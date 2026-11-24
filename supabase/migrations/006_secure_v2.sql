-- ============================================================================
-- AgzStay V2 Hardened Security Migration (006_secure_v2.sql)
-- Idempotent migration supporting BOTH fresh V2 installs and staging upgrades
-- from 001_init.sql .. 005_agzstay_v2_schema.sql.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 0. Global Platform Settings (Controls Verified-Owner Publish Gate)
-- ----------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id text primary key default 'global' check (id = 'global'),
  require_verified_to_publish boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.platform_settings (id, require_verified_to_publish)
values ('global', false)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- ----------------------------------------------------------------------------
-- 1. Profiles Table & Auth Role Helpers (Zero-Trust Role Protection)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text,
  advertiser_type text not null default 'owner' check (advertiser_type in ('owner', 'broker')),
  role text not null default 'guest' check (role in ('guest', 'owner', 'admin')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified')),
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.profiles
  add column if not exists name text not null default '',
  add column if not exists phone text,
  add column if not exists advertiser_type text not null default 'owner',
  add column if not exists role text not null default 'guest',
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists created_at timestamptz not null default pg_catalog.now();

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_advertiser_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_advertiser_type_check
      check (advertiser_type in ('owner', 'broker'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('guest', 'owner', 'admin'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_verification_status_check
      check (verification_status in ('unverified', 'pending', 'verified'));
  end if;
end $$;

create index if not exists idx_profiles_admin_id
  on public.profiles (id)
  where role = 'admin';

create index if not exists idx_profiles_phone_digits
  on public.profiles (phone);

alter table public.profiles enable row level security;

-- Helper: Strict admin check with empty search_path and initPlan auth.uid()
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Handle new auth.users signup (NEVER trusts client-supplied privileged role)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_adv_type text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
    'مستخدم إجازة ستاي'
  );
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  v_adv_type := case
    when coalesce(new.raw_user_meta_data ->> 'advertiser_type', '') = 'broker' then 'broker'
    else 'owner'
  end;

  insert into public.profiles (id, name, phone, advertiser_type, role, verification_status)
  values (new.id, v_name, v_phone, v_adv_type, 'guest', 'unverified')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY INVOKER so current_user reflects the real caller (never 'none' bypass!)
create or replace function public.prevent_profile_role_self_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trusted_db_role boolean;
begin
  v_trusted_db_role := (current_user in ('postgres', 'supabase_admin', 'service_role'));

  if (new.role is distinct from old.role or new.verification_status is distinct from old.verification_status) then
    if not v_trusted_db_role and not public.is_admin() then
      raise exception 'forbidden';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_role_self_change on public.profiles;
create trigger trg_prevent_profile_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_profile_role_self_change();

-- Safe self-service upgrade from guest -> owner (never admin)
create or replace function public.become_host(
  p_advertiser_type text default 'owner'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_type text;
  v_profile public.profiles%rowtype;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  v_type := case
    when p_advertiser_type = 'broker' then 'broker'
    else 'owner'
  end;

  update public.profiles
  set role = case when role = 'guest' then 'owner' else role end,
      advertiser_type = v_type
  where id = v_caller
  returning * into v_profile;

  if not found then
    insert into public.profiles (id, name, role, advertiser_type, verification_status)
    values (v_caller, 'مستخدم إجازة ستاي', 'owner', v_type, 'unverified')
    on conflict (id) do update
      set role = case when public.profiles.role = 'guest' then 'owner' else public.profiles.role end,
          advertiser_type = excluded.advertiser_type
    returning * into v_profile;
  end if;

  return pg_catalog.to_jsonb(v_profile);
end;
$$;

revoke all on function public.become_host(text) from public;
grant execute on function public.become_host(text) to authenticated, service_role;

-- Profiles RLS & least-privilege column grants
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

revoke all on table public.profiles from public, anon, authenticated;
grant select (id, name, phone, advertiser_type, role, verification_status, created_at)
  on public.profiles to authenticated;
grant update (name, phone, advertiser_type)
  on public.profiles to authenticated;

-- Platform settings RLS
drop policy if exists "platform_settings_read" on public.platform_settings;
create policy "platform_settings_read"
  on public.platform_settings for select
  using (true);

drop policy if exists "platform_settings_admin_update" on public.platform_settings;
create policy "platform_settings_admin_update"
  on public.platform_settings for update
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.platform_settings from public, anon, authenticated;
grant select on table public.platform_settings to anon, authenticated;
grant update (require_verified_to_publish, updated_at) on table public.platform_settings to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Plans Table (Authoritative Server Pricing & Quotas)
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,
  name text not null,
  badge text not null default '',
  price numeric not null default 0 check (price >= 0),
  max_units integer not null default 1 check (max_units >= 1),
  is_featured_eligible boolean not null default false,
  priority_label text not null default '',
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_plans_sort_order
  on public.plans (sort_order asc);

alter table public.plans enable row level security;

insert into public.plans (id, name, badge, price, max_units, is_featured_eligible, priority_label, features, sort_order, is_active)
values
  (
    'free',
    'الباقة المجانية',
    'ابدأ مجاناً',
    0,
    1,
    false,
    'ظهور عادي في نتائج البحث',
    '["إضافة وحدة واحدة مجاناً بدون رسوم","تواصل مباشر من المستأجرين عبر واتساب والهاتف","إدارة تقويم التواريخ المتاحة والمغلقة"]'::jsonb,
    1,
    true
  ),
  (
    'starter',
    'باقة البداية (Starter)',
    'للملاك الأفراد',
    500,
    5,
    true,
    'شارة إعلان مميز',
    '["نشر حتى ٥ وحدات عقارية في نفس الوقت","تفعيل شارة \"إعلان مميز\" على وحداتك تلقائياً","إدارة كاملة للتقويم وحجب التواريخ المحجوزة"]'::jsonb,
    2,
    true
  ),
  (
    'pro',
    'الباقة الاحترافية (Pro)',
    'الأكثر طلباً',
    800,
    10,
    true,
    'شارة مميز + أولوية ظهور',
    '["نشر حتى ١٠ وحدات عقارية بمختلف المحافظات","أولوية ظهور أعلى في الصفحة الرئيسية ونتائج البحث","شارة \"إعلان مميز\" على كافة وحداتك النشطة"]'::jsonb,
    3,
    true
  ),
  (
    'enterprise',
    'باقة الشركات والمكاتب (Enterprise)',
    'للمكاتب والوسطاء',
    1500,
    20,
    true,
    'شارة مميز + ترويج وأولوية قصوى',
    '["نشر حتى ٢٠ وحدة (شقق مفروشة، فاضية، شاليهات، فيلات)","أعلى أولوية ظهور وترويج لوحدات المكتب أو الشركة","شارة \"إعلان مميز\" وتقارير توافر شاملة"]'::jsonb,
    4,
    true
  )
on conflict (id) do update
set name = excluded.name,
    badge = excluded.badge,
    price = excluded.price,
    max_units = excluded.max_units,
    is_featured_eligible = excluded.is_featured_eligible,
    priority_label = excluded.priority_label,
    features = excluded.features,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read"
  on public.plans for select
  using (is_active = true or public.is_admin());

drop policy if exists "plans_admin_write" on public.plans;
create policy "plans_admin_write"
  on public.plans for all
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.plans from public, anon, authenticated;
grant select on table public.plans to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Chalets & Private Chalet Contacts (Safe Staging Backfill + Hardening)
-- ----------------------------------------------------------------------------
create table if not exists public.chalets (
  id text primary key default ('prop-' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
  owner_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  governorate text,
  city text,
  area_or_village text,
  property_type text not null default 'شاليه',
  advertiser_role text not null default 'مالك مباشر',
  owner_name text not null default 'معلن AgzStay',
  is_featured boolean not null default false,
  owner_verified boolean not null default false,
  deposit_type text not null default 'percent',
  deposit_value numeric not null default 0 check (deposit_value >= 0),
  price_per_night numeric not null default 0 check (price_per_night >= 0),
  weekly_price numeric,
  monthly_price numeric,
  bedrooms integer not null default 1 check (bedrooms >= 0),
  bathrooms integer not null default 1 check (bathrooms >= 0),
  area_sqm numeric,
  max_guests integer not null default 2 check (max_guests > 0),
  beach_distance_meters integer not null default 0 check (beach_distance_meters >= 0),
  coordinates jsonb,
  images text[] not null default '{}'::text[],
  amenities text[] not null default '{}'::text[],
  blocked_dates text[] not null default '{}'::text[],
  rules text[] not null default '{}'::text[],
  availability_status text not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.chalets
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists description text not null default '',
  add column if not exists governorate text,
  add column if not exists city text,
  add column if not exists area_or_village text,
  add column if not exists property_type text not null default 'شاليه',
  add column if not exists advertiser_role text not null default 'مالك مباشر',
  add column if not exists owner_name text not null default 'معلن AgzStay',
  add column if not exists is_featured boolean not null default false,
  add column if not exists owner_verified boolean not null default false,
  add column if not exists deposit_type text not null default 'percent',
  add column if not exists deposit_value numeric not null default 0,
  add column if not exists price_per_night numeric not null default 0,
  add column if not exists weekly_price numeric,
  add column if not exists monthly_price numeric,
  add column if not exists bedrooms integer not null default 1,
  add column if not exists bathrooms integer not null default 1,
  add column if not exists area_sqm numeric,
  add column if not exists max_guests integer not null default 2,
  add column if not exists beach_distance_meters integer not null default 0,
  add column if not exists coordinates jsonb,
  add column if not exists images text[] not null default '{}'::text[],
  add column if not exists amenities text[] not null default '{}'::text[],
  add column if not exists blocked_dates text[] not null default '{}'::text[],
  add column if not exists rules text[] not null default '{}'::text[],
  add column if not exists availability_status text not null default 'active',
  add column if not exists created_at timestamptz not null default pg_catalog.now(),
  add column if not exists updated_at timestamptz not null default pg_catalog.now();

create table if not exists public.chalet_contacts (
  chalet_id text primary key references public.chalets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_phone text not null,
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.chalet_contacts enable row level security;

-- Safe staging data cleanup & backfill BEFORE adding strict constraints
do $$
declare
  v_has_owner_phone boolean;
  v_has_featured boolean;
  v_has_dest_label boolean;
  v_has_resort boolean;
  v_has_unit_type boolean;
  v_has_fixed_dep boolean;
  v_has_down_pct boolean;
  v_fallback_admin uuid;
begin
  -- Make obsolete 001 NOT NULL columns nullable if present
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'destination') then
    alter table public.chalets alter column destination drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'destination_label') then
    alter table public.chalets alter column destination_label drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'resort') then
    alter table public.chalets alter column resort drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'unit_type') then
    alter table public.chalets alter column unit_type drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'view_type') then
    alter table public.chalets alter column view_type drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'coordinates') then
    alter table public.chalets alter column coordinates drop not null;
  end if;

  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'owner_phone') into v_has_owner_phone;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'featured') into v_has_featured;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'destination_label') into v_has_dest_label;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'resort') into v_has_resort;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'unit_type') into v_has_unit_type;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'fixed_deposit_amount') into v_has_fixed_dep;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chalets' and column_name = 'down_payment_percent') into v_has_down_pct;

  -- Backfill V2 semantic columns from 001 legacy columns if present
  if v_has_dest_label then
    execute 'update public.chalets set governorate = coalesce(governorate, destination_label) where governorate is null';
  end if;
  if v_has_resort then
    execute 'update public.chalets set area_or_village = coalesce(area_or_village, resort) where area_or_village is null';
  end if;
  if v_has_unit_type then
    execute 'update public.chalets set property_type = coalesce(nullif(property_type, ''''), unit_type, ''شاليه'') where property_type is null or property_type = ''''';
  end if;
  if v_has_featured then
    execute 'update public.chalets set is_featured = true where featured = true and is_featured = false';
  end if;
  if v_has_fixed_dep and v_has_down_pct then
    execute '
      update public.chalets
      set deposit_value = case
        when deposit_type in (''fixed'', ''ج.م'') then coalesce(fixed_deposit_amount, 0)
        else coalesce(down_payment_percent, 25)
      end
      where coalesce(deposit_value, 0) = 0
    ';
  end if;

  -- Normalize deposit_type & availability_status from 005 values before strict checks
  update public.chalets
  set deposit_type = case
    when deposit_type in ('fixed', 'ج.م') then 'fixed'
    else 'percent'
  end
  where deposit_type is distinct from case
    when deposit_type in ('fixed', 'ج.م') then 'fixed'
    else 'percent'
  end;

  update public.chalets
  set availability_status = case
    when availability_status = 'draft' then 'hidden'
    when availability_status in ('active', 'hidden', 'rented', 'pending_review') then availability_status
    else 'active'
  end
  where availability_status is distinct from case
    when availability_status = 'draft' then 'hidden'
    when availability_status in ('active', 'hidden', 'rented', 'pending_review') then availability_status
    else 'active'
  end;

  -- Recover owner_id on legacy 005 rows by normalized phone -> fallback admin profile
  select p.id into v_fallback_admin
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at asc
  limit 1;

  if v_has_owner_phone then
    execute '
      update public.chalets c
      set owner_id = p.id
      from public.profiles p
      where c.owner_id is null
        and nullif(trim(coalesce(c.owner_phone, '''')), '''') is not null
        and pg_catalog.regexp_replace(coalesce(p.phone, ''''), ''\D'', '''', ''g'') =
            pg_catalog.regexp_replace(c.owner_phone, ''\D'', '''', ''g'')
    ';
  end if;

  if v_fallback_admin is not null then
    update public.chalets
    set owner_id = v_fallback_admin
    where owner_id is null;
  end if;

  -- Migrate any chalets.owner_phone into private public.chalet_contacts and drop column
  if v_has_owner_phone then
    execute '
      insert into public.chalet_contacts (chalet_id, owner_id, owner_phone)
      select c.id, c.owner_id, trim(c.owner_phone)
      from public.chalets c
      where c.owner_id is not null
        and nullif(trim(coalesce(c.owner_phone, '''')), '''') is not null
      on conflict (chalet_id) do update
        set owner_id = excluded.owner_id,
            owner_phone = excluded.owner_phone
    ';
    drop index if exists public.idx_chalets_owner_phone;
    alter table public.chalets drop column if exists owner_phone;
  end if;
end $$;

-- Strict constraints on chalets
alter table public.chalets drop constraint if exists chalets_deposit_type_check;
alter table public.chalets
  add constraint chalets_deposit_type_check
  check (deposit_type in ('percent', 'fixed'));

alter table public.chalets drop constraint if exists chalets_availability_status_check;
alter table public.chalets
  add constraint chalets_availability_status_check
  check (availability_status in ('active', 'hidden', 'rented', 'pending_review'));

-- Enforce NOT NULL on owner_id when no orphan pre-V2 rows remain
do $$
begin
  if not exists (select 1 from public.chalets where owner_id is null) then
    alter table public.chalets alter column owner_id set not null;
  end if;
end $$;

create index if not exists idx_chalets_owner_id
  on public.chalets (owner_id);
create index if not exists idx_chalets_availability_status
  on public.chalets (availability_status);
create index if not exists idx_chalets_featured
  on public.chalets (is_featured desc, created_at desc);
create index if not exists idx_chalets_governorate
  on public.chalets (governorate, city);

create index if not exists idx_chalet_contacts_owner_id
  on public.chalet_contacts (owner_id);

alter table public.chalets enable row level security;

-- Updated_at trigger helper (empty search_path)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists trg_chalets_updated_at on public.chalets;
create trigger trg_chalets_updated_at
  before update on public.chalets
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_chalet_contacts_updated_at on public.chalet_contacts;
create trigger trg_chalet_contacts_updated_at
  before update on public.chalet_contacts
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Subscriptions Table (Staging Backfill + Strict Constraints & Unique Indexes)
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id text primary key default ('sub-' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
  user_id uuid references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  plan_name text not null,
  price numeric not null default 0 check (price >= 0),
  max_units integer not null default 1 check (max_units >= 1),
  receipt_path text,
  status text not null default 'pending',
  admin_note text,
  expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz
);

alter table public.subscriptions
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists admin_note text,
  add column if not exists expires_at timestamptz,
  add column if not exists reviewed_at timestamptz;

do $$
declare
  v_has_sub_phone boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'owner_phone'
  ) into v_has_sub_phone;

  if v_has_sub_phone then
    execute '
      update public.subscriptions s
      set user_id = p.id
      from public.profiles p
      where s.user_id is null
        and nullif(trim(coalesce(s.owner_phone, '''')), '''') is not null
        and pg_catalog.regexp_replace(coalesce(p.phone, ''''), ''\D'', '''', ''g'') =
            pg_catalog.regexp_replace(s.owner_phone, ''\D'', '''', ''g'')
    ';
  end if;

  -- Mark any unlinked legacy 005 active/pending rows so they cannot grant quota or block unique indexes
  update public.subscriptions
  set status = case when status = 'active' then 'expired' else 'rejected' end,
      admin_note = coalesce(admin_note, 'سجل قديم غير مرتبط بحساب موثق قبل التحديث الأمني'),
      reviewed_at = coalesce(reviewed_at, pg_catalog.now())
  where user_id is null
    and status in ('active', 'pending');

  -- Deduplicate multiple active rows per user_id (keep newest/highest) before creating unique partial index
  with ranked_active as (
    select id,
           pg_catalog.row_number() over (
             partition by user_id
             order by max_units desc, created_at desc, id desc
           ) as rn
    from public.subscriptions
    where status = 'active'
      and user_id is not null
  )
  update public.subscriptions s
  set status = 'expired'
  from ranked_active ra
  where s.id = ra.id
    and ra.rn > 1;

  -- Deduplicate multiple pending rows per user_id (keep newest)
  with ranked_pending as (
    select id,
           pg_catalog.row_number() over (
             partition by user_id
             order by created_at desc, id desc
           ) as rn
    from public.subscriptions
    where status = 'pending'
      and user_id is not null
  )
  update public.subscriptions s
  set status = 'rejected',
      admin_note = coalesce(s.admin_note, 'تم استبدال الطلب بطلب أحدث'),
      reviewed_at = coalesce(s.reviewed_at, pg_catalog.now())
  from ranked_pending rp
  where s.id = rp.id
    and rp.rn > 1;
end $$;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('pending', 'active', 'rejected', 'expired'));

do $$
begin
  if not exists (select 1 from public.subscriptions where user_id is null) then
    alter table public.subscriptions alter column user_id set not null;
  end if;
end $$;

create index if not exists idx_subscriptions_user_status
  on public.subscriptions (user_id, status, expires_at desc);

create unique index if not exists idx_subscriptions_one_active_per_owner
  on public.subscriptions (user_id)
  where (status = 'active');

create unique index if not exists idx_subscriptions_one_pending_per_owner
  on public.subscriptions (user_id)
  where (status = 'pending');

alter table public.subscriptions enable row level security;

-- Drop legacy permissive policies on subscriptions
drop policy if exists "subscriptions_v2_select" on public.subscriptions;
drop policy if exists "subscriptions_v2_insert" on public.subscriptions;
drop policy if exists "subscriptions_v2_update" on public.subscriptions;
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;

create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  using (user_id = (select auth.uid()) or public.is_admin());

-- All mutations go through request_subscription() and admin_review_subscription() RPCs
revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Unified Chalets Protection Trigger (Verification Gate + Atomic Quota Lock)
--    Replaces separate unlinked enforce_chalet_verified_owner_publish() so there
--    is a single deterministic trigger order and no conflicting owner_verified.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_chalets_verify_publish_gate on public.chalets;
drop function if exists public.enforce_chalet_verified_owner_publish();

create or replace function public.chalets_protect()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trusted_db_role boolean;
  v_is_admin boolean;
  v_caller uuid;
  v_owner_role text;
  v_verification_status text;
  v_owner_verified boolean := false;
  v_require_verified boolean := false;
  v_max_units integer := 1;
  v_is_featured_eligible boolean := false;
  v_used_units integer := 0;
begin
  v_trusted_db_role := (current_user in ('postgres', 'supabase_admin', 'service_role'));
  v_is_admin := public.is_admin();
  v_caller := (select auth.uid());

  -- Enforce owner_id integrity for non-admin client writes
  if tg_op = 'INSERT' then
    if not v_trusted_db_role and not v_is_admin then
      if v_caller is null then
        raise exception 'not_authenticated';
      end if;
      new.owner_id := v_caller;
    end if;
    if new.owner_id is null then
      raise exception 'not_authenticated';
    end if;
  elsif tg_op = 'UPDATE' then
    if not v_trusted_db_role and not v_is_admin then
      if v_caller is null then
        raise exception 'not_authenticated';
      end if;
      new.owner_id := old.owner_id;
    end if;
  end if;

  -- Serialize concurrent INSERTs and owner transfers per owner by locking the
  -- owner's profile row FOR UPDATE before reading quota & verification state.
  select p.role, p.verification_status
  into v_owner_role, v_verification_status
  from public.profiles p
  where p.id = new.owner_id
  for update;

  if not found then
    raise exception 'forbidden';
  end if;

  -- Ensure owner_verified is computed in one authoritative place
  v_owner_verified := (v_verification_status = 'verified');
  if not v_owner_verified and pg_catalog.to_regclass('public.owner_verifications') is not null then
    execute
      'select exists (
         select 1 from public.owner_verifications ov
         where ov.owner_id = $1 and ov.status = ''verified''
       )'
      into v_owner_verified
      using new.owner_id;
  end if;
  new.owner_verified := coalesce(v_owner_verified, false);

  -- Enforce verification gate if enabled in platform_settings
  select ps.require_verified_to_publish
  into v_require_verified
  from public.platform_settings ps
  where ps.id = 'global';

  if coalesce(v_require_verified, false)
     and not v_trusted_db_role
     and not v_is_admin
     and new.availability_status = 'active'
     and not new.owner_verified then
    raise exception 'owner_not_verified';
  end if;

  -- Resolve active paid subscription quota & featured eligibility
  select s.max_units, coalesce(pl.is_featured_eligible, true)
  into v_max_units, v_is_featured_eligible
  from public.subscriptions s
  left join public.plans pl on pl.id = s.plan_id
  where s.user_id = new.owner_id
    and s.status = 'active'
    and (s.expires_at is null or s.expires_at > pg_catalog.now())
  order by s.max_units desc, s.created_at desc
  limit 1;

  if not found then
    select pl.max_units, pl.is_featured_eligible
    into v_max_units, v_is_featured_eligible
    from public.plans pl
    where pl.id = 'free'
    limit 1;

    v_max_units := coalesce(v_max_units, 1);
    v_is_featured_eligible := coalesce(v_is_featured_eligible, false);
  end if;

  -- Prevent non-admin advertisers from self-assigning featured badge
  if not v_trusted_db_role and not v_is_admin then
    new.is_featured := v_is_featured_eligible;
  end if;

  -- Enforce listing quota atomically (under the owner profiles FOR UPDATE lock)
  if (tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id))
     and not v_trusted_db_role
     and not v_is_admin then
    if v_owner_role not in ('owner', 'admin') then
      raise exception 'forbidden';
    end if;

    select pg_catalog.count(*)::integer
    into v_used_units
    from public.chalets c
    where c.owner_id = new.owner_id
      and (tg_op = 'INSERT' or c.id <> old.id);

    if v_used_units >= v_max_units then
      raise exception 'quota_exceeded';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chalets_protect on public.chalets;
drop trigger if exists trg_01_chalets_protect on public.chalets;
create trigger trg_01_chalets_protect
  before insert or update on public.chalets
  for each row execute function public.chalets_protect();

-- Chalet contacts ownership & Egyptian phone validation trigger
create or replace function public.chalet_contacts_protect()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trusted_db_role boolean;
  v_chalet_owner uuid;
  v_digits text;
begin
  v_trusted_db_role := (current_user in ('postgres', 'supabase_admin', 'service_role'));

  select c.owner_id into v_chalet_owner
  from public.chalets c
  where c.id = new.chalet_id;

  if not found then
    raise exception 'contact_not_available';
  end if;

  if not v_trusted_db_role and not public.is_admin() then
    if v_chalet_owner <> (select auth.uid()) then
      raise exception 'forbidden';
    end if;
  end if;

  new.owner_id := v_chalet_owner;

  v_digits := pg_catalog.regexp_replace(coalesce(new.owner_phone, ''), '\D', '', 'g');
  if v_digits like '20%' and pg_catalog.length(v_digits) = 12 then
    v_digits := '0' || pg_catalog.substr(v_digits, 3);
  end if;

  if v_digits !~ '^01[0125][0-9]{8}$' then
    raise exception 'phone_invalid';
  end if;

  new.owner_phone := v_digits;
  return new;
end;
$$;

drop trigger if exists trg_chalet_contacts_protect on public.chalet_contacts;
create trigger trg_chalet_contacts_protect
  before insert or update on public.chalet_contacts
  for each row execute function public.chalet_contacts_protect();

-- Drop all legacy permissive policies on chalets & recreate strict initPlan policies
drop policy if exists "Enable read access for all users" on public.chalets;
drop policy if exists "chalets_v2_all_select" on public.chalets;
drop policy if exists "chalets_v2_all_insert" on public.chalets;
drop policy if exists "chalets_v2_all_update" on public.chalets;
drop policy if exists "chalets_v2_all_delete" on public.chalets;
drop policy if exists "chalets_public_read_active" on public.chalets;
drop policy if exists "chalets_owner_insert" on public.chalets;
drop policy if exists "chalets_owner_update" on public.chalets;
drop policy if exists "chalets_owner_delete" on public.chalets;

create policy "chalets_public_read_active"
  on public.chalets for select
  using (
    availability_status = 'active'
    or owner_id = (select auth.uid())
    or public.is_admin()
  );

create policy "chalets_owner_insert"
  on public.chalets for insert
  with check (
    (
      owner_id = (select auth.uid())
      and exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('owner', 'admin')
      )
    )
    or public.is_admin()
  );

create policy "chalets_owner_update"
  on public.chalets for update
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy "chalets_owner_delete"
  on public.chalets for delete
  using (owner_id = (select auth.uid()) or public.is_admin());

-- Column-level SELECT permissions on public.chalets (explicit safe allowlist)
revoke all on table public.chalets from public, anon, authenticated;
grant select (
  id,
  owner_id,
  title,
  description,
  governorate,
  city,
  area_or_village,
  property_type,
  advertiser_role,
  owner_name,
  is_featured,
  owner_verified,
  deposit_type,
  deposit_value,
  price_per_night,
  weekly_price,
  monthly_price,
  bedrooms,
  bathrooms,
  area_sqm,
  max_guests,
  beach_distance_meters,
  coordinates,
  images,
  amenities,
  blocked_dates,
  rules,
  availability_status,
  created_at,
  updated_at
) on public.chalets to anon, authenticated;
grant insert, update, delete on table public.chalets to authenticated;

-- Strict RLS on private chalet_contacts (initPlan auth.uid())
drop policy if exists "chalet_contacts_owner_read" on public.chalet_contacts;
drop policy if exists "chalet_contacts_owner_insert" on public.chalet_contacts;
drop policy if exists "chalet_contacts_owner_update" on public.chalet_contacts;
drop policy if exists "chalet_contacts_owner_delete" on public.chalet_contacts;

create policy "chalet_contacts_owner_read"
  on public.chalet_contacts for select
  using (owner_id = (select auth.uid()) or public.is_admin());

create policy "chalet_contacts_owner_insert"
  on public.chalet_contacts for insert
  with check (
    (
      owner_id = (select auth.uid())
      and exists (
        select 1 from public.chalets c
        where c.id = chalet_id
          and c.owner_id = (select auth.uid())
      )
    )
    or public.is_admin()
  );

create policy "chalet_contacts_owner_update"
  on public.chalet_contacts for update
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy "chalet_contacts_owner_delete"
  on public.chalet_contacts for delete
  using (owner_id = (select auth.uid()) or public.is_admin());

revoke all on table public.chalet_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.chalet_contacts to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Atomic Contact Reveal Rate Limiting (No Spoofable X-Forwarded-For!)
-- ----------------------------------------------------------------------------
create table if not exists public.contact_reveal_rate_limits (
  actor_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (actor_key, window_start)
);

alter table public.contact_reveal_rate_limits enable row level security;
revoke all on table public.contact_reveal_rate_limits from public, anon, authenticated;

create table if not exists public.contact_reveal_logs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  chalet_id text not null references public.chalets(id) on delete cascade,
  actor_key text not null,
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_contact_reveal_logs_actor_created
  on public.contact_reveal_logs (actor_key, created_at desc);

alter table public.contact_reveal_logs enable row level security;

drop policy if exists "contact_reveal_logs_admin_select" on public.contact_reveal_logs;
create policy "contact_reveal_logs_admin_select"
  on public.contact_reveal_logs for select
  using (public.is_admin());

revoke all on table public.contact_reveal_logs from public, anon, authenticated;
grant select on table public.contact_reveal_logs to authenticated;

create or replace function public.reveal_listing_contact(p_chalet_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_is_admin boolean;
  v_peer_ip text;
  v_actor_key text;
  v_window_start timestamptz;
  v_hourly_limit integer;
  v_new_count integer;
  v_chalet_owner uuid;
  v_availability text;
  v_owner_phone text;
begin
  if nullif(trim(coalesce(p_chalet_id, '')), '') is null then
    raise exception 'contact_not_available';
  end if;

  v_uid := (select auth.uid());
  v_is_admin := public.is_admin();

  -- Derive actor_key strictly from authenticated UID or kernel socket peer IP
  -- (pg_catalog.inet_client_addr). NEVER read client-spoofable X-Forwarded-For.
  if v_uid is not null then
    v_actor_key := 'user:' || v_uid::text;
    v_hourly_limit := 20;
  else
    v_peer_ip := nullif(pg_catalog.host(pg_catalog.inet_client_addr()), '');
    v_actor_key := 'anon:' || coalesce(v_peer_ip, 'local_peer');
    v_hourly_limit := 10;
  end if;

  if not v_is_admin then
    v_window_start := pg_catalog.date_trunc('hour', pg_catalog.now());

    -- Serialize concurrent requests for this actor inside the transaction
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('reveal_contact:' || v_actor_key)
    );

    -- Single atomic upsert counter; increments ONLY while request_count < limit
    insert into public.contact_reveal_rate_limits as rl (
      actor_key,
      window_start,
      request_count,
      updated_at
    )
    values (v_actor_key, v_window_start, 1, pg_catalog.now())
    on conflict (actor_key, window_start) do update
      set request_count = rl.request_count + 1,
          updated_at = pg_catalog.now()
      where rl.request_count < v_hourly_limit
    returning rl.request_count into v_new_count;

    if not found then
      raise exception 'rate_limited';
    end if;
  end if;

  select c.owner_id, c.availability_status, cc.owner_phone
  into v_chalet_owner, v_availability, v_owner_phone
  from public.chalets c
  join public.chalet_contacts cc on cc.chalet_id = c.id
  where c.id = p_chalet_id;

  if not found then
    raise exception 'contact_not_available';
  end if;

  if v_availability <> 'active' and v_chalet_owner is distinct from v_uid and not v_is_admin then
    raise exception 'contact_not_available';
  end if;

  insert into public.contact_reveal_logs (chalet_id, actor_key, viewer_id)
  values (p_chalet_id, v_actor_key, v_uid);

  return pg_catalog.jsonb_build_object('owner_phone', v_owner_phone);
end;
$$;

revoke all on function public.reveal_listing_contact(text) from public;
grant execute on function public.reveal_listing_contact(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Subscription Lifecycle RPCs (Serialized Per Owner + Deterministic Locks)
-- ----------------------------------------------------------------------------
create or replace function public.request_subscription(
  p_plan_id text,
  p_receipt_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_plan public.plans%rowtype;
  v_clean_path text;
  v_created public.subscriptions%rowtype;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Lock owner profile to serialize concurrent subscription requests for same user
  perform 1
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.user_id = v_uid
      and s.status = 'pending'
  ) then
    raise exception 'duplicate_request';
  end if;

  select *
  into v_plan
  from public.plans pl
  where pl.id = p_plan_id
    and pl.is_active = true
    and pl.id <> 'free';

  if not found then
    raise exception 'invalid_plan';
  end if;

  v_clean_path := trim(coalesce(p_receipt_path, ''));
  if v_clean_path = ''
     or pg_catalog.strpos(v_clean_path, '..') > 0
     or pg_catalog.left(v_clean_path, pg_catalog.length(v_uid::text) + 1) <> (v_uid::text || '/') then
    raise exception 'forbidden';
  end if;

  insert into public.subscriptions (
    user_id,
    plan_id,
    plan_name,
    price,
    max_units,
    receipt_path,
    status
  )
  values (
    v_uid,
    v_plan.id,
    v_plan.name,
    v_plan.price,
    v_plan.max_units,
    v_clean_path,
    'pending'
  )
  returning * into v_created;

  return pg_catalog.to_jsonb(v_created);
end;
$$;

revoke all on function public.request_subscription(text, text) from public;
grant execute on function public.request_subscription(text, text) to authenticated, service_role;

create or replace function public.my_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_used_units integer := 0;
  v_active_sub public.subscriptions%rowtype;
  v_pending_sub public.subscriptions%rowtype;
  v_rejected_sub public.subscriptions%rowtype;
  v_free_plan public.plans%rowtype;
  v_active_plan public.plans%rowtype;
  v_pending_json jsonb := null;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select pg_catalog.count(*)::integer
  into v_used_units
  from public.chalets c
  where c.owner_id = v_uid;

  select *
  into v_free_plan
  from public.plans pl
  where pl.id = 'free'
  limit 1;

  select *
  into v_pending_sub
  from public.subscriptions s
  where s.user_id = v_uid
    and s.status = 'pending'
  order by s.created_at desc
  limit 1;

  if found then
    v_pending_json := pg_catalog.jsonb_build_object(
      'id', v_pending_sub.id,
      'plan_id', v_pending_sub.plan_id,
      'plan_name', v_pending_sub.plan_name,
      'created_at', v_pending_sub.created_at,
      'status', v_pending_sub.status
    );
  end if;

  select *
  into v_active_sub
  from public.subscriptions s
  where s.user_id = v_uid
    and s.status = 'active'
    and (s.expires_at is null or s.expires_at > pg_catalog.now())
  order by s.max_units desc, s.created_at desc
  limit 1;

  if found then
    select * into v_active_plan
    from public.plans pl
    where pl.id = v_active_sub.plan_id
    limit 1;

    return pg_catalog.jsonb_build_object(
      'plan_id', v_active_sub.plan_id,
      'plan_name', v_active_sub.plan_name,
      'used_units', v_used_units,
      'max_units', v_active_sub.max_units,
      'expires_at', v_active_sub.expires_at,
      'status', 'active',
      'is_featured_eligible', coalesce(v_active_plan.is_featured_eligible, true),
      'pending_request', v_pending_json,
      'admin_note', v_active_sub.admin_note
    );
  end if;

  select *
  into v_rejected_sub
  from public.subscriptions s
  where s.user_id = v_uid
    and s.status = 'rejected'
  order by s.reviewed_at desc nulls last, s.created_at desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'plan_id', 'free',
    'plan_name', coalesce(v_free_plan.name, 'الباقة المجانية'),
    'used_units', v_used_units,
    'max_units', coalesce(v_free_plan.max_units, 1),
    'expires_at', null,
    'status', case
      when v_pending_json is not null then 'pending'
      when v_rejected_sub.id is not null then 'rejected'
      else 'free'
    end,
    'is_featured_eligible', coalesce(v_free_plan.is_featured_eligible, false),
    'pending_request', v_pending_json,
    'admin_note', v_rejected_sub.admin_note
  );
end;
$$;

revoke all on function public.my_subscription() from public;
grant execute on function public.my_subscription() to authenticated, service_role;

create or replace function public.admin_review_subscription(
  p_id text,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user_id uuid;
  v_sub public.subscriptions%rowtype;
  v_plan_featured boolean := true;
  v_clean_note text;
begin
  -- Explicit admin check (never relies on current_user inside SECURITY DEFINER)
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- Step 1: Identify target owner without taking subscription lock first
  select s.user_id
  into v_target_user_id
  from public.subscriptions s
  where s.id = p_id;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  -- Step 2: Canonical lock order: lock owner profile FIRST so concurrent
  -- admin reviews for the same owner serialize cleanly without deadlocks.
  perform 1
  from public.profiles p
  where p.id = v_target_user_id
  for update;

  -- Step 3: Lock target subscription row and re-check status after acquiring lock
  select *
  into v_sub
  from public.subscriptions s
  where s.id = p_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  if v_sub.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  v_clean_note := nullif(trim(coalesce(p_note, '')), '');

  if p_approve then
    -- Ensure at most one active subscription exists for this owner
    update public.subscriptions s
    set status = 'expired'
    where s.user_id = v_target_user_id
      and s.status = 'active'
      and s.id <> p_id;

    update public.subscriptions s
    set status = 'active',
        admin_note = v_clean_note,
        reviewed_at = pg_catalog.now(),
        expires_at = pg_catalog.now() + interval '30 days'
    where s.id = p_id
    returning * into v_sub;

    select coalesce(pl.is_featured_eligible, true)
    into v_plan_featured
    from public.plans pl
    where pl.id = v_sub.plan_id;

    update public.chalets c
    set is_featured = coalesce(v_plan_featured, true)
    where c.owner_id = v_target_user_id;
  else
    update public.subscriptions s
    set status = 'rejected',
        admin_note = v_clean_note,
        reviewed_at = pg_catalog.now()
    where s.id = p_id
    returning * into v_sub;
  end if;

  return pg_catalog.to_jsonb(v_sub);
end;
$$;

revoke all on function public.admin_review_subscription(text, boolean, text) from public;
grant execute on function public.admin_review_subscription(text, boolean, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Storage Buckets & Complete Cleanup of Legacy Permissive Policies
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
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

-- Purge ALL known and residual permissive storage.objects policies touching
-- 'property-images' or 'receipts' (since Postgres combines permissive policies with OR).
drop policy if exists "property_images_v2_select" on storage.objects;
drop policy if exists "property_images_v2_insert" on storage.objects;
drop policy if exists "property_images_v2_delete" on storage.objects;
drop policy if exists "receipts_v2_select" on storage.objects;
drop policy if exists "receipts_v2_insert" on storage.objects;
drop policy if exists "receipts_private_read" on storage.objects;
drop policy if exists "receipts_user_upload" on storage.objects;

do $$
declare
  v_pol record;
begin
  for v_pol in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike 'property_images_%'
        or policyname ilike 'receipts_%'
        or coalesce(qual, '') ~* '''(property-images|receipts)'''
        or coalesce(with_check, '') ~* '''(property-images|receipts)'''
      )
  loop
    execute pg_catalog.format('drop policy if exists %I on storage.objects', v_pol.policyname);
  end loop;
end $$;

-- Recreate strict scoped policies using (select auth.uid())
create policy "property_images_public_read_v2"
  on storage.objects for select
  using (bucket_id = 'property-images');

create policy "property_images_owner_insert_v2"
  on storage.objects for insert
  with check (
    bucket_id = 'property-images'
    and (select auth.uid()) is not null
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "property_images_owner_update_v2"
  on storage.objects for update
  using (
    bucket_id = 'property-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'property-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

create policy "property_images_owner_delete_v2"
  on storage.objects for delete
  using (
    bucket_id = 'property-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

create policy "receipts_owner_or_admin_read_v2"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

create policy "receipts_owner_insert_v2"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (select auth.uid()) is not null
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "receipts_admin_delete_v2"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and public.is_admin()
  );
