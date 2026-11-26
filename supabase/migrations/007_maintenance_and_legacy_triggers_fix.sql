-- ============================================================================
-- AgzStay Post-V2 Hardening & Maintenance Migration (007)
-- Additive migration (leaves 001..006 intact):
-- 1. Fixes legacy SECURITY DEFINER current_user checks in 002/003 triggers
--    (handle_owner_verification_rules & enforce_booking_update_rules).
-- 2. Adds scheduled maintenance RPCs (expire_subscriptions, purge_contact_reveals).
-- 3. Adds admin_link_legacy_owner(uuid, text) RPC for legacy phone listings.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fix 002/003 handle_owner_verification_rules() SECURITY DEFINER bypass
--    Previously checked `current_user in ('postgres', ...)` inside SECURITY
--    DEFINER, where current_user is always the function owner ('postgres').
-- ----------------------------------------------------------------------------
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

    update public.profiles
    set verification_status = new.status
    where id = new.owner_id;

    if new.status = 'verified' then
      new.reviewed_at := pg_catalog.now();
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
      new.reviewed_at := pg_catalog.now();
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

do $$
begin
  if pg_catalog.to_regclass('public.owner_verifications') is not null then
    drop trigger if exists trg_owner_verifications_rules on public.owner_verifications;
    create trigger trg_owner_verifications_rules
      before insert or update on public.owner_verifications
      for each row execute function public.handle_owner_verification_rules();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Fix 001/002 enforce_booking_update_rules() to SECURITY INVOKER
-- ----------------------------------------------------------------------------
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

  if pg_catalog.pg_trigger_depth() = 1 and new.status is distinct from old.status then
    raise exception 'forbidden';
  end if;

  return new;
end;
$$;

do $$
begin
  if pg_catalog.to_regclass('public.bookings') is not null then
    drop trigger if exists trg_enforce_booking_update_rules on public.bookings;
    create trigger trg_enforce_booking_update_rules
      before update on public.bookings
      for each row execute function public.enforce_booking_update_rules();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Scheduled Maintenance Functions (pg_cron compatible)
-- ----------------------------------------------------------------------------
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_count integer := 0;
  v_affected_owners uuid[];
begin
  with expired as (
    update public.subscriptions s
    set status = 'expired'
    where s.status = 'active'
      and s.expires_at is not null
      and s.expires_at <= pg_catalog.now()
    returning s.user_id
  )
  select pg_catalog.count(*)::integer, pg_catalog.array_agg(distinct user_id)
  into v_expired_count, v_affected_owners
  from expired;

  if v_affected_owners is not null then
    update public.chalets c
    set is_featured = false
    where c.owner_id = any(v_affected_owners)
      and c.is_featured = true
      and not exists (
        select 1
        from public.subscriptions s
        left join public.plans pl on pl.id = s.plan_id
        where s.user_id = c.owner_id
          and s.status = 'active'
          and (s.expires_at is null or s.expires_at > pg_catalog.now())
          and coalesce(pl.is_featured_eligible, true) = true
      );
  end if;

  return coalesce(v_expired_count, 0);
end;
$$;

revoke all on function public.expire_subscriptions() from public;
grant execute on function public.expire_subscriptions() to service_role;

create or replace function public.purge_contact_reveals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_limits integer := 0;
  v_deleted_logs integer := 0;
begin
  with dl as (
    delete from public.contact_reveal_rate_limits
    where window_start < pg_catalog.now() - interval '7 days'
    returning 1
  )
  select pg_catalog.count(*)::integer into v_deleted_limits from dl;

  with dg as (
    delete from public.contact_reveal_logs
    where created_at < pg_catalog.now() - interval '90 days'
    returning 1
  )
  select pg_catalog.count(*)::integer into v_deleted_logs from dg;

  return coalesce(v_deleted_limits, 0) + coalesce(v_deleted_logs, 0);
end;
$$;

revoke all on function public.purge_contact_reveals() from public;
grant execute on function public.purge_contact_reveals() to service_role;

-- ----------------------------------------------------------------------------
-- 4. Admin Helper: Link Legacy Phone-Only Listings & Subscriptions to User ID
-- ----------------------------------------------------------------------------
create or replace function public.admin_link_legacy_owner(
  p_user_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text;
  v_linked_chalets integer := 0;
  v_linked_subs integer := 0;
  v_has_sub_phone boolean := false;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  v_digits := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_digits like '20%' and pg_catalog.length(v_digits) = 12 then
    v_digits := '0' || pg_catalog.substr(v_digits, 3);
  end if;
  if v_digits !~ '^01[0125][0-9]{8}$' then
    raise exception 'phone_invalid';
  end if;

  update public.profiles
  set role = case when role = 'guest' then 'owner' else role end,
      phone = coalesce(nullif(trim(coalesce(phone, '')), ''), v_digits)
  where id = p_user_id;

  with matched_chalets as (
    select cc.chalet_id
    from public.chalet_contacts cc
    join public.chalets c on c.id = cc.chalet_id
    where pg_catalog.regexp_replace(cc.owner_phone, '\D', '', 'g') = v_digits
      and (
        c.owner_id is null
        or exists (
          select 1 from public.profiles op
          where op.id = c.owner_id and op.role = 'admin'
        )
      )
  ),
  upd_chalets as (
    update public.chalets c
    set owner_id = p_user_id
    from matched_chalets mc
    where c.id = mc.chalet_id
    returning c.id
  )
  select pg_catalog.count(*)::integer into v_linked_chalets from upd_chalets;

  update public.chalet_contacts cc
  set owner_id = p_user_id
  from public.chalets c
  where cc.chalet_id = c.id
    and c.owner_id = p_user_id
    and cc.owner_id is distinct from p_user_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscriptions'
      and column_name = 'owner_phone'
  ) into v_has_sub_phone;

  if v_has_sub_phone then
    execute '
      with upd_subs as (
        update public.subscriptions s
        set user_id = $1
        where s.user_id is null
          and pg_catalog.regexp_replace(coalesce(s.owner_phone, ''''), ''\D'', '''', ''g'') = $2
          and s.status not in (''active'', ''pending'')
        returning s.id
      )
      select pg_catalog.count(*)::integer from upd_subs
    '
    into v_linked_subs
    using p_user_id, v_digits;
  end if;

  return pg_catalog.jsonb_build_object(
    'linked_chalets', coalesce(v_linked_chalets, 0),
    'linked_subscriptions', coalesce(v_linked_subs, 0)
  );
end;
$$;

revoke all on function public.admin_link_legacy_owner(uuid, text) from public;
grant execute on function public.admin_link_legacy_owner(uuid, text) to authenticated, service_role;
