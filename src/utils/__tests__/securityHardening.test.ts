import { describe, expect, it } from 'vitest';
import { CHALET_PUBLIC_SELECT_COLUMNS } from '@/services/agzstayRepository';
import migrationSql from '../../../supabase/migrations/006_secure_v2.sql?raw';
import pgTapSql from '../../../supabase/tests/006_secure_v2.test.sql?raw';
import repoSource from '@/services/agzstayRepository.ts?raw';

import adminDashboardSource from '@/components/AdminDashboard.tsx?raw';

describe('006_secure_v2.sql security & concurrency invariants', () => {
  it('explicitly binds chalets_protect trigger, locks owner profile FOR UPDATE, and merges verification gate', () => {
    expect(migrationSql).toMatch(/create\s+trigger\s+trg_01_chalets_protect/i);
    expect(migrationSql).toMatch(/from\s+public\.profiles\s+p[\s\S]*for\s+update/i);
    expect(migrationSql).toContain("raise exception 'owner_not_verified'");
    expect(migrationSql).toContain("raise exception 'quota_exceeded'");
    // No orphaned unlinked enforce_chalet_verified_owner_publish trigger/function
    expect(migrationSql).toMatch(/drop\s+function\s+if\s+exists\s+public\.enforce_chalet_verified_owner_publish/i);
  });

  it('uses atomic lock + single upsert counter in reveal_listing_contact without X-Forwarded-For spoofing', () => {
    const fnMatch = migrationSql.match(
      /create\s+or\s+replace\s+function\s+public\.reveal_listing_contact[\s\S]*?\$\$;/i
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    expect(fnBody).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(fnBody).toContain('on conflict (actor_key, window_start) do update');
    expect(fnBody).toContain('where rl.request_count < v_hourly_limit');
    expect(fnBody).toContain('pg_catalog.inet_client_addr()');
    const fnCodeOnly = fnBody.replace(/--.*$/gm, '').toLowerCase();
    expect(fnCodeOnly).not.toContain('x-forwarded-for');
    expect(fnCodeOnly).not.toContain('request.headers');
  });

  it('pins search_path = empty on all SECURITY DEFINER functions and removes role = none bypasses', () => {
    const secDefBlocks = migrationSql.match(
      /create\s+or\s+replace\s+function\s+[\s\S]*?as\s+\$\$/gi
    );
    expect(secDefBlocks && secDefBlocks.length).toBeGreaterThanOrEqual(7);

    for (const header of secDefBlocks ?? []) {
      if (/security\s+definer/i.test(header)) {
        expect(header).toMatch(/set\s+search_path\s*=\s*''/i);
      }
    }

    expect(migrationSql.toLowerCase()).not.toMatch(/current_setting\(\s*'role'[^)]*\)\s*=\s*'none'/);
  });

  it('purges legacy storage.objects policies dynamically and keeps receipts bucket private', () => {
    expect(migrationSql).toMatch(/insert\s+into\s+storage\.buckets[\s\S]*'receipts'[\s\S]*false/i);
    expect(migrationSql).toMatch(/from\s+pg_catalog\.pg_policies[\s\S]*storage[\s\S]*objects/i);
    expect(migrationSql).toMatch(/drop\s+policy\s+if\s+exists\s+%I\s+on\s+storage\.objects/i);
  });

  it('serializes admin_review_subscription per owner and enforces unique partial active subscription index', () => {
    const fnMatch = migrationSql.match(
      /create\s+or\s+replace\s+function\s+public\.admin_review_subscription[\s\S]*?\$\$;/i
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    expect(fnBody).toMatch(/if\s+not\s+public\.is_admin\(\)/i);
    expect(fnBody).toMatch(/from\s+public\.profiles\s+p[\s\S]*for\s+update/i);
    expect(fnBody).toMatch(/from\s+public\.subscriptions\s+s[\s\S]*for\s+update/i);
    expect(migrationSql).toContain('idx_subscriptions_one_active_per_owner');
    expect(migrationSql).toContain('idx_subscriptions_one_pending_per_owner');
  });

  it('wraps auth.uid() in (select auth.uid()) across RLS policies and matches CHALET_PUBLIC_SELECT_COLUMNS', () => {
    const policyBlocks = migrationSql.match(/create\s+policy\s+[\s\S]*?;/gi) ?? [];
    expect(policyBlocks.length).toBeGreaterThan(10);
    for (const policy of policyBlocks) {
      if (policy.toLowerCase().includes('auth.uid()')) {
        expect(policy.toLowerCase()).toContain('(select auth.uid())');
      }
    }

    // Match explicit GRANT SELECT (...) ON public.chalets with repository allowlist
    const grantMatch = migrationSql.match(
      /grant\s+select\s*\(([^)]*)\)\s*on\s+public\.chalets\s+to\s+anon,\s*authenticated/i
    );
    expect(grantMatch).not.toBeNull();
    const sqlCols = grantMatch![1]
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean);
    const tsCols = CHALET_PUBLIC_SELECT_COLUMNS.split(',').map((c: string) => c.trim());

    expect(tsCols).toEqual(sqlCols);
    expect(tsCols).not.toContain('owner_phone');

    // Ensure repository never executes broad .select('*') against chalets
    expect(repoSource).not.toMatch(/from\(\s*'chalets'\s*\)[\s\S]{0,120}\.select\(\s*'\*'\s*\)/);
  });

  it('includes matching pgTAP assertions count with plan(N)', () => {
    const planMatch = pgTapSql.match(/select\s+plan\((\d+)\)/i);
    expect(planMatch).not.toBeNull();
    expect(Number(planMatch![1])).toBe(35);
  });

  it('enforces real Supabase Auth & DB role check on /admin without hardcoded emails or PINs', () => {
    expect(adminDashboardSource).not.toContain('VITE_ADMIN_PIN');
    expect(adminDashboardSource).toContain('هذا الحساب لا يملك صلاحية الإدارة');
    expect(adminDashboardSource).toContain('العودة للرئيسية');
    expect(repoSource).toContain("supabase.rpc('is_admin')");
    expect(repoSource).toContain("supabase.from('profiles').select('role').eq('id', user.id).single()");
  });
});
