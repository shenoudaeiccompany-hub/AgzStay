-- AgzStay Phase 3: Profile Verification Status Sync & Safe Self-Service Host Upgrade RPC
-- Run AFTER 001_init.sql and 002_phase2_lifecycle_and_payments.sql in Supabase SQL Editor.

-- 1. Add verification_status & advertiser_type to public.profiles
alter table public.profiles
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified')),
  add column if not exists advertiser_type text not null default 'owner'
    check (advertiser_type in ('owner', 'broker'));

-- Backfill verification_status from existing owner_verifications rows
update public.profiles p
set verification_status = ov.status
from public.owner_verifications ov
where ov.owner_id = p.id
  and ov.status in ('unverified', 'pending', 'verified')
  and p.verification_status is distinct from ov.status;

-- 2. Harden profile trigger: block direct client edits to role or verification_status
create or replace function public.prevent_profile_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if (new.role is distinct from old.role or new.verification_status is distinct from old.verification_status) then
    if current_user not in ('postgres', 'supabase_admin', 'service_role')
       and not public.is_admin() then
      raise exception 'forbidden';
    end if;
  end if;
  return new;
end;
$$;

-- 3. Keep profiles.verification_status in sync with owner_verifications
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

    update public.profiles
    set verification_status = new.status
    where id = new.owner_id;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_admin() and current_user not in ('postgres', 'supabase_admin', 'service_role') then
      if old.owner_id = auth.uid() and new.owner_id = auth.uid() then
        new.status := 'pending';
        new.reviewed_at := null;
        new.rejection_reason := null;
        new.reviewed_by := null;
        new.submitted_at := now();

        update public.profiles
        set verification_status = 'pending'
        where id = new.owner_id;

        return new;
      end if;
      raise exception 'forbidden';
    end if;

    update public.profiles
    set verification_status = new.status
    where id = new.owner_id;

    if new.status = 'verified' then
      new.reviewed_at := now();
      new.rejection_reason := null;
      update public.profiles
      set role = case when role = 'guest' then 'owner' else role end,
          verification_status = 'verified'
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

-- 4. Safe Self-Service RPC to switch a guest account into an owner/broker host account (NEVER admin)
create or replace function public.become_host(
  p_advertiser_type text default 'owner'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_type text;
  v_profile public.profiles%rowtype;
begin
  v_caller := auth.uid();
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
    insert into public.profiles (id, name, role, advertiser_type)
    values (v_caller, 'مستخدم إجازة ستاي', 'owner', v_type)
    on conflict (id) do update
      set role = case when public.profiles.role = 'guest' then 'owner' else public.profiles.role end,
          advertiser_type = excluded.advertiser_type
    returning * into v_profile;
  end if;

  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.become_host(text) from public;
grant execute on function public.become_host(text) to authenticated;
