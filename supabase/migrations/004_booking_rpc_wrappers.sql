-- AgzStay Phase 4: Unified Booking Lifecycle RPCs & Strict Domain Error Keys
-- Run AFTER 001_init.sql, 002_phase2_lifecycle_and_payments.sql, and 003_profile_host_upgrade.sql.

alter table public.bookings
  add column if not exists cancellation_reason text;

-- 1. create_booking (computes check_out from p_nights, enforces domain error keys)
create or replace function public.create_booking(
  p_chalet_id text,
  p_check_in date,
  p_nights integer,
  p_duration text default 'daily',
  p_guests integer default 1,
  p_guest_name text default '',
  p_guest_phone text default '',
  p_notes text default '',
  p_policy_accepted boolean default false,
  p_channel text default 'form'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_chalet public.chalets%rowtype;
  v_check_out date;
  v_quote jsonb;
  v_booking public.bookings%rowtype;
  v_clean_phone text;
  v_has_duplicate boolean;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not coalesce(p_policy_accepted, false) then
    raise exception 'policy_not_accepted';
  end if;

  if p_check_in is null or coalesce(p_nights, 0) <= 0 then
    raise exception 'invalid_dates';
  end if;

  v_check_out := p_check_in + p_nights;
  if v_check_out <= p_check_in then
    raise exception 'invalid_dates';
  end if;

  v_clean_phone := trim(coalesce(p_guest_phone, ''));
  if v_clean_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'phone_invalid';
  end if;

  if trim(coalesce(p_guest_name, '')) = '' then
    raise exception 'يرجى إدخال الاسم الكامل.';
  end if;

  select * into v_chalet from public.chalets where id = p_chalet_id;
  if not found then
    raise exception 'الوحدة المطلوبة غير موجودة.';
  end if;

  if v_chalet.owner_id = v_caller then
    raise exception 'cannot_book_own';
  end if;

  if v_chalet.availability_status <> 'active' then
    raise exception 'listing_suspended';
  end if;

  if coalesce(p_guests, 1) < 1 or coalesce(p_guests, 1) > v_chalet.max_guests then
    raise exception 'invalid_guests';
  end if;

  perform public.sync_booking_lifecycle_statuses();

  select exists (
    select 1
    from public.bookings b
    where b.chalet_id = p_chalet_id
      and b.renter_id = v_caller
      and b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'pending_verification')
      and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, v_check_out, '[)')
  ) into v_has_duplicate;

  if v_has_duplicate then
    raise exception 'duplicate_request';
  end if;

  begin
    v_quote := public.calculate_booking_quote(
      p_chalet_id,
      p_check_in,
      v_check_out,
      coalesce(p_duration, 'daily')
    );
  exception
    when raise_exception then
      if sqlerrm like '%مغلق من قِبل المالك%' then
        raise exception 'dates_unavailable';
      end if;
      raise;
  end;

  begin
    insert into public.bookings (
      chalet_id,
      renter_id,
      chalet_title,
      resort,
      destination_label,
      owner_name,
      guest_name,
      guest_phone,
      check_in,
      check_out,
      nights,
      rental_duration,
      inquiry_channel,
      guests,
      total_price,
      deposit_amount,
      remaining_amount,
      security_deposit,
      policy_accepted,
      notes,
      status,
      expires_at
    )
    values (
      v_chalet.id,
      v_caller,
      v_chalet.title,
      v_chalet.resort,
      v_chalet.destination_label,
      v_chalet.owner_name,
      trim(p_guest_name),
      v_clean_phone,
      p_check_in,
      v_check_out,
      (v_quote ->> 'nights')::integer,
      coalesce(p_duration, 'daily'),
      coalesce(p_channel, 'form'),
      greatest(1, coalesce(p_guests, 1)),
      (v_quote ->> 'total_price')::numeric,
      (v_quote ->> 'deposit_amount')::numeric,
      (v_quote ->> 'remaining_amount')::numeric,
      (v_quote ->> 'security_deposit')::numeric,
      true,
      coalesce(trim(p_notes), ''),
      'pending',
      now() + interval '24 hours'
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'dates_unavailable';
  end;

  perform public.create_app_notification(
    v_chalet.owner_id,
    v_booking.id,
    'booking_requested',
    'طلب حجز جديد بانتظار موافقتك',
    v_booking.guest_name || ' يطلب حجز "' || v_chalet.title || '" من ' || to_char(p_check_in, 'DD/MM/YYYY') || ' إلى ' || to_char(v_check_out, 'DD/MM/YYYY') || ' (مهلة الرد ٢٤ ساعة).'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.create_booking(text, date, integer, text, integer, text, text, text, boolean, text) from public;
grant execute on function public.create_booking(text, date, integer, text, integer, text, text, text, boolean, text) to authenticated;

-- 2. owner_respond_booking
create or replace function public.owner_respond_booking(
  p_booking_id text,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_approve then
    return public.approve_booking_request(p_booking_id);
  else
    return public.reject_booking_request(p_booking_id, p_reason);
  end if;
end;
$$;

revoke all on function public.owner_respond_booking(text, boolean, text) from public;
grant execute on function public.owner_respond_booking(text, boolean, text) to authenticated;

-- 3. submit_payment_receipt
create or replace function public.submit_payment_receipt(
  p_booking_id text,
  p_receipt_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  return public.submit_booking_payment_receipt(p_booking_id, p_receipt_path, 'manual_transfer', null);
end;
$$;

revoke all on function public.submit_payment_receipt(text, text) from public;
grant execute on function public.submit_payment_receipt(text, text) to authenticated;

-- 4. owner_review_payment
create or replace function public.owner_review_payment(
  p_booking_id text,
  p_confirm boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_confirm then
    return public.confirm_booking_payment(p_booking_id);
  else
    return public.reject_booking_request(p_booking_id, p_reason);
  end if;
end;
$$;

revoke all on function public.owner_review_payment(text, boolean, text) from public;
grant execute on function public.owner_review_payment(text, boolean, text) to authenticated;

-- 5. cancel_booking
create or replace function public.cancel_booking(
  p_booking_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_result := public.cancel_booking_with_policy(p_booking_id);
  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reason is not null then
    update public.bookings
    set cancellation_reason = v_reason
    where id = p_booking_id;

    v_result := v_result || jsonb_build_object('cancellation_reason', v_reason);
  end if;

  return v_result;
end;
$$;

revoke all on function public.cancel_booking(text, text) from public;
grant execute on function public.cancel_booking(text, text) to authenticated;

-- 6. complete_booking
create or replace function public.complete_booking(
  p_booking_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  return public.complete_booking_stay(p_booking_id);
end;
$$;

revoke all on function public.complete_booking(text) from public;
grant execute on function public.complete_booking(text) to authenticated;
