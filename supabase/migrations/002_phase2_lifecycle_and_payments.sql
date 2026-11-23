-- AgzStay Phase 2: Verification Gate, Full Booking Lifecycle RPCs, Payment Receipts Bucket,
-- Notifications + Realtime, and Server-Side Review Rating Aggregation
-- Run AFTER 001_init.sql in Supabase SQL Editor.

-- 1. Chalets Availability Gate (Only verified owners can publish 'active')
alter table public.chalets
  drop constraint if exists chalets_availability_status_check;

alter table public.chalets
  add constraint chalets_availability_status_check
  check (availability_status in ('active', 'rented', 'draft', 'pending_review', 'hidden'));

create or replace function public.enforce_chalet_verified_owner_publish()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  owner_is_verified boolean;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') or public.is_admin() then
    return new;
  end if;

  select exists (
    select 1
    from public.owner_verifications ov
    where ov.owner_id = new.owner_id
      and ov.status = 'verified'
  ) into owner_is_verified;

  new.owner_verified := coalesce(owner_is_verified, false);

  if not owner_is_verified and new.availability_status = 'active' then
    new.availability_status := 'pending_review';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chalets_verify_publish_gate on public.chalets;
create trigger trg_chalets_verify_publish_gate
  before insert or update on public.chalets
  for each row execute function public.enforce_chalet_verified_owner_publish();

drop policy if exists "chalets_owner_insert" on public.chalets;
create policy "chalets_owner_insert"
  on public.chalets for insert
  with check (owner_id = auth.uid());

-- 2. Owner Verifications: Rejection Reason, Reviewed By & Admin Review RPC
alter table public.owner_verifications
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

create or replace function public.handle_owner_verification_rules()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and current_user not in ('postgres', 'supabase_admin', 'service_role') then
      new.status := 'pending';
      new.reviewed_at := null;
      new.rejection_reason := null;
      new.reviewed_by := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Allow owner to re-submit their own rejected/pending record ONLY as 'pending'
    if not public.is_admin() and current_user not in ('postgres', 'supabase_admin', 'service_role') then
      if old.owner_id = auth.uid() and new.owner_id = auth.uid() then
        new.status := 'pending';
        new.reviewed_at := null;
        new.rejection_reason := null;
        new.reviewed_by := null;
        new.submitted_at := now();
        return new;
      end if;
      raise exception 'الإدارة فقط يمكنها مراجعة وتحديث حالة التوثيق.';
    end if;

    if new.status = 'verified' then
      new.reviewed_at := now();
      new.rejection_reason := null;
      update public.profiles
      set role = case when role = 'guest' then 'owner' else role end
      where id = new.owner_id;

      update public.chalets
      set owner_verified = true,
          availability_status = case
            when availability_status = 'pending_review' then 'active'
            else availability_status
          end
      where owner_id = new.owner_id;
    elsif new.status = 'unverified' then
      new.reviewed_at := now();
      update public.chalets
      set owner_verified = false,
          availability_status = case
            when availability_status = 'active' then 'pending_review'
            else availability_status
          end
      where owner_id = new.owner_id;
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists "owner_verifications_resubmit_own" on public.owner_verifications;
create policy "owner_verifications_resubmit_own"
  on public.owner_verifications for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- 3. Notifications Table + RLS + Realtime
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id text,
  type text not null,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

create or replace function public.create_app_notification(
  p_user_id uuid,
  p_booking_id text,
  p_type text,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, booking_id, type, title, body)
  values (p_user_id, p_booking_id, p_type, p_title, p_body);
end;
$$;

create or replace function public.admin_review_owner_verification(
  p_verification_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.owner_verifications%rowtype;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'هذه العملية متاحة للإدارة العامة فقط.';
  end if;

  if p_decision not in ('verified', 'unverified') then
    raise exception 'قرار المراجعة غير صالح.';
  end if;

  v_reason := nullif(trim(coalesce(p_rejection_reason, '')), '');

  if p_decision = 'unverified' and v_reason is null then
    raise exception 'يرجى كتابة سبب رفض طلب التوثيق ليظهر للمالك.';
  end if;

  update public.owner_verifications
  set status = p_decision,
      rejection_reason = case when p_decision = 'unverified' then v_reason else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_verification_id
  returning * into v_row;

  if not found then
    raise exception 'طلب التوثيق غير موجود.';
  end if;

  if p_decision = 'verified' then
    perform public.create_app_notification(
      v_row.owner_id,
      null,
      'verification_approved',
      'تم اعتماد توثيق حسابك كمُعلن موثق',
      'مبروك! تم قبول مستندات التوثيق وترقية حسابك إلى مالك موثق وتفعيل وحداتك المعلقة.'
    );
  else
    perform public.create_app_notification(
      v_row.owner_id,
      null,
      'verification_rejected',
      'يرجى مراجعة طلب توثيق المالك',
      'تم رفض مستند التوثيق للسبب التالي: ' || v_reason
    );
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_review_owner_verification(uuid, text, text) from public;
grant execute on function public.admin_review_owner_verification(uuid, text, text) to authenticated;

-- 4. Bookings Lifecycle Extensions, Exclusion Constraint & Payment Receipts Bucket
alter table public.bookings
  add column if not exists approved_at timestamptz,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists expires_at timestamptz default (now() + interval '24 hours'),
  add column if not exists rejection_reason text,
  add column if not exists payment_provider text not null default 'manual_transfer',
  add column if not exists payment_reference text;

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in (
    'pending',
    'approved',
    'payment_submitted',
    'confirmed',
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
  ) where (status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'pending_verification'));

-- Link notifications.booking_id softly/cleanly with FK if not present
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_booking_id_fkey'
  ) then
    alter table public.notifications
      add constraint notifications_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete cascade;
  end if;
end $$;

-- Private payment-receipts storage bucket (strictly renter + chalet owner + admin)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment_receipts_private_read" on storage.objects;
create policy "payment_receipts_private_read"
  on storage.objects for select
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1
        from public.bookings b
        join public.chalets c on c.id = b.chalet_id
        where b.receipt_path = storage.objects.name
          and c.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "payment_receipts_user_upload" on storage.objects;
create policy "payment_receipts_user_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update safe availability RPCs to reflect all active blocking statuses & exclude expired pending requests
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
set search_path = public, extensions
as $$
  select b.chalet_id, b.check_in, b.check_out, b.status
  from public.bookings b
  where b.chalet_id = p_chalet_id
    and b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'pending_verification')
    and (b.status <> 'pending' or b.expires_at is null or b.expires_at > now());
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
set search_path = public, extensions
as $$
  select b.chalet_id, b.check_in, b.check_out, b.status
  from public.bookings b
  where b.status in ('pending', 'approved', 'payment_submitted', 'confirmed', 'pending_verification')
    and (b.status <> 'pending' or b.expires_at is null or b.expires_at > now());
$$;

revoke all on function public.get_all_active_booked_ranges() from public;
grant execute on function public.get_all_active_booked_ranges() to anon, authenticated;

-- Update reveal_owner_contact to support approved / payment_submitted / confirmed / completed
create or replace function public.reveal_owner_contact(p_chalet_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid;
  is_authorized boolean;
  contact_row record;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'يجب تسجيل الدخول لعرض بيانات تواصل المالك.';
  end if;

  select (
    public.is_admin()
    or exists (
      select 1
      from public.chalets c
      where c.id = p_chalet_id
        and c.owner_id = caller_id
    )
    or exists (
      select 1
      from public.bookings b
      where b.chalet_id = p_chalet_id
        and b.renter_id = caller_id
        and b.status in ('approved', 'payment_submitted', 'confirmed', 'completed', 'pending_verification')
    )
  ) into is_authorized;

  if not is_authorized then
    raise exception 'تظهر بيانات الدفع والتواصل بمجرد موافقة المالك على طلب الحجز.';
  end if;

  select cc.owner_phone, cc.insta_pay_handle
  into contact_row
  from public.chalet_contacts cc
  where cc.chalet_id = p_chalet_id;

  if not found then
    return jsonb_build_object('owner_phone', null, 'insta_pay_handle', null);
  end if;

  return jsonb_build_object(
    'owner_phone', contact_row.owner_phone,
    'insta_pay_handle', contact_row.insta_pay_handle
  );
end;
$$;

revoke all on function public.reveal_owner_contact(text) from public;
grant execute on function public.reveal_owner_contact(text) to authenticated;

-- 5. Server-Side Authoritative Quote & Booking Lifecycle RPCs
create or replace function public.calculate_booking_quote(
  p_chalet_id text,
  p_check_in date,
  p_check_out date,
  p_rental_duration text default 'daily'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_chalet public.chalets%rowtype;
  v_nights integer;
  v_day date;
  v_day_iso text;
  v_rule jsonb;
  v_standard numeric;
  v_weekend numeric;
  v_peak numeric;
  v_rate numeric;
  v_subtotal numeric := 0;
  v_has_custom boolean := false;
  v_month integer;
  v_dow integer;
  v_dep_type text;
  v_dep_percent numeric;
  v_dep_fixed numeric;
  v_deposit_amount numeric := 0;
  v_remaining numeric := 0;
begin
  select * into v_chalet from public.chalets where id = p_chalet_id;
  if not found then
    raise exception 'الوحدة المطلوبة غير موجودة.';
  end if;

  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'تواريخ الوصول والمغادرة غير صالحة.';
  end if;

  v_nights := p_check_out - p_check_in;
  v_standard := coalesce(v_chalet.price_per_night, 0);
  v_weekend := coalesce(v_chalet.weekend_price_per_night, round((v_standard * 1.15) / 50.0) * 50.0);
  v_peak := coalesce(v_chalet.peak_price_per_night, round((v_standard * 1.25) / 50.0) * 50.0);

  v_dep_type := coalesce(v_chalet.deposit_type, 'percent');
  v_dep_percent := coalesce(v_chalet.down_payment_percent, 25);
  v_dep_fixed := coalesce(v_chalet.fixed_deposit_amount, 0);

  for i in 0..(v_nights - 1) loop
    v_day := p_check_in + i;
    v_day_iso := to_char(v_day, 'YYYY-MM-DD');
    v_rule := v_chalet.date_rules -> v_day_iso;

    if (v_day_iso = any(coalesce(v_chalet.blocked_dates, '{}'::text[]))
        and coalesce(v_rule ->> 'status', '') <> 'available')
       or coalesce(v_rule ->> 'status', '') = 'blocked' then
      raise exception 'التاريخ % مغلق من قِبل المالك ولا يمكن الحجز فيه.', v_day_iso;
    end if;

    if v_rule is not null and (v_rule ->> 'nightlyPrice') is not null and ((v_rule ->> 'nightlyPrice')::numeric > 0) then
      v_rate := (v_rule ->> 'nightlyPrice')::numeric;
      v_has_custom := true;
    else
      v_month := extract(month from v_day)::integer;
      v_dow := extract(dow from v_day)::integer;
      if v_month in (7, 8) then
        v_rate := v_peak;
      elsif v_dow in (4, 5) then
        v_rate := v_weekend;
      else
        v_rate := v_standard;
      end if;
    end if;

    v_subtotal := v_subtotal + v_rate;

    if v_rule is not null
       and (v_rule ->> 'depositType') is not null
       and (v_rule ->> 'depositValue') is not null
       and ((v_rule ->> 'depositValue')::numeric > 0) then
      v_dep_type := v_rule ->> 'depositType';
      if v_dep_type = 'fixed' then
        v_dep_fixed := (v_rule ->> 'depositValue')::numeric;
      else
        v_dep_percent := (v_rule ->> 'depositValue')::numeric;
      end if;
    end if;
  end loop;

  if p_rental_duration = 'monthly' and v_nights >= 28 and not v_has_custom then
    v_subtotal := coalesce(v_chalet.monthly_price, round(v_standard * 22)) * greatest(1, round(v_nights / 30.0));
  elsif p_rental_duration = 'weekly' and v_nights >= 7 and (v_nights % 7 = 0) and not v_has_custom then
    v_subtotal := coalesce(v_chalet.weekly_price, round(v_standard * 6.2)) * greatest(1, round(v_nights / 7.0));
  end if;

  if v_dep_type = 'fixed' and v_dep_fixed > 0 then
    v_deposit_amount := least(v_subtotal, v_dep_fixed);
  else
    v_deposit_amount := round((v_subtotal * v_dep_percent) / 100.0);
  end if;

  v_remaining := greatest(0, v_subtotal - v_deposit_amount);

  return jsonb_build_object(
    'nights', v_nights,
    'total_price', v_subtotal,
    'deposit_amount', v_deposit_amount,
    'remaining_amount', v_remaining,
    'security_deposit', coalesce(v_chalet.security_deposit, 0)
  );
end;
$$;

revoke all on function public.calculate_booking_quote(text, date, date, text) from public;
grant execute on function public.calculate_booking_quote(text, date, date, text) to anon, authenticated;

-- Sync stale pending (>24h -> expired) & finished confirmed stays (check_out <= today -> completed)
create or replace function public.sync_booking_lifecycle_statuses()
returns integer
language plpgsql
security definer
set search_path = public, extensions
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
      and b.expires_at <= now()
    returning b.id, b.renter_id, b.chalet_title, b.check_in, b.check_out
  loop
    v_updated := v_updated + 1;
    perform public.create_app_notification(
      v_row.renter_id,
      v_row.id,
      'booking_expired',
      'انتهت صلاحية طلب الحجز (٢٤ ساعة)',
      'انتهت مهلة ٢٤ ساعة دون رد المالك على طلب "' || v_row.chalet_title || '". يمكنك اختيار موعد أو وحدة أخرى.'
    );
  end loop;

  for v_row in
    update public.bookings b
    set status = 'completed',
        completed_at = coalesce(b.completed_at, now())
    where b.status = 'confirmed'
      and b.check_out <= current_date
    returning b.id, b.renter_id, b.chalet_title
  loop
    v_updated := v_updated + 1;
    perform public.create_app_notification(
      v_row.renter_id,
      v_row.id,
      'booking_completed',
      'اكتملت إقامتك — شارك تقييمك الآن',
      'نأمل أن تكون إقامتك في "' || v_row.chalet_title || '" قد نالت إعجابك. يمكنك الآن إضافة تقييم موثق.'
    );
  end loop;

  return v_updated;
end;
$$;

revoke all on function public.sync_booking_lifecycle_statuses() from public;
grant execute on function public.sync_booking_lifecycle_statuses() to authenticated;

-- Create Booking Request (Step 1: status = 'pending', expires in 24h, server pricing & overlap check)
create or replace function public.create_booking_request(
  p_chalet_id text,
  p_guest_name text,
  p_guest_phone text,
  p_check_in date,
  p_check_out date,
  p_guests integer default 1,
  p_rental_duration text default 'daily',
  p_inquiry_channel text default 'form',
  p_policy_accepted boolean default false,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_chalet public.chalets%rowtype;
  v_quote jsonb;
  v_booking public.bookings%rowtype;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً قبل إرسال طلب الحجز.';
  end if;

  if not coalesce(p_policy_accepted, false) then
    raise exception 'يجب الموافقة على شروط المنصة وسياسة الإلغاء قبل إرسال الطلب.';
  end if;

  if trim(coalesce(p_guest_name, '')) = '' or trim(coalesce(p_guest_phone, '')) = '' then
    raise exception 'يرجى إدخال الاسم الكامل ورقم الموبايل.';
  end if;

  select * into v_chalet from public.chalets where id = p_chalet_id;
  if not found then
    raise exception 'الوحدة المطلوبة غير موجودة.';
  end if;

  if v_chalet.availability_status <> 'active' then
    raise exception 'هذه الوحدة غير متاحة حالياً لاستقبال طلبات الحجز.';
  end if;

  if coalesce(p_guests, 1) > v_chalet.max_guests then
    raise exception 'عدد الأفراد يتجاوز الحد الأقصى المسموح في هذه الوحدة (%).', v_chalet.max_guests;
  end if;

  perform public.sync_booking_lifecycle_statuses();

  v_quote := public.calculate_booking_quote(p_chalet_id, p_check_in, p_check_out, coalesce(p_rental_duration, 'daily'));

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
    trim(p_guest_phone),
    p_check_in,
    p_check_out,
    (v_quote ->> 'nights')::integer,
    coalesce(p_rental_duration, 'daily'),
    coalesce(p_inquiry_channel, 'form'),
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

  perform public.create_app_notification(
    v_chalet.owner_id,
    v_booking.id,
    'booking_requested',
    'طلب حجز جديد بانتظار موافقتك',
    v_booking.guest_name || ' يطلب حجز "' || v_chalet.title || '" من ' || to_char(p_check_in, 'DD/MM/YYYY') || ' إلى ' || to_char(p_check_out, 'DD/MM/YYYY') || ' (مهلة الرد ٢٤ ساعة).'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.create_booking_request(text, text, text, date, date, integer, text, text, boolean, text) from public;
grant execute on function public.create_booking_request(text, text, text, date, date, integer, text, text, boolean, text) to authenticated;

-- Step 2: Owner approves booking & shares payment details (status: pending -> approved)
create or replace function public.approve_booking_request(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً.';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'طلب الحجز غير موجود.';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  if not public.is_admin() and v_owner_id <> v_caller then
    raise exception 'المالك أو الإدارة فقط يمكنهم الموافقة على الطلب.';
  end if;

  if v_booking.status = 'pending' and v_booking.expires_at is not null and v_booking.expires_at <= now() then
    update public.bookings set status = 'expired' where id = p_booking_id;
    raise exception 'انتهت صلاحية هذا الطلب بعد مرور ٢٤ ساعة دون رد.';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'لا يمكن الموافقة على هذا الطلب في حالته الحالية (%).', v_booking.status;
  end if;

  update public.bookings
  set status = 'approved',
      approved_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.create_app_notification(
    v_booking.renter_id,
    v_booking.id,
    'booking_approved',
    'تمت الموافقة المبدئية على طلبك — أكمل دفع العربون',
    'وافق المالك على حجز "' || v_booking.chalet_title || '". افتح "طلباتي" لمشاهدة بيانات التحويل ورفع إيصال العربون.'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.approve_booking_request(text) from public;
grant execute on function public.approve_booking_request(text) to authenticated;

-- Step 3: Renter uploads deposit receipt (status: approved -> payment_submitted)
create or replace function public.submit_booking_payment_receipt(
  p_booking_id text,
  p_receipt_path text,
  p_payment_provider text default 'manual_transfer',
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'طلب الحجز غير موجود.';
  end if;

  if not public.is_admin() and v_booking.renter_id <> v_caller then
    raise exception 'المستأجر صاحب الطلب فقط يمكنه رفع إيصال الدفع.';
  end if;

  if v_booking.status <> 'approved' then
    raise exception 'رفع إيصال الدفع متاح فقط بعد موافقة المالك المبدئية.';
  end if;

  if trim(coalesce(p_receipt_path, '')) = '' then
    raise exception 'يرجى إرفاق ملف إيصال التحويل أولاً.';
  end if;

  update public.bookings
  set status = 'payment_submitted',
      receipt_path = trim(p_receipt_path),
      payment_provider = coalesce(nullif(trim(p_payment_provider), ''), 'manual_transfer'),
      payment_reference = nullif(trim(coalesce(p_payment_reference, '')), ''),
      payment_submitted_at = now()
  where id = p_booking_id
  returning * into v_booking;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  perform public.create_app_notification(
    v_owner_id,
    v_booking.id,
    'payment_submitted',
    'تم رفع إيصال تحويل العربون',
    'قام ' || v_booking.guest_name || ' برفع إيصال العربون لحجز "' || v_booking.chalet_title || '". يرجى المراجعة وتأكيد الاستلام.'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.submit_booking_payment_receipt(text, text, text, text) from public;
grant execute on function public.submit_booking_payment_receipt(text, text, text, text) to authenticated;

-- Step 4: Owner or Admin confirms deposit receipt (status: payment_submitted/approved/pending_verification -> confirmed)
create or replace function public.confirm_booking_payment(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'طلب الحجز غير موجود.';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  if not public.is_admin() and v_owner_id <> v_caller then
    raise exception 'المالك أو الإدارة فقط يمكنهم تأكيد استلام العربون.';
  end if;

  if v_booking.status not in ('payment_submitted', 'pending_verification', 'approved') then
    raise exception 'لا يمكن تأكيد الحجز من الحالة الحالية (%).', v_booking.status;
  end if;

  update public.bookings
  set status = 'confirmed',
      confirmed_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.create_app_notification(
    v_booking.renter_id,
    v_booking.id,
    'booking_confirmed',
    'تم تأكيد حجزك نهائياً!',
    'أكد المالك استلام العربون لحجز "' || v_booking.chalet_title || '". بطاقة الترحيب وتعليمات الدخول متاحة الآن في طلباتي.'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.confirm_booking_payment(text) from public;
grant execute on function public.confirm_booking_payment(text) to authenticated;

-- Reject booking request (Owner or Admin)
create or replace function public.reject_booking_request(
  p_booking_id text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
  v_reason text;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'طلب الحجز غير موجود.';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  if not public.is_admin() and v_owner_id <> v_caller then
    raise exception 'المالك أو الإدارة فقط يمكنهم رفض طلب الحجز.';
  end if;

  if v_booking.status not in ('pending', 'approved', 'payment_submitted', 'pending_verification') then
    raise exception 'لا يمكن رفض الطلب في هذه المرحلة (%).', v_booking.status;
  end if;

  v_reason := nullif(trim(coalesce(p_rejection_reason, '')), '');

  update public.bookings
  set status = 'rejected',
      rejection_reason = v_reason,
      cancelled_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.create_app_notification(
    v_booking.renter_id,
    v_booking.id,
    'booking_rejected',
    'تعذر قبول طلب الحجز',
    case
      when v_reason is not null then 'تم رفض طلب حجز "' || v_booking.chalet_title || '" للسبب: ' || v_reason
      else 'تم رفض طلب حجز "' || v_booking.chalet_title || '" وإعادة فتح التواريخ.'
    end
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.reject_booking_request(text, text) from public;
grant execute on function public.reject_booking_request(text, text) to authenticated;

-- Mark booking completed manually (when checkout <= today or admin)
create or replace function public.complete_booking_stay(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'الحجز غير موجود.';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;
  if not public.is_admin() and v_owner_id <> v_caller then
    raise exception 'المالك أو الإدارة فقط يمكنهم إتمام الإقامة.';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'الإقامة المؤكدة فقط يمكن تحويلها إلى مكتملة.';
  end if;

  if not public.is_admin() and v_booking.check_out > current_date then
    raise exception 'لا يمكن إنهاء الإقامة قبل تاريخ المغادرة (%).', v_booking.check_out;
  end if;

  update public.bookings
  set status = 'completed',
      completed_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.create_app_notification(
    v_booking.renter_id,
    v_booking.id,
    'booking_completed',
    'اكتملت إقامتك — شارك تقييمك الآن',
    'تم تسجيل اكتمال إقامتك في "' || v_booking.chalet_title || '". يمكنك الآن تقييم الوحدة.'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.complete_booking_stay(text) from public;
grant execute on function public.complete_booking_stay(text) to authenticated;

-- Server-side Cancellation with 10-Day Forfeiture Policy
create or replace function public.cancel_booking_with_policy(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'يرجى تسجيل الدخول أولاً.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'الحجز غير موجود.';
  end if;

  select c.owner_id into v_owner_id from public.chalets c where c.id = v_booking.chalet_id;

  if not public.is_admin() and v_booking.renter_id <> v_caller and v_owner_id <> v_caller then
    raise exception 'غير مصرح بإلغاء هذا الحجز.';
  end if;

  if v_booking.status not in ('pending', 'approved', 'payment_submitted', 'confirmed', 'pending_verification') then
    raise exception 'لا يمكن إلغاء الحجز في حالته الحالية (%).', v_booking.status;
  end if;

  v_days_notice := (v_booking.check_in - current_date);
  v_is_forfeited := (v_days_notice < 10);
  v_forfeited_amount := case
    when v_is_forfeited and v_booking.status in ('confirmed', 'payment_submitted', 'pending_verification')
      then coalesce(v_booking.deposit_amount, round(v_booking.total_price * 0.25))
    else 0
  end;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_days_notice = v_days_notice,
      deposit_forfeited = v_is_forfeited,
      forfeited_amount = v_forfeited_amount
  where id = p_booking_id
  returning * into v_booking;

  v_target_notify := case when v_caller = v_booking.renter_id then v_owner_id else v_booking.renter_id end;
  perform public.create_app_notification(
    v_target_notify,
    v_booking.id,
    'booking_cancelled',
    'تم إلغاء الحجز',
    'تم إلغاء حجز "' || v_booking.chalet_title || '" وإعادة فتح التواريخ.'
  );

  return to_jsonb(v_booking);
end;
$$;

revoke all on function public.cancel_booking_with_policy(text) from public;
grant execute on function public.cancel_booking_with_policy(text) to authenticated;

-- Tighten bookings update rules trigger so normal users go through RPCs or safe cancellation
create or replace function public.enforce_booking_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') or public.is_admin() then
    return new;
  end if;

  -- Direct client table mutations are blocked if changing status arbitrarily;
  -- transitions must run inside the SECURITY DEFINER RPC functions above.
  if pg_trigger_depth() = 1 and new.status is distinct from old.status then
    raise exception 'يرجى تحديث حالة الحجز عبر إجراءات المنصة المعتمدة.';
  end if;

  return new;
end;
$$;

-- 6. Reviews Hardening: ONLY after booking status = 'completed' + Server Rating Aggregation Trigger
drop policy if exists "reviews_insert_verified_stay" on public.reviews;
create policy "reviews_insert_verified_stay"
  on public.reviews for insert
  with check (
    renter_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.chalet_id = reviews.chalet_id
        and b.renter_id = auth.uid()
        and b.status = 'completed'
    )
  );

create or replace function public.recalculate_chalet_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chalet_id text;
  v_avg numeric;
  v_cnt integer;
begin
  v_chalet_id := coalesce(new.chalet_id, old.chalet_id);

  select coalesce(round(avg(r.rating)::numeric, 2), 5.0), count(*)::integer
  into v_avg, v_cnt
  from public.reviews r
  where r.chalet_id = v_chalet_id;

  update public.chalets
  set rating = v_avg,
      reviews_count = v_cnt
  where id = v_chalet_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalculate_chalet_rating on public.reviews;
create trigger trg_recalculate_chalet_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalculate_chalet_rating_stats();
