-- ============================================================================
-- AgzStay Migration 010: Performance Indexes, Guided Booking RPCs,
-- Customer Support Tickets, Audit Logs & Hardened RLS Policies
-- Run AFTER 006_secure_v2.sql .. 009_marketplace_enhancements.sql
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Bookings Schema Alignment, Performance Indexes & Strict RLS
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id text primary key default ('booking-' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
  chalet_id text not null references public.chalets(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  chalet_title text not null,
  resort text not null default '',
  destination_label text not null default '',
  owner_name text not null default '',
  guest_name text not null,
  guest_phone text not null,
  check_in date not null,
  check_out date not null,
  nights integer not null check (nights > 0),
  rental_duration text not null default 'daily' check (rental_duration in ('daily', 'weekly', 'monthly')),
  inquiry_channel text not null default 'form' check (inquiry_channel in ('form', 'whatsapp', 'phone')),
  guests integer not null default 1 check (guests > 0),
  total_price numeric not null default 0 check (total_price >= 0),
  deposit_amount numeric not null default 0 check (deposit_amount >= 0),
  remaining_amount numeric not null default 0 check (remaining_amount >= 0),
  security_deposit numeric not null default 0 check (security_deposit >= 0),
  policy_accepted boolean not null default false,
  receipt_path text,
  notes text not null default '',
  status text not null default 'pending',
  approved_at timestamptz,
  payment_submitted_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  modified_at timestamptz,
  modification_note text,
  expires_at timestamptz default (pg_catalog.now() + interval '24 hours'),
  cancellation_days_notice integer,
  deposit_forfeited boolean not null default false,
  forfeited_amount numeric not null default 0 check (forfeited_amount >= 0),
  cancellation_reason text,
  rejection_reason text,
  cancellation_policy text not null default 'flexible_10_days',
  payment_provider text not null default 'manual_transfer',
  payment_reference text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint bookings_dates_valid check (check_out > check_in)
);

alter table public.bookings
  add column if not exists approved_at timestamptz,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists modified_at timestamptz,
  add column if not exists modification_note text,
  add column if not exists expires_at timestamptz default (pg_catalog.now() + interval '24 hours'),
  add column if not exists cancellation_days_notice integer,
  add column if not exists deposit_forfeited boolean not null default false,
  add column if not exists forfeited_amount numeric not null default 0,
  add column if not exists cancellation_reason text,
  add column if not exists rejection_reason text,
  add column if not exists cancellation_policy text not null default 'flexible_10_days',
  add column if not exists payment_provider text not null default 'manual_transfer',
  add column if not exists payment_reference text,
  add column if not exists updated_at timestamptz not null default pg_catalog.now();

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in (
    'pending',
    'approved',
    'payment_submitted',
    'confirmed',
    'modified',
    'completed',
    'cancelled',
    'rejected',
    'expired',
    'pending_verification'
  ));

alter table public.bookings
  drop constraint if exists bookings_no_overlap;

alter table public.bookings
  add constraint bookings_no_overlap exclude using gist (
    chalet_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'modified', 'pending_verification'));

create index if not exists idx_bookings_renter_created
  on public.bookings (renter_id, created_at desc);

create index if not exists idx_bookings_chalet_dates
  on public.bookings (chalet_id, status, check_in, check_out);

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

alter table public.bookings enable row level security;

-- SECURITY INVOKER guard: blocks direct table mutations to price/status/renter
create or replace function public.enforce_booking_update_rules()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trusted_db_role boolean;
begin
  v_trusted_db_role := (current_user in ('postgres', 'supabase_admin', 'service_role'));

  if v_trusted_db_role or public.is_admin() then
    return new;
  end if;

  if pg_catalog.pg_trigger_depth() = 1 and (
    new.status is distinct from old.status
    or new.total_price is distinct from old.total_price
    or new.deposit_amount is distinct from old.deposit_amount
    or new.remaining_amount is distinct from old.remaining_amount
    or new.check_in is distinct from old.check_in
    or new.check_out is distinct from old.check_out
    or new.renter_id is distinct from old.renter_id
  ) then
    raise exception 'forbidden';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_update_rules on public.bookings;
create trigger trg_enforce_booking_update_rules
  before update on public.bookings
  for each row execute function public.enforce_booking_update_rules();

drop policy if exists "bookings_select_renter_owner_admin" on public.bookings;
create policy "bookings_select_renter_owner_admin"
  on public.bookings for select
  using (
    renter_id = (select auth.uid())
    or exists (
      select 1
      from public.chalets c
      where c.id = chalet_id
        and c.owner_id = (select auth.uid())
    )
    or public.is_admin()
  );

drop policy if exists "bookings_insert_renter" on public.bookings;
drop policy if exists "bookings_update_renter_owner_admin" on public.bookings;

-- All booking creation & transitions MUST pass through SECURITY DEFINER RPCs
revoke all on table public.bookings from public, anon, authenticated;
grant select on table public.bookings to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Helper: Safe User Notification Dispatcher (`user_notifications` in 009)
-- ----------------------------------------------------------------------------
create or replace function public.notify_user_safe(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link_section text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if pg_catalog.to_regclass('public.user_notifications') is not null then
    insert into public.user_notifications (user_id, type, title, body, link_section)
    values (
      p_user_id,
      case when p_type in ('verification', 'subscription', 'report', 'system') then p_type else 'system' end,
      p_title,
      p_body,
      p_link_section
    );
  end if;
exception when others then
  null;
end;
$$;

revoke all on function public.notify_user_safe(uuid, text, text, text, text) from public;
grant execute on function public.notify_user_safe(uuid, text, text, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Authoritative Server-Side Booking Quote, Create, Modify & Cancel RPCs
-- ----------------------------------------------------------------------------
create or replace function public.get_chalet_booked_ranges(p_chalet_id text)
returns table (
  chalet_id text,
  check_in date,
  check_out date,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.chalet_id, b.check_in, b.check_out, b.status
  from public.bookings b
  where b.chalet_id = p_chalet_id
    and b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'modified', 'pending_verification')
    and (b.status <> 'pending' or b.expires_at is null or b.expires_at > pg_catalog.now());
$$;

revoke all on function public.get_chalet_booked_ranges(text) from public;
grant execute on function public.get_chalet_booked_ranges(text) to anon, authenticated;

create or replace function public.get_all_active_booked_ranges()
returns table (
  chalet_id text,
  check_in date,
  check_out date,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.chalet_id, b.check_in, b.check_out, b.status
  from public.bookings b
  where b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'modified', 'pending_verification')
    and (b.status <> 'pending' or b.expires_at is null or b.expires_at > pg_catalog.now());
$$;

revoke all on function public.get_all_active_booked_ranges() from public;
grant execute on function public.get_all_active_booked_ranges() to anon, authenticated;

create or replace function public.calculate_booking_quote(
  p_chalet_id text,
  p_check_in date,
  p_check_out date,
  p_rental_duration text default 'daily',
  p_ignore_booking_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chalet record;
  v_rule record;
  v_nights integer;
  v_day date;
  v_day_iso text;
  v_dow integer;
  v_is_monthly boolean;
  v_base_rate numeric;
  v_weekend_rate numeric;
  v_seasonal_rate numeric;
  v_seasonal_start date;
  v_seasonal_end date;
  v_rate numeric;
  v_subtotal numeric := 0;
  v_regular_nights integer := 0;
  v_weekend_nights integer := 0;
  v_seasonal_nights integer := 0;
  v_dep_type text;
  v_dep_value numeric;
  v_deposit_amount numeric := 0;
  v_remaining numeric := 0;
  v_conflict boolean := false;
begin
  select
    c.id,
    c.property_type,
    c.price_per_night,
    c.weekly_price,
    c.monthly_price,
    c.deposit_type,
    c.deposit_value,
    c.blocked_dates,
    c.availability_status,
    c.max_guests
  into v_chalet
  from public.chalets c
  where c.id = p_chalet_id;

  if not found then
    raise exception 'chalet_not_found';
  end if;

  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'invalid_dates';
  end if;

  if p_check_in < current_date then
    raise exception 'invalid_dates';
  end if;

  v_nights := p_check_out - p_check_in;
  if v_nights <= 0 or v_nights > 365 then
    raise exception 'invalid_dates';
  end if;

  v_is_monthly := (v_chalet.property_type = 'شقة فاضية' or p_rental_duration = 'monthly');
  v_base_rate := coalesce(v_chalet.price_per_night, 0);

  if pg_catalog.to_regclass('public.chalet_pricing_rules') is not null then
    select
      r.weekend_price,
      r.seasonal_price,
      r.seasonal_start,
      r.seasonal_end
    into v_rule
    from public.chalet_pricing_rules r
    where r.chalet_id = p_chalet_id;
  end if;

  v_weekend_rate := coalesce(v_rule.weekend_price, 0);
  v_seasonal_rate := coalesce(v_rule.seasonal_price, 0);
  v_seasonal_start := v_rule.seasonal_start;
  v_seasonal_end := v_rule.seasonal_end;

  -- Check blocked dates and active booking overlaps
  for i in 0..(v_nights - 1) loop
    v_day := p_check_in + i;
    v_day_iso := pg_catalog.to_char(v_day, 'YYYY-MM-DD');

    if not v_is_monthly and v_day_iso = any(coalesce(v_chalet.blocked_dates, '{}'::text[])) then
      raise exception 'dates_unavailable';
    end if;

    if v_is_monthly then
      continue;
    end if;

    if v_seasonal_rate > 0
       and v_seasonal_start is not null
       and v_seasonal_end is not null
       and v_day >= v_seasonal_start
       and v_day <= v_seasonal_end then
      v_rate := v_seasonal_rate;
      v_seasonal_nights := v_seasonal_nights + 1;
    else
      v_dow := extract(dow from v_day)::integer;
      -- Egypt weekend nights: Thursday (4) and Friday (5)
      if v_weekend_rate > 0 and v_dow in (4, 5) then
        v_rate := v_weekend_rate;
        v_weekend_nights := v_weekend_nights + 1;
      else
        v_rate := v_base_rate;
        v_regular_nights := v_regular_nights + 1;
      end if;
    end if;

    v_subtotal := v_subtotal + v_rate;
  end loop;

  if not v_is_monthly then
    select exists (
      select 1
      from public.bookings b
      where b.chalet_id = p_chalet_id
        and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
        and b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'modified', 'pending_verification')
        and (b.status <> 'pending' or b.expires_at is null or b.expires_at > pg_catalog.now())
        and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
    ) into v_conflict;

    if v_conflict then
      raise exception 'dates_unavailable';
    end if;
  end if;

  if v_chalet.property_type = 'شقة فاضية' then
    v_subtotal := coalesce(v_chalet.monthly_price, v_base_rate);
    v_regular_nights := v_nights;
  elsif p_rental_duration = 'monthly' and v_nights >= 28 and v_chalet.monthly_price is not null and v_chalet.monthly_price > 0 then
    v_subtotal := v_chalet.monthly_price * pg_catalog.greatest(1, round(v_nights / 30.0));
  elsif p_rental_duration = 'weekly' and v_nights >= 7 and (v_nights % 7 = 0) and v_chalet.weekly_price is not null and v_chalet.weekly_price > 0 and v_weekend_nights = 0 and v_seasonal_nights = 0 then
    v_subtotal := v_chalet.weekly_price * pg_catalog.greatest(1, round(v_nights / 7.0));
  end if;

  v_dep_type := coalesce(v_chalet.deposit_type, 'percent');
  v_dep_value := coalesce(v_chalet.deposit_value, 0);

  if v_dep_value <= 0 then
    v_deposit_amount := 0;
  elsif v_dep_type = 'fixed' then
    v_deposit_amount := pg_catalog.least(v_subtotal, round(v_dep_value));
  else
    v_deposit_amount := round((v_subtotal * pg_catalog.least(100, v_dep_value)) / 100.0);
  end if;

  v_remaining := pg_catalog.greatest(0, v_subtotal - v_deposit_amount);

  return pg_catalog.jsonb_build_object(
    'nights', v_nights,
    'regular_nights', v_regular_nights,
    'weekend_nights', v_weekend_nights,
    'seasonal_nights', v_seasonal_nights,
    'unit_price', case when v_chalet.property_type = 'شقة فاضية' then coalesce(v_chalet.monthly_price, v_base_rate) else v_base_rate end,
    'total_price', v_subtotal,
    'deposit_amount', v_deposit_amount,
    'remaining_amount', v_remaining,
    'security_deposit', 0,
    'is_available', true,
    'checkin_time', '١٤:٠٠ (٢:٠٠ عصراً)',
    'checkout_time', '١٢:٠٠ (١٢:٠٠ ظهراً)',
    'cancellation_policy', 'إلغاء مجاني قبل موعد الوصول بـ ١٠ أيام على الأقل؛ بعد ذلك يُخصم مبلغ جدية الحجز (إن وُجد).'
  );
end;
$$;

revoke all on function public.calculate_booking_quote(text, date, date, text, text) from public;
grant execute on function public.calculate_booking_quote(text, date, date, text, text) to anon, authenticated;

-- Sync expired pending requests (>24h) and completed stays
create or replace function public.sync_booking_lifecycle_statuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_updated integer := 0;
begin
  for v_row in
    update public.bookings b
    set status = 'expired'
    where b.status = 'pending'
      and b.expires_at is not null
      and b.expires_at <= pg_catalog.now()
    returning b.id, b.renter_id, b.chalet_title
  loop
    v_updated := v_updated + 1;
    perform public.notify_user_safe(
      v_row.renter_id,
      'system',
      'انتهت صلاحية طلب الحجز (٢٤ ساعة)',
      'انتهت مهلة ٢٤ ساعة دون رد المعلن على طلب "' || v_row.chalet_title || '". يمكنك اختيار موعد أو وحدة أخرى.',
      'bookings'
    );
  end loop;

  for v_row in
    update public.bookings b
    set status = 'completed',
        completed_at = coalesce(b.completed_at, pg_catalog.now())
    where b.status in ('confirmed', 'modified')
      and b.check_out <= current_date
    returning b.id, b.renter_id, b.chalet_title
  loop
    v_updated := v_updated + 1;
    perform public.notify_user_safe(
      v_row.renter_id,
      'system',
      'اكتملت إقامتك — شارك تقييمك الآن',
      'نأمل أن تكون إقامتك في "' || v_row.chalet_title || '" قد نالت إعجابك.',
      'bookings'
    );
  end loop;

  return v_updated;
end;
$$;

revoke all on function public.sync_booking_lifecycle_statuses() from public;
grant execute on function public.sync_booking_lifecycle_statuses() to authenticated;

-- Create Booking (Authoritative server-side quote & availability check)
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
set search_path = ''
as $$
declare
  v_caller uuid;
  v_chalet record;
  v_check_out date;
  v_quote jsonb;
  v_booking public.bookings%rowtype;
  v_clean_phone text;
  v_clean_name text;
  v_has_duplicate boolean;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not coalesce(p_policy_accepted, false) then
    raise exception 'policy_not_accepted';
  end if;

  if p_check_in is null or coalesce(p_nights, 0) <= 0 or coalesce(p_nights, 0) > 365 then
    raise exception 'invalid_dates';
  end if;

  v_check_out := p_check_in + p_nights;
  if v_check_out <= p_check_in then
    raise exception 'invalid_dates';
  end if;

  v_clean_phone := pg_catalog.regexp_replace(coalesce(p_guest_phone, ''), '\D', '', 'g');
  if v_clean_phone like '20%' and pg_catalog.length(v_clean_phone) = 12 then
    v_clean_phone := '0' || pg_catalog.substr(v_clean_phone, 3);
  end if;
  if v_clean_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'phone_invalid';
  end if;

  v_clean_name := trim(coalesce(p_guest_name, ''));
  if pg_catalog.length(v_clean_name) < 2 then
    raise exception 'يرجى إدخال الاسم الكامل (حرفان على الأقل).';
  end if;

  -- Serialize concurrent bookings on this unit
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_chalet_id));

  select
    c.id,
    c.owner_id,
    c.title,
    c.area_or_village,
    c.city,
    c.governorate,
    c.owner_name,
    c.max_guests,
    c.availability_status,
    c.property_type
  into v_chalet
  from public.chalets c
  where c.id = p_chalet_id;

  if not found then
    raise exception 'chalet_not_found';
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
      and b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'modified', 'pending_verification')
      and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, v_check_out, '[)')
  ) into v_has_duplicate;

  if v_has_duplicate then
    raise exception 'duplicate_request';
  end if;

  -- Always compute authoritative quote server-side
  v_quote := public.calculate_booking_quote(
    p_chalet_id,
    p_check_in,
    v_check_out,
    coalesce(p_duration, 'daily'),
    null
  );

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
      cancellation_policy,
      expires_at
    )
    values (
      v_chalet.id,
      v_caller,
      v_chalet.title,
      coalesce(nullif(v_chalet.area_or_village, ''), v_chalet.city, ''),
      coalesce(nullif(v_chalet.governorate, ''), v_chalet.city, ''),
      coalesce(v_chalet.owner_name, 'معلن AgzStay'),
      v_clean_name,
      v_clean_phone,
      p_check_in,
      v_check_out,
      (v_quote ->> 'nights')::integer,
      case when p_duration in ('daily', 'weekly', 'monthly') then p_duration else 'daily' end,
      case when p_channel in ('form', 'whatsapp', 'phone') then p_channel else 'form' end,
      pg_catalog.greatest(1, coalesce(p_guests, 1)),
      (v_quote ->> 'total_price')::numeric,
      (v_quote ->> 'deposit_amount')::numeric,
      (v_quote ->> 'remaining_amount')::numeric,
      coalesce((v_quote ->> 'security_deposit')::numeric, 0),
      true,
      pg_catalog.left(coalesce(trim(p_notes), ''), 600),
      'pending',
      'flexible_10_days',
      pg_catalog.now() + interval '24 hours'
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'dates_unavailable';
  end;

  perform public.notify_user_safe(
    v_chalet.owner_id,
    'system',
    'طلب حجز جديد بانتظار المراجعة',
    v_booking.guest_name || ' يطلب حجز "' || v_chalet.title || '" من ' || pg_catalog.to_char(p_check_in, 'DD/MM/YYYY') || ' إلى ' || pg_catalog.to_char(v_check_out, 'DD/MM/YYYY') || '.',
    'owner'
  );

  return pg_catalog.to_jsonb(v_booking);
end;
$$;

revoke all on function public.create_booking(text, date, integer, text, integer, text, text, text, boolean, text) from public;
grant execute on function public.create_booking(text, date, integer, text, integer, text, text, text, boolean, text) to authenticated;

-- Modify Booking Dates / Guests (Renter or Admin, Server-side price recalculation)
create or replace function public.modify_my_booking(
  p_booking_id text,
  p_check_in date,
  p_check_out date,
  p_guests integer default null,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_chalet record;
  v_quote jsonb;
  v_new_guests integer;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  if not public.is_admin() and v_booking.renter_id <> v_caller then
    raise exception 'forbidden';
  end if;

  if v_booking.status not in ('pending', 'approved', 'confirmed', 'modified', 'pending_verification') then
    raise exception 'invalid_state';
  end if;

  select c.id, c.owner_id, c.title, c.max_guests, c.availability_status
  into v_chalet
  from public.chalets c
  where c.id = v_booking.chalet_id;

  if not found or v_chalet.availability_status <> 'active' then
    raise exception 'listing_suspended';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_booking.chalet_id));

  v_new_guests := coalesce(p_guests, v_booking.guests);
  if v_new_guests < 1 or v_new_guests > v_chalet.max_guests then
    raise exception 'invalid_guests';
  end if;

  v_quote := public.calculate_booking_quote(
    v_booking.chalet_id,
    p_check_in,
    p_check_out,
    v_booking.rental_duration,
    v_booking.id
  );

  begin
    update public.bookings
    set check_in = p_check_in,
        check_out = p_check_out,
        nights = (v_quote ->> 'nights')::integer,
        guests = v_new_guests,
        total_price = (v_quote ->> 'total_price')::numeric,
        deposit_amount = (v_quote ->> 'deposit_amount')::numeric,
        remaining_amount = (v_quote ->> 'remaining_amount')::numeric,
        status = 'modified',
        modified_at = pg_catalog.now(),
        modification_note = nullif(pg_catalog.left(trim(coalesce(p_note, '')), 400), '')
    where id = p_booking_id
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'dates_unavailable';
  end;

  perform public.notify_user_safe(
    v_chalet.owner_id,
    'system',
    'تم تعديل تفاصيل حجز',
    'قام ' || v_booking.guest_name || ' بتعديل حجز "' || v_chalet.title || '" إلى ' || pg_catalog.to_char(p_check_in, 'DD/MM/YYYY') || ' - ' || pg_catalog.to_char(p_check_out, 'DD/MM/YYYY') || '.',
    'owner'
  );

  return pg_catalog.to_jsonb(v_booking);
end;
$$;

revoke all on function public.modify_my_booking(text, date, date, integer, text) from public;
grant execute on function public.modify_my_booking(text, date, date, integer, text) to authenticated;

-- Hardened Cancel Booking with 10-Day Policy
create or replace function public.cancel_booking_with_policy(
  p_booking_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
  v_days_notice integer;
  v_is_forfeited boolean;
  v_forfeited_amount numeric;
  v_target_notify uuid;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  if not public.is_admin() and v_booking.renter_id <> v_caller and v_owner_id <> v_caller then
    raise exception 'forbidden';
  end if;

  if v_booking.status not in ('pending', 'approved', 'payment_submitted', 'confirmed', 'modified', 'pending_verification') then
    raise exception 'invalid_state';
  end if;

  v_days_notice := (v_booking.check_in - current_date);
  v_is_forfeited := (v_days_notice < 10);
  v_forfeited_amount := case
    when v_is_forfeited and v_booking.status in ('confirmed', 'modified', 'payment_submitted', 'pending_verification')
      then coalesce(v_booking.deposit_amount, 0)
    else 0
  end;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      cancellation_days_notice = v_days_notice,
      deposit_forfeited = v_is_forfeited,
      forfeited_amount = v_forfeited_amount,
      cancellation_reason = coalesce(nullif(pg_catalog.left(trim(coalesce(p_reason, '')), 400), ''), cancellation_reason)
  where id = p_booking_id
  returning * into v_booking;

  v_target_notify := case when v_caller = v_booking.renter_id then v_owner_id else v_booking.renter_id end;
  perform public.notify_user_safe(
    v_target_notify,
    'system',
    'تم إلغاء الحجز',
    'تم إلغاء حجز "' || v_booking.chalet_title || '" وإعادة فتح التواريخ.',
    case when v_caller = v_booking.renter_id then 'owner' else 'bookings' end
  );

  return pg_catalog.to_jsonb(v_booking);
end;
$$;

revoke all on function public.cancel_booking_with_policy(text, text) from public;
grant execute on function public.cancel_booking_with_policy(text, text) to authenticated;

create or replace function public.cancel_booking(
  p_booking_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.cancel_booking_with_policy(p_booking_id, p_reason);
end;
$$;

revoke all on function public.cancel_booking(text, text) from public;
grant execute on function public.cancel_booking(text, text) to authenticated;

-- Admin or Owner Confirm/Reject Booking Status RPC
create or replace function public.update_booking_status_rpc(
  p_booking_id text,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
  v_clean_reason text;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_status not in ('approved', 'confirmed', 'rejected', 'completed') then
    raise exception 'forbidden_status';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  if not public.is_admin() and v_owner_id <> v_caller then
    raise exception 'forbidden';
  end if;

  v_clean_reason := nullif(pg_catalog.left(trim(coalesce(p_reason, '')), 400), '');

  update public.bookings
  set status = p_status,
      approved_at = case when p_status = 'approved' then coalesce(approved_at, pg_catalog.now()) else approved_at end,
      confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, pg_catalog.now()) else confirmed_at end,
      completed_at = case when p_status = 'completed' then coalesce(completed_at, pg_catalog.now()) else completed_at end,
      rejection_reason = case when p_status = 'rejected' then v_clean_reason else rejection_reason end
  where id = p_booking_id
  returning * into v_booking;

  perform public.notify_user_safe(
    v_booking.renter_id,
    'system',
    case p_status
      when 'confirmed' then 'تم تأكيد حجزك'
      when 'approved' then 'تمت الموافقة المبدئية على حجزك'
      when 'rejected' then 'تم الاعتذار عن طلب الحجز'
      else 'تم تحديث حالة الحجز'
    end,
    'تم تحديث حالة حجز "' || v_booking.chalet_title || '" إلى: ' || p_status,
    'bookings'
  );

  return pg_catalog.to_jsonb(v_booking);
end;
$$;

revoke all on function public.update_booking_status_rpc(text, text, text) from public;
grant execute on function public.update_booking_status_rpc(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Customer Support Tickets (`public.support_tickets`) & Secure RPCs
-- ----------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  ticket_code text not null default ('TKT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 6))),
  user_id uuid references public.profiles(id) on delete set null,
  booking_id text references public.bookings(id) on delete set null,
  contact_name text not null,
  contact_email text not null default '',
  contact_phone text not null default '',
  category text not null default 'inquiry'
    check (category in ('booking_modify', 'booking_cancel', 'complaint', 'inquiry', 'technical')),
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'replied', 'closed')),
  admin_reply text,
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_support_tickets_user_created
  on public.support_tickets (user_id, created_at desc);

create index if not exists idx_support_tickets_booking_id
  on public.support_tickets (booking_id)
  where booking_id is not null;

create index if not exists idx_support_tickets_status_created
  on public.support_tickets (status, created_at desc);

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_updated_at();

alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_select_own_or_admin" on public.support_tickets;
create policy "support_tickets_select_own_or_admin"
  on public.support_tickets for select
  using (user_id = (select auth.uid()) or public.is_admin());

revoke all on table public.support_tickets from public, anon, authenticated;
grant select (
  id, ticket_code, user_id, booking_id, contact_name, contact_email, contact_phone,
  category, subject, message, status, admin_reply, responded_at, created_at, updated_at
) on public.support_tickets to authenticated;

-- Rate limit support ticket creation & auto-link user_id + booking_id
create or replace function public.submit_support_ticket(
  p_category text default 'inquiry',
  p_subject text default '',
  p_message text default '',
  p_booking_id text default null,
  p_contact_name text default '',
  p_contact_email text default '',
  p_contact_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_booking_id text;
  v_name text;
  v_email text;
  v_phone text;
  v_subject text;
  v_message text;
  v_category text;
  v_actor_key text;
  v_window timestamptz;
  v_count integer;
  v_ticket public.support_tickets%rowtype;
  v_is_booking_member boolean := false;
begin
  v_caller := (select auth.uid());
  v_name := trim(coalesce(p_contact_name, ''));
  v_email := trim(coalesce(p_contact_email, ''));
  v_phone := trim(coalesce(p_contact_phone, ''));
  v_subject := trim(coalesce(p_subject, ''));
  v_message := trim(coalesce(p_message, ''));
  v_booking_id := nullif(trim(coalesce(p_booking_id, '')), '');

  v_category := case
    when p_category in ('booking_modify', 'booking_cancel', 'complaint', 'inquiry', 'technical') then p_category
    else 'inquiry'
  end;

  if v_caller is not null and v_name = '' then
    select coalesce(nullif(trim(p.name), ''), 'مستخدم AgzStay'), coalesce(p.phone, '')
    into v_name, v_phone
    from public.profiles p
    where p.id = v_caller;
  end if;

  if pg_catalog.length(v_name) < 2 then
    raise exception 'يرجى إدخال اسمك الكامل للتواصل.';
  end if;

  if v_caller is null and v_email = '' and v_phone = '' then
    raise exception 'يرجى إدخال البريد الإلكتروني أو رقم الموبايل للرد عليك.';
  end if;

  if pg_catalog.length(v_subject) < 3 or pg_catalog.length(v_message) < 8 then
    raise exception 'يرجى كتابة عنوان ووصف واضح لطلب الدعم (٨ أحرف على الأقل).';
  end if;

  if v_booking_id is not null then
    if v_caller is null then
      raise exception 'not_authenticated';
    end if;

    select exists (
      select 1
      from public.bookings b
      left join public.chalets c on c.id = b.chalet_id
      where b.id = v_booking_id
        and (b.renter_id = v_caller or c.owner_id = v_caller or public.is_admin())
    ) into v_is_booking_member;

    if not v_is_booking_member then
      raise exception 'forbidden';
    end if;
  end if;

  -- Atomic hourly rate limit (never uses spoofable headers)
  v_actor_key := case
    when v_caller is not null then 'ticket:user:' || v_caller::text
    else 'ticket:ip:' || coalesce(pg_catalog.host(pg_catalog.inet_client_addr()), 'unknown')
  end;
  v_window := pg_catalog.date_trunc('hour', pg_catalog.now());
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor_key || ':' || v_window::text));

  if pg_catalog.to_regclass('public.contact_reveal_rate_limits') is not null then
    insert into public.contact_reveal_rate_limits (actor_key, window_start, request_count)
    values (v_actor_key, v_window, 1)
    on conflict (actor_key, window_start) do update
      set request_count = public.contact_reveal_rate_limits.request_count + 1
    where public.contact_reveal_rate_limits.request_count < (case when v_caller is not null then 15 else 5 end)
    returning request_count into v_count;

    if not found then
      raise exception 'rate_limited';
    end if;
  end if;

  insert into public.support_tickets (
    user_id,
    booking_id,
    contact_name,
    contact_email,
    contact_phone,
    category,
    subject,
    message,
    status
  )
  values (
    v_caller,
    v_booking_id,
    pg_catalog.left(v_name, 100),
    pg_catalog.left(v_email, 160),
    pg_catalog.left(v_phone, 30),
    v_category,
    pg_catalog.left(v_subject, 160),
    pg_catalog.left(v_message, 2000),
    'open'
  )
  returning * into v_ticket;

  return pg_catalog.jsonb_build_object(
    'id', v_ticket.id,
    'ticket_code', v_ticket.ticket_code,
    'status', v_ticket.status,
    'created_at', v_ticket.created_at
  );
end;
$$;

revoke all on function public.submit_support_ticket(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_support_ticket(text, text, text, text, text, text, text) to anon, authenticated;

-- Admin Reply / Status Update RPC
create or replace function public.admin_update_support_ticket(
  p_ticket_id uuid,
  p_status text,
  p_admin_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_ticket public.support_tickets%rowtype;
  v_reply text;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_status not in ('open', 'replied', 'closed') then
    raise exception 'invalid_state';
  end if;

  v_reply := nullif(pg_catalog.left(trim(coalesce(p_admin_reply, '')), 2000), '');

  update public.support_tickets
  set status = p_status,
      admin_reply = coalesce(v_reply, admin_reply),
      responded_by = v_caller,
      responded_at = pg_catalog.now()
  where id = p_ticket_id
  returning * into v_ticket;

  if not found then
    raise exception 'ticket_not_found';
  end if;

  if v_ticket.user_id is not null then
    perform public.notify_user_safe(
      v_ticket.user_id,
      'system',
      'تحديث على تذكرة الدعم ' || v_ticket.ticket_code,
      case
        when v_reply is not null then 'رد فريق الدعم: ' || pg_catalog.left(v_reply, 140)
        else 'تم تحديث حالة تذكرة الدعم الخاصة بك.'
      end,
      'support'
    );
  end if;

  return pg_catalog.to_jsonb(v_ticket);
end;
$$;

revoke all on function public.admin_update_support_ticket(uuid, text, text) from public;
grant execute on function public.admin_update_support_ticket(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Audit Logs (`public.audit_logs`) + Automatic Triggers + Scoped Timeline
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_id uuid,
  actor_role text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary_ar text not null default '',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_audit_logs_entity_created
  on public.audit_logs (entity_type, entity_id, created_at desc);

create index if not exists idx_audit_logs_actor_created
  on public.audit_logs (actor_id, created_at desc);

create index if not exists idx_audit_logs_created_desc
  on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select"
  on public.audit_logs for select
  using (public.is_admin());

revoke all on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;

create or replace function public.write_audit_log_entry(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary_ar text,
  p_old_data jsonb default null,
  p_new_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text := 'system';
begin
  v_actor := (select auth.uid());
  if v_actor is not null then
    select coalesce(p.role, 'user') into v_role
    from public.profiles p
    where p.id = v_actor;
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary_ar,
    old_data,
    new_data
  )
  values (
    v_actor,
    coalesce(v_role, 'system'),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_summary_ar, ''),
    p_old_data,
    p_new_data
  );
exception when others then
  null;
end;
$$;

revoke all on function public.write_audit_log_entry(text, text, text, text, jsonb, jsonb) from public;

-- Trigger: Audit Booking Mutations
create or replace function public.trg_audit_bookings_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log_entry(
      'booking_created',
      'booking',
      new.id,
      'إنشاء طلب حجز جديد للوحدة "' || coalesce(new.chalet_title, '') || '"',
      null,
      pg_catalog.jsonb_build_object(
        'status', new.status,
        'check_in', new.check_in,
        'check_out', new.check_out,
        'guests', new.guests,
        'total_price', new.total_price
      )
    );
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       or new.check_in is distinct from old.check_in
       or new.check_out is distinct from old.check_out
       or new.guests is distinct from old.guests
       or new.total_price is distinct from old.total_price then
      perform public.write_audit_log_entry(
        case
          when new.status = 'cancelled' and old.status is distinct from 'cancelled' then 'booking_cancelled'
          when new.status = 'modified' or new.check_in is distinct from old.check_in or new.check_out is distinct from old.check_out then 'booking_modified'
          else 'booking_status_changed'
        end,
        'booking',
        new.id,
        case
          when new.status = 'cancelled' and old.status is distinct from 'cancelled' then 'إلغاء الحجز' || coalesce(' — السبب: ' || nullif(new.cancellation_reason, ''), '')
          when new.status = 'modified' or new.check_in is distinct from old.check_in or new.check_out is distinct from old.check_out then
            'تعديل الحجز (' || pg_catalog.to_char(new.check_in, 'DD/MM/YYYY') || ' - ' || pg_catalog.to_char(new.check_out, 'DD/MM/YYYY') || ')'
          else 'تحديث حالة الحجز من ' || coalesce(old.status, '-') || ' إلى ' || coalesce(new.status, '-')
        end,
        pg_catalog.jsonb_build_object(
          'status', old.status,
          'check_in', old.check_in,
          'check_out', old.check_out,
          'guests', old.guests,
          'total_price', old.total_price
        ),
        pg_catalog.jsonb_build_object(
          'status', new.status,
          'check_in', new.check_in,
          'check_out', new.check_out,
          'guests', new.guests,
          'total_price', new.total_price
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_bookings on public.bookings;
create trigger trg_audit_bookings
  after insert or update on public.bookings
  for each row execute function public.trg_audit_bookings_fn();

-- Trigger: Audit Profile Role & Verification Changes
create or replace function public.trg_audit_profiles_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.verification_status is distinct from old.verification_status then
    perform public.write_audit_log_entry(
      case when new.role is distinct from old.role then 'profile_role_changed' else 'profile_verification_changed' end,
      'profile',
      new.id::text,
      'تغيير صلاحية أو حالة توثيق المستخدم "' || coalesce(new.name, '') || '"',
      pg_catalog.jsonb_build_object('role', old.role, 'verification_status', old.verification_status),
      pg_catalog.jsonb_build_object('role', new.role, 'verification_status', new.verification_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after update on public.profiles
  for each row execute function public.trg_audit_profiles_fn();

-- Trigger: Audit Support Tickets
create or replace function public.trg_audit_support_tickets_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log_entry(
      'ticket_created',
      'support_ticket',
      new.id::text,
      'تذكرة دعم جديدة (' || new.ticket_code || '): ' || new.subject,
      null,
      pg_catalog.jsonb_build_object('status', new.status, 'category', new.category, 'booking_id', new.booking_id)
    );
  elsif tg_op = 'UPDATE' and (new.status is distinct from old.status or new.admin_reply is distinct from old.admin_reply) then
    perform public.write_audit_log_entry(
      'ticket_updated',
      'support_ticket',
      new.id::text,
      'تحديث تذكرة الدعم (' || new.ticket_code || ') إلى ' || new.status,
      pg_catalog.jsonb_build_object('status', old.status),
      pg_catalog.jsonb_build_object('status', new.status, 'has_reply', new.admin_reply is not null)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_support_tickets on public.support_tickets;
create trigger trg_audit_support_tickets
  after insert or update on public.support_tickets
  for each row execute function public.trg_audit_support_tickets_fn();

-- Trigger: Audit Subscription Reviews
create or replace function public.trg_audit_subscriptions_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform public.write_audit_log_entry(
      'subscription_status_changed',
      'subscription',
      new.id,
      'تغيير حالة الاشتراك (' || coalesce(new.plan_name, '') || ') إلى ' || new.status,
      pg_catalog.jsonb_build_object('status', old.status),
      pg_catalog.jsonb_build_object('status', new.status, 'admin_note', new.admin_note)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
  after update on public.subscriptions
  for each row execute function public.trg_audit_subscriptions_fn();

-- Safe Scoped Booking Timeline RPC (Renter, Owner of that unit, or Admin ONLY)
create or replace function public.get_my_booking_audit_timeline(p_booking_id text)
returns table (
  id uuid,
  action text,
  summary_ar text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_allowed boolean := false;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1
    from public.bookings b
    left join public.chalets c on c.id = b.chalet_id
    where b.id = p_booking_id
      and (b.renter_id = v_caller or c.owner_id = v_caller or public.is_admin())
  ) into v_allowed;

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  return query
  select a.id, a.action, a.summary_ar, a.created_at
  from public.audit_logs a
  where a.entity_type = 'booking'
    and a.entity_id = p_booking_id
  order by a.created_at desc
  limit 20;
end;
$$;

revoke all on function public.get_my_booking_audit_timeline(text) from public;
grant execute on function public.get_my_booking_audit_timeline(text) to authenticated;
