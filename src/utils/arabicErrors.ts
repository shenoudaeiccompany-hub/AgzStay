export const MESSAGES: Record<string, string> = {
  not_authenticated: 'يجب تسجيل الدخول أولاً للمتابعة.',
  quota_exceeded:
    'لقد وصلت إلى الحد الأقصى لعدد الإعلانات المسموح بها في باقتك الحالية. قم بالترقية لإضافة المزيد.',
  rate_limited:
    'تم تجاوز الحد المسموح به لعرض أرقام التواصل خلال هذه الساعة، يرجى المحاولة لاحقاً.',
  contact_not_available: 'رقم التواصل الخاص بهذا الإعلان غير متاح حالياً.',
  duplicate_request: 'لديك طلب اشتراك قيد المراجعة بالفعل. يرجى انتظار مراجعة الإدارة.',
  invalid_plan: 'الباقة المختارة غير متاحة حالياً.',
  subscription_not_found: 'تعذر العثور على طلب الاشتراك المطلوب.',
  already_reviewed: 'تمت مراجعة طلب الاشتراك هذا مسبقاً.',
  dates_unavailable: 'هذه التواريخ غير متاحة.',
  owner_not_verified: 'يجب توثيق حسابك قبل نشر الإعلان.',
  phone_invalid: 'رقم الموبايل المصري غير صحيح (يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ومكون من ١١ رقماً).',
  policy_not_accepted: 'يجب الموافقة على الشروط والأحكام.',
  invalid_state: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية.',
  listing_suspended: 'هذا الإعلان موقوف حالياً من الإدارة.',
  forbidden_status: 'غير مسموح بتغيير حالة الإعلان إلى هذه الحالة.',
  forbidden: 'غير مسموح لك بتنفيذ هذا الإجراء.',
  'row-level security': 'غير مسموح لك بتنفيذ هذا الإجراء (صلاحيات غير كافية).',
  'duplicate key': 'هذا السجل موجود بالفعل.',
  plan_is_free: 'الباقة المجانية لا تحتاج إلى اشتراك.',
  invalid_receipt_path: 'ملف الإيصال غير صالح، أعد رفعه ثم حاول مجدداً.',
  invalid_document_path: 'ملف مستند التوثيق غير صالح، أعد رفعه ثم حاول مجدداً.',
  owner_missing: 'هذا الاشتراك غير مربوط بحساب معلن بعد. اربط الحساب أولاً.',
  chalet_not_found: 'الإعلان غير موجود أو غير منشور.',
  profile_not_found: 'لم يتم العثور على الملف الشخصي المطلوب.',
  report_not_found: 'تعذر العثور على البلاغ المطلوب.',
  duplicate_report: 'لقد أرسلت بلاغاً عن هذا الإعلان خلال الـ ٢٤ ساعة الماضية.',
  ticket_not_found: 'تعذر العثور على تذكرة الدعم المطلوبة.',
  cannot_book_own: 'لا يمكنك حجز وحدتك الخاصة — يمكنك إدارة التواريخ من بوابة المعلن.',
  invalid_dates: 'تواريخ الوصول والمغادرة غير صالحة (يجب أن يكون تاريخ المغادرة بعد الوصول ومن اليوم فصاعداً).',
  invalid_guests: 'عدد الضيوف غير صالح أو يتجاوز الحد الأقصى المسموح به للوحدة.',
  not_found: 'العنصر المطلوب غير موجود.',
  chalets_limits_chk:
    'إحدى بيانات الإعلان خارج الحدود المسموحة (عنوان طويل، صور كثيرة، أو سعر غير منطقي).',
};

// Match longest keys first so shorter prefixes (e.g. `forbidden`) don't swallow `forbidden_status`
const MESSAGE_KEYS = Object.keys(MESSAGES).sort((a, b) => b.length - a.length);

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

export function toArabicError(
  err: { message?: string; code?: string; details?: string } | null | undefined
): string {
  const msg = err?.message ?? '';
  const code = err?.code ?? '';

  const exactKey = MESSAGE_KEYS.find((k) => msg.includes(k));
  if (exactKey) {
    return MESSAGES[exactKey];
  }

  const lowerMsg = msg.toLowerCase();
  const caseInsensitiveKey = MESSAGE_KEYS.find((k) =>
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

export function extractErrorCodeKey(err: unknown): string | null {
  if (!err) return null;
  const msg =
    typeof err === 'string'
      ? err
      : String((err as { message?: string; details?: string }).message ?? '');
  const lower = msg.toLowerCase();
  const keys = [
    'not_authenticated',
    'quota_exceeded',
    'rate_limited',
    'contact_not_available',
    'duplicate_request',
    'invalid_plan',
    'plan_is_free',
    'invalid_receipt_path',
    'invalid_document_path',
    'duplicate_report',
    'report_not_found',
    'ticket_not_found',
    'cannot_book_own',
    'invalid_dates',
    'invalid_guests',
    'dates_unavailable',
    'policy_not_accepted',
    'listing_suspended',
    'invalid_state',
    'owner_missing',
    'chalet_not_found',
    'profile_not_found',
    'forbidden_status',
    'phone_invalid',
    'forbidden',
  ];
  return keys.find((k) => lower.includes(k)) ?? null;
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
  if (lowerMsg.includes('different from the old password') || lowerMsg.includes('same_password')) {
    return 'يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.';
  }
  if (lowerMsg.includes('rate limit') || lowerMsg.includes('email rate limit exceeded')) {
    return 'تم إرسال طلبات كثيرة في وقت قصير، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
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
