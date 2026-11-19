-- AgzStay Phase 1 Schema, Strict RLS, Double-Booking Prevention & Secure Contact RPC
-- Run this migration in Supabase SQL Editor (Project -> SQL Editor -> New Query)

-- 1. Extensions
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- 2. Profiles Table (Role NEVER trusted from user_metadata; users cannot self-promote)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text,
  role text not null default 'guest' check (role in ('guest', 'owner', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_name text;
begin
  fallback_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'مستخدم إجازة ستاي'
  );

  insert into public.profiles (id, name, phone, role)
  values (
    new.id,
    fallback_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'guest'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_profile_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if current_user not in ('postgres', 'supabase_admin', 'service_role')
       and not public.is_admin() then
      raise exception 'لا يُسمح بتغيير الصلاحيات من المستخدم مباشرة.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_role_self_change on public.profiles;
create trigger trg_prevent_profile_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_profile_role_self_change();

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 3. Chalets Table (Public listing data WITHOUT owner phone)
create table if not exists public.chalets (
  id text primary key default ('prop-' || encode(gen_random_bytes(6), 'hex')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  unit_number integer,
  title text not null,
  listing_mode text not null default 'rent' check (listing_mode in ('rent')),
  availability_status text not null default 'active' check (availability_status in ('active', 'rented')),
  supported_durations text[] not null default array['daily', 'weekly', 'monthly']::text[],
  destination text not null,
  governorate text,
  area text,
  destination_label text not null,
  resort text not null,
  unit_type text not null,
  view_type text not null,
  includes_passes boolean not null default true,
  verified_live_photos boolean not null default false,
  live_photos_verified_at text,
  welcome_guide jsonb,
  host_tier text not null default 'free' check (host_tier in ('free', 'pro')),
  price_per_night numeric not null check (price_per_night >= 0),
  weekly_price numeric,
  monthly_price numeric,
  weekend_price_per_night numeric,
  peak_price_per_night numeric,
  security_deposit numeric not null default 0 check (security_deposit >= 0),
  down_payment_percent numeric not null default 25 check (down_payment_percent >= 0 and down_payment_percent <= 100),
  deposit_type text not null default 'percent' check (deposit_type in ('percent', 'fixed')),
  fixed_deposit_amount numeric,
  bedrooms integer not null default 1 check (bedrooms >= 0),
  bathrooms integer not null default 1 check (bathrooms >= 0),
  area_sqm numeric,
  max_guests integer not null default 2 check (max_guests > 0),
  beach_distance_meters integer not null default 0 check (beach_distance_meters >= 0),
  coordinates jsonb not null,
  rating numeric not null default 5.0 check (rating >= 0 and rating <= 5),
  reviews_count integer not null default 0 check (reviews_count >= 0),
  images text[] not null default '{}'::text[],
  amenities text[] not null default '{}'::text[],
  blocked_dates text[] not null default '{}'::text[],
  date_rules jsonb not null default '{}'::jsonb,
  nearby_highlights jsonb not null default '[]'::jsonb,
  description text not null default '',
  rules text[] not null default '{}'::text[],
  owner_name text not null,
  owner_role_type text not null default 'owner' check (owner_role_type in ('owner', 'founding-owner', 'broker')),
  broker_agency text,
  owner_verified boolean not null default false,
  owner_response_time text not null default 'يرد خلال دقائق',
  owner_member_since text not null default '٢٠٢٦',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chalets_owner_id on public.chalets (owner_id);
create index if not exists idx_chalets_status on public.chalets (availability_status);

alter table public.chalets enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_chalets_updated_at on public.chalets;
create trigger trg_chalets_updated_at
  before update on public.chalets
  for each row execute function public.touch_updated_at();

drop policy if exists "chalets_public_read_active" on public.chalets;
create policy "chalets_public_read_active"
  on public.chalets for select
  using (
    availability_status = 'active'
    or owner_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "chalets_owner_insert" on public.chalets;
create policy "chalets_owner_insert"
  on public.chalets for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'admin')
    )
  );

drop policy if exists "chalets_owner_update" on public.chalets;
create policy "chalets_owner_update"
  on public.chalets for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "chalets_owner_delete" on public.chalets;
create policy "chalets_owner_delete"
  on public.chalets for delete
  using (owner_id = auth.uid() or public.is_admin());

-- 4. Private Chalet Contacts Table (NEVER publicly readable)
create table if not exists public.chalet_contacts (
  chalet_id text primary key references public.chalets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_phone text not null,
  insta_pay_handle text,
  updated_at timestamptz not null default now()
);

alter table public.chalet_contacts enable row level security;

drop trigger if exists trg_chalet_contacts_updated_at on public.chalet_contacts;
create trigger trg_chalet_contacts_updated_at
  before update on public.chalet_contacts
  for each row execute function public.touch_updated_at();

drop policy if exists "chalet_contacts_owner_read" on public.chalet_contacts;
create policy "chalet_contacts_owner_read"
  on public.chalet_contacts for select
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "chalet_contacts_owner_insert" on public.chalet_contacts;
create policy "chalet_contacts_owner_insert"
  on public.chalet_contacts for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.chalets c
      where c.id = chalet_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists "chalet_contacts_owner_update" on public.chalet_contacts;
create policy "chalet_contacts_owner_update"
  on public.chalet_contacts for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "chalet_contacts_owner_delete" on public.chalet_contacts;
create policy "chalet_contacts_owner_delete"
  on public.chalet_contacts for delete
  using (owner_id = auth.uid() or public.is_admin());

-- 5. Bookings Table with DB-level Double-Booking Exclusion Constraint
create table if not exists public.bookings (
  id text primary key default ('booking-' || encode(gen_random_bytes(6), 'hex')),
  chalet_id text not null references public.chalets(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  chalet_title text not null,
  resort text not null,
  destination_label text not null,
  owner_name text not null,
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
  status text not null default 'pending_verification' check (status in ('pending', 'pending_verification', 'confirmed', 'cancelled')),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_days_notice integer,
  deposit_forfeited boolean not null default false,
  forfeited_amount numeric not null default 0 check (forfeited_amount >= 0),
  created_at timestamptz not null default now(),
  constraint bookings_dates_valid check (check_out > check_in),
  constraint bookings_no_overlap exclude using gist (
    chalet_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('pending', 'pending_verification', 'confirmed'))
);

create index if not exists idx_bookings_chalet_id on public.bookings (chalet_id);
create index if not exists idx_bookings_renter_id on public.bookings (renter_id);

alter table public.bookings enable row level security;

create or replace function public.enforce_booking_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_chalet_owner boolean;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') or public.is_admin() then
    return new;
  end if;

  select exists (
    select 1
    from public.chalets c
    where c.id = new.chalet_id
      and c.owner_id = auth.uid()
  ) into is_chalet_owner;

  -- Only chalet owner or admin may confirm a booking
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    if not is_chalet_owner then
      raise exception 'المالك أو الإدارة فقط يمكنهم تأكيد استلام جدية الحجز.';
    end if;
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if not is_chalet_owner and new.renter_id <> auth.uid() then
      raise exception 'غير مصرح بإلغاء هذا الحجز.';
    end if;
    new.cancelled_at := coalesce(new.cancelled_at, now());
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
    renter_id = auth.uid()
    or exists (
      select 1
      from public.chalets c
      where c.id = chalet_id
        and c.owner_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "bookings_insert_renter" on public.bookings;
create policy "bookings_insert_renter"
  on public.bookings for insert
  with check (
    renter_id = auth.uid()
    and policy_accepted = true
    and status in ('pending', 'pending_verification')
  );

drop policy if exists "bookings_update_renter_owner_admin" on public.bookings;
create policy "bookings_update_renter_owner_admin"
  on public.bookings for update
  using (
    renter_id = auth.uid()
    or exists (
      select 1
      from public.chalets c
      where c.id = chalet_id
        and c.owner_id = auth.uid()
    )
    or public.is_admin()
  )
  with check (
    renter_id = auth.uid()
    or exists (
      select 1
      from public.chalets c
      where c.id = chalet_id
        and c.owner_id = auth.uid()
    )
    or public.is_admin()
  );

-- 6. Safe Public Availability RPCs (no PII exposed)
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
set search_path = public
as $$
  select b.chalet_id, b.check_in, b.check_out, b.status
  from public.bookings b
  where b.chalet_id = p_chalet_id
    and b.status in ('pending', 'pending_verification', 'confirmed');
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
set search_path = public
as $$
  select b.chalet_id, b.check_in, b.check_out, b.status
  from public.bookings b
  where b.status in ('pending', 'pending_verification', 'confirmed');
$$;

revoke all on function public.get_all_active_booked_ranges() from public;
grant execute on function public.get_all_active_booked_ranges() to anon, authenticated;

-- 7. Reviews Table (ONLY confirmed & completed bookings, max 1 review per booking)
create table if not exists public.reviews (
  id text primary key default ('review-' || encode(gen_random_bytes(6), 'hex')),
  chalet_id text not null references public.chalets(id) on delete cascade,
  booking_id text not null unique references public.bookings(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  rating numeric not null check (rating >= 1 and rating <= 5),
  tags text[] not null default '{}'::text[],
  comment text not null,
  stay_date text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_chalet_id on public.reviews (chalet_id);

alter table public.reviews enable row level security;

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read"
  on public.reviews for select
  using (true);

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
        and b.status = 'confirmed'
        and b.check_out <= current_date
    )
  );

drop policy if exists "reviews_delete_author_or_admin" on public.reviews;
create policy "reviews_delete_author_or_admin"
  on public.reviews for delete
  using (renter_id = auth.uid() or public.is_admin());

-- 8. Renter Trust Reviews Table
create table if not exists public.renter_trust_reviews (
  id text primary key default ('trust-' || encode(gen_random_bytes(6), 'hex')),
  booking_id text not null unique references public.bookings(id) on delete cascade,
  chalet_id text not null references public.chalets(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  renter_id uuid references public.profiles(id) on delete set null,
  renter_name text not null,
  renter_phone text not null,
  host_name text not null,
  chalet_title text not null,
  rating numeric not null check (rating >= 1 and rating <= 5),
  punctuality_score numeric not null check (punctuality_score >= 1 and punctuality_score <= 5),
  property_care_score numeric not null check (property_care_score >= 1 and property_care_score <= 5),
  tags text[] not null default '{}'::text[],
  comment text not null,
  created_at timestamptz not null default now()
);

alter table public.renter_trust_reviews enable row level security;

drop policy if exists "renter_trust_select" on public.renter_trust_reviews;
create policy "renter_trust_select"
  on public.renter_trust_reviews for select
  using (
    host_id = auth.uid()
    or renter_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "renter_trust_insert_host" on public.renter_trust_reviews;
create policy "renter_trust_insert_host"
  on public.renter_trust_reviews for insert
  with check (
    host_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      join public.chalets c on c.id = b.chalet_id
      where b.id = booking_id
        and b.chalet_id = renter_trust_reviews.chalet_id
        and c.owner_id = auth.uid()
    )
  );

-- 9. Listing Reports Table + Aggregate Count RPC
create table if not exists public.listing_reports (
  id text primary key default ('report-' || encode(gen_random_bytes(6), 'hex')),
  chalet_id text not null references public.chalets(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

alter table public.listing_reports enable row level security;

drop policy if exists "listing_reports_select_admin_or_reporter" on public.listing_reports;
create policy "listing_reports_select_admin_or_reporter"
  on public.listing_reports for select
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "listing_reports_insert_auth" on public.listing_reports;
create policy "listing_reports_insert_auth"
  on public.listing_reports for insert
  with check (reporter_id = auth.uid());

create or replace function public.get_chalet_report_counts()
returns table (
  chalet_id text,
  report_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select lr.chalet_id, count(*)::bigint as report_count
  from public.listing_reports lr
  group by lr.chalet_id;
$$;

revoke all on function public.get_chalet_report_counts() from public;
grant execute on function public.get_chalet_report_counts() to anon, authenticated;

-- 10. Owner Verifications Table (Owner creates/reads own; ONLY admin updates status)
create table if not exists public.owner_verifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  owner_name text not null,
  phone text not null,
  document_type text not null check (document_type in ('resort-card', 'ownership-contract', 'authorization')),
  document_number text not null,
  document_path text not null,
  status text not null default 'pending' check (status in ('unverified', 'pending', 'verified')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.owner_verifications enable row level security;

create or replace function public.handle_owner_verification_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.status := 'pending';
      new.reviewed_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_admin() and current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'الإدارة فقط يمكنها مراجعة وتحديث حالة التوثيق.';
    end if;

    if new.status = 'verified' and old.status is distinct from 'verified' then
      new.reviewed_at := now();
      update public.profiles
      set role = case when role = 'guest' then 'owner' else role end
      where id = new.owner_id;

      update public.chalets
      set owner_verified = true
      where owner_id = new.owner_id;
    elsif new.status <> 'verified' then
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_owner_verifications_rules on public.owner_verifications;
create trigger trg_owner_verifications_rules
  before insert or update on public.owner_verifications
  for each row execute function public.handle_owner_verification_rules();

drop policy if exists "owner_verifications_select" on public.owner_verifications;
create policy "owner_verifications_select"
  on public.owner_verifications for select
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "owner_verifications_insert" on public.owner_verifications;
create policy "owner_verifications_insert"
  on public.owner_verifications for insert
  with check (owner_id = auth.uid() and status = 'pending');

drop policy if exists "owner_verifications_update_admin_only" on public.owner_verifications;
create policy "owner_verifications_update_admin_only"
  on public.owner_verifications for update
  using (public.is_admin())
  with check (public.is_admin());

-- 11. Host Subscriptions Table
create table if not exists public.host_subscriptions (
  id text primary key default ('sub-' || encode(gen_random_bytes(6), 'hex')),
  host_id uuid not null references public.profiles(id) on delete cascade,
  host_name text not null,
  host_phone text not null,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  status text not null default 'pending-verification' check (status in ('active', 'pending-verification', 'expired')),
  monthly_fee numeric not null default 150 check (monthly_fee >= 0),
  payment_method text,
  sender_phone_or_handle text,
  transfer_reference text,
  receipt_path text,
  start_date date not null default current_date,
  expiry_date date not null default (current_date + interval '30 days')::date,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table public.host_subscriptions enable row level security;

drop policy if exists "host_subscriptions_select" on public.host_subscriptions;
create policy "host_subscriptions_select"
  on public.host_subscriptions for select
  using (host_id = auth.uid() or public.is_admin());

drop policy if exists "host_subscriptions_insert" on public.host_subscriptions;
create policy "host_subscriptions_insert"
  on public.host_subscriptions for insert
  with check (host_id = auth.uid() and status = 'pending-verification');

drop policy if exists "host_subscriptions_update_admin_only" on public.host_subscriptions;
create policy "host_subscriptions_update_admin_only"
  on public.host_subscriptions for update
  using (public.is_admin())
  with check (public.is_admin());

-- 12. Secure RPC to Reveal Owner Phone & InstaPay ONLY after an active booking exists
create or replace function public.reveal_owner_contact(p_chalet_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
        and b.status in ('pending', 'pending_verification', 'confirmed')
    )
  ) into is_authorized;

  if not is_authorized then
    raise exception 'غير مصرح بعرض بيانات التواصل قبل إرسال طلب حجز.';
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

-- 13. Storage Buckets & Strict Folder/MIME/Size Policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chalet-images',
  'chalet-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: chalet-images (public read, owner folder upload/delete)
drop policy if exists "chalet_images_public_read" on storage.objects;
create policy "chalet_images_public_read"
  on storage.objects for select
  using (bucket_id = 'chalet-images');

drop policy if exists "chalet_images_owner_upload" on storage.objects;
create policy "chalet_images_owner_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'chalet-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chalet_images_owner_delete" on storage.objects;
create policy "chalet_images_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'chalet-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Storage policies: verification-docs (fully private: owner folder + admin)
drop policy if exists "verification_docs_private_read" on storage.objects;
create policy "verification_docs_private_read"
  on storage.objects for select
  using (
    bucket_id = 'verification-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "verification_docs_owner_upload" on storage.objects;
create policy "verification_docs_owner_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'verification-docs'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies: receipts (private: uploader folder, chalet owner of that booking, or admin)
drop policy if exists "receipts_private_read" on storage.objects;
create policy "receipts_private_read"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
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

drop policy if exists "receipts_user_upload" on storage.objects;
create policy "receipts_user_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 14. Enable Realtime for bookings calendar sync (safe if publication already includes table)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.bookings;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
