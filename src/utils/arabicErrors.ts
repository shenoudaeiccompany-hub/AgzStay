export const MESSAGES: Record<string, string> = {
  not_authenticated: 'يجب تسجيل الدخول أولاً',
  dates_unavailable: 'هذه التواريخ غير متاحة',
  owner_not_verified: 'يجب توثيق حسابك قبل نشر الإعلان',
  phone_invalid: 'رقم الموبايل غير صحيح (مثال: 01012345678)',
  policy_not_accepted: 'يجب الموافقة على سياسة الإلغاء',
  duplicate_request: 'لديك طلب سابق لنفس التواريخ',
  invalid_state: 'لا يمكن تنفيذ هذا الإجراء في حالة الحجز الحالية',
  stay_not_finished: 'لا يمكن إنهاء الحجز قبل تاريخ المغادرة',
  listing_suspended: 'هذا الإعلان موقوف من الإدارة',
  invalid_guests: 'عدد الضيوف يتجاوز سعة الوحدة',
  invalid_dates: 'التواريخ غير صحيحة',
  cannot_book_own: 'لا يمكنك حجز وحدتك',
  forbidden: 'غير مسموح لك بهذا الإجراء',
  'row-level security': 'غير مسموح لك بهذا الإجراء',
  'duplicate key': 'هذا السجل موجود بالفعل',
};

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

export function toArabicError(
  err: { message?: string; code?: string; details?: string } | null | undefined
): string {
  const msg = err?.message ?? '';
  const code = err?.code ?? '';

  const exactKey = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (exactKey) {
    return MESSAGES[exactKey];
  }

  const lowerMsg = msg.toLowerCase();
  const caseInsensitiveKey = Object.keys(MESSAGES).find((k) =>
    lowerMsg.includes(k.toLowerCase())
  );
  if (caseInsensitiveKey) {
    return MESSAGES[caseInsensitiveKey];
  }

  if (code === '23P01' || lowerMsg.includes('bookings_no_overlap')) {
    return MESSAGES.dates_unavailable;
  }
  if (code === '23505') {
    return MESSAGES['duplicate key'];
  }
  if (code === '42501' || lowerMsg.includes('permission denied')) {
    return MESSAGES.forbidden;
  }

  return 'حدث خطأ غير متوقع، حاول مرة أخرى';
}

export function formatSupabaseError(err: unknown, fallback?: string): string {
  const defaultFallback = fallback ?? 'حدث خطأ غير متوقع، حاول مرة أخرى';
  if (!err) return defaultFallback;

  const obj =
    typeof err === 'string'
      ? { message: err }
      : (err as { code?: string; message?: string; details?: string });

  const msg = obj.message ?? '';
  const lowerMsg = msg.toLowerCase();

  // Check standard domain & Postgres keys via toArabicError first
  const mapped = toArabicError(obj);
  if (mapped !== 'حدث خطأ غير متوقع، حاول مرة أخرى') {
    return mapped;
  }

  // Supabase Auth & network messages
  if (lowerMsg.includes('invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (lowerMsg.includes('email not confirmed')) {
    return 'يرجى تأكيد بريدك الإلكتروني أولاً عبر الرابط المرسل إليك.';
  }
  if (lowerMsg.includes('user already registered')) {
    return 'هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة.';
  }
  if (lowerMsg.includes('password should be at least')) {
    return 'كلمة المرور يجب أن تتكون من ٦ أحرف على الأقل.';
  }
  if (lowerMsg.includes('jwt expired') || lowerMsg.includes('session not found')) {
    return MESSAGES.not_authenticated;
  }
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('network')) {
    return 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.';
  }

  // Preserve custom Arabic RPC exceptions raised directly by our SQL functions
  if (msg && ARABIC_CHAR_REGEX.test(msg)) {
    return msg;
  }

  return defaultFallback;
}
