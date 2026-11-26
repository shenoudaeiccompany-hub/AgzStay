import { resolveCoordinatesForLocation } from '@/data/egyptLocations';
import {
  SUBSCRIPTION_PLANS,
  getSubscriptionPlanById,
  normalizeEgyptianPhone,
} from '@/data/subscriptions';
import { isSupabaseConfigured, requireSupabase, supabase } from '@/lib/supabase';
import type {
  AdvertiserRoleLabel,
  AdvertiserTypeCode,
  AmenityId,
  AuthUserSummary,
  Chalet,
  ChaletPricingRuleInput,
  ChaletRevealStat,
  ChaletReviewRecord,
  DepositType,
  ListingAvailabilityStatus,
  ListingReportRecord,
  ListingReportStatus,
  MySubscriptionSummary,
  NotificationType,
  OwnerRevealStats,
  OwnerVerificationRecord,
  OwnerVerificationStatus,
  PendingSubscriptionInfo,
  ProfileRole,
  PropertyType,
  RouteSection,
  SubscriptionPlan,
  SubscriptionPlanId,
  SubscriptionRecord,
  SubscriptionStatus,
  UserNotificationRecord,
  UserProfile,
  VerificationDocumentType,
} from '@/types/chalet';
import { MESSAGES, extractErrorCodeKey, formatSupabaseError } from '@/utils/arabicErrors';
import { compressImage } from '@/utils/imageCompression';

export type RepoResult<T> =
  | { data: T; error: null; errorCode?: undefined }
  | { data: null; error: string; errorCode?: string };

const STORAGE_KEYS = {
  favorites: 'agzstay_favorites_v2',
  pwaDismissed: 'agzstay_pwa_dismissed_v2',
} as const;

export const agzstayStorageKeys = STORAGE_KEYS;

export function migrateLegacyStorageKeys(): void {
  try {
    const legacyFav = localStorage.getItem('agzstay_favorites_v1');
    if (legacyFav && !localStorage.getItem(STORAGE_KEYS.favorites)) {
      localStorage.setItem(STORAGE_KEYS.favorites, legacyFav);
    }
    // Remove deprecated insecure local sessions from earlier versions
    localStorage.removeItem('agzstay_owner_session_v2');
    sessionStorage.removeItem('agzstay_admin_pin_ok_v2');
  } catch {
    // Ignore storage access restrictions
  }
}

export function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function isValidEgyptianMobile(rawPhone: string): boolean {
  const normalized = normalizeEgyptianPhone(rawPhone);
  return /^01[0125]\d{8}$/.test(normalized);
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const RECEIPT_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function sanitizeFileName(rawName: string, forcedExt?: string): string {
  const baseOnly = rawName.split(/[/\\]/).pop() ?? 'file';
  const dotIdx = baseOnly.lastIndexOf('.');
  const rawBase = dotIdx > 0 ? baseOnly.slice(0, dotIdx) : baseOnly;
  const rawExt = dotIdx > 0 ? baseOnly.slice(dotIdx + 1) : '';
  const safeBase =
    rawBase
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'asset';
  const safeExt =
    forcedExt ||
    rawExt
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8) ||
    'bin';
  return `${safeBase}.${safeExt}`;
}

function normalizePropertyType(raw: unknown): PropertyType {
  const val = String(raw ?? '').trim();
  switch (val) {
    case 'شقة مفروشة':
    case 'furnished-apartment':
      return 'شقة مفروشة';
    case 'شقة فاضية':
    case 'unfurnished-apartment':
      return 'شقة فاضية';
    case 'شاليه':
    case 'chalet':
    case 'ground-garden':
      return 'شاليه';
    case 'فيلا':
    case 'villa':
    case 'duplex':
      return 'فيلا';
    case 'استوديو':
    case 'studio':
      return 'استوديو';
    default:
      return 'شاليه';
  }
}

function normalizeAdvertiserRole(raw: unknown): AdvertiserRoleLabel {
  const val = String(raw ?? '').trim();
  if (val === 'مكتب / وسيط' || val === 'broker') {
    return 'مكتب / وسيط';
  }
  return 'مالك مباشر';
}

function normalizeDepositType(raw: unknown): DepositType {
  const val = String(raw ?? '').trim();
  if (val === 'fixed' || val === 'ج.م') {
    return 'fixed';
  }
  return 'percent';
}

function mapChaletFromRow(row: Record<string, unknown>, ownerPhoneOverride?: string): Chalet {
  const governorate = String(row.governorate ?? row.destination_label ?? 'القاهرة');
  const city = String(row.city ?? row.area ?? '');
  const areaOrVillage = String(row.area_or_village ?? row.resort ?? '');
  const rawCoords = row.coordinates as { lat?: unknown; lng?: unknown } | null | undefined;
  const parsedLat = Number(rawCoords?.lat);
  const parsedLng = Number(rawCoords?.lng);
  const fallbackCoords = resolveCoordinatesForLocation(governorate, city);

  const depositValueRaw =
    row.deposit_value !== undefined && row.deposit_value !== null
      ? Number(row.deposit_value)
      : row.fixed_deposit_amount !== undefined && row.fixed_deposit_amount !== null
      ? Number(row.fixed_deposit_amount)
      : row.down_payment_percent !== undefined && row.down_payment_percent !== null
      ? Number(row.down_payment_percent)
      : 0;

  return {
    id: String(row.id),
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    isDemo: false,
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    governorate,
    city,
    areaOrVillage,
    propertyType: normalizePropertyType(row.property_type ?? row.unit_type),
    advertiserRole: normalizeAdvertiserRole(row.advertiser_role ?? row.owner_role_type),
    ownerName: String(row.owner_name ?? 'معلن AgzStay'),
    ownerPhone: ownerPhoneOverride,
    isFeatured: Boolean(row.is_featured ?? row.featured ?? false),
    ownerVerified: Boolean(row.owner_verified ?? false),
    depositType: normalizeDepositType(row.deposit_type),
    depositValue: Number.isFinite(depositValueRaw) ? depositValueRaw : 0,
    pricePerNight: Number(row.price_per_night ?? 0),
    monthlyPrice:
      row.monthly_price !== undefined && row.monthly_price !== null
        ? Number(row.monthly_price)
        : undefined,
    bedrooms: Number(row.bedrooms ?? 1),
    bathrooms: Number(row.bathrooms ?? 1),
    areaSqm:
      row.area_sqm !== undefined && row.area_sqm !== null ? Number(row.area_sqm) : undefined,
    maxGuests: Number(row.max_guests ?? 2),
    beachDistanceMeters:
      row.beach_distance_meters !== undefined && row.beach_distance_meters !== null
        ? Number(row.beach_distance_meters)
        : undefined,
    coordinates: {
      lat: Number.isFinite(parsedLat) ? parsedLat : fallbackCoords.lat,
      lng: Number.isFinite(parsedLng) ? parsedLng : fallbackCoords.lng,
    },
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    amenities: Array.isArray(row.amenities) ? (row.amenities as AmenityId[]) : [],
    blockedDates: Array.isArray(row.blocked_dates) ? (row.blocked_dates as string[]) : [],
    rules: Array.isArray(row.rules) ? (row.rules as string[]) : [],
    availabilityStatus: (row.availability_status as ListingAvailabilityStatus) ?? 'active',
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

function mapProfileFromRow(row: Record<string, unknown>): UserProfile {
  const roleRaw = String(row.role ?? 'guest');
  const role: ProfileRole =
    roleRaw === 'admin' || roleRaw === 'owner' ? roleRaw : 'guest';
  const advRaw = String(row.advertiser_type ?? 'owner');
  const advertiserType: AdvertiserTypeCode = advRaw === 'broker' ? 'broker' : 'owner';

  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    advertiserType,
    role,
    verificationStatus: row.verification_status ? String(row.verification_status) : undefined,
  };
}

function mapSubscriptionFromRow(
  row: Record<string, unknown>,
  profileMap?: Map<string, { name?: string; phone?: string }>
): SubscriptionRecord {
  const statusRaw = String(row.status ?? 'pending');
  const status: SubscriptionStatus =
    statusRaw === 'active' || statusRaw === 'rejected' || statusRaw === 'expired'
      ? statusRaw
      : 'pending';
  const planId = String(row.plan_id ?? 'free');
  const fallbackPlan = getSubscriptionPlanById(planId as SubscriptionPlanId);
  const userId = row.user_id
    ? String(row.user_id)
    : row.owner_id
    ? String(row.owner_id)
    : undefined;
  const profileInfo = userId ? profileMap?.get(userId) : undefined;

  return {
    id: String(row.id),
    userId,
    ownerName: String(row.owner_name ?? profileInfo?.name ?? 'معلن AgzStay'),
    ownerPhone: String(row.owner_phone ?? profileInfo?.phone ?? ''),
    planId,
    planName: String(row.plan_name ?? fallbackPlan.name),
    price: Number(row.price ?? fallbackPlan.price),
    maxUnits: Number(row.max_units ?? fallbackPlan.maxUnits),
    receiptPath: row.receipt_path ? String(row.receipt_path) : undefined,
    receiptUrl: row.receipt_url ? String(row.receipt_url) : undefined,
    status,
    adminNote: row.admin_note
      ? String(row.admin_note)
      : row.note
      ? String(row.note)
      : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

function mapPlanFromRow(row: Record<string, unknown>): SubscriptionPlan {
  const id = String(row.id ?? 'free') as SubscriptionPlanId;
  const fallback = getSubscriptionPlanById(id);
  let features: string[] = fallback.features;
  if (Array.isArray(row.features)) {
    features = row.features.map((f) => String(f)).filter(Boolean);
  } else if (typeof row.features === 'string') {
    try {
      const parsed = JSON.parse(row.features);
      if (Array.isArray(parsed)) {
        features = parsed.map((f) => String(f)).filter(Boolean);
      }
    } catch {
      // keep fallback features
    }
  }

  return {
    id,
    name: String(row.name ?? fallback.name),
    badge: String(row.badge ?? fallback.badge),
    price: Number(row.price ?? fallback.price),
    maxUnits: Number(row.max_units ?? fallback.maxUnits),
    features,
    isFeaturedEligible: Boolean(
      row.is_featured_eligible ?? row.featured_eligible ?? row.is_featured ?? fallback.isFeaturedEligible
    ),
    priorityLabel: String(row.priority_label ?? fallback.priorityLabel),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : undefined,
  };
}

// ---------- Supabase Auth & Profiles (`006_secure_v2.sql`) ----------

export async function getCurrentAuthUser(): Promise<AuthUserSummary | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      return {
        id: data.user.id,
        email: data.user.email ?? '',
      };
    }
    const sessionRes = await supabase.auth.getSession();
    const sessionUser = sessionRes.data?.session?.user;
    if (sessionUser) {
      return {
        id: sessionUser.id,
        email: sessionUser.email ?? '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function onAuthStateChange(
  callback: (user: AuthUserSummary | null, event?: string) => void
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const u = session?.user;
    callback(u ? { id: u.id, email: u.email ?? '' } : null, event);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<RepoResult<AuthUserSummary>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تسجيل الدخول. تأكد من البريد الإلكتروني وكلمة المرور.'),
      };
    }
    return {
      data: { id: data.user.id, email: data.user.email ?? email.trim() },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إتمام تسجيل الدخول.'),
    };
  }
}

export async function signUpOwnerAccount(payload: {
  email: string;
  password: string;
  name: string;
  phone: string;
  advertiserType: AdvertiserTypeCode;
}): Promise<RepoResult<{ user: AuthUserSummary; needsEmailConfirmation: boolean }>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }

  const normalizedPhone = normalizeEgyptianPhone(payload.phone);
  if (!isValidEgyptianMobile(normalizedPhone)) {
    return { data: null, error: MESSAGES.phone_invalid, errorCode: 'phone_invalid' };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email.trim(),
      password: payload.password,
      options: {
        data: {
          name: payload.name.trim(),
          phone: normalizedPhone,
          advertiser_type: payload.advertiserType,
        },
      },
    });

    if (error || !data.user) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إنشاء الحساب الجديد.'),
      };
    }

    const summary: AuthUserSummary = {
      id: data.user.id,
      email: data.user.email ?? payload.email.trim(),
    };

    if (data.session) {
      await updateMyProfile({
        name: payload.name.trim(),
        phone: normalizedPhone,
        advertiserType: payload.advertiserType,
      });
      await ensureOwnerRole(payload.advertiserType);
    }

    return {
      data: {
        user: summary,
        needsEmailConfirmation: !data.session,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إنشاء الحساب.'),
    };
  }
}

export async function sendPasswordResetEmail(
  email: string,
  redirectPath = '/owner'
): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return { data: null, error: 'يرجى إدخال بريد إلكتروني صحيح.' };
  }

  try {
    let redirectTo: string | undefined;
    if (
      typeof window !== 'undefined' &&
      window.location.origin.startsWith('http') &&
      !window.location.origin.includes('appassets.androidplatform.net')
    ) {
      const cleanPath = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`;
      redirectTo = `${window.location.origin}${cleanPath}`;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      redirectTo ? { redirectTo } : undefined
    );
    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إرسال رابط استعادة كلمة المرور.'),
      };
    }
    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إرسال رابط استعادة كلمة المرور.'),
    };
  }
}

export async function updateMyPassword(newPassword: string): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  if (newPassword.length < 6) {
    return { data: null, error: 'كلمة المرور يجب أن تتكون من ٦ أحرف على الأقل.' };
  }
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث كلمة المرور الآن.'),
      };
    }
    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحديث كلمة المرور الآن.'),
    };
  }
}

export async function signOutAuth(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
}

export async function fetchMyProfile(): Promise<RepoResult<UserProfile | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, phone, advertiser_type, role, verification_status')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل بيانات الملف الشخصي.'),
      };
    }

    return {
      data: data ? mapProfileFromRow(data as Record<string, unknown>) : null,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحميل الملف الشخصي.'),
    };
  }
}

/**
 * Updates ONLY allowed profile columns: name, phone, advertiser_type.
 * Never attempts to modify role or verification_status directly.
 */
export async function updateMyProfile(payload: {
  name: string;
  phone: string;
  advertiserType: AdvertiserTypeCode;
}): Promise<RepoResult<UserProfile>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  const normalizedPhone = normalizeEgyptianPhone(payload.phone);
  if (!isValidEgyptianMobile(normalizedPhone)) {
    return { data: null, error: MESSAGES.phone_invalid, errorCode: 'phone_invalid' };
  }

  try {
    const allowedPatch = {
      name: payload.name.trim(),
      phone: normalizedPhone,
      advertiser_type: payload.advertiserType,
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(allowedPatch)
      .eq('id', user.id)
      .select('id, name, phone, advertiser_type, role, verification_status')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث بيانات الحساب.'),
      };
    }

    return { data: mapProfileFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر حفظ بيانات الحساب.'),
    };
  }
}

export async function ensureOwnerRole(
  advertiserType: AdvertiserTypeCode = 'owner'
): Promise<RepoResult<UserProfile | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const profileRes = await fetchMyProfile();
    if (profileRes.data && (profileRes.data.role === 'owner' || profileRes.data.role === 'admin')) {
      return { data: profileRes.data, error: null };
    }

    const { data, error } = await supabase.rpc('become_host', {
      p_advertiser_type: advertiserType,
    });

    if (!error && data && typeof data === 'object') {
      return { data: mapProfileFromRow(data as Record<string, unknown>), error: null };
    }

    // Fallback check for alternative upgrade RPC names if present in DB
    if (error && (error.code === 'PGRST202' || error.message?.includes('become_host'))) {
      const alt = await supabase.rpc('become_owner', { p_advertiser_type: advertiserType });
      if (!alt.error && alt.data && typeof alt.data === 'object') {
        return { data: mapProfileFromRow(alt.data as Record<string, unknown>), error: null };
      }
      const refreshed = await fetchMyProfile();
      return refreshed;
    }

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تفعيل صلاحية المعلن للحساب.'),
      };
    }

    return await fetchMyProfile();
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر ترقية الحساب إلى معلن.'),
    };
  }
}

export async function checkIsAdmin(): Promise<{
  authenticated: boolean;
  isAdmin: boolean;
  email: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { authenticated: false, isAdmin: false, email: '' };
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = !userError && userData?.user ? userData.user : null;
    if (!user) {
      return { authenticated: false, isAdmin: false, email: '' };
    }

    const [rpcRes, profileRes] = await Promise.all([
      supabase.rpc('is_admin'),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
    ]);

    const rpcIsAdmin = !rpcRes.error && rpcRes.data === true;
    const profileRole = (profileRes.data as { role?: string } | null)?.role;
    const profileIsAdmin = !profileRes.error && profileRole === 'admin';

    return {
      authenticated: true,
      isAdmin: rpcIsAdmin || profileIsAdmin,
      email: user.email ?? '',
    };
  } catch {
    return { authenticated: false, isAdmin: false, email: '' };
  }
}

export interface AdminAccessDiagnostic {
  userId: string;
  email: string;
  profileExists: boolean;
  currentRole: string | null;
  rpcIsAdmin: boolean;
  errorMessage: string | null;
}

export async function fetchAdminAccessDiagnostic(): Promise<AdminAccessDiagnostic | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = !userError && userData?.user ? userData.user : null;
    if (!user) return null;

    const [rpcRes, profileRes] = await Promise.all([
      supabase.rpc('is_admin'),
      supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle(),
    ]);

    const profileRow = profileRes.data as { id?: string; role?: string } | null;
    const errorMessage = profileRes.error?.message ?? rpcRes.error?.message ?? null;

    return {
      userId: user.id,
      email: user.email ?? '',
      profileExists: Boolean(profileRow?.id),
      currentRole: profileRow?.role ?? null,
      rpcIsAdmin: !rpcRes.error && rpcRes.data === true,
      errorMessage,
    };
  } catch (err) {
    return {
      userId: '',
      email: '',
      profileExists: false,
      currentRole: null,
      rpcIsAdmin: false,
      errorMessage: err instanceof Error ? err.message : 'تعذر فحص حالة الصلاحية.',
    };
  }
}

// ---------- Storage Uploads (`property-images` & private `receipts`) ----------

export async function uploadPropertyImages(files: File[]): Promise<RepoResult<string[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  const urls: string[] = [];

  try {
    for (const file of files) {
      if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        return {
          data: null,
          error: `حجم الصورة "${file.name}" غير صالح أو يتجاوز ٥ ميجابايت.`,
        };
      }
      const blob = await compressImage(file);
      const safeName = sanitizeFileName(file.name, 'webp');
      const path = `${user.id}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage
        .from('property-images')
        .upload(path, blob, { contentType: 'image/webp', upsert: false });

      if (error) {
        return {
          data: null,
          error: formatSupabaseError(error, 'تعذر رفع صور الوحدة إلى حاوية property-images.'),
        };
      }

      const { data: pub } = supabase.storage.from('property-images').getPublicUrl(path);
      urls.push(pub.publicUrl);
    }
    return { data: urls, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'حدث خطأ أثناء معالجة ورفع الصور.'),
    };
  }
}

export async function uploadSubscriptionReceiptFile(
  file: File
): Promise<RepoResult<{ path: string }>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { data: null, error: 'حجم ملف الإيصال يجب أن يكون أقل من ٥ ميجابايت.' };
  }
  const ext = RECEIPT_MIME_EXT[file.type];
  if (!ext) {
    return { data: null, error: 'صيغة الإيصال غير مدعومة (يُقبل JPG, PNG, WebP, PDF).' };
  }

  const safeName = sanitizeFileName(file.name, ext);
  const path = `${user.id}/${Date.now()}_${safeName}`;

  try {
    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر رفع إيصال الباقة إلى حاوية receipts.'),
      };
    }

    return { data: { path }, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر رفع صورة الإيصال.'),
    };
  }
}

export async function resolveReceiptPreviewUrl(
  receiptPath?: string,
  legacyReceiptUrl?: string
): Promise<RepoResult<string>> {
  if (receiptPath) {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
    }
    try {
      const signed = await supabase.storage.from('receipts').createSignedUrl(receiptPath, 3600);
      if (!signed.error && signed.data?.signedUrl) {
        return { data: signed.data.signedUrl, error: null };
      }
      return {
        data: null,
        error: formatSupabaseError(signed.error, 'تعذر إنشاء رابط معاينة مؤقت للإيصال.'),
      };
    } catch (err) {
      return { data: null, error: formatSupabaseError(err, 'تعذر فتح الإيصال.') };
    }
  }

  if (legacyReceiptUrl && /^https?:\/\//i.test(legacyReceiptUrl)) {
    return { data: legacyReceiptUrl, error: null };
  }

  return { data: null, error: 'لا يوجد إيصال مرفق لهذا الاشتراك.' };
}

// ---------- Chalets + Private `chalet_contacts` + `reveal_listing_contact` ----------

export const CHALET_PUBLIC_SELECT_COLUMNS =
  'id, owner_id, title, description, governorate, city, area_or_village, property_type, advertiser_role, owner_name, is_featured, owner_verified, deposit_type, deposit_value, price_per_night, weekly_price, monthly_price, bedrooms, bathrooms, area_sqm, max_guests, beach_distance_meters, coordinates, images, amenities, blocked_dates, rules, availability_status, created_at, updated_at' as const;

interface PricingRuleRow {
  weekendPrice?: number;
  seasonalPrice?: number;
  seasonalLabel?: string;
  seasonalStart?: string;
  seasonalEnd?: string;
}

interface RatingSummaryRow {
  ratingAvg: number;
  ratingCount: number;
}

async function fetchPricingRulesMap(): Promise<Record<string, PricingRuleRow>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase
      .from('chalet_pricing_rules')
      .select('chalet_id, weekend_price, seasonal_price, seasonal_label, seasonal_start, seasonal_end');
    if (error || !Array.isArray(data)) return {};
    const out: Record<string, PricingRuleRow> = {};
    for (const row of data as Record<string, unknown>[]) {
      if (!row.chalet_id) continue;
      out[String(row.chalet_id)] = {
        weekendPrice:
          row.weekend_price !== null && row.weekend_price !== undefined
            ? Number(row.weekend_price)
            : undefined,
        seasonalPrice:
          row.seasonal_price !== null && row.seasonal_price !== undefined
            ? Number(row.seasonal_price)
            : undefined,
        seasonalLabel: row.seasonal_label ? String(row.seasonal_label) : undefined,
        seasonalStart: row.seasonal_start ? String(row.seasonal_start) : undefined,
        seasonalEnd: row.seasonal_end ? String(row.seasonal_end) : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchRatingSummariesMap(): Promise<Record<string, RatingSummaryRow>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase
      .from('chalet_reviews')
      .select('chalet_id, rating')
      .eq('is_approved', true);
    if (error || !Array.isArray(data)) return {};
    const acc = new Map<string, { sum: number; count: number }>();
    for (const row of data as Record<string, unknown>[]) {
      const cid = row.chalet_id ? String(row.chalet_id) : '';
      const rating = Number(row.rating ?? 0);
      if (!cid || rating < 1 || rating > 5) continue;
      const cur = acc.get(cid) ?? { sum: 0, count: 0 };
      cur.sum += rating;
      cur.count += 1;
      acc.set(cid, cur);
    }
    const out: Record<string, RatingSummaryRow> = {};
    for (const [cid, v] of acc.entries()) {
      out[cid] = {
        ratingAvg: Math.round((v.sum / v.count) * 10) / 10,
        ratingCount: v.count,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function enrichChalet(
  chalet: Chalet,
  pricingMap: Record<string, PricingRuleRow>,
  ratingsMap: Record<string, RatingSummaryRow>
): Chalet {
  const pricing = pricingMap[chalet.id];
  const rating = ratingsMap[chalet.id];
  if (!pricing && !rating) return chalet;
  return {
    ...chalet,
    weekendPrice: pricing?.weekendPrice,
    seasonalPrice: pricing?.seasonalPrice,
    seasonalLabel: pricing?.seasonalLabel,
    seasonalStart: pricing?.seasonalStart,
    seasonalEnd: pricing?.seasonalEnd,
    ratingAvg: rating?.ratingAvg,
    ratingCount: rating?.ratingCount,
  };
}

export async function fetchAllChaletsFromDb(includeHidden = false): Promise<RepoResult<Chalet[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    let query = supabase.from('chalets').select(CHALET_PUBLIC_SELECT_COLUMNS);
    if (!includeHidden) {
      query = query.eq('availability_status', 'active');
    }
    const [chaletsRes, pricingMap, ratingsMap] = await Promise.all([
      query.order('is_featured', { ascending: false }).order('created_at', { ascending: false }),
      fetchPricingRulesMap(),
      fetchRatingSummariesMap(),
    ]);

    if (chaletsRes.error) {
      return {
        data: null,
        error: formatSupabaseError(chaletsRes.error, 'تعذر تحميل قائمة الوحدات من قاعدة البيانات.'),
      };
    }

    return {
      data: (chaletsRes.data ?? []).map((row) =>
        enrichChalet(mapChaletFromRow(row as Record<string, unknown>), pricingMap, ratingsMap)
      ),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر الاتصال بقاعدة البيانات.'),
    };
  }
}

export async function fetchOwnerChalets(): Promise<RepoResult<Chalet[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const [chaletsRes, contactsRes, pricingMap, ratingsMap] = await Promise.all([
      supabase
        .from('chalets')
        .select(CHALET_PUBLIC_SELECT_COLUMNS)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('chalet_contacts').select('chalet_id, owner_phone').eq('owner_id', user.id),
      fetchPricingRulesMap(),
      fetchRatingSummariesMap(),
    ]);

    if (chaletsRes.error) {
      return {
        data: null,
        error: formatSupabaseError(chaletsRes.error, 'تعذر تحميل وحداتك من قاعدة البيانات.'),
      };
    }

    const phoneMap = new Map<string, string>();
    if (!contactsRes.error && Array.isArray(contactsRes.data)) {
      for (const c of contactsRes.data as Record<string, unknown>[]) {
        if (c.chalet_id && c.owner_phone) {
          phoneMap.set(String(c.chalet_id), String(c.owner_phone));
        }
      }
    }

    const mapped = (chaletsRes.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return enrichChalet(mapChaletFromRow(r, phoneMap.get(String(r.id))), pricingMap, ratingsMap);
    });

    return { data: mapped, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحميل وحدات المعلن.'),
    };
  }
}

export async function fetchAdminChaletContactsMap(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase.from('chalet_contacts').select('chalet_id, owner_phone');
    if (error || !Array.isArray(data)) return {};
    const result: Record<string, string> = {};
    for (const row of data as Record<string, unknown>[]) {
      if (row.chalet_id && row.owner_phone) {
        result[String(row.chalet_id)] = String(row.owner_phone);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export interface UpsertChaletPayload {
  title: string;
  description: string;
  governorate: string;
  city: string;
  areaOrVillage: string;
  propertyType: PropertyType;
  advertiserRole: AdvertiserRoleLabel;
  ownerName: string;
  ownerPhone: string;
  depositType: DepositType;
  depositValue: number;
  pricePerNight: number;
  monthlyPrice?: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm?: number;
  maxGuests: number;
  images: string[];
  amenities: AmenityId[];
  blockedDates: string[];
  rules: string[];
  availabilityStatus?: ListingAvailabilityStatus;
  /** Admin-only override when explicitly managing featured flag from AdminDashboard */
  isFeatured?: boolean;
  ownerId?: string;
}

export async function insertChaletWithContact(
  payload: UpsertChaletPayload,
  options?: { allowAdminFeatured?: boolean }
): Promise<RepoResult<Chalet>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  const normalizedPhone = normalizeEgyptianPhone(payload.ownerPhone);
  if (!isValidEgyptianMobile(normalizedPhone)) {
    return { data: null, error: MESSAGES.phone_invalid, errorCode: 'phone_invalid' };
  }

  const coordinates = resolveCoordinatesForLocation(payload.governorate, payload.city);
  const insertRow: Record<string, unknown> = {
    owner_id: user.id,
    title: payload.title.trim(),
    description: payload.description.trim(),
    governorate: payload.governorate,
    city: payload.city.trim(),
    area_or_village: payload.areaOrVillage.trim(),
    property_type: payload.propertyType,
    advertiser_role: payload.advertiserRole,
    owner_name: payload.ownerName.trim(),
    deposit_type: payload.depositType,
    deposit_value: Number.isFinite(payload.depositValue) ? payload.depositValue : 0,
    price_per_night: payload.pricePerNight,
    monthly_price:
      payload.propertyType === 'شقة فاضية' ? payload.pricePerNight : payload.monthlyPrice ?? null,
    bedrooms: payload.bedrooms,
    bathrooms: payload.bathrooms,
    area_sqm: payload.areaSqm ?? null,
    max_guests: payload.maxGuests,
    coordinates,
    images: payload.images,
    amenities: payload.amenities,
    blocked_dates: payload.blockedDates,
    rules: payload.rules,
    availability_status: payload.availabilityStatus ?? 'active',
  };

  if (options?.allowAdminFeatured && payload.isFeatured !== undefined) {
    insertRow.is_featured = payload.isFeatured;
  }

  try {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('chalets')
      .insert(insertRow)
      .select(CHALET_PUBLIC_SELECT_COLUMNS)
      .single();
    if (error || !data) {
      const codeKey = extractErrorCodeKey(error) ?? undefined;
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر حفظ الوحدة في جدول chalets.'),
        errorCode: codeKey,
      };
    }

    const chaletId = String((data as Record<string, unknown>).id);
    const contactRes = await sb.from('chalet_contacts').upsert(
      {
        chalet_id: chaletId,
        owner_id: user.id,
        owner_phone: normalizedPhone,
      },
      { onConflict: 'chalet_id' }
    );

    if (contactRes.error) {
      return {
        data: null,
        error: formatSupabaseError(
          contactRes.error,
          'تم نشر الوحدة ولكن تعذر حفظ رقم الواتساب في جدول جهات الاتصال.'
        ),
        errorCode: extractErrorCodeKey(contactRes.error) ?? undefined,
      };
    }

    return {
      data: mapChaletFromRow(data as Record<string, unknown>, normalizedPhone),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر نشر الوحدة الآن.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

export async function updateChaletWithContact(
  chaletId: string,
  updates: Partial<UpsertChaletPayload>,
  options?: { allowAdminFeatured?: boolean }
): Promise<RepoResult<Chalet>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  let normalizedPhone: string | undefined;
  if (updates.ownerPhone !== undefined) {
    normalizedPhone = normalizeEgyptianPhone(updates.ownerPhone);
    if (!isValidEgyptianMobile(normalizedPhone)) {
      return { data: null, error: MESSAGES.phone_invalid, errorCode: 'phone_invalid' };
    }
  }

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title.trim();
  if (updates.description !== undefined) patch.description = updates.description.trim();
  if (updates.governorate !== undefined) {
    patch.governorate = updates.governorate;
  }
  if (updates.city !== undefined) patch.city = updates.city.trim();
  if (updates.areaOrVillage !== undefined) {
    patch.area_or_village = updates.areaOrVillage.trim();
  }
  if (updates.propertyType !== undefined) {
    patch.property_type = updates.propertyType;
  }
  if (updates.advertiserRole !== undefined) patch.advertiser_role = updates.advertiserRole;
  if (updates.ownerName !== undefined) patch.owner_name = updates.ownerName.trim();
  if (options?.allowAdminFeatured && updates.isFeatured !== undefined) {
    patch.is_featured = updates.isFeatured;
  }
  if (updates.depositType !== undefined) patch.deposit_type = updates.depositType;
  if (updates.depositValue !== undefined) patch.deposit_value = updates.depositValue;
  if (updates.pricePerNight !== undefined) {
    patch.price_per_night = updates.pricePerNight;
    if (updates.propertyType === 'شقة فاضية') {
      patch.monthly_price = updates.pricePerNight;
    }
  }
  if (updates.bedrooms !== undefined) patch.bedrooms = updates.bedrooms;
  if (updates.bathrooms !== undefined) patch.bathrooms = updates.bathrooms;
  if (updates.areaSqm !== undefined) patch.area_sqm = updates.areaSqm;
  if (updates.maxGuests !== undefined) patch.max_guests = updates.maxGuests;
  if (updates.images !== undefined) patch.images = updates.images;
  if (updates.amenities !== undefined) patch.amenities = updates.amenities;
  if (updates.blockedDates !== undefined) patch.blocked_dates = updates.blockedDates;
  if (updates.rules !== undefined) patch.rules = updates.rules;
  if (updates.availabilityStatus !== undefined) {
    patch.availability_status = updates.availabilityStatus;
  }
  if (updates.governorate !== undefined || updates.city !== undefined) {
    patch.coordinates = resolveCoordinatesForLocation(updates.governorate, updates.city);
  }

  try {
    const { data, error } = await supabase
      .from('chalets')
      .update(patch)
      .eq('id', chaletId)
      .select(CHALET_PUBLIC_SELECT_COLUMNS)
      .single();

    if (error || !data) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث بيانات الوحدة.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    if (normalizedPhone !== undefined) {
      const targetOwnerId =
        updates.ownerId || String((data as Record<string, unknown>).owner_id ?? user.id);
      const contactRes = await supabase.from('chalet_contacts').upsert(
        {
          chalet_id: chaletId,
          owner_id: targetOwnerId,
          owner_phone: normalizedPhone,
        },
        { onConflict: 'chalet_id' }
      );
      if (contactRes.error) {
        return {
          data: null,
          error: formatSupabaseError(contactRes.error, 'تم تحديث الوحدة ولكن تعذر تحديث رقم الواتساب.'),
          errorCode: extractErrorCodeKey(contactRes.error) ?? undefined,
        };
      }
    }

    return {
      data: mapChaletFromRow(data as Record<string, unknown>, normalizedPhone),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تعديل الوحدة.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

export async function deleteChaletRecord(chaletId: string): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { error } = await supabase.from('chalets').delete().eq('id', chaletId);
    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر حذف الوحدة.'),
      };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر حذف الوحدة.') };
  }
}

export async function revealListingContact(chaletId: string): Promise<RepoResult<string>> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: MESSAGES.contact_not_available,
      errorCode: 'contact_not_available',
    };
  }
  try {
    const { data, error } = await supabase.rpc('reveal_listing_contact', {
      p_chalet_id: chaletId,
    });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, MESSAGES.contact_not_available),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    let rawPhone = '';
    if (typeof data === 'string') {
      rawPhone = data;
    } else if (Array.isArray(data) && data.length > 0) {
      const first = data[0] as Record<string, unknown> | string;
      rawPhone =
        typeof first === 'string'
          ? first
          : String(first?.owner_phone ?? first?.phone ?? '');
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      rawPhone = String(obj.owner_phone ?? obj.phone ?? obj.contact ?? '');
    }

    const cleaned = rawPhone.trim();
    if (!cleaned || cleaned.replace(/\D/g, '').length < 8) {
      return {
        data: null,
        error: MESSAGES.contact_not_available,
        errorCode: 'contact_not_available',
      };
    }

    return { data: cleaned, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, MESSAGES.contact_not_available),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

// ---------- Plans & Subscription RPCs (`006_secure_v2.sql`) ----------

export async function fetchPlansFromDb(): Promise<RepoResult<SubscriptionPlan[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: SUBSCRIPTION_PLANS, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      return {
        data: SUBSCRIPTION_PLANS,
        error: null,
      };
    }

    const activeRows = (data ?? []).filter(
      (r) => (r as Record<string, unknown>).is_active !== false
    );
    if (activeRows.length === 0) {
      return { data: SUBSCRIPTION_PLANS, error: null };
    }

    return {
      data: activeRows.map((row) => mapPlanFromRow(row as Record<string, unknown>)),
      error: null,
    };
  } catch {
    return { data: SUBSCRIPTION_PLANS, error: null };
  }
}

export async function fetchMySubscriptionSummary(): Promise<RepoResult<MySubscriptionSummary>> {
  const defaultFree: MySubscriptionSummary = {
    planId: 'free',
    planName: SUBSCRIPTION_PLANS[0].name,
    usedUnits: 0,
    maxUnits: SUBSCRIPTION_PLANS[0].maxUnits,
    expiresAt: null,
    status: 'free',
    isFeaturedEligible: false,
    pendingRequest: null,
    adminNote: null,
  };

  if (!isSupabaseConfigured || !supabase) {
    return { data: defaultFree, error: null };
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const { data, error } = await supabase.rpc('my_subscription');
    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل ملخص اشتراكك الحالي.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    const rawObj = Array.isArray(data)
      ? ((data[0] as Record<string, unknown> | undefined) ?? {})
      : ((data as Record<string, unknown> | null) ?? {});

    const planId = String(rawObj.plan_id ?? rawObj.planId ?? 'free');
    const fallbackPlan = getSubscriptionPlanById(planId as SubscriptionPlanId);
    const maxUnits = Number(rawObj.max_units ?? rawObj.maxUnits ?? fallbackPlan.maxUnits);
    const usedUnits = Number(rawObj.used_units ?? rawObj.usedUnits ?? 0);
    const expiresAt = rawObj.expires_at
      ? String(rawObj.expires_at)
      : rawObj.expiresAt
      ? String(rawObj.expiresAt)
      : null;

    const rawPending = rawObj.pending_request ?? rawObj.pendingRequest ?? null;
    let pendingRequest: PendingSubscriptionInfo | null = null;
    if (rawPending === true) {
      pendingRequest = {
        planName: String(rawObj.pending_plan_name ?? 'طلب ترقية قيد المراجعة'),
        status: 'pending',
      };
    } else if (rawPending && typeof rawPending === 'object') {
      const pObj = rawPending as Record<string, unknown>;
      pendingRequest = {
        id: pObj.id ? String(pObj.id) : undefined,
        planId: pObj.plan_id ? String(pObj.plan_id) : undefined,
        planName: String(
          pObj.plan_name ??
            pObj.planName ??
            getSubscriptionPlanById((pObj.plan_id ?? 'starter') as SubscriptionPlanId).name
        ),
        createdAt: pObj.created_at ? String(pObj.created_at) : undefined,
        status: pObj.status ? String(pObj.status) : 'pending',
      };
    }

    const rawStatus = String(rawObj.status ?? (planId !== 'free' ? 'active' : 'free'));
    const status: MySubscriptionSummary['status'] =
      rawStatus === 'active' ||
      rawStatus === 'pending' ||
      rawStatus === 'rejected' ||
      rawStatus === 'expired'
        ? rawStatus
        : pendingRequest
        ? 'pending'
        : 'free';

    return {
      data: {
        planId,
        planName: String(rawObj.plan_name ?? rawObj.planName ?? fallbackPlan.name),
        usedUnits: Number.isFinite(usedUnits) ? usedUnits : 0,
        maxUnits: Number.isFinite(maxUnits) ? maxUnits : 1,
        expiresAt,
        status,
        isFeaturedEligible: Boolean(
          rawObj.is_featured_eligible ??
            rawObj.isFeaturedEligible ??
            (planId !== 'free' && status === 'active')
        ),
        pendingRequest,
        adminNote: rawObj.admin_note ? String(rawObj.admin_note) : null,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر قراءة تفاصيل الاشتراك.'),
    };
  }
}

export async function submitSubscriptionRequestRpc(
  planId: string,
  receiptPath: string
): Promise<RepoResult<unknown>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const { data, error } = await supabase.rpc('request_subscription', {
      p_plan_id: planId,
      p_receipt_path: receiptPath,
    });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إرسال طلب الاشتراك للمراجعة.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    return { data: data ?? true, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إرسال طلب الاشتراك.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

export async function fetchAllSubscriptionsAdmin(): Promise<RepoResult<SubscriptionRecord[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل اشتراكات الباقات.'),
      };
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const userIds = Array.from(
      new Set(
        rows
          .map((r) => (r.user_id ? String(r.user_id) : r.owner_id ? String(r.owner_id) : ''))
          .filter(Boolean)
      )
    );

    const profileMap = new Map<string, { name?: string; phone?: string }>();
    if (userIds.length > 0) {
      const profRes = await supabase.from('profiles').select('id, name, phone').in('id', userIds);
      if (!profRes.error && Array.isArray(profRes.data)) {
        for (const p of profRes.data as Record<string, unknown>[]) {
          profileMap.set(String(p.id), {
            name: p.name ? String(p.name) : undefined,
            phone: p.phone ? String(p.phone) : undefined,
          });
        }
      }
    }

    return {
      data: rows.map((row) => mapSubscriptionFromRow(row, profileMap)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر تحميل الاشتراكات.') };
  }
}

export async function adminReviewSubscriptionRpc(
  subscriptionId: string,
  approve: boolean,
  note?: string
): Promise<RepoResult<unknown>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_review_subscription', {
      p_id: subscriptionId,
      p_approve: approve,
      p_note: note?.trim() || null,
    });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر مراجعة طلب الاشتراك.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    return { data: data ?? true, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحديث حالة الاشتراك.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

export async function linkLegacyOwner(
  userId: string,
  phone: string
): Promise<RepoResult<{ linkedChalets: number; linkedSubscriptions: number }>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_link_legacy_owner', {
      p_user_id: userId,
      p_phone: normalizeEgyptianPhone(phone),
    });

    if (error || !data || typeof data !== 'object') {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر ربط الحساب بالوحدات القديمة.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    const r = data as Record<string, unknown>;
    return {
      data: {
        linkedChalets: Number(r.linked_chalets ?? 0),
        linkedSubscriptions: Number(r.linked_subscriptions ?? 0),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر ربط الحساب بالوحدات القديمة.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

// ---------- Owner Verification Workflow (`008_verification_reports_and_stats.sql`) ----------

function mapVerificationFromRow(row: Record<string, unknown>): OwnerVerificationRecord {
  const docTypeRaw = String(row.document_type ?? 'national-id');
  const documentType: VerificationDocumentType =
    docTypeRaw === 'resort-card' ||
    docTypeRaw === 'ownership-contract' ||
    docTypeRaw === 'authorization'
      ? docTypeRaw
      : 'national-id';

  const statusRaw = String(row.status ?? 'pending');
  const status: OwnerVerificationStatus =
    statusRaw === 'verified' || statusRaw === 'unverified' ? statusRaw : 'pending';

  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    ownerName: String(row.owner_name ?? 'معلن AgzStay'),
    phone: String(row.phone ?? ''),
    documentType,
    documentNumber: String(row.document_number ?? ''),
    documentPath: String(row.document_path ?? ''),
    status,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    submittedAt: String(row.submitted_at ?? new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

export async function uploadVerificationDocumentFile(
  file: File
): Promise<RepoResult<{ path: string }>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { data: null, error: 'حجم مستند التوثيق يجب أن يكون أقل من ٥ ميجابايت.' };
  }
  const ext = RECEIPT_MIME_EXT[file.type];
  if (!ext) {
    return { data: null, error: 'صيغة المستند غير مدعومة (يُقبل JPG, PNG, WebP, PDF).' };
  }

  const safeName = sanitizeFileName(file.name, ext);
  const path = `${user.id}/${Date.now()}_${safeName}`;

  try {
    const { error } = await supabase.storage
      .from('verifications')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر رفع مستند التوثيق إلى حاوية verifications.'),
      };
    }

    return { data: { path }, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر رفع مستند التوثيق.'),
    };
  }
}

export async function resolveVerificationDocumentUrl(
  documentPath?: string
): Promise<RepoResult<string>> {
  if (!documentPath) {
    return { data: null, error: 'لا يوجد مستند مرفق لهذا الطلب.' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const signed = await supabase.storage
      .from('verifications')
      .createSignedUrl(documentPath, 3600);
    if (!signed.error && signed.data?.signedUrl) {
      return { data: signed.data.signedUrl, error: null };
    }
    return {
      data: null,
      error: formatSupabaseError(signed.error, 'تعذر إنشاء رابط معاينة مؤقت لمستند التوثيق.'),
    };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر فتح مستند التوثيق.') };
  }
}

export async function fetchMyOwnerVerification(): Promise<
  RepoResult<OwnerVerificationRecord | null>
> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const { data, error } = await supabase
      .from('owner_verifications')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل حالة توثيق المعلن.'),
      };
    }

    return {
      data: data ? mapVerificationFromRow(data as Record<string, unknown>) : null,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحميل حالة التوثيق.'),
    };
  }
}

export async function submitOwnerVerificationRpc(payload: {
  ownerName: string;
  phone: string;
  documentType: VerificationDocumentType;
  documentNumber: string;
  documentPath: string;
}): Promise<RepoResult<OwnerVerificationRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  const normalizedPhone = normalizeEgyptianPhone(payload.phone);
  if (!isValidEgyptianMobile(normalizedPhone)) {
    return { data: null, error: MESSAGES.phone_invalid, errorCode: 'phone_invalid' };
  }

  try {
    const { data, error } = await supabase.rpc('submit_owner_verification', {
      p_owner_name: payload.ownerName.trim(),
      p_phone: normalizedPhone,
      p_document_type: payload.documentType,
      p_document_number: payload.documentNumber.trim(),
      p_document_path: payload.documentPath,
    });

    if (error || !data || typeof data !== 'object') {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إرسال طلب توثيق المعلن.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    return { data: mapVerificationFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إرسال طلب التوثيق.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

export async function fetchAllOwnerVerificationsAdmin(): Promise<
  RepoResult<OwnerVerificationRecord[]>
> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('owner_verifications')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل طلبات توثيق الملاك.'),
      };
    }

    return {
      data: (data ?? []).map((r) => mapVerificationFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر تحميل طلبات التوثيق.') };
  }
}

export async function adminReviewOwnerVerificationRpc(
  verificationId: string,
  decision: 'verified' | 'unverified',
  rejectionReason?: string
): Promise<RepoResult<OwnerVerificationRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_review_owner_verification', {
      p_verification_id: verificationId,
      p_decision: decision,
      p_rejection_reason: rejectionReason?.trim() || null,
    });

    if (error || !data || typeof data !== 'object') {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث حالة توثيق المعلن.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    return { data: mapVerificationFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر مراجعة طلب التوثيق.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

// ---------- Owner Contact Reveal Analytics (`get_owner_contact_reveal_stats`) ----------

export async function fetchOwnerContactRevealStats(): Promise<RepoResult<OwnerRevealStats>> {
  const emptyStats: OwnerRevealStats = {
    totalReveals: 0,
    revealsLast7Days: 0,
    revealsLast30Days: 0,
    perChalet: {},
  };

  if (!isSupabaseConfigured || !supabase) {
    return { data: emptyStats, error: null };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    const { data, error } = await supabase.rpc('get_owner_contact_reveal_stats');
    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل إحصائيات كشف الرقم.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    const obj = (data as Record<string, unknown> | null) ?? {};
    const perMap: Record<string, ChaletRevealStat> = {};
    const rows = Array.isArray(obj.per_chalet) ? (obj.per_chalet as Record<string, unknown>[]) : [];
    for (const r of rows) {
      if (!r.chalet_id) continue;
      const cid = String(r.chalet_id);
      perMap[cid] = {
        chaletId: cid,
        totalReveals: Number(r.total_reveals ?? 0),
        revealsLast7Days: Number(r.reveals_last_7_days ?? 0),
        lastRevealedAt: r.last_revealed_at ? String(r.last_revealed_at) : undefined,
      };
    }

    return {
      data: {
        totalReveals: Number(obj.total_reveals ?? 0),
        revealsLast7Days: Number(obj.reveals_last_7_days ?? 0),
        revealsLast30Days: Number(obj.reveals_last_30_days ?? 0),
        perChalet: perMap,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر قراءة إحصائيات التفاعل.'),
    };
  }
}

// ---------- Guarded Listing Violation Reports ----------

function mapListingReportFromRow(
  row: Record<string, unknown>,
  chaletTitleMap?: Map<string, string>
): ListingReportRecord {
  const statusRaw = String(row.status ?? 'open');
  const status: ListingReportStatus =
    statusRaw === 'resolved' || statusRaw === 'dismissed' ? statusRaw : 'open';
  const chaletId = String(row.chalet_id ?? '');

  return {
    id: String(row.id),
    chaletId,
    chaletTitle: row.chalet_title
      ? String(row.chalet_title)
      : chaletTitleMap?.get(chaletId),
    reporterId: row.reporter_id ? String(row.reporter_id) : undefined,
    reason: String(row.reason ?? ''),
    details: String(row.details ?? ''),
    status,
    adminNote: row.admin_note ? String(row.admin_note) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

export async function submitListingReportRpc(
  chaletId: string,
  reason: string,
  details = ''
): Promise<RepoResult<{ id: string; status: string }>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    return { data: null, error: 'يرجى اختيار سبب البلاغ.' };
  }

  try {
    const { data, error } = await supabase.rpc('submit_listing_report', {
      p_chalet_id: chaletId,
      p_reason: cleanReason,
      p_details: details.trim(),
    });

    if (error || !data || typeof data !== 'object') {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إرسال البلاغ الآن.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    const r = data as Record<string, unknown>;
    return {
      data: {
        id: String(r.id ?? ''),
        status: String(r.status ?? 'open'),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إرسال البلاغ الآن.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

export async function fetchAllListingReportsAdmin(
  chaletsForTitleLookup?: Chalet[]
): Promise<RepoResult<ListingReportRecord[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('listing_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل البلاغات الواردة.'),
      };
    }

    const titleMap = new Map<string, string>();
    for (const c of chaletsForTitleLookup ?? []) {
      titleMap.set(c.id, c.title);
    }

    return {
      data: (data ?? []).map((row) =>
        mapListingReportFromRow(row as Record<string, unknown>, titleMap)
      ),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحميل البلاغات.'),
    };
  }
}

export async function adminReviewListingReportRpc(
  reportId: string,
  action: 'dismiss' | 'resolve_keep' | 'hide_listing',
  adminNote?: string
): Promise<RepoResult<ListingReportRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_review_listing_report', {
      p_report_id: reportId,
      p_action: action,
      p_admin_note: adminNote?.trim() || null,
    });

    if (error || !data || typeof data !== 'object') {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث حالة البلاغ.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    return {
      data: mapListingReportFromRow(data as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر مراجعة البلاغ.'),
      errorCode: extractErrorCodeKey(err) ?? undefined,
    };
  }
}

// ---------- Marketplace Enhancements (`009_marketplace_enhancements.sql`) ----------

export async function upsertChaletPricingRule(
  chaletId: string,
  input: ChaletPricingRuleInput
): Promise<RepoResult<boolean>> {
  const hasAnyRule =
    (input.weekendPrice !== undefined && input.weekendPrice !== null && input.weekendPrice > 0) ||
    (input.seasonalPrice !== undefined && input.seasonalPrice !== null && input.seasonalPrice > 0);

  if (!isSupabaseConfigured || !supabase) {
    return { data: true, error: null };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: MESSAGES.not_authenticated, errorCode: 'not_authenticated' };
  }

  try {
    if (!hasAnyRule) {
      const { error } = await supabase
        .from('chalet_pricing_rules')
        .delete()
        .eq('chalet_id', chaletId);
      if (error) {
        // Ignore missing table if user didn't configure dynamic pricing
        return { data: true, error: null };
      }
      return { data: true, error: null };
    }

    const { error } = await supabase.from('chalet_pricing_rules').upsert(
      {
        chalet_id: chaletId,
        owner_id: user.id,
        weekend_price:
          input.weekendPrice && input.weekendPrice > 0 ? Math.round(input.weekendPrice) : null,
        seasonal_price:
          input.seasonalPrice && input.seasonalPrice > 0 ? Math.round(input.seasonalPrice) : null,
        seasonal_label: input.seasonalLabel?.trim() || '',
        seasonal_start: input.seasonalStart || null,
        seasonal_end: input.seasonalEnd || null,
      },
      { onConflict: 'chalet_id' }
    );

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر حفظ قواعد التسعير المرن (تأكد من تشغيل ترحيل 009).'),
      };
    }

    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر حفظ التسعير المرن.'),
    };
  }
}

function mapReviewFromRow(row: Record<string, unknown>): ChaletReviewRecord {
  return {
    id: String(row.id),
    chaletId: String(row.chalet_id ?? ''),
    reviewerName: String(row.reviewer_name ?? 'زائر'),
    rating: Math.min(5, Math.max(1, Number(row.rating ?? 5))),
    comment: String(row.comment ?? ''),
    isApproved: row.is_approved !== false,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function fetchChaletReviews(
  chaletId: string
): Promise<RepoResult<ChaletReviewRecord[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('chalet_reviews')
      .select('id, chalet_id, reviewer_name, rating, comment, is_approved, created_at')
      .eq('chalet_id', chaletId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: null };
    }

    return {
      data: (data ?? []).map((r) => mapReviewFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch {
    return { data: [], error: null };
  }
}

export async function submitChaletReviewRpc(
  chaletId: string,
  reviewerName: string,
  rating: number,
  comment = ''
): Promise<RepoResult<ChaletReviewRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('submit_chalet_review', {
      p_chalet_id: chaletId,
      p_reviewer_name: reviewerName.trim(),
      p_rating: rating,
      p_comment: comment.trim(),
    });

    if (error || !data || typeof data !== 'object') {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إرسال التقييم الآن.'),
        errorCode: extractErrorCodeKey(error) ?? undefined,
      };
    }

    return { data: mapReviewFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر إرسال التقييم الآن.'),
    };
  }
}

function mapNotificationFromRow(row: Record<string, unknown>): UserNotificationRecord {
  const rawType = String(row.type ?? 'system');
  const type: NotificationType =
    rawType === 'verification' || rawType === 'subscription' || rawType === 'report'
      ? rawType
      : 'system';
  const rawLink = row.link_section ? String(row.link_section) : '';
  const linkSection: RouteSection | undefined =
    rawLink === 'home' || rawLink === 'pricing' || rawLink === 'owner' || rawLink === 'admin'
      ? rawLink
      : undefined;

  return {
    id: String(row.id),
    userId: String(row.user_id ?? ''),
    type,
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    linkSection,
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function fetchMyNotifications(): Promise<RepoResult<UserNotificationRecord[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('id, user_id, type, title, body, link_section, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return { data: [], error: null };
    }

    return {
      data: (data ?? []).map((r) => mapNotificationFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch {
    return { data: [], error: null };
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  } catch {
    // non-fatal
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const user = await getCurrentAuthUser();
  if (!user) return;
  try {
    await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
  } catch {
    // non-fatal
  }
}


