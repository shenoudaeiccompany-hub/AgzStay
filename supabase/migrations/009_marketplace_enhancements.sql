-- ============================================================================
-- AgzStay Marketplace Enhancements Migration (009)
-- Additive migration (leaves 001..008 intact):
-- 1. Flexible weekend & seasonal pricing (`chalet_pricing_rules`).
-- 2. Rate-limited guest reviews & ratings (`chalet_reviews` + `submit_chalet_review`).
-- 3. In-app notification center & automatic triggers (`user_notifications` +
--    triggers on owner_verifications, subscriptions, and listing_reports).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Flexible Weekend & Seasonal Pricing (`chalet_pricing_rules`)
-- ----------------------------------------------------------------------------
create table if not exists public.chalet_pricing_rules (
  chalet_id text primary key references public.chalets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  weekend_price numeric check (weekend_price is null or weekend_price > 0),
  seasonal_price numeric check (seasonal_price is null or seasonal_price > 0),
  seasonal_label text not null default '',
  seasonal_start date,
  seasonal_end date,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint chalet_pricing_seasonal_dates_chk check (
    seasonal_start is null
    or seasonal_end is null
    or seasonal_end >= seasonal_start
  )
);

alter table public.chalet_pricing_rules enable row level security;

create or replace function public.chalet_pricing_rules_protect()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chalet_owner uuid;
  v_trusted boolean;
begin
  v_trusted := (current_user in ('postgres', 'supabase_admin', 'service_role'));

  select c.owner_id into v_chalet_owner
  from public.chalets c
  where c.id = new.chalet_id;

  if not found then
    raise exception 'chalet_not_found';
  end if;

  if not v_trusted and not public.is_admin() then
    if v_chalet_owner <> (select auth.uid()) then
      raise exception 'forbidden';
    end if;
  end if;

  new.owner_id := v_chalet_owner;
  new.seasonal_label := pg_catalog.left(trim(coalesce(new.seasonal_label, '')), 80);
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists trg_chalet_pricing_rules_protect on public.chalet_pricing_rules;
create trigger trg_chalet_pricing_rules_protect
  before insert or update on public.chalet_pricing_rules
  for each row execute function public.chalet_pricing_rules_protect();

drop policy if exists "chalet_pricing_rules_public_select" on public.chalet_pricing_rules;
drop policy if exists "chalet_pricing_rules_owner_insert" on public.chalet_pricing_rules;
drop policy if exists "chalet_pricing_rules_owner_update" on public.chalet_pricing_rules;
drop policy if exists "chalet_pricing_rules_owner_delete" on public.chalet_pricing_rules;

create policy "chalet_pricing_rules_public_select"
  on public.chalet_pricing_rules for select
  using (true);

create policy "chalet_pricing_rules_owner_insert"
  on public.chalet_pricing_rules for insert
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy "chalet_pricing_rules_owner_update"
  on public.chalet_pricing_rules for update
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy "chalet_pricing_rules_owner_delete"
  on public.chalet_pricing_rules for delete
  using (owner_id = (select auth.uid()) or public.is_admin());

revoke all on table public.chalet_pricing_rules from public, anon, authenticated;
grant select on table public.chalet_pricing_rules to anon, authenticated;
grant insert, update, delete on table public.chalet_pricing_rules to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Guarded Guest Reviews & Ratings (`chalet_reviews` + `submit_chalet_review`)
-- ----------------------------------------------------------------------------
create table if not exists public.chalet_reviews (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  chalet_id text not null references public.chalets(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  actor_key text not null,
  reviewer_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  is_approved boolean not null default true,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_chalet_reviews_chalet_created
  on public.chalet_reviews (chalet_id, is_approved, created_at desc);

create index if not exists idx_chalet_reviews_actor_created
  on public.chalet_reviews (chalet_id, actor_key, created_at desc);

alter table public.chalet_reviews enable row level security;

drop policy if exists "chalet_reviews_public_select" on public.chalet_reviews;
drop policy if exists "chalet_reviews_admin_update" on public.chalet_reviews;
drop policy if exists "chalet_reviews_admin_delete" on public.chalet_reviews;

create policy "chalet_reviews_public_select"
  on public.chalet_reviews for select
  using (is_approved = true or public.is_admin());

create policy "chalet_reviews_admin_update"
  on public.chalet_reviews for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "chalet_reviews_admin_delete"
  on public.chalet_reviews for delete
  using (public.is_admin());

revoke all on table public.chalet_reviews from public, anon, authenticated;
grant select (id, chalet_id, reviewer_name, rating, comment, is_approved, created_at)
  on table public.chalet_reviews to anon, authenticated;
grant update, delete on table public.chalet_reviews to authenticated;

create or replace function public.submit_chalet_review(
  p_chalet_id text,
  p_reviewer_name text,
  p_rating integer,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_peer_ip text;
  v_actor_key text;
  v_clean_name text;
  v_clean_comment text;
  v_recent_count integer := 0;
  v_created public.chalet_reviews%rowtype;
begin
  if nullif(trim(coalesce(p_chalet_id, '')), '') is null then
    raise exception 'chalet_not_found';
  end if;

  select c.owner_id
  into v_owner_id
  from public.chalets c
  where c.id = p_chalet_id
    and c.availability_status = 'active';

  if not found then
    raise exception 'chalet_not_found';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_state';
  end if;

  v_clean_name := pg_catalog.left(trim(coalesce(p_reviewer_name, '')), 60);
  if pg_catalog.length(v_clean_name) < 2 then
    raise exception 'يرجى كتابة اسمك (حرفين على الأقل) لإضافة التقييم.';
  end if;

  v_clean_comment := pg_catalog.left(trim(coalesce(p_comment, '')), 600);

  v_uid := (select auth.uid());
  if v_uid is not null and v_owner_id = v_uid then
    raise exception 'لا يمكن للمعلن تقييم وحدته الخاصة.';
  end if;

  if v_uid is not null then
    v_actor_key := 'user:' || v_uid::text;
  else
    v_peer_ip := nullif(pg_catalog.host(pg_catalog.inet_client_addr()), '');
    v_actor_key := 'anon:' || coalesce(v_peer_ip, 'local_peer');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('chalet_review:' || v_actor_key)
  );

  if exists (
    select 1
    from public.chalet_reviews cr
    where cr.chalet_id = p_chalet_id
      and cr.actor_key = v_actor_key
      and cr.created_at >= pg_catalog.now() - interval '30 days'
  ) then
    raise exception 'لقد قمت بتقييم هذه الوحدة مسبقاً.';
  end if;

  select pg_catalog.count(*)::integer
  into v_recent_count
  from public.chalet_reviews cr
  where cr.actor_key = v_actor_key
    and cr.created_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.chalet_reviews (
    chalet_id,
    reviewer_id,
    actor_key,
    reviewer_name,
    rating,
    comment,
    is_approved
  )
  values (
    p_chalet_id,
    v_uid,
    v_actor_key,
    v_clean_name,
    p_rating,
    v_clean_comment,
    true
  )
  returning * into v_created;

  return pg_catalog.jsonb_build_object(
    'id', v_created.id,
    'chalet_id', v_created.chalet_id,
    'reviewer_name', v_created.reviewer_name,
    'rating', v_created.rating,
    'comment', v_created.comment,
    'is_approved', v_created.is_approved,
    'created_at', v_created.created_at
  );
end;
$$;

revoke all on function public.submit_chalet_review(text, text, integer, text) from public;
grant execute on function public.submit_chalet_review(text, text, integer, text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. In-App Notifications & Event Triggers (`user_notifications`)
-- ----------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system' check (type in ('verification', 'subscription', 'report', 'system')),
  title text not null,
  body text not null,
  link_section text check (link_section is null or link_section in ('home', 'pricing', 'owner', 'admin')),
  is_read boolean not null default false,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_user_notifications_user_created
  on public.user_notifications (user_id, is_read, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_owner_select" on public.user_notifications;
drop policy if exists "user_notifications_owner_update" on public.user_notifications;
drop policy if exists "user_notifications_owner_delete" on public.user_notifications;

create policy "user_notifications_owner_select"
  on public.user_notifications for select
  using (user_id = (select auth.uid()));

create policy "user_notifications_owner_update"
  on public.user_notifications for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_notifications_owner_delete"
  on public.user_notifications for delete
  using (user_id = (select auth.uid()));

revoke all on table public.user_notifications from public, anon, authenticated;
grant select, update, delete on table public.user_notifications to authenticated;

create or replace function public.notify_on_verification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.user_notifications (user_id, type, title, body, link_section)
    select p.id,
           'verification',
           'طلب توثيق معلن جديد',
           pg_catalog.format('قدّم المعلن %s طلباً جديداً لتوثيق حسابه.', new.owner_name),
           'admin'
    from public.profiles p
    where p.role = 'admin';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'pending' then
      insert into public.user_notifications (user_id, type, title, body, link_section)
      select p.id,
             'verification',
             'إعادة إرسال طلب توثيق',
             pg_catalog.format('أعاد المعلن %s رفع مستند التوثيق للمراجعة.', new.owner_name),
             'admin'
      from public.profiles p
      where p.role = 'admin';
    elsif new.status = 'verified' then
      insert into public.user_notifications (user_id, type, title, body, link_section)
      values (
        new.owner_id,
        'verification',
        'تم توثيق حسابك بنجاح',
        'مبروك! تم اعتماد مستندك وتفعيل شارة «معلن موثق» على جميع وحداتك.',
        'owner'
      );
    elsif new.status = 'unverified' then
      insert into public.user_notifications (user_id, type, title, body, link_section)
      values (
        new.owner_id,
        'verification',
        'يلزم تحديث مستند التوثيق',
        coalesce(nullif(new.rejection_reason, ''), 'يرجى مراجعة سبب الرفض وإعادة رفع مستند واضح من بوابة المعلن.'),
        'owner'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_verification_event on public.owner_verifications;
create trigger trg_notify_verification_event
  after insert or update on public.owner_verifications
  for each row execute function public.notify_on_verification_event();

create or replace function public.notify_on_subscription_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.user_notifications (user_id, type, title, body, link_section)
    select p.id,
           'subscription',
           'طلب اشتراك باقة جديد',
           pg_catalog.format('طلب جديد لباقة %s من %s بانتظار المراجعة.', coalesce(new.plan_name, new.plan_id), new.owner_name),
           'admin'
    from public.profiles p
    where p.role = 'admin';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.user_id is not null then
    if new.status = 'active' then
      insert into public.user_notifications (user_id, type, title, body, link_section)
      values (
        new.user_id,
        'subscription',
        'تم تفعيل باقة اشتراكك',
        pg_catalog.format('تم اعتماد باقة %s وتمييز وحداتك تلقائياً.', coalesce(new.plan_name, new.plan_id)),
        'owner'
      );
    elsif new.status = 'rejected' then
      insert into public.user_notifications (user_id, type, title, body, link_section)
      values (
        new.user_id,
        'subscription',
        'تم رفض طلب الاشتراك',
        coalesce(nullif(new.admin_note, ''), 'يرجى مراجعة إيصال التحويل والتواصل معنا أو إعادة المحاولة.'),
        'pricing'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_subscription_event on public.subscriptions;
create trigger trg_notify_subscription_event
  after insert or update on public.subscriptions
  for each row execute function public.notify_on_subscription_event();

create or replace function public.notify_on_listing_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications (user_id, type, title, body, link_section)
  select p.id,
         'report',
         'بلاغ جديد على وحدة',
         pg_catalog.format('ورد بلاغ جديد بسبب "%s" على الوحدة (%s).', new.reason, new.chalet_id),
         'admin'
  from public.profiles p
  where p.role = 'admin';
  return new;
end;
$$;

drop trigger if exists trg_notify_listing_report_insert on public.listing_reports;
create trigger trg_notify_listing_report_insert
  after insert on public.listing_reports
  for each row execute function public.notify_on_listing_report_insert();
