import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { INITIAL_BOOKINGS, INITIAL_RENTER_TRUST_REVIEWS } from '@/data/chalets';
import type {
  AppUser,
  BookingRequest,
  Chalet,
  ChaletReview,
  ListingReport,
  OwnerVerificationSubmission,
  RenterTrustReview,
} from '@/types/chalet';

const STORAGE_KEYS = {
  favorites: 'masayef_favorites_v1',
  bookings: 'masayef_bookings_v1',
  customChalets: 'masayef_custom_chalets_v1',
  chaletOverrides: 'masayef_chalet_overrides_v1',
  reviews: 'masayef_reviews_v1',
  renterReviews: 'agzstay_renter_trust_v1',
  reports: 'agzstay_reports_v1',
  compareIds: 'masayef_compare_v1',
  user: 'masayef_user_v1',
  verification: 'masayef_owner_verification_v1',
  pwaDismissed: 'agzstay_pwa_banner_dismissed_v1',
} as const;

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

export const masayefStorageKeys = STORAGE_KEYS;

export function loadInitialRenterTrustReviews(): RenterTrustReview[] {
  return loadLocalJson<RenterTrustReview[]>(
    STORAGE_KEYS.renterReviews,
    INITIAL_RENTER_TRUST_REVIEWS
  );
}

export function loadInitialBookings(): BookingRequest[] {
  return loadLocalJson<BookingRequest[]>(STORAGE_KEYS.bookings, INITIAL_BOOKINGS);
}

export async function uploadChaletImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];

  if (isSupabaseConfigured && supabase) {
    const uploadedUrls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('chalet-images')
        .upload(path, file, { upsert: false });

      if (!error) {
        const { data } = supabase.storage.from('chalet-images').getPublicUrl(path);
        if (data?.publicUrl) {
          uploadedUrls.push(data.publicUrl);
          continue;
        }
      }
      uploadedUrls.push(await fileToDataUrl(file));
    }
    return uploadedUrls;
  }

  return Promise.all(files.map((file) => fileToDataUrl(file)));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export async function fetchRemoteChalets(): Promise<Chalet[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('chalets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data as unknown as Chalet[];
  } catch {
    return null;
  }
}

export async function persistRemoteChalet(chalet: Chalet): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('chalets').upsert(chalet);
  } catch {
    // Keep local state resilient when schema/RLS differs
  }
}

export async function persistRemoteBooking(booking: BookingRequest): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('bookings').upsert(booking);
  } catch {
    // Keep local state resilient
  }
}

export async function persistRemoteReview(review: ChaletReview): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('reviews').upsert(review);
  } catch {
    // Keep local state resilient
  }
}

export async function persistRemoteRenterTrustReview(
  review: RenterTrustReview
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('renter_trust_reviews').upsert(review);
  } catch {
    // Keep local state resilient
  }
}

export async function persistRemoteReport(report: ListingReport): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('listing_reports').upsert(report);
  } catch {
    // Keep local state resilient
  }
}

export async function signInWithSupabaseOrLocal(payload: {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role: 'guest' | 'owner';
  isSignUp: boolean;
}): Promise<{ user: AppUser; error?: string }> {
  if (isSupabaseConfigured && supabase) {
    try {
      const result = payload.isSignUp
        ? await supabase.auth.signUp({
            email: payload.email,
            password: payload.password,
            options: {
              data: {
                name: payload.name || payload.email.split('@')[0],
                phone: payload.phone || '',
                role: payload.role,
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email: payload.email,
            password: payload.password,
          });

      if (result.error) {
        return {
          user: {
            id: '',
            name: '',
            email: '',
            role: payload.role,
          },
          error: result.error.message,
        };
      }

      const authUser = result.data.user;
      if (authUser) {
        return {
          user: {
            id: authUser.id,
            name:
              (authUser.user_metadata?.name as string | undefined) ||
              payload.name ||
              payload.email.split('@')[0],
            email: authUser.email || payload.email,
            phone: (authUser.user_metadata?.phone as string | undefined) || payload.phone,
            role: (authUser.user_metadata?.role as 'guest' | 'owner' | undefined) || payload.role,
            isLocalDemo: false,
          },
        };
      }
    } catch (err) {
      return {
        user: { id: '', name: '', email: '', role: payload.role },
        error: err instanceof Error ? err.message : 'تعذر تسجيل الدخول',
      };
    }
  }

  return {
    user: {
      id: `local-${Date.now()}`,
      name: payload.name?.trim() || payload.email.split('@')[0] || 'مستخدم إجازة ستاي',
      email: payload.email.trim(),
      phone: payload.phone?.trim(),
      role: payload.role,
      isLocalDemo: true,
    },
  };
}

export async function signOutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore remote sign out failure
    }
  }
}

export function loadInitialVerification(): OwnerVerificationSubmission | null {
  return loadLocalJson<OwnerVerificationSubmission | null>(
    STORAGE_KEYS.verification,
    null
  );
}
