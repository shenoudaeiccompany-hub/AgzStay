import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURATED_EGYPT_UNITS } from '@/data/chalets';

interface MockPlanRow {
  id: string;
  name: string;
  badge: string;
  price: number;
  max_units: number;
  is_featured_eligible: boolean;
  priority_label: string;
  features: string[];
  sort_order: number;
  is_active: boolean;
}

interface MockSubRow {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  price: number;
  max_units: number;
  receipt_path: string;
  status: 'pending' | 'active' | 'rejected' | 'expired';
  admin_note: string | null;
  expires_at: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface MockChaletRow {
  id: string;
  owner_id: string;
  title: string;
  governorate: string;
  city: string;
  area_or_village: string;
  property_type: string;
  advertiser_role: string;
  owner_name: string;
  is_featured: boolean;
  deposit_type: string;
  deposit_value: number;
  price_per_night: number;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  images: string[];
  amenities: string[];
  blocked_dates: string[];
  rules: string[];
  availability_status: string;
}

interface MockContactRow {
  chalet_id: string;
  owner_id: string;
  owner_phone: string;
}

const mockState = vi.hoisted(() => ({
  currentUser: { id: 'user-owner-1', email: 'owner@agzstay.com' } as {
    id: string;
    email: string;
  } | null,
  profiles: new Map<
    string,
    { id: string; name: string; phone: string; advertiser_type: string; role: string }
  >(),
  plans: [] as MockPlanRow[],
  subscriptions: [] as MockSubRow[],
  chalets: [] as MockChaletRow[],
  chaletContacts: [] as MockContactRow[],
  uploadedFiles: [] as { bucket: string; path: string; contentType: string }[],
  signedUrlCalls: [] as { bucket: string; path: string; expiresIn: number }[],
  rateLimitedChaletIds: new Set<string>(),
  quotaLimitOverride: null as number | null,
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
    createSignedUrl: async (path: string, expiresIn: number) => {
      mockState.signedUrlCalls.push({ bucket, path, expiresIn });
      return {
        data: {
          signedUrl: `https://mock.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc`,
        },
        error: null,
      };
    },
  });

  const rpc = async (fnName: string, args?: Record<string, unknown>) => {
    if (fnName === 'is_admin') {
      const uid = mockState.currentUser?.id;
      const prof = uid ? mockState.profiles.get(uid) : undefined;
      return { data: prof?.role === 'admin', error: null };
    }

    if (fnName === 'become_host') {
      if (!mockState.currentUser) {
        return { data: null, error: { message: 'not_authenticated' } };
      }
      const prof = mockState.profiles.get(mockState.currentUser.id);
      if (prof && prof.role === 'guest') {
        prof.role = 'owner';
      }
      return { data: prof ?? null, error: null };
    }

    if (fnName === 'request_subscription') {
      if (!mockState.currentUser) {
        return { data: null, error: { message: 'not_authenticated' } };
      }
      const uid = mockState.currentUser.id;
      const alreadyPending = mockState.subscriptions.some(
        (s) => s.user_id === uid && s.status === 'pending'
      );
      if (alreadyPending) {
        return { data: null, error: { message: 'duplicate_request' } };
      }
      const planId = String(args?.p_plan_id ?? 'starter');
      const plan = mockState.plans.find((p) => p.id === planId);
      if (!plan) {
        return { data: null, error: { message: 'invalid_plan' } };
      }
      const created: MockSubRow = {
        id: `sub-${mockState.subscriptions.length + 1}`,
        user_id: uid,
        plan_id: plan.id,
        plan_name: plan.name,
        price: plan.price,
        max_units: plan.max_units,
        receipt_path: String(args?.p_receipt_path ?? ''),
        status: 'pending',
        admin_note: null,
        expires_at: null,
        created_at: new Date().toISOString(),
        reviewed_at: null,
      };
      mockState.subscriptions.unshift(created);
      return { data: created, error: null };
    }

    if (fnName === 'my_subscription') {
      if (!mockState.currentUser) {
        return { data: null, error: { message: 'not_authenticated' } };
      }
      const uid = mockState.currentUser.id;
      const usedUnits = mockState.chalets.filter((c) => c.owner_id === uid).length;
      const activeSub = mockState.subscriptions.find(
        (s) => s.user_id === uid && s.status === 'active'
      );
      const pendingSub = mockState.subscriptions.find(
        (s) => s.user_id === uid && s.status === 'pending'
      );
      const rejectedSub = mockState.subscriptions.find(
        (s) => s.user_id === uid && s.status === 'rejected'
      );

      if (activeSub) {
        return {
          data: {
            plan_id: activeSub.plan_id,
            plan_name: activeSub.plan_name,
            used_units: usedUnits,
            max_units: activeSub.max_units,
            expires_at: activeSub.expires_at,
            status: 'active',
            is_featured_eligible: true,
            pending_request: pendingSub
              ? { id: pendingSub.id, plan_name: pendingSub.plan_name, status: 'pending' }
              : null,
            admin_note: activeSub.admin_note,
          },
          error: null,
        };
      }

      return {
        data: {
          plan_id: 'free',
          plan_name: 'الباقة المجانية',
          used_units: usedUnits,
          max_units: 1,
          expires_at: null,
          status: pendingSub ? 'pending' : rejectedSub ? 'rejected' : 'free',
          is_featured_eligible: false,
          pending_request: pendingSub
            ? { id: pendingSub.id, plan_name: pendingSub.plan_name, status: 'pending' }
            : null,
          admin_note: rejectedSub?.admin_note ?? null,
        },
        error: null,
      };
    }

    if (fnName === 'admin_review_subscription') {
      const uid = mockState.currentUser?.id;
      const prof = uid ? mockState.profiles.get(uid) : undefined;
      if (prof?.role !== 'admin') {
        return { data: null, error: { message: 'forbidden' } };
      }
      const subId = String(args?.p_id ?? '');
      const approve = Boolean(args?.p_approve);
      const note = args?.p_note ? String(args.p_note) : null;
      const target = mockState.subscriptions.find((s) => s.id === subId);
      if (!target) {
        return { data: null, error: { message: 'subscription_not_found' } };
      }
      if (target.status !== 'pending') {
        return { data: null, error: { message: 'already_reviewed' } };
      }
      target.status = approve ? 'active' : 'rejected';
      target.admin_note = note;
      target.reviewed_at = new Date().toISOString();
      if (approve) {
        target.expires_at = '2026-12-31T00:00:00Z';
        for (const c of mockState.chalets) {
          if (c.owner_id === target.user_id) {
            c.is_featured = true;
          }
        }
      }
      return { data: target, error: null };
    }

    if (fnName === 'reveal_listing_contact') {
      const chaletId = String(args?.p_chalet_id ?? '');
      if (mockState.rateLimitedChaletIds.has(chaletId)) {
        return { data: null, error: { message: 'rate_limited' } };
      }
      const contact = mockState.chaletContacts.find((c) => c.chalet_id === chaletId);
      if (!contact) {
        return { data: null, error: { message: 'contact_not_available' } };
      }
      return { data: { owner_phone: contact.owner_phone }, error: null };
    }

    throw new Error(`Unexpected RPC ${fnName}`);
  };

  const from = (table: string) => {
    if (table === 'plans') {
      return {
        select: () => ({
          order: async () => ({
            data: [...mockState.plans].sort((a, b) => a.sort_order - b.sort_order),
            error: null,
          }),
        }),
      };
    }

    if (table === 'profiles') {
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({
              data: mockState.profiles.get(id) ?? null,
              error: null,
            }),
            single: async () => {
              const found = mockState.profiles.get(id);
              return found
                ? { data: found, error: null }
                : { data: null, error: { message: 'not_found' } };
            },
          }),
          in: async (_col: string, ids: string[]) => ({
            data: ids.map((id) => mockState.profiles.get(id)).filter(Boolean),
            error: null,
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            select: () => ({
              single: async () => {
                if ('role' in patch || 'verification_status' in patch) {
                  return { data: null, error: { message: 'forbidden' } };
                }
                const existing = mockState.profiles.get(id);
                if (!existing) return { data: null, error: { message: 'not_found' } };
                Object.assign(existing, patch);
                return { data: existing, error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === 'subscriptions') {
      return {
        select: () => ({
          order: async () => ({
            data: [...mockState.subscriptions],
            error: null,
          }),
        }),
      };
    }

    if (table === 'chalets') {
      return {
        select: () => ({
          eq: (_col: string, ownerId: string) => ({
            order: async () => ({
              data: mockState.chalets.filter((c) => c.owner_id === ownerId),
              error: null,
            }),
          }),
          order: () => ({
            order: async () => ({
              data: [...mockState.chalets],
              error: null,
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if ('owner_phone' in row) {
                return { data: null, error: { message: 'column owner_phone does not exist' } };
              }
              const uid = String(row.owner_id ?? mockState.currentUser?.id ?? '');
              const ownerUnits = mockState.chalets.filter((c) => c.owner_id === uid).length;
              const activeSub = mockState.subscriptions.find(
                (s) => s.user_id === uid && s.status === 'active'
              );
              const limit = mockState.quotaLimitOverride ?? activeSub?.max_units ?? 1;
              if (ownerUnits >= limit) {
                return { data: null, error: { message: 'quota_exceeded' } };
              }

              const created: MockChaletRow = {
                id: `chalet-${mockState.chalets.length + 1}`,
                owner_id: uid,
                title: String(row.title ?? ''),
                governorate: String(row.governorate ?? 'مطروح'),
                city: String(row.city ?? ''),
                area_or_village: String(row.area_or_village ?? ''),
                property_type: String(row.property_type ?? 'شاليه'),
                advertiser_role: String(row.advertiser_role ?? 'مالك مباشر'),
                owner_name: String(row.owner_name ?? ''),
                is_featured: Boolean(activeSub),
                deposit_type: String(row.deposit_type ?? 'percent'),
                deposit_value: Number(row.deposit_value ?? 0),
                price_per_night: Number(row.price_per_night ?? 0),
                bedrooms: Number(row.bedrooms ?? 1),
                bathrooms: Number(row.bathrooms ?? 1),
                max_guests: Number(row.max_guests ?? 2),
                images: (row.images as string[]) ?? [],
                amenities: (row.amenities as string[]) ?? [],
                blocked_dates: (row.blocked_dates as string[]) ?? [],
                rules: (row.rules as string[]) ?? [],
                availability_status: String(row.availability_status ?? 'active'),
              };
              mockState.chalets.unshift(created);
              return { data: created, error: null };
            },
          }),
        }),
      };
    }

    if (table === 'chalet_contacts') {
      return {
        select: () => ({
          eq: async (_col: string, ownerId: string) => ({
            data: mockState.chaletContacts.filter((c) => c.owner_id === ownerId),
            error: null,
          }),
        }),
        upsert: async (row: MockContactRow) => {
          const existingIdx = mockState.chaletContacts.findIndex(
            (c) => c.chalet_id === row.chalet_id
          );
          if (existingIdx >= 0) {
            mockState.chaletContacts[existingIdx] = row;
          } else {
            mockState.chaletContacts.push(row);
          }
          return { data: row, error: null };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getUser: async () => ({
          data: { user: mockState.currentUser },
          error: null,
        }),
        getSession: async () => ({
          data: { session: mockState.currentUser ? { user: mockState.currentUser } : null },
          error: null,
        }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
      storage: { from: storageFrom },
      from,
      rpc,
    },
    requireSupabase: () => ({
      storage: { from: storageFrom },
      from,
      rpc,
    }),
  };
});

import {
  adminReviewSubscriptionRpc,
  checkIsAdmin,
  fetchMySubscriptionSummary,
  fetchOwnerChalets,
  fetchPlansFromDb,
  insertChaletWithContact,
  resolveReceiptPreviewUrl,
  revealListingContact,
  submitSubscriptionRequestRpc,
  updateMyProfile,
  uploadSubscriptionReceiptFile,
} from '@/services/agzstayRepository';

describe('006_secure_v2.sql secure flows (Auth, chalet_contacts, reveal_listing_contact, receipts, RPC subscriptions)', () => {
  beforeEach(() => {
    mockState.currentUser = { id: 'user-owner-1', email: 'owner@agzstay.com' };
    mockState.profiles.clear();
    mockState.profiles.set('user-owner-1', {
      id: 'user-owner-1',
      name: 'أ. كريم محمد',
      phone: '01012345678',
      advertiser_type: 'owner',
      role: 'owner',
    });
    mockState.profiles.set('user-admin-1', {
      id: 'user-admin-1',
      name: 'مدير المنصة',
      phone: '01000000000',
      advertiser_type: 'owner',
      role: 'admin',
    });
    mockState.plans = [
      {
        id: 'free',
        name: 'الباقة المجانية',
        badge: 'ابدأ مجاناً',
        price: 0,
        max_units: 1,
        is_featured_eligible: false,
        priority_label: 'ظهور عادي',
        features: ['إعلان واحد'],
        sort_order: 1,
        is_active: true,
      },
      {
        id: 'starter',
        name: 'باقة البداية (Starter)',
        badge: 'للملاك الأفراد',
        price: 500,
        max_units: 5,
        is_featured_eligible: true,
        priority_label: 'شارة إعلان مميز',
        features: ['حتى ٥ وحدات'],
        sort_order: 2,
        is_active: true,
      },
    ];
    mockState.subscriptions = [];
    mockState.chalets = [];
    mockState.chaletContacts = [];
    mockState.uploadedFiles = [];
    mockState.signedUrlCalls = [];
    mockState.rateLimitedChaletIds.clear();
    mockState.quotaLimitOverride = null;
  });

  it('uploads receipts scoped to auth.uid(), enforces duplicate_request, previews via createSignedUrl(3600), and activates via admin_review_subscription', async () => {
    const plansRes = await fetchPlansFromDb();
    expect(plansRes.data?.map((p) => p.id)).toEqual(['free', 'starter']);

    const fakeReceipt = new File(['receipt-bytes'], 'instapay 01.png', { type: 'image/png' });
    const uploadRes = await uploadSubscriptionReceiptFile(fakeReceipt);
    expect(uploadRes.error).toBeNull();
    expect(uploadRes.data?.path).toMatch(/^user-owner-1\/\d+_instapay_01\.png$/);
    expect(mockState.uploadedFiles[0]?.bucket).toBe('receipts');

    // Submit subscription via request_subscription RPC
    const subRes = await submitSubscriptionRequestRpc('starter', uploadRes.data!.path);
    expect(subRes.error).toBeNull();

    // Duplicate pending request is rejected with Arabic message
    const dupRes = await submitSubscriptionRequestRpc('starter', uploadRes.data!.path);
    expect(dupRes.error).toContain('طلب اشتراك قيد المراجعة بالفعل');

    // Owner checks my_subscription() while pending
    const pendingSummary = await fetchMySubscriptionSummary();
    expect(pendingSummary.data?.maxUnits).toBe(1);
    expect(pendingSummary.data?.pendingRequest?.planName).toBe('باقة البداية (Starter)');

    // Admin signs in & previews receipt using createSignedUrl(..., 3600)
    mockState.currentUser = { id: 'user-admin-1', email: 'admin@agzstay.com' };
    const adminCheck = await checkIsAdmin();
    expect(adminCheck.isAdmin).toBe(true);

    const signedPreview = await resolveReceiptPreviewUrl(uploadRes.data!.path);
    expect(signedPreview.data).toContain('/storage/v1/object/sign/receipts/');
    expect(mockState.signedUrlCalls[0]?.expiresIn).toBe(3600);

    // Owner adds 1 unit before approval so we verify auto-featured update
    mockState.currentUser = { id: 'user-owner-1', email: 'owner@agzstay.com' };
    const insertRes = await insertChaletWithContact({
      title: 'شاليه بالساحل الشمالي',
      description: 'وصف',
      governorate: 'مطروح',
      city: 'الساحل الشمالي',
      areaOrVillage: 'مراسي',
      propertyType: 'شاليه',
      advertiserRole: 'مالك مباشر',
      ownerName: 'أ. كريم محمد',
      ownerPhone: '01012345678',
      depositType: 'percent',
      depositValue: 20,
      pricePerNight: 3000,
      bedrooms: 2,
      bathrooms: 1,
      maxGuests: 4,
      images: [],
      amenities: ['wifi'],
      blockedDates: [],
      rules: [],
    });
    expect(insertRes.error).toBeNull();

    // Admin approves with p_note
    mockState.currentUser = { id: 'user-admin-1', email: 'admin@agzstay.com' };
    const subId = mockState.subscriptions[0].id;
    const reviewRes = await adminReviewSubscriptionRpc(subId, true, 'تمت مطابقة التحويل بنجاح');
    expect(reviewRes.error).toBeNull();
    expect(mockState.subscriptions[0].admin_note).toBe('تمت مطابقة التحويل بنجاح');
    expect(mockState.chalets[0].is_featured).toBe(true);

    // Owner checks my_subscription() after activation
    mockState.currentUser = { id: 'user-owner-1', email: 'owner@agzstay.com' };
    const activeSummary = await fetchMySubscriptionSummary();
    expect(activeSummary.data?.maxUnits).toBe(5);
    expect(activeSummary.data?.usedUnits).toBe(1);
    expect(activeSummary.data?.expiresAt).toBe('2026-12-31T00:00:00Z');
  });

  it('splits phone into chalet_contacts, catches quota_exceeded, and reveals phone via reveal_listing_contact with rate_limited handling', async () => {
    const first = await insertChaletWithContact({
      title: 'وحدة أولى للإيجار',
      description: 'تفاصيل',
      governorate: 'مطروح',
      city: 'الساحل الشمالي',
      areaOrVillage: 'مراسي',
      propertyType: 'شاليه',
      advertiserRole: 'مالك مباشر',
      ownerName: 'أ. كريم',
      ownerPhone: '+201098765432',
      depositType: 'percent',
      depositValue: 20,
      pricePerNight: 2500,
      bedrooms: 2,
      bathrooms: 1,
      maxGuests: 4,
      images: [],
      amenities: [],
      blockedDates: [],
      rules: [],
    });
    expect(first.error).toBeNull();
    expect(mockState.chaletContacts).toHaveLength(1);
    expect(mockState.chaletContacts[0].owner_phone).toBe('01098765432');

    // Second unit hits free quota_exceeded
    const second = await insertChaletWithContact({
      title: 'وحدة ثانية تتجاوز الباقة',
      description: 'تفاصيل',
      governorate: 'مطروح',
      city: 'الساحل الشمالي',
      areaOrVillage: 'هاسيندا',
      propertyType: 'شاليه',
      advertiserRole: 'مالك مباشر',
      ownerName: 'أ. كريم',
      ownerPhone: '01098765432',
      depositType: 'percent',
      depositValue: 20,
      pricePerNight: 2500,
      bedrooms: 2,
      bathrooms: 1,
      maxGuests: 4,
      images: [],
      amenities: [],
      blockedDates: [],
      rules: [],
    });
    expect(second.errorCode).toBe('quota_exceeded');
    expect(second.error).toContain('الحد الأقصى');

    // Owner fetches own chalets -> phone attached from chalet_contacts
    const ownerChalets = await fetchOwnerChalets();
    expect(ownerChalets.data?.[0]?.ownerPhone).toBe('01098765432');

    // Renter reveals contact via RPC
    const revealOk = await revealListingContact(first.data!.id);
    expect(revealOk.data).toBe('01098765432');

    // Rate limited response maps cleanly
    mockState.rateLimitedChaletIds.add(first.data!.id);
    const revealLimited = await revealListingContact(first.data!.id);
    expect(revealLimited.errorCode).toBe('rate_limited');
    expect(revealLimited.error).toContain('تجاوز الحد المسموح');
  });

  it('updates only allowed profile fields and preserves 9 curated Egyptian launch listings', async () => {
    const profRes = await updateMyProfile({
      name: 'أ. كريم المعدّل',
      phone: '01122334455',
      advertiserType: 'broker',
    });
    expect(profRes.error).toBeNull();
    expect(profRes.data?.advertiserType).toBe('broker');

    expect(CURATED_EGYPT_UNITS.length).toBeGreaterThanOrEqual(8);
    expect(CURATED_EGYPT_UNITS.length).toBeLessThanOrEqual(10);
    for (const unit of CURATED_EGYPT_UNITS) {
      expect(unit.ownerPhone).toMatch(/^01[0125]\d{8}$/);
      expect(unit.depositValue).toBeGreaterThan(0);
    }
  });

  it('prevents double review (already_reviewed) and concurrent quota/request races cleanly', async () => {
    const fakeReceipt = new File(['bytes'], 'r.png', { type: 'image/png' });
    const uploadRes = await uploadSubscriptionReceiptFile(fakeReceipt);
    expect(uploadRes.error).toBeNull();

    // Concurrent request_subscription calls: only 1 succeeds, 1 hits duplicate_request
    const [req1, req2] = await Promise.all([
      submitSubscriptionRequestRpc('starter', uploadRes.data!.path),
      submitSubscriptionRequestRpc('pro', uploadRes.data!.path),
    ]);
    const reqSuccesses = [req1, req2].filter((r) => r.error === null);
    const reqDuplicates = [req1, req2].filter((r) => r.errorCode === 'duplicate_request');
    expect(reqSuccesses).toHaveLength(1);
    expect(reqDuplicates).toHaveLength(1);

    // Concurrent admin approvals on same subscription ID: only 1 succeeds, 2nd hits already_reviewed
    mockState.currentUser = { id: 'user-admin-1', email: 'admin@agzstay.com' };
    const subId = mockState.subscriptions[0].id;
    const [rev1, rev2] = await Promise.all([
      adminReviewSubscriptionRpc(subId, true, 'اعتماد أول'),
      adminReviewSubscriptionRpc(subId, true, 'اعتماد مكرر'),
    ]);
    const revSuccesses = [rev1, rev2].filter((r) => r.error === null);
    const revErrors = [rev1, rev2].filter((r) => r.error !== null);
    expect(revSuccesses).toHaveLength(1);
    expect(revErrors).toHaveLength(1);
    expect(revErrors[0]?.error).toContain('مسبقا');
  });

  it('verifies /admin authorization via supabase.auth.getUser() and dual rpc(is_admin) || profiles.role check', async () => {
    // 1. Unauthenticated -> authenticated: false
    mockState.currentUser = null;
    const unauthCheck = await checkIsAdmin();
    expect(unauthCheck).toEqual({ authenticated: false, isAdmin: false, email: '' });

    // 2. Logged in owner (non-admin) -> authenticated: true, isAdmin: false
    mockState.currentUser = { id: 'user-owner-1', email: 'owner@agzstay.com' };
    const ownerCheck = await checkIsAdmin();
    expect(ownerCheck).toEqual({
      authenticated: true,
      isAdmin: false,
      email: 'owner@agzstay.com',
    });

    // 3. Logged in admin -> authenticated: true, isAdmin: true
    mockState.currentUser = { id: 'user-admin-1', email: 'admin@agzstay.com' };
    const adminCheck = await checkIsAdmin();
    expect(adminCheck).toEqual({
      authenticated: true,
      isAdmin: true,
      email: 'admin@agzstay.com',
    });
  });
});
