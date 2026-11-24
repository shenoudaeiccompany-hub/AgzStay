-- AgzStay V2 Schema Alignment Migration
-- Run this script inside Supabase SQL Editor (Project -> SQL Editor -> New Query)
-- Aligns `chalets` columns, creates `subscriptions`, configures `property-images` and `receipts` buckets.

create extension if not exists pgcrypto;

-- 1. Align `chalets` table for direct classifieds directory & owner phone portal
create table if not exists public.chalets (
  id text primary key default ('prop-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  title text not null,
  description text not null default '',
  price_per_night numeric not null default 0 check (price_per_night >= 0),
  bedrooms integer not null default 1 check (bedrooms >= 0),
  bathrooms integer not null default 1 check (bathrooms >= 0),
  max_guests integer not null default 2 check (max_guests > 0),
  images text[] not null default '{}'::text[],
  amenities text[] not null default '{}'::text[],
  blocked_dates text[] not null default '{}'::text[],
  availability_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Allow listings added via Owner Portal (phone-based session without mandatory Supabase Auth user)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'owner_id'
  ) then
    alter table public.chalets alter column owner_id drop not null;
  end if;
end $$;

-- Ensure standardized V2 columns exist on `chalets`
alter table public.chalets add column if not exists governorate text;
alter table public.chalets add column if not exists city text;
alter table public.chalets add column if not exists area_or_village text;
alter table public.chalets add column if not exists property_type text not null default 'شاليه';
alter table public.chalets add column if not exists deposit_type text not null default 'percent';
alter table public.chalets add column if not exists deposit_value numeric not null default 0;
alter table public.chalets add column if not exists owner_phone text;
alter table public.chalets add column if not exists owner_name text not null default 'معلن AgzStay';
alter table public.chalets add column if not exists is_featured boolean not null default false;
alter table public.chalets add column if not exists advertiser_role text not null default 'مالك مباشر';
alter table public.chalets add column if not exists monthly_price numeric;
alter table public.chalets add column if not exists weekly_price numeric;
alter table public.chalets add column if not exists area_sqm numeric;
alter table public.chalets add column if not exists rules text[] not null default '{}'::text[];
alter table public.chalets add column if not exists availability_status text not null default 'active';
alter table public.chalets add column if not exists blocked_dates text[] not null default '{}'::text[];

-- Relax legacy constraints that might block V2 values ('hidden', '%', 'ج.م', nullable coordinates/destination)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'destination'
  ) then
    alter table public.chalets alter column destination drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'destination_label'
  ) then
    alter table public.chalets alter column destination_label drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'resort'
  ) then
    alter table public.chalets alter column resort drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'unit_type'
  ) then
    alter table public.chalets alter column unit_type drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'view_type'
  ) then
    alter table public.chalets alter column view_type drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chalets' and column_name = 'coordinates'
  ) then
    alter table public.chalets alter column coordinates drop not null;
  end if;
end $$;

alter table public.chalets drop constraint if exists chalets_availability_status_check;
alter table public.chalets add constraint chalets_availability_status_check
  check (availability_status in ('active', 'rented', 'hidden', 'draft', 'pending_review'));

alter table public.chalets drop constraint if exists chalets_deposit_type_check;
alter table public.chalets add constraint chalets_deposit_type_check
  check (deposit_type in ('percent', 'fixed', '%', 'ج.م'));

create index if not exists idx_chalets_owner_phone on public.chalets (owner_phone);
create index if not exists idx_chalets_governorate on public.chalets (governorate, city);
create index if not exists idx_chalets_featured on public.chalets (is_featured desc, created_at desc);

alter table public.chalets enable row level security;

drop policy if exists "chalets_public_read_active" on public.chalets;
drop policy if exists "chalets_owner_insert" on public.chalets;
drop policy if exists "chalets_owner_update" on public.chalets;
drop policy if exists "chalets_owner_delete" on public.chalets;
drop policy if exists "Enable read access for all users" on public.chalets;
drop policy if exists "chalets_v2_all_select" on public.chalets;
drop policy if exists "chalets_v2_all_insert" on public.chalets;
drop policy if exists "chalets_v2_all_update" on public.chalets;
drop policy if exists "chalets_v2_all_delete" on public.chalets;

create policy "chalets_v2_all_select"
  on public.chalets for select
  using (true);

create policy "chalets_v2_all_insert"
  on public.chalets for insert
  with check (true);

create policy "chalets_v2_all_update"
  on public.chalets for update
  using (true)
  with check (true);

create policy "chalets_v2_all_delete"
  on public.chalets for delete
  using (true);

-- 2. Create `subscriptions` table for advertiser packages
create table if not exists public.subscriptions (
  id text primary key default ('sub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  owner_name text not null,
  owner_phone text not null,
  plan_id text not null check (plan_id in ('free', 'starter', 'pro', 'enterprise')),
  plan_name text not null,
  price numeric not null default 0 check (price >= 0),
  max_units integer not null default 1 check (max_units >= 1),
  receipt_path text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_subscriptions_owner_phone on public.subscriptions (owner_phone);
create index if not exists idx_subscriptions_status on public.subscriptions (status);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_v2_select" on public.subscriptions;
drop policy if exists "subscriptions_v2_insert" on public.subscriptions;
drop policy if exists "subscriptions_v2_update" on public.subscriptions;

create policy "subscriptions_v2_select"
  on public.subscriptions for select
  using (true);

create policy "subscriptions_v2_insert"
  on public.subscriptions for insert
  with check (true);

create policy "subscriptions_v2_update"
  on public.subscriptions for update
  using (true)
  with check (true);

-- 3. Storage Buckets: `property-images` and `receipts`
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
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "property_images_v2_select" on storage.objects;
drop policy if exists "property_images_v2_insert" on storage.objects;
drop policy if exists "property_images_v2_delete" on storage.objects;

create policy "property_images_v2_select"
  on storage.objects for select
  using (bucket_id = 'property-images');

create policy "property_images_v2_insert"
  on storage.objects for insert
  with check (bucket_id = 'property-images');

create policy "property_images_v2_delete"
  on storage.objects for delete
  using (bucket_id = 'property-images');

drop policy if exists "receipts_v2_select" on storage.objects;
drop policy if exists "receipts_v2_insert" on storage.objects;
drop policy if exists "receipts_private_read" on storage.objects;
drop policy if exists "receipts_user_upload" on storage.objects;

create policy "receipts_v2_select"
  on storage.objects for select
  using (bucket_id = 'receipts');

create policy "receipts_v2_insert"
  on storage.objects for insert
  with check (bucket_id = 'receipts');
