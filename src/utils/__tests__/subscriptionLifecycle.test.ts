import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURATED_EGYPT_UNITS } from '@/data/chalets';
import { resolveOwnerQuota } from '@/data/subscriptions';

interface MockSubRow {
  id: string;
  owner_name: string;
  owner_phone: string;
  plan_id: string;
  plan_name: string;
  price: number;
  max_units: number;
  receipt_path: string | null;
  receipt_url: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

interface MockChaletRow {
  id: string;
  owner_phone: string;
  is_featured: boolean;
}

const mockState = vi.hoisted(() => ({
  subscriptions: [] as MockSubRow[],
  chalets: [] as MockChaletRow[],
  uploadedFiles: [] as { bucket: string; path: string; contentType: string }[],
}));

vi.mock('@/lib/supabase', () => {
  const storageFrom = (bucket: string) => ({
    upload: async (path: string, _file: unknown, opts?: { contentType?: string }) => {
      mockState.uploadedFiles.push({
        bucket,
        path,
        contentType: opts?.contentType ?? 'application/octet-stream',
      });
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}` },
    }),
    createSignedUrl: async (path: string) => ({
      data: { signedUrl: `https://mock.supabase.co/storage/v1/object/sign/${bucket}/${path}` },
      error: null,
    }),
  });

  const from = (table: string) => {
    if (table === 'subscriptions') {
      return {
        select: () => ({
          order: async () => ({
            data: [...mockState.subscriptions],
            error: null,
          }),
        }),
        insert: (row: Partial<MockSubRow>) => ({
          select: () => ({
            single: async () => {
              const created: MockSubRow = {
                id: `sub-${mockState.subscriptions.length + 1}`,
                owner_name: String(row.owner_name ?? ''),
                owner_phone: String(row.owner_phone ?? ''),
                plan_id: String(row.plan_id ?? 'starter'),
                plan_name: String(row.plan_name ?? ''),
                price: Number(row.price ?? 0),
                max_units: Number(row.max_units ?? 1),
                receipt_path: row.receipt_path ?? null,
                receipt_url: row.receipt_url ?? null,
                status: String(row.status ?? 'pending'),
                created_at: new Date().toISOString(),
                reviewed_at: null,
              };
              mockState.subscriptions.unshift(created);
              return { data: created, error: null };
            },
          }),
        }),
        update: (patch: Partial<MockSubRow>) => ({
          eq: (_col: string, id: string) => ({
            select: () => ({
              single: async () => {
                const target = mockState.subscriptions.find((s) => s.id === id);
                if (!target) {
                  return { data: null, error: { message: 'Not found' } };
                }
                Object.assign(target, patch);
                return { data: target, error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === 'chalets') {
      return {
        select: async () => ({
          data: [...mockState.chalets],
          error: null,
        }),
        update: (patch: Partial<MockChaletRow>) => ({
          in: async (_col: string, ids: string[]) => {
            for (const c of mockState.chalets) {
              if (ids.includes(c.id)) {
                Object.assign(c, patch);
              }
            }
            return { data: null, error: null };
          },
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      storage: { from: storageFrom },
      from,
    },
    requireSupabase: () => ({
      storage: { from: storageFrom },
      from,
    }),
  };
});

import {
  createSubscriptionRequest,
  fetchSubscriptionsByPhone,
  reviewSubscriptionAdmin,
  uploadSubscriptionReceiptFile,
} from '@/services/agzstayRepository';

describe('Full subscription lifecycle (/pricing -> /admin -> /owner) & launch dataset', () => {
  beforeEach(() => {
    mockState.subscriptions = [];
    mockState.chalets = [
      { id: 'unit-1', owner_phone: '01012345678', is_featured: false },
      { id: 'unit-2', owner_phone: '01199999999', is_featured: false },
    ];
    mockState.uploadedFiles = [];
  });

  it('completes receipt upload -> pending request -> admin approval -> featured units & unlocked quota', async () => {
    const fakeReceipt = new File(['receipt-bytes'], 'instapay.png', { type: 'image/png' });

    // Step 1: Owner uploads receipt on /pricing
    const uploadRes = await uploadSubscriptionReceiptFile(fakeReceipt, '+201012345678');
    expect(uploadRes.error).toBeNull();
    expect(uploadRes.data?.path).toMatch(/^01012345678\/sub-.*\.png$/);
    expect(mockState.uploadedFiles[0]?.bucket).toBe('receipts');

    // Step 2: Subscription row created as pending
    const createRes = await createSubscriptionRequest({
      ownerName: 'أ. كريم محمد',
      ownerPhone: '01012345678',
      planId: 'starter',
      planName: 'باقة البداية (Starter)',
      price: 500,
      maxUnits: 5,
      receiptPath: uploadRes.data?.path,
      receiptUrl: uploadRes.data?.publicUrl,
    });
    expect(createRes.error).toBeNull();
    expect(createRes.data?.status).toBe('pending');

    // Step 3: Owner checks /owner before admin approval
    const beforeSubs = await fetchSubscriptionsByPhone('01012345678');
    expect(beforeSubs.data).toHaveLength(1);
    const pendingQuota = resolveOwnerQuota('01012345678', beforeSubs.data ?? []);
    expect(pendingQuota.subscriptionStatus).toBe('pending');
    expect(pendingQuota.maxUnits).toBe(1);
    expect(pendingQuota.pendingSubscription?.id).toBe(createRes.data?.id);

    // Step 4: Admin approves subscription in /admin
    const reviewRes = await reviewSubscriptionAdmin(
      createRes.data!.id,
      createRes.data!.ownerPhone,
      'active'
    );
    expect(reviewRes.error).toBeNull();
    expect(reviewRes.data?.status).toBe('active');

    // Matching owner's units are automatically marked featured; other owners unaffected
    expect(mockState.chalets.find((u) => u.id === 'unit-1')?.is_featured).toBe(true);
    expect(mockState.chalets.find((u) => u.id === 'unit-2')?.is_featured).toBe(false);

    // Step 5: Owner checks /owner after activation -> quota unlocked
    const afterSubs = await fetchSubscriptionsByPhone('01012345678');
    const activeQuota = resolveOwnerQuota('01012345678', afterSubs.data ?? []);
    expect(activeQuota.subscriptionStatus).toBe('active');
    expect(activeQuota.maxUnits).toBe(5);
    expect(activeQuota.activePlan.isFeaturedEligible).toBe(true);
  });

  it('tracks rejected subscription state without unlocking paid quota', async () => {
    const createRes = await createSubscriptionRequest({
      ownerName: 'أ. سارة علي',
      ownerPhone: '01122334455',
      planId: 'pro',
      planName: 'الباقة الاحترافية (Pro)',
      price: 800,
      maxUnits: 10,
    });
    expect(createRes.error).toBeNull();

    const rejectRes = await reviewSubscriptionAdmin(
      createRes.data!.id,
      createRes.data!.ownerPhone,
      'rejected'
    );
    expect(rejectRes.error).toBeNull();
    expect(rejectRes.data?.status).toBe('rejected');

    const subs = await fetchSubscriptionsByPhone('01122334455');
    const quota = resolveOwnerQuota('01122334455', subs.data ?? []);
    expect(quota.subscriptionStatus).toBe('rejected');
    expect(quota.maxUnits).toBe(1);
    expect(quota.latestRejectedSubscription?.id).toBe(createRes.data?.id);
  });

  it('provides 9 curated Egyptian listings with complete pre-launch quality', () => {
    expect(CURATED_EGYPT_UNITS.length).toBeGreaterThanOrEqual(8);
    expect(CURATED_EGYPT_UNITS.length).toBeLessThanOrEqual(10);

    const roles = new Set(CURATED_EGYPT_UNITS.map((u) => u.advertiserRole));
    expect(roles.has('مالك مباشر')).toBe(true);
    expect(roles.has('مكتب / وسيط')).toBe(true);

    const types = new Set(CURATED_EGYPT_UNITS.map((u) => u.propertyType));
    expect(types.has('شاليه')).toBe(true);
    expect(types.has('شقة مفروشة')).toBe(true);
    expect(types.has('شقة فاضية')).toBe(true);

    for (const unit of CURATED_EGYPT_UNITS) {
      expect(unit.ownerPhone).toMatch(/^01[0125]\d{8}$/);
      expect(unit.depositValue).toBeGreaterThan(0);
      expect(unit.images.length).toBeGreaterThanOrEqual(2);
      for (const img of unit.images) {
        expect(img).toContain('w=1200&h=900');
      }
    }
  });
});
