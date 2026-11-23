import { supabase, isSupabaseConfigured, requireSupabase } from '@/lib/supabase';
import { formatSupabaseError, MESSAGES, toArabicError } from '@/utils/arabicErrors';
import { compressImage } from '@/utils/imageCompression';
import type {
  AppNotification,
  AppUser,
  BookedDateRange,
  BookingRequest,
  BookingStatus,
  Chalet,
  ChaletReview,
  HostSubscriptionRecord,
  OwnerVerificationSubmission,
  PaymentMethod,
  PropertyReviewTag,
  RenterTrustReview,
  RenterTrustTag,
  RevealedOwnerContact,
} from '@/types/chalet';

export { MESSAGES, toArabicError, requireSupabase };
export type RepoResult<T> = { data: T; error: null } | { data: null; error: string };

const STORAGE_KEYS = {
  favorites: 'agzstay_favorites_v1',
  compareIds: 'agzstay_compare_v1',
  pwaDismissed: 'agzstay_pwa_banner_dismissed_v1',
} as const;

export const agzstayStorageKeys = STORAGE_KEYS;

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

export function migrateLegacyStorageKeys(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const migrations: [string[], string][] = [
      [['masayef_favorites_v1', 'masayef_favorites'], STORAGE_KEYS.favorites],
      [['masayef_compare_v1', 'masayef_compare_ids'], STORAGE_KEYS.compareIds],
      [['masayef_pwa_banner_dismissed_v1', 'masayef_pwa_dismissed'], STORAGE_KEYS.pwaDismissed],
    ];

    migrations.forEach(([legacyKeys, targetKey]) => {
      const existingNew = localStorage.getItem(targetKey);
      for (const oldKey of legacyKeys) {
        const oldVal = localStorage.getItem(oldKey);
        if (oldVal !== null) {
          if (existingNew === null) {
            localStorage.setItem(targetKey, oldVal);
          }
          localStorage.removeItem(oldKey);
        }
      }
    });
  } catch {
    // Ignore storage access errors
  }
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB strict cap matching Supabase Storage

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const DOC_AND_RECEIPT_MIME_EXT: Record<string, string> = {
  ...IMAGE_MIME_EXT,
  'application/pdf': 'pdf',
};

function validateFileForUpload(
  file: File,
  allowedMimes: Record<string, string>,
  label: string
): { ext: string; error: null } | { ext: null; error: string } {
  if (file.size <= 0) {
    return { ext: null, error: `الملف المختار (${label}) فارغ.` };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ext: null,
      error: `حجم ملف ${label} يتجاوز الحد الأقصى المسموح (٥ ميجابايت).`,
    };
  }
  const ext = allowedMimes[file.type];
  if (!ext) {
    const allowedText = Object.values(allowedMimes).join(', ').toUpperCase();
    return {
      ext: null,
      error: `صيغة ملف ${label} غير مدعومة. الصيغ المسموحة: ${allowedText}`,
    };
  }
  return { ext, error: null };
}

function getArabicSupabaseError(err: unknown, fallback: string): string {
  return formatSupabaseError(err, fallback);
}

async function getAuthenticatedUserId(): Promise<RepoResult<string>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { data: null, error: 'يرجى تسجيل الدخول أولاً للمتابعة.' };
  }
  return { data: data.user.id, error: null };
}

// ---------- Auth & Profile ----------

interface ProfileQueryRow {
  name?: string | null;
  phone?: string | null;
  role?: string | null;
  verification_status?: string | null;
  advertiser_type?: string | null;
}

async function fetchProfileRow(
  sb: NonNullable<typeof supabase>,
  userId: string
): Promise<{ profile: ProfileQueryRow | null; error: unknown | null }> {
  const extended = await sb
    .from('profiles')
    .select('name, phone, role, verification_status, advertiser_type')
    .eq('id', userId)
    .maybeSingle();

  if (!extended.error) {
    return { profile: extended.data as ProfileQueryRow | null, error: null };
  }

  // Graceful fallback if 003_profile_host_upgrade.sql has not been applied yet
  const errObj = extended.error as { code?: string; message?: string };
  if (
    errObj.code === '42703' ||
    (errObj.message ?? '').includes('verification_status') ||
    (errObj.message ?? '').includes('advertiser_type')
  ) {
    const basic = await sb
      .from('profiles')
      .select('name, phone, role')
      .eq('id', userId)
      .maybeSingle();
    return {
      profile: basic.data as ProfileQueryRow | null,
      error: basic.error ?? null,
    };
  }

  return { profile: null, error: extended.error };
}

function mapProfileToAppUser(
  authUser: { id: string; email?: string | null },
  profile: ProfileQueryRow | null
): AppUser {
  const roleRaw = profile?.role;
  const role: AppUser['role'] =
    roleRaw === 'admin' || roleRaw === 'owner' ? roleRaw : 'guest';
  const verRaw = profile?.verification_status;
  const verificationStatus: AppUser['verificationStatus'] =
    verRaw === 'verified' || verRaw === 'pending' ? verRaw : 'unverified';
  const advertiserType: AppUser['advertiserType'] =
    profile?.advertiser_type === 'broker' ? 'broker' : 'owner';

  return {
    id: authUser.id,
    name:
      profile?.name?.trim() ||
      authUser.email?.split('@')[0] ||
      'مستخدم إجازة ستاي',
    email: authUser.email ?? '',
    phone: profile?.phone || undefined,
    role,
    verificationStatus,
    advertiserType,
  };
}

export async function signUp(p: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<{ needsEmailConfirmation: boolean }> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signUp({
    email: p.email.trim(),
    password: p.password,
    options: {
      data: {
        name: p.name.trim(),
        phone: p.phone?.trim() || '',
      },
    },
  });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function loadCurrentUser(): Promise<AppUser | null> {
  const sb = requireSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { profile, error } = await fetchProfileRow(sb, user.id);
  if (error) throw error;
  return mapProfileToAppUser(user, profile);
}

export async function becomeHost(type: 'owner' | 'broker' = 'owner'): Promise<void> {
  const { error } = await requireSupabase().rpc('become_host', {
    p_advertiser_type: type,
  });
  if (error) throw error;
}

export async function becomeHostAccount(
  type: 'owner' | 'broker' = 'owner'
): Promise<RepoResult<AppUser | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    await becomeHost(type);
    const updated = await loadCurrentUser();
    return { data: updated, error: null };
  } catch (err) {
    return {
      data: null,
      error: getArabicSupabaseError(err, 'تعذر تفعيل حساب المعلن.'),
    };
  }
}

export async function getCurrentUser(): Promise<RepoResult<AppUser | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) {
      return { data: null, error: getArabicSupabaseError(sessionErr, 'تعذر التحقق من الجلسة.') };
    }
    const authUser = sessionRes.session?.user;
    if (!authUser) {
      return { data: null, error: null };
    }

    const { profile, error: profileErr } = await fetchProfileRow(supabase, authUser.id);
    if (profileErr) {
      return {
        data: null,
        error: getArabicSupabaseError(profileErr, 'تعذر تحميل ملف المستخدم من قاعدة البيانات.'),
      };
    }

    return {
      data: mapProfileToAppUser(authUser, profile),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر جلب بيانات المستخدم.') };
  }
}

export function onAuthStateChange(
  callback: (user: AppUser | null) => void
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    void getCurrentUser().then((res) => {
      if (!res.error) {
        callback(res.data);
      }
    });
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signInWithEmail(payload: {
  email: string;
  password: string;
}): Promise<RepoResult<AppUser>> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: 'وضع تجريبي: تسجيل الدخول غير متاح بدون إعداد Supabase.',
    };
  }
  try {
    await signIn(payload.email, payload.password);
    const profileRes = await getCurrentUser();
    if (profileRes.error || !profileRes.data) {
      return {
        data: null,
        error: profileRes.error ?? 'تعذر تحميل ملف الحساب.',
      };
    }
    return { data: profileRes.data, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تسجيل الدخول.') };
  }
}

export async function signUpWithEmail(payload: {
  email: string;
  password: string;
  name: string;
  phone?: string;
}): Promise<RepoResult<{ user: AppUser | null; needsEmailConfirmation: boolean }>> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: 'وضع تجريبي: إنشاء الحساب غير متاح بدون إعداد Supabase.',
    };
  }
  try {
    const { needsEmailConfirmation } = await signUp(payload);
    if (needsEmailConfirmation) {
      return {
        data: { user: null, needsEmailConfirmation: true },
        error: null,
      };
    }
    const profileRes = await getCurrentUser();
    if (profileRes.error) {
      return { data: null, error: profileRes.error };
    }
    return {
      data: { user: profileRes.data, needsEmailConfirmation: false },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إنشاء الحساب.') };
  }
}

export async function signOutUser(): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: true, error: null };
  }
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر تسجيل الخروج.') };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تسجيل الخروج.') };
  }
}

// ---------- Media Uploads (Strict Validation, No Base64 Fallback) ----------

export async function uploadChaletImages(
  files: File[],
  userId: string
): Promise<string[]> {
  const sb = requireSupabase();
  const urls: string[] = [];
  for (const file of files) {
    const blob = await compressImage(file);
    const uniqueName =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${userId}/${uniqueName}.webp`;
    const { error } = await sb.storage
      .from('chalet-images')
      .upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw error;
    urls.push(sb.storage.from('chalet-images').getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

export async function uploadPaymentReceipt(
  file: File
): Promise<RepoResult<{ path: string }>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يرجى تسجيل الدخول لرفع إيصال العربون.' };
  }

  const check = validateFileForUpload(file, DOC_AND_RECEIPT_MIME_EXT, 'إيصال التحويل');
  if (check.error || !check.ext) {
    return { data: null, error: check.error ?? 'ملف الإيصال غير صالح.' };
  }

  const path = `${uidRes.data}/pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`;
  const { error } = await supabase.storage
    .from('payment-receipts')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return {
      data: null,
      error: getArabicSupabaseError(error, 'تعذر رفع صورة الإيصال. يمكنك المحاولة مرة أخرى.'),
    };
  }

  return { data: { path }, error: null };
}

export async function uploadBookingReceipt(
  file: File
): Promise<RepoResult<{ path: string }>> {
  return uploadPaymentReceipt(file);
}

export async function uploadSubscriptionReceipt(
  file: File
): Promise<RepoResult<{ path: string }>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يرجى تسجيل الدخول لرفع إيصال الاشتراك.' };
  }

  const check = validateFileForUpload(file, DOC_AND_RECEIPT_MIME_EXT, 'إيصال الاشتراك');
  if (check.error || !check.ext) {
    return { data: null, error: check.error ?? 'ملف الإيصال غير صالح.' };
  }

  const path = `${uidRes.data}/sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`;
  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return {
      data: null,
      error: getArabicSupabaseError(error, 'تعذر رفع صورة إيصال الاشتراك.'),
    };
  }

  return { data: { path }, error: null };
}

export async function uploadVerificationDocument(
  file: File
): Promise<RepoResult<{ path: string; fileName: string }>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يرجى تسجيل الدخول لرفع مستند التوثيق.' };
  }

  const check = validateFileForUpload(file, DOC_AND_RECEIPT_MIME_EXT, 'مستند التوثيق');
  if (check.error || !check.ext) {
    return { data: null, error: check.error ?? 'مستند التوثيق غير صالح.' };
  }

  const path = `${uidRes.data}/verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`;
  const { error } = await supabase.storage
    .from('verification-docs')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return {
      data: null,
      error: getArabicSupabaseError(error, 'تعذر رفع مستند التوثيق. حاول مرة أخرى.'),
    };
  }

  return { data: { path, fileName: file.name }, error: null };
}

export async function getBookingReceiptSignedUrl(
  receiptPath?: string
): Promise<RepoResult<string>> {
  if (!receiptPath) {
    return { data: null, error: 'لا يوجد إيصال مرفق لهذا الطلب.' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const primary = await supabase.storage
      .from('payment-receipts')
      .createSignedUrl(receiptPath, 300);

    if (!primary.error && primary.data?.signedUrl) {
      return { data: primary.data.signedUrl, error: null };
    }

    const legacy = await supabase.storage
      .from('receipts')
      .createSignedUrl(receiptPath, 300);

    if (legacy.error || !legacy.data?.signedUrl) {
      return {
        data: null,
        error: getArabicSupabaseError(
          primary.error ?? legacy.error,
          'تعذر إنشاء رابط معاينة مؤقت للإيصال.'
        ),
      };
    }
    return { data: legacy.data.signedUrl, error: null };
  } catch (err) {
    return {
      data: null,
      error: getArabicSupabaseError(err, 'تعذر فتح الإيصال.'),
    };
  }
}

export async function getSubscriptionReceiptSignedUrl(
  receiptPath?: string
): Promise<RepoResult<string>> {
  if (!receiptPath) {
    return { data: null, error: 'لا يوجد إيصال اشتراك مرفق.' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(receiptPath, 300);

    if (error || !data?.signedUrl) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر إنشاء رابط معاينة لإيصال الاشتراك.'),
      };
    }
    return { data: data.signedUrl, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر فتح الإيصال.') };
  }
}

export async function getVerificationDocSignedUrl(
  documentPath?: string
): Promise<RepoResult<string>> {
  if (!documentPath) {
    return { data: null, error: 'لا يوجد مستند مرفق.' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.storage
      .from('verification-docs')
      .createSignedUrl(documentPath, 300);

    if (error || !data?.signedUrl) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر إنشاء رابط معاينة للمستند.'),
      };
    }
    return { data: data.signedUrl, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر فتح مستند التوثيق.') };
  }
}

// ---------- Mappers ----------

function mapChaletFromRow(
  row: Record<string, unknown>,
  privateContact?: { owner_phone?: string; insta_pay_handle?: string }
): Chalet {
  const coordinates = (row.coordinates as Chalet['coordinates'] | undefined) ?? {
    lat: 30.0444,
    lng: 31.2357,
  };
  return {
    id: String(row.id),
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    isDemo: false,
    unitNumber: row.unit_number !== null && row.unit_number !== undefined ? Number(row.unit_number) : undefined,
    title: String(row.title ?? ''),
    listingMode: 'rent',
    availabilityStatus: (row.availability_status as Chalet['availabilityStatus']) ?? 'active',
    supportedDurations: Array.isArray(row.supported_durations)
      ? (row.supported_durations as Chalet['supportedDurations'])
      : ['daily', 'weekly', 'monthly'],
    destination: (row.destination as Chalet['destination']) ?? 'greater-cairo',
    governorate: (row.governorate as Chalet['governorate']) ?? undefined,
    area: row.area ? String(row.area) : undefined,
    destinationLabel: String(row.destination_label ?? ''),
    resort: String(row.resort ?? ''),
    unitType: (row.unit_type as Chalet['unitType']) ?? 'chalet',
    viewType: (row.view_type as Chalet['viewType']) ?? 'city-nile',
    includesPasses: Boolean(row.includes_passes ?? true),
    verifiedLivePhotos: Boolean(row.verified_live_photos ?? false),
    livePhotosVerifiedAt: row.live_photos_verified_at
      ? String(row.live_photos_verified_at)
      : undefined,
    welcomeGuide: (row.welcome_guide as Chalet['welcomeGuide']) ?? undefined,
    hostTier: (row.host_tier as Chalet['hostTier']) ?? 'free',
    pricePerNight: Number(row.price_per_night ?? 0),
    weeklyPrice:
      row.weekly_price !== null && row.weekly_price !== undefined
        ? Number(row.weekly_price)
        : undefined,
    monthlyPrice:
      row.monthly_price !== null && row.monthly_price !== undefined
        ? Number(row.monthly_price)
        : undefined,
    weekendPricePerNight:
      row.weekend_price_per_night !== null && row.weekend_price_per_night !== undefined
        ? Number(row.weekend_price_per_night)
        : undefined,
    peakPricePerNight:
      row.peak_price_per_night !== null && row.peak_price_per_night !== undefined
        ? Number(row.peak_price_per_night)
        : undefined,
    securityDeposit: Number(row.security_deposit ?? 0),
    downPaymentPercent: Number(row.down_payment_percent ?? 25),
    depositType: (row.deposit_type as Chalet['depositType']) ?? 'percent',
    fixedDepositAmount:
      row.fixed_deposit_amount !== null && row.fixed_deposit_amount !== undefined
        ? Number(row.fixed_deposit_amount)
        : undefined,
    bedrooms: Number(row.bedrooms ?? 1),
    bathrooms: Number(row.bathrooms ?? 1),
    areaSqm:
      row.area_sqm !== null && row.area_sqm !== undefined
        ? Number(row.area_sqm)
        : undefined,
    maxGuests: Number(row.max_guests ?? 2),
    beachDistanceMeters: Number(row.beach_distance_meters ?? 0),
    coordinates,
    rating: Number(row.rating ?? 5),
    reviewsCount: Number(row.reviews_count ?? 0),
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    amenities: Array.isArray(row.amenities) ? (row.amenities as Chalet['amenities']) : [],
    blockedDates: Array.isArray(row.blocked_dates) ? (row.blocked_dates as string[]) : [],
    dateRules: (row.date_rules as Chalet['dateRules']) ?? {},
    nearbyHighlights: Array.isArray(row.nearby_highlights)
      ? (row.nearby_highlights as Chalet['nearbyHighlights'])
      : undefined,
    description: String(row.description ?? ''),
    rules: Array.isArray(row.rules) ? (row.rules as string[]) : [],
    featured: Boolean(row.featured ?? false),
    owner: {
      name: String(row.owner_name ?? ''),
      phone: privateContact?.owner_phone || undefined,
      instaPayHandle: privateContact?.insta_pay_handle || undefined,
      verified: Boolean(row.owner_verified ?? false),
      roleType: (row.owner_role_type as Chalet['owner']['roleType']) ?? 'owner',
      brokerAgency: row.broker_agency ? String(row.broker_agency) : undefined,
      verificationStatus: row.owner_verified ? 'verified' : 'unverified',
      responseTime: String(row.owner_response_time ?? 'يرد خلال دقائق'),
      memberSince: String(row.owner_member_since ?? '٢٠٢٦'),
    },
  };
}

function mapBookingFromRow(row: Record<string, unknown>): BookingRequest {
  return {
    id: String(row.id),
    chaletId: String(row.chalet_id ?? ''),
    renterId: row.renter_id ? String(row.renter_id) : undefined,
    chaletTitle: String(row.chalet_title ?? ''),
    resort: String(row.resort ?? ''),
    destinationLabel: String(row.destination_label ?? ''),
    ownerName: String(row.owner_name ?? ''),
    guestName: String(row.guest_name ?? ''),
    guestPhone: String(row.guest_phone ?? ''),
    checkIn: String(row.check_in ?? ''),
    checkOut: row.check_out ? String(row.check_out) : undefined,
    nights: Number(row.nights ?? 1),
    rentalDuration: (row.rental_duration as BookingRequest['rentalDuration']) ?? 'daily',
    inquiryChannel: (row.inquiry_channel as BookingRequest['inquiryChannel']) ?? 'form',
    guests: Number(row.guests ?? 1),
    totalPrice: Number(row.total_price ?? 0),
    depositAmount:
      row.deposit_amount !== null && row.deposit_amount !== undefined
        ? Number(row.deposit_amount)
        : undefined,
    remainingAmount:
      row.remaining_amount !== null && row.remaining_amount !== undefined
        ? Number(row.remaining_amount)
        : undefined,
    securityDeposit:
      row.security_deposit !== null && row.security_deposit !== undefined
        ? Number(row.security_deposit)
        : undefined,
    policyAccepted: Boolean(row.policy_accepted ?? false),
    receiptPath: row.receipt_path ? String(row.receipt_path) : undefined,
    paymentProvider: row.payment_provider ? String(row.payment_provider) : undefined,
    paymentReference: row.payment_reference ? String(row.payment_reference) : undefined,
    notes: String(row.notes ?? ''),
    status: (row.status as BookingStatus) ?? 'pending',
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    paymentSubmittedAt: row.payment_submitted_at ? String(row.payment_submitted_at) : undefined,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    cancellationDaysNotice:
      row.cancellation_days_notice !== null && row.cancellation_days_notice !== undefined
        ? Number(row.cancellation_days_notice)
        : undefined,
    depositForfeited: Boolean(row.deposit_forfeited ?? false),
    forfeitedAmount:
      row.forfeited_amount !== null && row.forfeited_amount !== undefined
        ? Number(row.forfeited_amount)
        : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

// ---------- Chalets & Private Contacts ----------

export async function fetchPublicChalets(): Promise<RepoResult<Chalet[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('chalets')
      .select('*')
      .eq('availability_status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل قائمة الوحدات من الخادم.'),
      };
    }

    return {
      data: (data ?? []).map((row) => mapChaletFromRow(row as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getArabicSupabaseError(err, 'تعذر الاتصال بقاعدة البيانات.'),
    };
  }
}

export async function fetchMyChalets(ownerId: string): Promise<RepoResult<Chalet[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const [chaletsRes, contactsRes] = await Promise.all([
      supabase
        .from('chalets')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('chalet_contacts')
        .select('chalet_id, owner_phone, insta_pay_handle')
        .eq('owner_id', ownerId),
    ]);

    if (chaletsRes.error) {
      return {
        data: null,
        error: getArabicSupabaseError(chaletsRes.error, 'تعذر تحميل وحداتك.'),
      };
    }

    const contactsMap = new Map<string, { owner_phone?: string; insta_pay_handle?: string }>();
    if (!contactsRes.error && Array.isArray(contactsRes.data)) {
      contactsRes.data.forEach((c) => {
        contactsMap.set(String(c.chalet_id), {
          owner_phone: c.owner_phone ? String(c.owner_phone) : undefined,
          insta_pay_handle: c.insta_pay_handle ? String(c.insta_pay_handle) : undefined,
        });
      });
    }

    return {
      data: (chaletsRes.data ?? []).map((row) => {
        const rec = row as Record<string, unknown>;
        return mapChaletFromRow(rec, contactsMap.get(String(rec.id)));
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل وحدات المالك.') };
  }
}

export async function createChalet(
  chalet: Omit<Chalet, 'id' | 'ownerId'> & {
    ownerPhone: string;
    instaPayHandle?: string;
  }
): Promise<RepoResult<Chalet>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يرجى تسجيل الدخول أولاً.' };
  }

  const ownerId = uidRes.data;
  const insertRow = {
    owner_id: ownerId,
    unit_number: chalet.unitNumber ?? null,
    title: chalet.title,
    listing_mode: 'rent',
    availability_status: chalet.availabilityStatus ?? 'active',
    supported_durations: chalet.supportedDurations ?? ['daily', 'weekly', 'monthly'],
    destination: chalet.destination,
    governorate: chalet.governorate ?? chalet.destination,
    area: chalet.area ?? null,
    destination_label: chalet.destinationLabel,
    resort: chalet.resort,
    unit_type: chalet.unitType,
    view_type: chalet.viewType,
    includes_passes: chalet.includesPasses,
    verified_live_photos: Boolean(chalet.verifiedLivePhotos),
    live_photos_verified_at: chalet.livePhotosVerifiedAt ?? null,
    welcome_guide: chalet.welcomeGuide ?? null,
    host_tier: chalet.hostTier ?? 'free',
    price_per_night: chalet.pricePerNight,
    weekly_price: chalet.weeklyPrice ?? null,
    monthly_price: chalet.monthlyPrice ?? null,
    weekend_price_per_night: chalet.weekendPricePerNight ?? null,
    peak_price_per_night: chalet.peakPricePerNight ?? null,
    security_deposit: chalet.securityDeposit ?? 0,
    down_payment_percent: chalet.downPaymentPercent ?? 25,
    deposit_type: chalet.depositType ?? 'percent',
    fixed_deposit_amount: chalet.fixedDepositAmount ?? null,
    bedrooms: chalet.bedrooms,
    bathrooms: chalet.bathrooms,
    area_sqm: chalet.areaSqm ?? null,
    max_guests: chalet.maxGuests,
    beach_distance_meters: chalet.beachDistanceMeters,
    coordinates: chalet.coordinates,
    rating: chalet.rating ?? 5,
    reviews_count: chalet.reviewsCount ?? 0,
    images: chalet.images,
    amenities: chalet.amenities,
    blocked_dates: chalet.blockedDates ?? [],
    date_rules: chalet.dateRules ?? {},
    nearby_highlights: chalet.nearbyHighlights ?? [],
    description: chalet.description,
    rules: chalet.rules,
    owner_name: chalet.owner.name,
    owner_role_type: chalet.owner.roleType ?? 'owner',
    broker_agency: chalet.owner.brokerAgency ?? null,
    owner_verified: Boolean(chalet.owner.verified),
    owner_response_time: chalet.owner.responseTime,
    owner_member_since: chalet.owner.memberSince,
    featured: Boolean(chalet.featured),
  };

  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('chalets')
      .insert(insertRow)
      .select('*')
      .single();

    if (insertErr || !inserted) {
      return {
        data: null,
        error: getArabicSupabaseError(
          insertErr,
          'تعذر نشر الوحدة. تأكد من تفعيل صلاحية المالك في حسابك.'
        ),
      };
    }

    const { error: contactErr } = await supabase.from('chalet_contacts').insert({
      chalet_id: inserted.id,
      owner_id: ownerId,
      owner_phone: chalet.ownerPhone,
      insta_pay_handle: chalet.instaPayHandle || null,
    });

    if (contactErr) {
      await supabase.from('chalets').delete().eq('id', inserted.id);
      return {
        data: null,
        error: getArabicSupabaseError(contactErr, 'تعذر حفظ بيانات التواصل الخاصة بالوحدة.'),
      };
    }

    return {
      data: mapChaletFromRow(inserted as Record<string, unknown>, {
        owner_phone: chalet.ownerPhone,
        insta_pay_handle: chalet.instaPayHandle,
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إنشاء الوحدة.') };
  }
}

export async function updateChalet(
  chaletId: string,
  ownerId: string,
  updates: Partial<Chalet>
): Promise<RepoResult<Chalet>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.availabilityStatus !== undefined)
    patch.availability_status = updates.availabilityStatus;
  if (updates.pricePerNight !== undefined) patch.price_per_night = updates.pricePerNight;
  if (updates.weeklyPrice !== undefined) patch.weekly_price = updates.weeklyPrice;
  if (updates.monthlyPrice !== undefined) patch.monthly_price = updates.monthlyPrice;
  if (updates.weekendPricePerNight !== undefined)
    patch.weekend_price_per_night = updates.weekendPricePerNight;
  if (updates.peakPricePerNight !== undefined)
    patch.peak_price_per_night = updates.peakPricePerNight;
  if (updates.securityDeposit !== undefined) patch.security_deposit = updates.securityDeposit;
  if (updates.downPaymentPercent !== undefined)
    patch.down_payment_percent = updates.downPaymentPercent;
  if (updates.depositType !== undefined) patch.deposit_type = updates.depositType;
  if (updates.fixedDepositAmount !== undefined)
    patch.fixed_deposit_amount = updates.fixedDepositAmount;
  if (updates.includesPasses !== undefined) patch.includes_passes = updates.includesPasses;
  if (updates.verifiedLivePhotos !== undefined)
    patch.verified_live_photos = updates.verifiedLivePhotos;
  if (updates.livePhotosVerifiedAt !== undefined)
    patch.live_photos_verified_at = updates.livePhotosVerifiedAt;
  if (updates.welcomeGuide !== undefined) patch.welcome_guide = updates.welcomeGuide;
  if (updates.hostTier !== undefined) patch.host_tier = updates.hostTier;
  if (updates.blockedDates !== undefined) patch.blocked_dates = updates.blockedDates;
  if (updates.dateRules !== undefined) patch.date_rules = updates.dateRules;
  if (updates.owner?.name !== undefined) patch.owner_name = updates.owner.name;

  try {
    const { data, error } = await supabase
      .from('chalets')
      .update(patch)
      .eq('id', chaletId)
      .eq('owner_id', ownerId)
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحديث إعدادات الوحدة أو لا تملك صلاحية التعديل.'),
      };
    }

    if (updates.owner?.phone !== undefined || updates.owner?.instaPayHandle !== undefined) {
      await supabase
        .from('chalet_contacts')
        .upsert({
          chalet_id: chaletId,
          owner_id: ownerId,
          owner_phone: updates.owner?.phone ?? '01000000000',
          insta_pay_handle: updates.owner?.instaPayHandle ?? null,
        });
    }

    return {
      data: mapChaletFromRow(data as Record<string, unknown>, {
        owner_phone: updates.owner?.phone,
        insta_pay_handle: updates.owner?.instaPayHandle,
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحديث الوحدة.') };
  }
}

export async function deleteChalet(
  chaletId: string,
  ownerId: string
): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { error } = await supabase
      .from('chalets')
      .delete()
      .eq('id', chaletId)
      .eq('owner_id', ownerId);

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر حذف الوحدة.'),
      };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر حذف الوحدة.') };
  }
}

// ---------- Bookings, Public Ranges, Realtime & Contact Reveal ----------

export async function fetchAllActiveBookedRanges(): Promise<RepoResult<BookedDateRange[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase.rpc('get_all_active_booked_ranges');
    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل التواريخ المحجوزة.'),
      };
    }
    const rows = Array.isArray(data)
      ? data.map((r: Record<string, unknown>) => ({
          chaletId: String(r.chalet_id),
          checkIn: String(r.check_in),
          checkOut: String(r.check_out),
          status: (r.status as BookingStatus) ?? 'confirmed',
        }))
      : [];
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل جدول التوافر.') };
  }
}

export async function fetchChaletBookedRanges(
  chaletId: string
): Promise<RepoResult<BookedDateRange[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase.rpc('get_chalet_booked_ranges', {
      p_chalet_id: chaletId,
    });
    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل تواريخ الوحدة المحجوزة.'),
      };
    }
    const rows = Array.isArray(data)
      ? data.map((r: Record<string, unknown>) => ({
          chaletId: String(r.chalet_id),
          checkIn: String(r.check_in),
          checkOut: String(r.check_out),
          status: (r.status as BookingStatus) ?? 'confirmed',
        }))
      : [];
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل تواريخ الوحدة.') };
  }
}

export async function fetchMyBookings(userId: string): Promise<RepoResult<BookingRequest[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('renter_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل حجوزاتك.'),
      };
    }
    return {
      data: (data ?? []).map((r) => mapBookingFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل الحجوزات.') };
  }
}

export async function fetchHostChaletBookings(
  chaletIds: string[]
): Promise<RepoResult<BookingRequest[]>> {
  if (!isSupabaseConfigured || !supabase || chaletIds.length === 0) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .in('chalet_id', chaletIds)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل حجوزات وحداتك.'),
      };
    }
    return {
      data: (data ?? []).map((r) => mapBookingFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل حجوزات المالك.') };
  }
}

export async function fetchAllBookingsAdmin(): Promise<RepoResult<BookingRequest[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل قائمة الحجوزات للإدارة.'),
      };
    }
    return {
      data: (data ?? []).map((r) => mapBookingFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل حجوزات الإدارة.') };
  }
}

export async function syncBookingLifecycleStatusesRpc(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.rpc('sync_booking_lifecycle_statuses');
  } catch {
    // Non-blocking background sync
  }
}

export async function createBookingRequestRpc(payload: {
  chaletId: string;
  guestName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rentalDuration?: 'daily' | 'weekly' | 'monthly';
  inquiryChannel?: 'form' | 'whatsapp' | 'phone';
  policyAccepted: boolean;
  notes?: string;
}): Promise<RepoResult<BookingRequest>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يجب تسجيل الدخول قبل إرسال طلب الحجز.' };
  }

  try {
    const { data, error } = await supabase.rpc('create_booking_request', {
      p_chalet_id: payload.chaletId,
      p_guest_name: payload.guestName,
      p_guest_phone: payload.guestPhone,
      p_check_in: payload.checkIn,
      p_check_out: payload.checkOut,
      p_guests: payload.guests,
      p_rental_duration: payload.rentalDuration ?? 'daily',
      p_inquiry_channel: payload.inquiryChannel ?? 'form',
      p_policy_accepted: payload.policyAccepted,
      p_notes: payload.notes ?? '',
    });

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر إرسال طلب الحجز.'),
      };
    }

    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إرسال طلب الحجز.') };
  }
}

export async function approveBookingRequestRpc(
  bookingId: string
): Promise<RepoResult<BookingRequest>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('approve_booking_request', {
      p_booking_id: bookingId,
    });
    if (error || !data) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر الموافقة على الطلب.') };
    }
    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر الموافقة على الطلب.') };
  }
}

export async function submitBookingPaymentReceiptRpc(payload: {
  bookingId: string;
  receiptPath: string;
  paymentProvider?: string;
  paymentReference?: string;
}): Promise<RepoResult<BookingRequest>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('submit_booking_payment_receipt', {
      p_booking_id: payload.bookingId,
      p_receipt_path: payload.receiptPath,
      p_payment_provider: payload.paymentProvider ?? 'manual_transfer',
      p_payment_reference: payload.paymentReference ?? null,
    });
    if (error || !data) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر إرفاق إيصال الدفع.') };
    }
    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إرفاق إيصال الدفع.') };
  }
}

export async function confirmBookingPaymentRpc(
  bookingId: string
): Promise<RepoResult<BookingRequest>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('confirm_booking_payment', {
      p_booking_id: bookingId,
    });
    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تأكيد استلام جدية الحجز.'),
      };
    }
    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تأكيد استلام العربون.') };
  }
}

export async function rejectBookingRequestRpc(
  bookingId: string,
  rejectionReason?: string
): Promise<RepoResult<BookingRequest>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('reject_booking_request', {
      p_booking_id: bookingId,
      p_rejection_reason: rejectionReason ?? null,
    });
    if (error || !data) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر رفض الطلب.') };
    }
    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر رفض الطلب.') };
  }
}

export async function cancelBookingWithPolicyRpc(
  bookingId: string
): Promise<RepoResult<BookingRequest>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('cancel_booking_with_policy', {
      p_booking_id: bookingId,
    });
    if (error || !data) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر إلغاء الحجز.') };
    }
    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إلغاء الحجز.') };
  }
}

export async function completeBookingStayRpc(
  bookingId: string
): Promise<RepoResult<BookingRequest>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('complete_booking_stay', {
      p_booking_id: bookingId,
    });
    if (error || !data) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر إتمام الإقامة.') };
    }
    return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إتمام الإقامة.') };
  }
}

export async function createBooking(p: {
  chaletId: string;
  checkIn: string;
  nights: number;
  duration: 'daily' | 'weekly' | 'monthly';
  guests: number;
  guestName: string;
  guestPhone: string;
  notes: string;
  channel?: string;
}) {
  const { data, error } = await requireSupabase().rpc('create_booking', {
    p_chalet_id: p.chaletId,
    p_check_in: p.checkIn,
    p_nights: p.nights,
    p_duration: p.duration,
    p_guests: p.guests,
    p_guest_name: p.guestName,
    p_guest_phone: p.guestPhone,
    p_notes: p.notes,
    p_policy_accepted: true,
    p_channel: p.channel ?? 'form',
  });
  if (error) throw error;
  return data;
}

export const ownerRespond = (id: string, approve: boolean, reason?: string) =>
  requireSupabase().rpc('owner_respond_booking', {
    p_booking_id: id,
    p_approve: approve,
    p_reason: reason ?? null,
  });

export const submitReceipt = (id: string, path: string) =>
  requireSupabase().rpc('submit_payment_receipt', {
    p_booking_id: id,
    p_receipt_path: path,
  });

export const reviewPayment = (id: string, confirm: boolean, reason?: string) =>
  requireSupabase().rpc('owner_review_payment', {
    p_booking_id: id,
    p_confirm: confirm,
    p_reason: reason ?? null,
  });

export const cancelBooking = (id: string, reason?: string) =>
  requireSupabase().rpc('cancel_booking', {
    p_booking_id: id,
    p_reason: reason ?? null,
  });

export const completeBooking = (id: string) =>
  requireSupabase().rpc('complete_booking', { p_booking_id: id });

export async function fetchBookings() {
  const { data, error } = await requireSupabase()
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createBookingCompat(
  payload: Omit<BookingRequest, 'id' | 'status' | 'createdAt' | 'renterId'> & {
    status?: BookingStatus;
  }
): Promise<RepoResult<BookingRequest>> {
  try {
    const data = await createBooking({
      chaletId: payload.chaletId,
      checkIn: payload.checkIn,
      nights: payload.nights,
      duration: payload.rentalDuration ?? 'daily',
      guests: payload.guests,
      guestName: payload.guestName,
      guestPhone: payload.guestPhone,
      notes: payload.notes,
      channel: payload.inquiryChannel,
    });
    if (data) {
      return { data: mapBookingFromRow(data as Record<string, unknown>), error: null };
    }
  } catch (err) {
    const errObj = err as { code?: string; message?: string };
    const isMissingNewRpc =
      errObj?.code === 'PGRST202' ||
      errObj?.code === '42883' ||
      (errObj?.message ?? '').includes('create_booking(');
    if (!isMissingNewRpc) {
      return {
        data: null,
        error: getArabicSupabaseError(err, 'تعذر إرسال طلب الحجز.'),
      };
    }
  }

  return createBookingRequestRpc({
    chaletId: payload.chaletId,
    guestName: payload.guestName,
    guestPhone: payload.guestPhone,
    checkIn: payload.checkIn,
    checkOut: payload.checkOut ?? payload.checkIn,
    guests: payload.guests,
    rentalDuration: payload.rentalDuration,
    inquiryChannel: payload.inquiryChannel,
    policyAccepted: Boolean(payload.policyAccepted),
    notes: payload.notes,
  });
}

export async function updateBookingStatus(
  bookingId: string,
  patch: {
    status: BookingStatus;
    notes?: string;
  }
): Promise<RepoResult<BookingRequest>> {
  if (patch.status === 'approved') return approveBookingRequestRpc(bookingId);
  if (patch.status === 'confirmed') return confirmBookingPaymentRpc(bookingId);
  if (patch.status === 'completed') return completeBookingStayRpc(bookingId);
  if (patch.status === 'rejected') return rejectBookingRequestRpc(bookingId, patch.notes);
  if (patch.status === 'cancelled') return cancelBookingWithPolicyRpc(bookingId);
  return { data: null, error: 'حالة غير مدعومة للتحديث المباشر.' };
}

export function subscribeToBookingsChanges(
  onChange: () => void,
  chaletId?: string
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channelName = chaletId ? `bookings-unit-${chaletId}` : 'bookings-all';
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      chaletId
        ? { event: '*', schema: 'public', table: 'bookings', filter: `chalet_id=eq.${chaletId}` }
        : { event: '*', schema: 'public', table: 'bookings' },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}

export async function revealOwnerContact(
  chaletId: string
): Promise<RepoResult<RevealedOwnerContact>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('reveal_owner_contact', {
      p_chalet_id: chaletId,
    });
    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر كشف بيانات التواصل.'),
      };
    }
    const obj = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        ownerPhone: obj.owner_phone ? String(obj.owner_phone) : null,
        instaPayHandle: obj.insta_pay_handle ? String(obj.insta_pay_handle) : null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر كشف بيانات التواصل.') };
  }
}

// ---------- Reviews & Renter Trust ----------

export async function fetchAllReviews(): Promise<RepoResult<ChaletReview[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر تحميل التقييمات.') };
    }
    return {
      data: (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        chaletId: String(r.chalet_id),
        bookingId: String(r.booking_id),
        authorName: String(r.author_name ?? ''),
        rating: Number(r.rating ?? 5),
        tags: Array.isArray(r.tags) ? (r.tags as PropertyReviewTag[]) : undefined,
        comment: String(r.comment ?? ''),
        stayDate: String(r.stay_date ?? ''),
        createdAt: String(r.created_at ?? new Date().toISOString()),
      })),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل التقييمات.') };
  }
}

export async function createReview(payload: {
  chaletId: string;
  bookingId: string;
  authorName: string;
  rating: number;
  tags?: PropertyReviewTag[];
  comment: string;
  stayDate: string;
}): Promise<RepoResult<ChaletReview>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يجب تسجيل الدخول لإضافة تقييم.' };
  }

  try {
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        chalet_id: payload.chaletId,
        booking_id: payload.bookingId,
        renter_id: uidRes.data,
        author_name: payload.authorName,
        rating: payload.rating,
        tags: payload.tags ?? [],
        comment: payload.comment,
        stay_date: payload.stayDate,
      })
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(
          error,
          'التقييم متاح فقط بعد اكتمال الإقامة (completed).'
        ),
      };
    }

    return {
      data: {
        id: String(data.id),
        chaletId: String(data.chalet_id),
        bookingId: String(data.booking_id),
        authorName: String(data.author_name),
        rating: Number(data.rating),
        tags: Array.isArray(data.tags) ? (data.tags as PropertyReviewTag[]) : undefined,
        comment: String(data.comment),
        stayDate: String(data.stay_date),
        createdAt: String(data.created_at),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر حفظ التقييم.') };
  }
}

export async function deleteReview(reviewId: string): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
    if (error) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر حذف التقييم.') };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر حذف التقييم.') };
  }
}

export async function fetchRenterTrustReviews(): Promise<RepoResult<RenterTrustReview[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('renter_trust_reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: null };
    }
    return {
      data: (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        bookingId: String(r.booking_id),
        chaletTitle: String(r.chalet_title ?? ''),
        renterName: String(r.renter_name ?? ''),
        renterPhone: String(r.renter_phone ?? ''),
        hostName: String(r.host_name ?? ''),
        rating: Number(r.rating ?? 5),
        punctualityScore: Number(r.punctuality_score ?? 5),
        propertyCareScore: Number(r.property_care_score ?? 5),
        tags: Array.isArray(r.tags) ? (r.tags as RenterTrustTag[]) : [],
        comment: String(r.comment ?? ''),
        createdAt: String(r.created_at ?? new Date().toISOString()),
      })),
      error: null,
    };
  } catch {
    return { data: [], error: null };
  }
}

export async function createRenterTrustReview(payload: {
  bookingId: string;
  chaletId: string;
  renterId?: string;
  chaletTitle: string;
  renterName: string;
  renterPhone: string;
  hostName: string;
  rating: number;
  punctualityScore: number;
  propertyCareScore: number;
  tags: RenterTrustTag[];
  comment: string;
}): Promise<RepoResult<RenterTrustReview>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يجب تسجيل الدخول لتقييم المستأجر.' };
  }

  try {
    const { data, error } = await supabase
      .from('renter_trust_reviews')
      .insert({
        booking_id: payload.bookingId,
        chalet_id: payload.chaletId,
        host_id: uidRes.data,
        renter_id: payload.renterId ?? null,
        renter_name: payload.renterName,
        renter_phone: payload.renterPhone,
        host_name: payload.hostName,
        chalet_title: payload.chaletTitle,
        rating: payload.rating,
        punctuality_score: payload.punctualityScore,
        property_care_score: payload.propertyCareScore,
        tags: payload.tags,
        comment: payload.comment,
      })
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر حفظ تقييم ثقة المستأجر.'),
      };
    }

    return {
      data: {
        id: String(data.id),
        bookingId: String(data.booking_id),
        chaletTitle: String(data.chalet_title),
        renterName: String(data.renter_name),
        renterPhone: String(data.renter_phone),
        hostName: String(data.host_name),
        rating: Number(data.rating),
        punctualityScore: Number(data.punctuality_score),
        propertyCareScore: Number(data.property_care_score),
        tags: Array.isArray(data.tags) ? (data.tags as RenterTrustTag[]) : [],
        comment: String(data.comment),
        createdAt: String(data.created_at),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر حفظ تقييم المستأجر.') };
  }
}

// ---------- Reports ----------

export async function fetchChaletReportCounts(): Promise<RepoResult<Record<string, number>>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: {}, error: null };
  }
  try {
    const { data, error } = await supabase.rpc('get_chalet_report_counts');
    if (error || !Array.isArray(data)) {
      return { data: {}, error: null };
    }
    const counts: Record<string, number> = {};
    data.forEach((row: Record<string, unknown>) => {
      counts[String(row.chalet_id)] = Number(row.report_count ?? 0);
    });
    return { data: counts, error: null };
  } catch {
    return { data: {}, error: null };
  }
}

export async function createListingReport(payload: {
  chaletId: string;
  reason: string;
  details: string;
}): Promise<RepoResult<boolean>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يجب تسجيل الدخول لإرسال بلاغ.' };
  }
  try {
    const { error } = await supabase.from('listing_reports').insert({
      chalet_id: payload.chaletId,
      reporter_id: uidRes.data,
      reason: payload.reason,
      details: payload.details,
    });
    if (error) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر إرسال البلاغ.') };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إرسال البلاغ.') };
  }
}

// ---------- Owner Verifications ----------

function mapVerificationFromRow(row: Record<string, unknown>): OwnerVerificationSubmission {
  const docPath = row.document_path ? String(row.document_path) : undefined;
  return {
    id: row.id ? String(row.id) : undefined,
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    ownerName: String(row.owner_name ?? ''),
    phone: String(row.phone ?? ''),
    documentType: (row.document_type as OwnerVerificationSubmission['documentType']) ?? 'resort-card',
    documentNumber: String(row.document_number ?? ''),
    documentPath: docPath,
    documentPreviewName: docPath ? docPath.split('/').pop() || 'مستند مرفق' : 'مستند مرفق',
    status: (row.status as OwnerVerificationSubmission['status']) ?? 'pending',
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    submittedAt: String(row.submitted_at ?? new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

export async function fetchMyVerification(
  ownerId: string
): Promise<RepoResult<OwnerVerificationSubmission | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('owner_verifications')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل حالة التوثيق.'),
      };
    }
    return {
      data: data ? mapVerificationFromRow(data as Record<string, unknown>) : null,
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل حالة التوثيق.') };
  }
}

export async function fetchAllVerificationsAdmin(): Promise<
  RepoResult<OwnerVerificationSubmission[]>
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
        error: getArabicSupabaseError(error, 'تعذر تحميل طلبات التوثيق.'),
      };
    }
    return {
      data: (data ?? []).map((r) => mapVerificationFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل طلبات التوثيق.') };
  }
}

export async function submitOwnerVerification(payload: {
  ownerName: string;
  phone: string;
  documentType: OwnerVerificationSubmission['documentType'];
  documentNumber: string;
  documentPath: string;
}): Promise<RepoResult<OwnerVerificationSubmission>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يرجى تسجيل الدخول لتقديم طلب التوثيق.' };
  }

  try {
    const { data, error } = await supabase
      .from('owner_verifications')
      .upsert(
        {
          owner_id: uidRes.data,
          owner_name: payload.ownerName,
          phone: payload.phone,
          document_type: payload.documentType,
          document_number: payload.documentNumber,
          document_path: payload.documentPath,
          status: 'pending',
        },
        { onConflict: 'owner_id' }
      )
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(
          error,
          'تعذر إرسال طلب التوثيق للمراجعة الإدارية.'
        ),
      };
    }

    return {
      data: mapVerificationFromRow(data as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إرسال طلب التوثيق.') };
  }
}

export async function reviewOwnerVerificationAdmin(
  verificationId: string,
  status: 'verified' | 'unverified',
  rejectionReason?: string
): Promise<RepoResult<OwnerVerificationSubmission>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const { data, error } = await supabase.rpc('admin_review_owner_verification', {
      p_verification_id: verificationId,
      p_decision: status,
      p_rejection_reason: rejectionReason ?? null,
    });

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحديث حالة توثيق المالك.'),
      };
    }
    return {
      data: mapVerificationFromRow(data as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر مراجعة طلب التوثيق.') };
  }
}

// ---------- Host Subscriptions ----------

function mapSubscriptionFromRow(row: Record<string, unknown>): HostSubscriptionRecord {
  return {
    id: String(row.id),
    hostId: row.host_id ? String(row.host_id) : undefined,
    hostName: String(row.host_name ?? ''),
    hostPhone: String(row.host_phone ?? ''),
    tier: (row.tier as HostSubscriptionRecord['tier']) ?? 'free',
    status: (row.status as HostSubscriptionRecord['status']) ?? 'pending-verification',
    monthlyFee: Number(row.monthly_fee ?? 150),
    paymentMethod: (row.payment_method as PaymentMethod | undefined) ?? undefined,
    senderPhoneOrHandle: row.sender_phone_or_handle
      ? String(row.sender_phone_or_handle)
      : undefined,
    transferReference: row.transfer_reference ? String(row.transfer_reference) : undefined,
    receiptPath: row.receipt_path ? String(row.receipt_path) : undefined,
    startDate: String(row.start_date ?? ''),
    expiryDate: String(row.expiry_date ?? ''),
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

export async function fetchMySubscriptions(
  hostId: string
): Promise<RepoResult<HostSubscriptionRecord[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('host_subscriptions')
      .select('*')
      .eq('host_id', hostId)
      .order('submitted_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل بيانات اشتراكك.'),
      };
    }
    return {
      data: (data ?? []).map((r) => mapSubscriptionFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل الاشتراك.') };
  }
}

export async function fetchAllSubscriptionsAdmin(): Promise<
  RepoResult<HostSubscriptionRecord[]>
> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('host_subscriptions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل جدول الاشتراكات.'),
      };
    }
    return {
      data: (data ?? []).map((r) => mapSubscriptionFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل الاشتراكات.') };
  }
}

export async function submitHostSubscription(payload: {
  hostName: string;
  hostPhone: string;
  monthlyFee: number;
  paymentMethod: PaymentMethod;
  senderPhoneOrHandle: string;
  transferReference: string;
  receiptPath?: string;
  startDate: string;
  expiryDate: string;
}): Promise<RepoResult<HostSubscriptionRecord>> {
  const uidRes = await getAuthenticatedUserId();
  if (uidRes.error || !uidRes.data || !supabase) {
    return { data: null, error: uidRes.error ?? 'يرجى تسجيل الدخول لإرسال طلب الاشتراك.' };
  }

  try {
    const { data, error } = await supabase
      .from('host_subscriptions')
      .insert({
        host_id: uidRes.data,
        host_name: payload.hostName,
        host_phone: payload.hostPhone,
        tier: 'pro',
        status: 'pending-verification',
        monthly_fee: payload.monthlyFee,
        payment_method: payload.paymentMethod,
        sender_phone_or_handle: payload.senderPhoneOrHandle,
        transfer_reference: payload.transferReference,
        receipt_path: payload.receiptPath ?? null,
        start_date: payload.startDate,
        expiry_date: payload.expiryDate,
      })
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تسجيل طلب الترقية.'),
      };
    }
    return {
      data: mapSubscriptionFromRow(data as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر إرسال طلب الاشتراك.') };
  }
}

export async function updateSubscriptionStatusAdmin(
  subscriptionId: string,
  status: 'active' | 'expired',
  dates?: { startDate: string; expiryDate: string }
): Promise<RepoResult<HostSubscriptionRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };
  if (status === 'active') {
    patch.tier = 'pro';
    if (dates) {
      patch.start_date = dates.startDate;
      patch.expiry_date = dates.expiryDate;
    }
  }

  try {
    const { data, error } = await supabase
      .from('host_subscriptions')
      .update(patch)
      .eq('id', subscriptionId)
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحديث حالة الاشتراك.'),
      };
    }
    return {
      data: mapSubscriptionFromRow(data as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحديث الاشتراك.') };
  }
}

// ---------- In-App Notifications & Realtime ----------

function mapNotificationFromRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ''),
    bookingId: row.booking_id ? String(row.booking_id) : undefined,
    type: String(row.type ?? 'info'),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    isRead: Boolean(row.is_read ?? false),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function fetchMyNotifications(
  userId: string
): Promise<RepoResult<AppNotification[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return {
        data: null,
        error: getArabicSupabaseError(error, 'تعذر تحميل الإشعارات.'),
      };
    }

    return {
      data: (data ?? []).map((r) => mapNotificationFromRow(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحميل الإشعارات.') };
  }
}

export async function markNotificationAsRead(
  notificationId: string
): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: true, error: null };
  }
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر تحديث الإشعار.') };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحديث الإشعار.') };
  }
}

export async function markAllNotificationsAsRead(
  userId: string
): Promise<RepoResult<boolean>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: true, error: null };
  }
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return { data: null, error: getArabicSupabaseError(error, 'تعذر تحديث الإشعارات.') };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getArabicSupabaseError(err, 'تعذر تحديث الإشعارات.') };
  }
}

export function subscribeToNotifications(
  userId: string,
  onChange: () => void
): () => void {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return () => {};
  }

  const channel = supabase
    .channel(`notifications-user-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}
