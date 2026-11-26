-- ============================================================================
-- AgzStay Feature Expansion & Security Hardening Migration (008)
-- Additive migration (leaves 001..007 intact):
-- 1. Owner verification workflow (`owner_verifications` + private `verifications`
--    storage bucket + `submit_owner_verification` & `admin_review_owner_verification`).
-- 2. Privacy-safe owner contact reveal analytics (`get_owner_contact_reveal_stats`).
-- 3. Guarded listing violation reports (`listing_reports` + rate-limited
--    `submit_listing_report` + `admin_review_listing_report`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Owner Verifications Table, Trigger Fix & Private Storage Bucket
-- ----------------------------------------------------------------------------
create table if not exists public.owner_verifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  owner_name text not null,
  phone text not null,
  document_type text not null,
  document_number text not null default '',
  document_path text not null,
  status text not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz
);

alter table public.owner_verifications
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.owner_verifications
  alter column document_number set default '';

-- Allow national-id alongside legacy document types
do $$
declare
  v_con record;
begin
  for v_con in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.owner_verifications'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ilike '%document_type%'
  loop
    execute pg_catalog.format(
      'alter table public.owner_verifications drop constraint if exists %I',
      v_con.conname
    );
  end loop;
end $$;

alter table public.owner_verifications
  drop constraint if exists owner_verifications_status_check;

alter table public.owner_verifications
  add constraint owner_verifications_document_type_check
  check (document_type in ('national-id', 'resort-card', 'ownership-contract', 'authorization'));

alter table public.owner_verifications
  add constraint owner_verifications_status_check
  check (status in ('unverified', 'pending', 'verified'));

alter table public.owner_verifications enable row level security;

-- Ensure handle_owner_verification_rules never sets invalid 'pending_review' status on 006 chalets
create or replace function public.handle_owner_verification_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_is_service_role boolean;
  v_caller uuid;
begin
  v_is_admin := public.is_admin();
  v_is_service_role := (pg_catalog.current_setting('role', true) = 'service_role');
  v_caller := (select auth.uid());

  if tg_op = 'INSERT' then
    if not v_is_admin and not v_is_service_role then
      new.status := 'pending';
      new.reviewed_at := null;
      new.rejection_reason := null;
      new.reviewed_by := null;
    end if;

    update public.profiles
    set verification_status = new.status
    where id = new.owner_id;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not v_is_admin and not v_is_service_role then
      if v_caller is not null and old.owner_id = v_caller and new.owner_id = v_caller then
        new.status := 'pending';
        new.reviewed_at := null;
        new.rejection_reason := null;
        new.reviewed_by := null;
        new.submitted_at := pg_catalog.now();

        update public.profiles
        set verification_status = 'pending'
        where id = new.owner_id;

        return new;
      end if;
      raise exception 'forbidden';
    end if;

    if new.status = 'verified' then
      new.reviewed_at := pg_catalog.now();
      new.rejection_reason := null;

      update public.profiles
      set role = case when role = 'guest' then 'owner' else role end,
          verification_status = 'verified'
      where id = new.owner_id;

      update public.chalets
      set owner_verified = true
      where owner_id = new.owner_id;
    elsif new.status = 'unverified' then
      new.reviewed_at := pg_catalog.now();

      update public.profiles
      set verification_status = 'unverified'
      where id = new.owner_id;

      update public.chalets
      set owner_verified = false
      where owner_id = new.owner_id;
    else
      update public.profiles
      set verification_status = new.status
      where id = new.owner_id;
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
drop policy if exists "owner_verifications_insert" on public.owner_verifications;
drop policy if exists "owner_verifications_update_admin_only" on public.owner_verifications;
drop policy if exists "owner_verifications_resubmit_own" on public.owner_verifications;
drop policy if exists "owner_verifications_select_v2" on public.owner_verifications;
drop policy if exists "owner_verifications_insert_v2" on public.owner_verifications;
drop policy if exists "owner_verifications_update_v2" on public.owner_verifications;

create policy "owner_verifications_select_v2"
  on public.owner_verifications for select
  using (owner_id = (select auth.uid()) or public.is_admin());

create policy "owner_verifications_insert_v2"
  on public.owner_verifications for insert
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "owner_verifications_update_v2"
  on public.owner_verifications for update
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

revoke all on table public.owner_verifications from public, anon, authenticated;
grant select, insert, update on table public.owner_verifications to authenticated;

-- Private Storage Bucket for Owner Verification Documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verifications',
  'verifications',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "verifications_owner_or_admin_read_v2" on storage.objects;
drop policy if exists "verifications_owner_insert_v2" on storage.objects;
drop policy if exists "verifications_owner_or_admin_delete_v2" on storage.objects;

create policy "verifications_owner_or_admin_read_v2"
  on storage.objects for select
  using (
    bucket_id = 'verifications'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

create policy "verifications_owner_insert_v2"
  on storage.objects for insert
  with check (
    bucket_id = 'verifications'
    and (select auth.uid()) is not null
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "verifications_owner_or_admin_delete_v2"
  on storage.objects for delete
  using (
    bucket_id = 'verifications'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

create or replace function public.submit_owner_verification(
  p_owner_name text,
  p_phone text,
  p_document_type text,
  p_document_number text,
  p_document_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_digits text;
  v_clean_name text;
  v_clean_doc_num text;
  v_clean_path text;
  v_row public.owner_verifications%rowtype;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_document_type not in ('national-id', 'resort-card', 'ownership-contract', 'authorization') then
    raise exception 'invalid_state';
  end if;

  v_digits := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_digits like '20%' and pg_catalog.length(v_digits) = 12 then
    v_digits := '0' || pg_catalog.substr(v_digits, 3);
  end if;
  if v_digits !~ '^01[0125][0-9]{8}$' then
    raise exception 'phone_invalid';
  end if;

  v_clean_path := trim(coalesce(p_document_path, ''));
  if v_clean_path = ''
     or pg_catalog.strpos(v_clean_path, '..') > 0
     or pg_catalog.left(v_clean_path, pg_catalog.length(v_uid::text) + 1) <> (v_uid::text || '/') then
    raise exception 'invalid_document_path';
  end if;

  v_clean_name := pg_catalog.left(trim(coalesce(p_owner_name, 'معلن AgzStay')), 120);
  v_clean_doc_num := pg_catalog.left(trim(coalesce(p_document_number, '')), 80);

  insert into public.owner_verifications (
    owner_id,
    owner_name,
    phone,
    document_type,
    document_number,
    document_path,
    status,
    rejection_reason,
    reviewed_by,
    submitted_at,
    reviewed_at
  )
  values (
    v_uid,
    case when v_clean_name = '' then 'معلن AgzStay' else v_clean_name end,
    v_digits,
    p_document_type,
    v_clean_doc_num,
    v_clean_path,
    'pending',
    null,
    null,
    pg_catalog.now(),
    null
  )
  on conflict (owner_id) do update
    set owner_name = excluded.owner_name,
        phone = excluded.phone,
        document_type = excluded.document_type,
        document_number = excluded.document_number,
        document_path = excluded.document_path,
        status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        submitted_at = pg_catalog.now(),
        reviewed_at = null
  returning * into v_row;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

revoke all on function public.submit_owner_verification(text, text, text, text, text) from public;
grant execute on function public.submit_owner_verification(text, text, text, text, text) to authenticated, service_role;

create or replace function public.admin_review_owner_verification(
  p_verification_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.owner_verifications%rowtype;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_decision not in ('verified', 'unverified') then
    raise exception 'invalid_state';
  end if;

  v_reason := nullif(trim(coalesce(p_rejection_reason, '')), '');
  if p_decision = 'unverified' and v_reason is null then
    raise exception 'يرجى كتابة سبب رفض طلب التوثيق ليظهر للمالك.';
  end if;

  update public.owner_verifications
  set status = p_decision,
      rejection_reason = case when p_decision = 'unverified' then v_reason else null end,
      reviewed_by = (select auth.uid()),
      reviewed_at = pg_catalog.now()
  where id = p_verification_id
  returning * into v_row;

  if not found then
    raise exception 'not_found';
  end if;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_review_owner_verification(uuid, text, text) from public;
grant execute on function public.admin_review_owner_verification(uuid, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Privacy-Safe Owner Contact Reveal Analytics
-- ----------------------------------------------------------------------------
create index if not exists idx_contact_reveal_logs_chalet_created
  on public.contact_reveal_logs (chalet_id, created_at desc);

create or replace function public.get_owner_contact_reveal_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_total bigint := 0;
  v_last_7 bigint := 0;
  v_last_30 bigint := 0;
  v_per_chalet jsonb := '[]'::jsonb;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select
    coalesce(pg_catalog.count(l.id), 0)::bigint,
    coalesce(pg_catalog.count(l.id) filter (where l.created_at >= pg_catalog.now() - interval '7 days'), 0)::bigint,
    coalesce(pg_catalog.count(l.id) filter (where l.created_at >= pg_catalog.now() - interval '30 days'), 0)::bigint
  into v_total, v_last_7, v_last_30
  from public.chalets c
  left join public.contact_reveal_logs l on l.chalet_id = c.id
  where c.owner_id = v_uid;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'chalet_id', s.chalet_id,
        'total_reveals', s.total_reveals,
        'reveals_last_7_days', s.reveals_last_7_days,
        'last_revealed_at', s.last_revealed_at
      )
      order by s.total_reveals desc, s.last_revealed_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_per_chalet
  from (
    select
      c.id as chalet_id,
      pg_catalog.count(l.id)::bigint as total_reveals,
      pg_catalog.count(l.id) filter (where l.created_at >= pg_catalog.now() - interval '7 days')::bigint as reveals_last_7_days,
      max(l.created_at) as last_revealed_at
    from public.chalets c
    left join public.contact_reveal_logs l on l.chalet_id = c.id
    where c.owner_id = v_uid
    group by c.id
  ) s;

  return pg_catalog.jsonb_build_object(
    'total_reveals', v_total,
    'reveals_last_7_days', v_last_7,
    'reveals_last_30_days', v_last_30,
    'per_chalet', v_per_chalet
  );
end;
$$;

revoke all on function public.get_owner_contact_reveal_stats() from public;
grant execute on function public.get_owner_contact_reveal_stats() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Guarded Listing Reports + Admin Moderation RPC
-- ----------------------------------------------------------------------------
create table if not exists public.listing_reports (
  id text primary key default ('report-' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
  chalet_id text not null references public.chalets(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  actor_key text,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.listing_reports
  alter column reporter_id drop not null;

alter table public.listing_reports
  add column if not exists actor_key text,
  add column if not exists status text not null default 'open',
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.listing_reports
  drop constraint if exists listing_reports_status_check;

alter table public.listing_reports
  add constraint listing_reports_status_check
  check (status in ('open', 'resolved', 'dismissed'));

create index if not exists idx_listing_reports_status_created
  on public.listing_reports (status, created_at desc);

create index if not exists idx_listing_reports_chalet_actor_created
  on public.listing_reports (chalet_id, actor_key, created_at desc);

alter table public.listing_reports enable row level security;

drop policy if exists "listing_reports_select_admin_or_reporter" on public.listing_reports;
drop policy if exists "listing_reports_insert_auth" on public.listing_reports;
drop policy if exists "listing_reports_select_v2" on public.listing_reports;
drop policy if exists "listing_reports_update_admin_v2" on public.listing_reports;

create policy "listing_reports_select_v2"
  on public.listing_reports for select
  using (reporter_id = (select auth.uid()) or public.is_admin());

create policy "listing_reports_update_admin_v2"
  on public.listing_reports for update
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.listing_reports from public, anon, authenticated;
grant select, update on table public.listing_reports to authenticated;

create or replace function public.submit_listing_report(
  p_chalet_id text,
  p_reason text,
  p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_peer_ip text;
  v_actor_key text;
  v_clean_reason text;
  v_clean_details text;
  v_recent_count integer := 0;
  v_created public.listing_reports%rowtype;
begin
  if nullif(trim(coalesce(p_chalet_id, '')), '') is null then
    raise exception 'chalet_not_found';
  end if;

  if not exists (
    select 1
    from public.chalets c
    where c.id = p_chalet_id
      and c.availability_status = 'active'
  ) then
    raise exception 'chalet_not_found';
  end if;

  v_clean_reason := pg_catalog.left(trim(coalesce(p_reason, '')), 120);
  v_clean_details := pg_catalog.left(trim(coalesce(p_details, '')), 500);
  if v_clean_reason = '' then
    raise exception 'invalid_state';
  end if;

  v_uid := (select auth.uid());
  if v_uid is not null then
    v_actor_key := 'user:' || v_uid::text;
  else
    v_peer_ip := nullif(pg_catalog.host(pg_catalog.inet_client_addr()), '');
    v_actor_key := 'anon:' || coalesce(v_peer_ip, 'local_peer');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('listing_report:' || v_actor_key)
  );

  if exists (
    select 1
    from public.listing_reports lr
    where lr.chalet_id = p_chalet_id
      and lr.actor_key = v_actor_key
      and lr.created_at >= pg_catalog.now() - interval '24 hours'
  ) then
    raise exception 'duplicate_report';
  end if;

  select pg_catalog.count(*)::integer
  into v_recent_count
  from public.listing_reports lr
  where lr.actor_key = v_actor_key
    and lr.created_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.listing_reports (
    chalet_id,
    reporter_id,
    actor_key,
    reason,
    details,
    status
  )
  values (
    p_chalet_id,
    v_uid,
    v_actor_key,
    v_clean_reason,
    v_clean_details,
    'open'
  )
  returning * into v_created;

  return pg_catalog.jsonb_build_object(
    'id', v_created.id,
    'status', v_created.status,
    'created_at', v_created.created_at
  );
end;
$$;

revoke all on function public.submit_listing_report(text, text, text) from public;
grant execute on function public.submit_listing_report(text, text, text) to anon, authenticated, service_role;

create or replace function public.admin_review_listing_report(
  p_report_id text,
  p_action text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.listing_reports%rowtype;
  v_clean_note text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_action not in ('dismiss', 'resolve_keep', 'hide_listing') then
    raise exception 'invalid_state';
  end if;

  select *
  into v_report
  from public.listing_reports lr
  where lr.id = p_report_id
  for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  v_clean_note := nullif(trim(coalesce(p_admin_note, '')), '');

  if p_action = 'hide_listing' then
    update public.chalets c
    set availability_status = 'hidden'
    where c.id = v_report.chalet_id;

    update public.listing_reports lr
    set status = 'resolved',
        admin_note = coalesce(v_clean_note, lr.admin_note),
        reviewed_by = (select auth.uid()),
        reviewed_at = pg_catalog.now()
    where lr.id = p_report_id
    returning * into v_report;
  elsif p_action = 'resolve_keep' then
    update public.listing_reports lr
    set status = 'resolved',
        admin_note = coalesce(v_clean_note, lr.admin_note),
        reviewed_by = (select auth.uid()),
        reviewed_at = pg_catalog.now()
    where lr.id = p_report_id
    returning * into v_report;
  else
    update public.listing_reports lr
    set status = 'dismissed',
        admin_note = coalesce(v_clean_note, lr.admin_note),
        reviewed_by = (select auth.uid()),
        reviewed_at = pg_catalog.now()
    where lr.id = p_report_id
    returning * into v_report;
  end if;

  return pg_catalog.to_jsonb(v_report);
end;
$$;

revoke all on function public.admin_review_listing_report(text, text, text) from public;
grant execute on function public.admin_review_listing_report(text, text, text) to authenticated, service_role;
