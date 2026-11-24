-- ============================================================================
-- AgzStay V2 Security & Concurrency pgTAP Test Suite
-- Run with: supabase test db (or pg_prove against a database migrated with
-- 006_secure_v2.sql). Wrapped in BEGIN ... ROLLBACK so staging stays clean.
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(35);

-- ----------------------------------------------------------------------------
-- 1. Schema, Trigger, Search-Path & Storage Hardening Invariants
-- ----------------------------------------------------------------------------
select hasnt_column(
  'public',
  'chalets',
  'owner_phone',
  'public.chalets must not expose owner_phone column'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'is_admin',
        'handle_new_user',
        'become_host',
        'reveal_listing_contact',
        'request_subscription',
        'my_subscription',
        'admin_review_subscription'
      )
      and p.prosecdef = true
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=']
  ),
  7,
  'All 7 SECURITY DEFINER functions in 006_secure_v2 must pin search_path = empty'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('prevent_profile_role_self_change', 'chalets_protect', 'chalet_contacts_protect')
      and pg_get_functiondef(p.oid) ilike '%''none''%'
  ),
  0,
  'Guard triggers must never rely on unsafe role = ''none'' exception'
);

select trigger_is(
  'public',
  'chalets',
  'trg_01_chalets_protect',
  'public',
  'chalets_protect',
  'Unified verification gate + quota lock trigger must be explicitly bound on public.chalets'
);

select is(
  (select public from storage.buckets where id = 'receipts'),
  false,
  'receipts storage bucket must be private (public = false)'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ~* '''(property-images|receipts)'''
        or coalesce(with_check, '') ~* '''(property-images|receipts)'''
      )
      and (
        qual = 'true'
        or with_check = 'true'
        or policyname ilike '%_v2_%'
      )
  ),
  0,
  'All permissive legacy storage.objects policies (*_v2_*, true) for property-images/receipts must be removed'
);

select has_index(
  'public',
  'subscriptions',
  'idx_subscriptions_one_active_per_owner',
  'Unique partial index must prevent two simultaneous active subscriptions per owner'
);

select has_index(
  'public',
  'subscriptions',
  'idx_subscriptions_one_pending_per_owner',
  'Unique partial index must prevent two simultaneous pending requests per owner'
);

-- ----------------------------------------------------------------------------
-- 2. Seed Isolated Test Users in auth.users / public.profiles
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'owner-tap@agzstay.test', '{"name":"مالك اختبار","phone":"01011111111"}'),
  ('22222222-2222-2222-2222-222222222222', 'guest-tap@agzstay.test', '{"name":"مستأجر اختبار","phone":"01122222222"}'),
  ('33333333-3333-3333-3333-333333333333', 'admin-tap@agzstay.test', '{"name":"مدير اختبار","phone":"01233333333"}')
on conflict (id) do nothing;

insert into public.profiles (id, name, phone, advertiser_type, role, verification_status)
values
  ('11111111-1111-1111-1111-111111111111', 'مالك اختبار', '01011111111', 'owner', 'guest', 'unverified'),
  ('22222222-2222-2222-2222-222222222222', 'مستأجر اختبار', '01122222222', 'owner', 'guest', 'unverified'),
  ('33333333-3333-3333-3333-333333333333', 'مدير اختبار', '01233333333', 'owner', 'admin', 'verified')
on conflict (id) do update
  set role = excluded.role,
      verification_status = excluded.verification_status;

-- ----------------------------------------------------------------------------
-- 3. Guest Upgrade & Zero-Trust Role Protection
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(public.is_admin(), false, 'Regular guest/owner is_admin() must return false');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'Column-level grant + trigger must block authenticated user from updating profiles.role'
);

select is(
  (public.become_host('owner') ->> 'role'),
  'owner',
  'become_host upgrades guest role safely to owner (never admin)'
);

-- ----------------------------------------------------------------------------
-- 4. Verification Gate Enforcement (require_verified_to_publish = true)
-- ----------------------------------------------------------------------------
reset role;
update public.platform_settings set require_verified_to_publish = true where id = 'global';

set local role authenticated;
select throws_ok(
  $$
    insert into public.chalets (id, owner_id, title, governorate, city, price_per_night, availability_status)
    values ('tap-unverified-active', '11111111-1111-1111-1111-111111111111', 'شاليه غير موثق', 'مطروح', 'الساحل الشمالي', 2000, 'active')
  $$,
  'P0001',
  'owner_not_verified',
  'Verification gate must reject active publish for unverified owner when require_verified_to_publish = true'
);

select lives_ok(
  $$
    insert into public.chalets (id, owner_id, title, governorate, city, price_per_night, availability_status)
    values ('tap-unverified-hidden', '11111111-1111-1111-1111-111111111111', 'مسودة غير موثقة', 'مطروح', 'الساحل الشمالي', 2000, 'hidden')
  $$,
  'Unverified owner can still save hidden draft when require_verified_to_publish = true'
);

-- Delete hidden draft and disable strict verify gate / verify owner for quota test
delete from public.chalets where id = 'tap-unverified-hidden';
reset role;
update public.profiles set verification_status = 'verified' where id = '11111111-1111-1111-1111-111111111111';

-- ----------------------------------------------------------------------------
-- 5. Listing Quota & Anti-Self-Featuring + Contact Separation
-- ----------------------------------------------------------------------------
set local role authenticated;

select lives_ok(
  $$
    insert into public.chalets (id, owner_id, title, governorate, city, price_per_night, is_featured, availability_status)
    values ('tap-unit-1', '11111111-1111-1111-1111-111111111111', 'شاليه ١', 'مطروح', 'الساحل الشمالي', 3000, true, 'active')
  $$,
  'Verified free owner can publish 1st unit'
);

select is(
  (select is_featured from public.chalets where id = 'tap-unit-1'),
  false,
  'chalets_protect must override self-assigned is_featured=true to false on free plan'
);

select is(
  (select owner_verified from public.chalets where id = 'tap-unit-1'),
  true,
  'chalets_protect must set owner_verified=true from verified profile'
);

select throws_ok(
  $$
    insert into public.chalets (id, owner_id, title, governorate, city, price_per_night, availability_status)
    values ('tap-unit-2', '11111111-1111-1111-1111-111111111111', 'شاليه ٢', 'مطروح', 'الساحل الشمالي', 3000, 'active')
  $$,
  'P0001',
  'quota_exceeded',
  'Free owner 2nd insert must fail with quota_exceeded under owner profile FOR UPDATE lock'
);

select lives_ok(
  $$
    insert into public.chalet_contacts (chalet_id, owner_id, owner_phone)
    values ('tap-unit-1', '11111111-1111-1111-1111-111111111111', '+201011111111')
  $$,
  'Owner can save normalized phone in private chalet_contacts'
);

-- ----------------------------------------------------------------------------
-- 6. Subscription Lifecycle & Concurrent-Safe Admin Review Serialization
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ select public.request_subscription('starter', '22222222-2222-2222-2222-222222222222/receipt.png') $$,
  'P0001',
  'forbidden',
  'request_subscription must reject receipt paths outside caller UID folder'
);

select lives_ok(
  $$ select public.request_subscription('starter', '11111111-1111-1111-1111-111111111111/r1.png') $$,
  'Owner can submit valid starter subscription request'
);

select throws_ok(
  $$ select public.request_subscription('pro', '11111111-1111-1111-1111-111111111111/r2.png') $$,
  'P0001',
  'duplicate_request',
  'Duplicate pending subscription request must fail with duplicate_request'
);

select throws_ok(
  $$
    select public.admin_review_subscription(
      (select id from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111' limit 1),
      true,
      'self approve'
    )
  $$,
  'P0001',
  'forbidden',
  'Non-admin owner must receive forbidden when calling admin_review_subscription'
);

-- Switch to admin user
reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select is(public.is_admin(), true, 'Admin profile is_admin() returns true');

select lives_ok(
  $$
    select public.admin_review_subscription(
      (select id from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111' and status = 'pending' limit 1),
      true,
      'تمت المراجعة'
    )
  $$,
  'Admin can approve pending subscription'
);

select is(
  (select is_featured from public.chalets where id = 'tap-unit-1'),
  true,
  'Approving paid eligible plan automatically marks owner chalets is_featured=true'
);

select throws_ok(
  $$
    select public.admin_review_subscription(
      (select id from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111' limit 1),
      true,
      'double approve'
    )
  $$,
  'P0001',
  'already_reviewed',
  'Re-reviewing already active subscription must raise already_reviewed'
);

-- Owner submits a 2nd upgrade (Pro) and admin approves: old active starter must auto-expire
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.request_subscription('pro', '11111111-1111-1111-1111-111111111111/r_pro.png');

reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;
select public.admin_review_subscription(
  (select id from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111' and status = 'pending' limit 1),
  true,
  'ترقية إلى Pro'
);

select is(
  (select count(*)::integer from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111' and status = 'active'),
  1,
  'Owner must have at most ONE active subscription after upgrade approval'
);

-- ----------------------------------------------------------------------------
-- 7. Anon Access, Column Isolation & Atomic Anti-Spoof Contact Reveal Rate Limit
-- ----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

select lives_ok(
  $$
    select id, owner_id, title, description, governorate, city, area_or_village,
           property_type, advertiser_role, owner_name, is_featured, owner_verified,
           deposit_type, deposit_value, price_per_night, weekly_price, monthly_price,
           bedrooms, bathrooms, area_sqm, max_guests, beach_distance_meters,
           coordinates, images, amenities, blocked_dates, rules,
           availability_status, created_at, updated_at
    from public.chalets
    where availability_status = 'active'
    limit 1
  $$,
  'anon can select all explicit allowlisted public columns on chalets'
);

select throws_ok(
  $$ select owner_phone from public.chalet_contacts limit 1 $$,
  '42501',
  null,
  'anon must be denied direct SELECT on private chalet_contacts'
);

select is(
  (public.reveal_listing_contact('tap-unit-1') ->> 'owner_phone'),
  '01011111111',
  'anon can reveal active listing phone once within hourly limit'
);

-- Verify advisory lock is held in pg_locks for this transaction's actor_key
select ok(
  exists (
    select 1 from pg_locks
    where locktype = 'advisory'
      and granted = true
  ),
  'reveal_listing_contact must acquire transaction advisory lock to serialize concurrent calls'
);

-- Calls 2..10 succeed EVEN IF attacker mutates X-Forwarded-For header every call
do $$
declare
  i integer;
begin
  for i in 2..10 loop
    perform set_config('request.headers', format('{"x-forwarded-for": "10.0.0.%s"}', i), true);
    perform public.reveal_listing_contact('tap-unit-1');
  end loop;
end $$;

select set_config('request.headers', '{"x-forwarded-for": "198.51.100.77"}', true);
select throws_ok(
  $$ select public.reveal_listing_contact('tap-unit-1') $$,
  'P0001',
  'rate_limited',
  '11th anon reveal must fail with rate_limited even with spoofed X-Forwarded-For header'
);

-- Verify authenticated renter gets their own independent atomic limit (up to 20)
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.reveal_listing_contact('tap-unit-1') ->> 'owner_phone'),
  '01011111111',
  'Authenticated guest has dedicated user-scoped rate-limit bucket'
);

do $$
declare
  i integer;
begin
  for i in 2..20 loop
    perform public.reveal_listing_contact('tap-unit-1');
  end loop;
end $$;

select throws_ok(
  $$ select public.reveal_listing_contact('tap-unit-1') $$,
  'P0001',
  'rate_limited',
  '21st authenticated reveal must fail with rate_limited'
);

-- Verify hidden listing contact is never revealed to third-party guest
reset role;
update public.chalets set availability_status = 'hidden' where id = 'tap-unit-1';
set local role authenticated;

-- Reset guest rate limit bucket only to confirm availability gate triggers contact_not_available
reset role;
delete from public.contact_reveal_rate_limits where actor_key = 'user:22222222-2222-2222-2222-222222222222';
set local role authenticated;

select throws_ok(
  $$ select public.reveal_listing_contact('tap-unit-1') $$,
  'P0001',
  'contact_not_available',
  'Hidden listing contact must raise contact_not_available to third-party renters'
);

select finish();
rollback;
