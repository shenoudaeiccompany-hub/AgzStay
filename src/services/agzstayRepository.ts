import { resolveCoordinatesForLocation } from '@/data/egyptLocations';
import { normalizeEgyptianPhone } from '@/data/subscriptions';
import { isSupabaseConfigured, requireSupabase, supabase } from '@/lib/supabase';
import type {
  AdvertiserRoleLabel,
  AmenityId,
  Chalet,
  DepositType,
  ListingAvailabilityStatus,
  OwnerSession,
  PropertyType,
  SubscriptionPlanId,
  SubscriptionRecord,
  SubscriptionStatus,
} from '@/types/chalet';
import { formatSupabaseError } from '@/utils/arabicErrors';
import { compressImage } from '@/utils/imageCompression';

export type RepoResult<T> = { data: T; error: null } | { data: null; error: string };

const STORAGE_KEYS = {
  favorites: 'agzstay_favorites_v2',
  ownerSession: 'agzstay_owner_session_v2',
  adminPinVerified: 'agzstay_admin_pin_ok_v2',
  pwaDismissed: 'agzstay_pwa_dismissed_v2',
} as const;

export const agzstayStorageKeys = STORAGE_KEYS;

export function migrateLegacyStorageKeys(): void {
  try {
    const legacyFav = localStorage.getItem('agzstay_favorites_v1');
    if (legacyFav && !localStorage.getItem(STORAGE_KEYS.favorites)) {
      localStorage.setItem(STORAGE_KEYS.favorites, legacyFav);
    }
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

export function loadOwnerSession(): OwnerSession | null {
  return loadLocalJson<OwnerSession | null>(STORAGE_KEYS.ownerSession, null);
}

export function saveOwnerSession(session: OwnerSession | null): void {
  if (!session) {
    try {
      localStorage.removeItem(STORAGE_KEYS.ownerSession);
    } catch {
      // ignore
    }
    return;
  }
  saveLocalJson(STORAGE_KEYS.ownerSession, session);
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const RECEIPT_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

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

function mapChaletFromRow(row: Record<string, unknown>): Chalet {
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
    isDemo: false,
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    governorate,
    city,
    areaOrVillage,
    propertyType: normalizePropertyType(row.property_type ?? row.unit_type),
    advertiserRole: normalizeAdvertiserRole(row.advertiser_role ?? row.owner_role_type),
    ownerName: String(row.owner_name ?? 'معلن AgzStay'),
    ownerPhone: String(row.owner_phone ?? ''),
    isFeatured: Boolean(row.is_featured ?? row.featured ?? false),
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

function mapSubscriptionFromRow(row: Record<string, unknown>): SubscriptionRecord {
  const statusRaw = String(row.status ?? 'pending');
  const status: SubscriptionStatus =
    statusRaw === 'active' || statusRaw === 'rejected' ? statusRaw : 'pending';
  const planRaw = String(row.plan_id ?? 'free');
  const planId: SubscriptionPlanId =
    planRaw === 'starter' || planRaw === 'pro' || planRaw === 'enterprise' ? planRaw : 'free';

  return {
    id: String(row.id),
    ownerName: String(row.owner_name ?? ''),
    ownerPhone: String(row.owner_phone ?? ''),
    planId,
    planName: String(row.plan_name ?? ''),
    price: Number(row.price ?? 0),
    maxUnits: Number(row.max_units ?? 1),
    receiptPath: row.receipt_path ? String(row.receipt_path) : undefined,
    receiptUrl: row.receipt_url ? String(row.receipt_url) : undefined,
    status,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

// ---------- Storage Uploads (`property-images` & `receipts`) ----------

export async function uploadPropertyImages(
  files: File[],
  ownerPhone: string
): Promise<RepoResult<string[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  const folder = normalizeEgyptianPhone(ownerPhone) || 'public';
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
      const uid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${folder}/${uid}.webp`;
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
  file: File,
  ownerPhone: string
): Promise<RepoResult<{ path: string; publicUrl: string }>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ في هذه البيئة.' };
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { data: null, error: 'حجم ملف الإيصال يجب أن يكون أقل من ٥ ميجابايت.' };
  }
  const ext = RECEIPT_MIME_EXT[file.type];
  if (!ext) {
    return { data: null, error: 'صيغة الإيصال غير مدعومة (يُقبل JPG, PNG, WebP, PDF).' };
  }

  const folder = normalizeEgyptianPhone(ownerPhone) || 'guest';
  const path = `${folder}/sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

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

    const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
    return { data: { path, publicUrl: pub.publicUrl }, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر رفع صورة الإيصال.'),
    };
  }
}

export async function resolveReceiptPreviewUrl(
  receiptUrl?: string,
  receiptPath?: string
): Promise<RepoResult<string>> {
  if (receiptUrl) {
    return { data: receiptUrl, error: null };
  }
  if (!receiptPath) {
    return { data: null, error: 'لا يوجد إيصال مرفق لهذا الاشتراك.' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }
  try {
    const signed = await supabase.storage.from('receipts').createSignedUrl(receiptPath, 300);
    if (!signed.error && signed.data?.signedUrl) {
      return { data: signed.data.signedUrl, error: null };
    }
    const { data: pub } = supabase.storage.from('receipts').getPublicUrl(receiptPath);
    if (pub.publicUrl) {
      return { data: pub.publicUrl, error: null };
    }
    return { data: null, error: 'تعذر عرض ملف الإيصال.' };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر فتح الإيصال.') };
  }
}

// ---------- Chalets CRUD (`chalets` table) ----------

export async function fetchAllChaletsFromDb(includeHidden = false): Promise<RepoResult<Chalet[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  try {
    let query = supabase.from('chalets').select('*');
    if (!includeHidden) {
      query = query.eq('availability_status', 'active');
    }
    const { data, error } = await query
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل قائمة الوحدات من قاعدة البيانات.'),
      };
    }

    return {
      data: (data ?? []).map((row) => mapChaletFromRow(row as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر الاتصال بقاعدة البيانات.'),
    };
  }
}

export async function fetchOwnerChaletsByPhone(
  ownerPhone: string
): Promise<RepoResult<Chalet[]>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: null };
  }
  const normalizedTarget = normalizeEgyptianPhone(ownerPhone);
  try {
    const { data, error } = await supabase
      .from('chalets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحميل وحداتك من قاعدة البيانات.'),
      };
    }

    const mapped = (data ?? [])
      .map((row) => mapChaletFromRow(row as Record<string, unknown>))
      .filter((c) => normalizeEgyptianPhone(c.ownerPhone) === normalizedTarget);

    return { data: mapped, error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر تحميل وحدات المعلن.'),
    };
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
  isFeatured: boolean;
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
}

export async function insertChaletRecord(
  payload: UpsertChaletPayload
): Promise<RepoResult<Chalet>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  const coordinates = resolveCoordinatesForLocation(payload.governorate, payload.city);
  const insertRow = {
    title: payload.title.trim(),
    description: payload.description.trim(),
    governorate: payload.governorate,
    city: payload.city.trim(),
    area_or_village: payload.areaOrVillage.trim(),
    property_type: payload.propertyType,
    advertiser_role: payload.advertiserRole,
    owner_name: payload.ownerName.trim(),
    owner_phone: normalizeEgyptianPhone(payload.ownerPhone),
    is_featured: payload.isFeatured,
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
    // Legacy compatibility fields if old NOT NULL constraints exist
    destination_label: payload.governorate,
    resort: payload.areaOrVillage.trim() || payload.city.trim() || payload.governorate,
    unit_type: payload.propertyType,
    view_type: 'city-nile',
  };

  try {
    const sb = requireSupabase();
    const { data, error } = await sb.from('chalets').insert(insertRow).select('*').single();
    if (error || !data) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر حفظ الوحدة في جدول chalets.'),
      };
    }
    return { data: mapChaletFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return {
      data: null,
      error: formatSupabaseError(err, 'تعذر نشر الوحدة الآن.'),
    };
  }
}

export async function updateChaletRecord(
  chaletId: string,
  updates: Partial<UpsertChaletPayload>
): Promise<RepoResult<Chalet>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title.trim();
  if (updates.description !== undefined) patch.description = updates.description.trim();
  if (updates.governorate !== undefined) {
    patch.governorate = updates.governorate;
    patch.destination_label = updates.governorate;
  }
  if (updates.city !== undefined) patch.city = updates.city.trim();
  if (updates.areaOrVillage !== undefined) {
    patch.area_or_village = updates.areaOrVillage.trim();
    patch.resort = updates.areaOrVillage.trim();
  }
  if (updates.propertyType !== undefined) {
    patch.property_type = updates.propertyType;
    patch.unit_type = updates.propertyType;
  }
  if (updates.advertiserRole !== undefined) patch.advertiser_role = updates.advertiserRole;
  if (updates.ownerName !== undefined) patch.owner_name = updates.ownerName.trim();
  if (updates.ownerPhone !== undefined)
    patch.owner_phone = normalizeEgyptianPhone(updates.ownerPhone);
  if (updates.isFeatured !== undefined) patch.is_featured = updates.isFeatured;
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
  if (updates.availabilityStatus !== undefined)
    patch.availability_status = updates.availabilityStatus;

  if (updates.governorate !== undefined || updates.city !== undefined) {
    patch.coordinates = resolveCoordinatesForLocation(updates.governorate, updates.city);
  }

  try {
    const { data, error } = await supabase
      .from('chalets')
      .update(patch)
      .eq('id', chaletId)
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث بيانات الوحدة.'),
      };
    }

    return { data: mapChaletFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر تعديل الوحدة.') };
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

// ---------- Subscriptions CRUD (`subscriptions` table) ----------

export async function fetchAllSubscriptions(): Promise<RepoResult<SubscriptionRecord[]>> {
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

    return {
      data: (data ?? []).map((row) => mapSubscriptionFromRow(row as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر تحميل الاشتراكات.') };
  }
}

export async function fetchSubscriptionsByPhone(
  ownerPhone: string
): Promise<RepoResult<SubscriptionRecord[]>> {
  const res = await fetchAllSubscriptions();
  if (res.error || !res.data) return res;
  const normalizedTarget = normalizeEgyptianPhone(ownerPhone);
  return {
    data: res.data.filter((s) => normalizeEgyptianPhone(s.ownerPhone) === normalizedTarget),
    error: null,
  };
}

export async function createSubscriptionRequest(payload: {
  ownerName: string;
  ownerPhone: string;
  planId: SubscriptionPlanId;
  planName: string;
  price: number;
  maxUnits: number;
  receiptPath?: string;
  receiptUrl?: string;
}): Promise<RepoResult<SubscriptionRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        owner_name: payload.ownerName.trim(),
        owner_phone: normalizeEgyptianPhone(payload.ownerPhone),
        plan_id: payload.planId,
        plan_name: payload.planName,
        price: payload.price,
        max_units: payload.maxUnits,
        receipt_path: payload.receiptPath ?? null,
        receipt_url: payload.receiptUrl ?? null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر إرسال طلب الاشتراك.'),
      };
    }

    return { data: mapSubscriptionFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر حفظ طلب الاشتراك.') };
  }
}

export async function reviewSubscriptionAdmin(
  subscriptionId: string,
  ownerPhone: string,
  decision: 'active' | 'rejected'
): Promise<RepoResult<SubscriptionRecord>> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: 'الاتصال بـ Supabase غير مهيأ.' };
  }

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId)
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: formatSupabaseError(error, 'تعذر تحديث حالة الاشتراك.'),
      };
    }

    // Automatically mark subscriber's units as featured when activated
    if (decision === 'active' && ownerPhone) {
      const normalized = normalizeEgyptianPhone(ownerPhone);
      const { data: allUnits } = await supabase.from('chalets').select('id, owner_phone');
      const matchingIds = (allUnits ?? [])
        .filter((u) => normalizeEgyptianPhone(String(u.owner_phone ?? '')) === normalized)
        .map((u) => String(u.id));

      if (matchingIds.length > 0) {
        await supabase.from('chalets').update({ is_featured: true }).in('id', matchingIds);
      }
    }

    return { data: mapSubscriptionFromRow(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err, 'تعذر مراجعة الاشتراك.') };
  }
}
