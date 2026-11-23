import { describe, expect, it } from 'vitest';
import { requireSupabase } from '@/lib/supabase';
import { formatSupabaseError, MESSAGES, toArabicError } from '@/utils/arabicErrors';

describe('arabicErrors utilities', () => {
  it('maps every predefined error key in MESSAGES via toArabicError', () => {
    for (const [key, expectedMessage] of Object.entries(MESSAGES)) {
      expect(toArabicError({ message: `Error: ${key}` })).toBe(expectedMessage);
    }
  });

  it('handles null, undefined, and unknown errors with default Arabic fallback', () => {
    const fallback = 'حدث خطأ غير متوقع، حاول مرة أخرى';
    expect(toArabicError(null)).toBe(fallback);
    expect(toArabicError(undefined)).toBe(fallback);
    expect(toArabicError({ message: 'some_unknown_internal_error' })).toBe(fallback);
  });

  it('maps PostgreSQL error codes via toArabicError', () => {
    expect(toArabicError({ code: '23P01', message: 'conflicting key value' })).toBe(
      MESSAGES.dates_unavailable
    );
    expect(toArabicError({ code: '23505', message: 'unique violation' })).toBe(
      MESSAGES['duplicate key']
    );
    expect(toArabicError({ code: '42501', message: 'insufficient privilege' })).toBe(
      MESSAGES.forbidden
    );
  });

  it('formatSupabaseError translates auth errors and preserves Arabic RPC messages', () => {
    expect(formatSupabaseError({ message: 'Invalid login credentials' }, 'فشل')).toBe(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
    );
    expect(
      formatSupabaseError({ message: 'التاريخ 2026-07-01 مغلق من قِبل المالك' }, 'فشل')
    ).toBe('التاريخ 2026-07-01 مغلق من قِبل المالك');
    expect(formatSupabaseError({ message: 'unexpected english sql trace' }, 'تعذر الحفظ.')).toBe(
      'تعذر الحفظ.'
    );
  });

  it('requireSupabase throws clear Arabic error when Supabase is not configured', () => {
    expect(() => requireSupabase()).toThrow('Supabase غير مضبوط');
  });
});
