import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ||
  ''
).trim();
const rawAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  ''
).trim();

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(isValidHttpUrl(rawUrl) && rawAnonKey.length > 0);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawUrl, rawAnonKey)
  : null;

export interface SupabaseConfigStatus {
  configured: boolean;
  urlPresent: boolean;
  urlValid: boolean;
  anonKeyPresent: boolean;
  urlHost: string | null;
  missingVars: string[];
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const urlPresent = rawUrl.length > 0;
  const urlValid = isValidHttpUrl(rawUrl);
  const anonKeyPresent = rawAnonKey.length > 0;
  const missingVars: string[] = [];

  if (!urlPresent || !urlValid) missingVars.push('VITE_SUPABASE_URL');
  if (!anonKeyPresent) missingVars.push('VITE_SUPABASE_ANON_KEY');

  let urlHost: string | null = null;
  if (urlValid) {
    try {
      urlHost = new URL(rawUrl).host;
    } catch {
      urlHost = null;
    }
  }

  return {
    configured: isSupabaseConfigured,
    urlPresent,
    urlValid,
    anonKeyPresent,
    urlHost,
    missingVars,
  };
}

export interface SupabaseUnitsTestResult {
  configured: boolean;
  ok: boolean;
  missingVars: string[];
  tableName: 'chalets';
  count: number;
  sampleRows: {
    id: string;
    title: string;
    resort?: string;
    pricePerNight?: number;
  }[];
  bookingsOk?: boolean;
  bookingsCount?: number;
  bookingsError?: string;
  receiptsBucketChecked?: boolean;
  error?: string;
  checkedAt: string;
}

export async function testSupabaseUnitsConnection(): Promise<SupabaseUnitsTestResult> {
  const status = getSupabaseConfigStatus();
  const checkedAt = new Date().toISOString();

  if (!status.configured || !supabase) {
    return {
      configured: false,
      ok: false,
      missingVars: status.missingVars,
      tableName: 'chalets',
      count: 0,
      sampleRows: [],
      error:
        status.urlPresent && !status.urlValid
          ? 'صيغة VITE_SUPABASE_URL غير صالحة (يجب أن تبدأ بـ https://).'
          : 'المتغيرات البيئية لـ Supabase غير مضبوطة بعد في لوحة Secrets.',
      checkedAt,
    };
  }

  try {
    const [chaletsRes, bookingsRes] = await Promise.all([
      supabase
        .from('chalets')
        .select('id, title, resort, price_per_night', { count: 'exact' })
        .limit(5),
      supabase.from('bookings').select('id', { count: 'exact' }).limit(1),
    ]);

    if (chaletsRes.error) {
      return {
        configured: true,
        ok: false,
        missingVars: [],
        tableName: 'chalets',
        count: 0,
        sampleRows: [],
        bookingsOk: !bookingsRes.error,
        bookingsCount: typeof bookingsRes.count === 'number' ? bookingsRes.count : 0,
        bookingsError: bookingsRes.error?.message,
        error: `${chaletsRes.error.message}${chaletsRes.error.code ? ` (${chaletsRes.error.code})` : ''}`,
        checkedAt,
      };
    }

    const rows = Array.isArray(chaletsRes.data)
      ? chaletsRes.data.map((row: Record<string, unknown>) => ({
          id: String(row.id ?? ''),
          title: String(row.title ?? 'وحدة بدون عنوان'),
          resort: row.resort ? String(row.resort) : undefined,
          pricePerNight:
            typeof row.price_per_night === 'number' ? row.price_per_night : undefined,
        }))
      : [];

    return {
      configured: true,
      ok: true,
      missingVars: [],
      tableName: 'chalets',
      count: typeof chaletsRes.count === 'number' ? chaletsRes.count : rows.length,
      sampleRows: rows,
      bookingsOk: !bookingsRes.error,
      bookingsCount: typeof bookingsRes.count === 'number' ? bookingsRes.count : 0,
      bookingsError: bookingsRes.error?.message,
      receiptsBucketChecked: true,
      checkedAt,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      missingVars: [],
      tableName: 'chalets',
      count: 0,
      sampleRows: [],
      error: err instanceof Error ? err.message : 'فشل الاتصال بجدول chalets في Supabase',
      checkedAt,
    };
  }
}
