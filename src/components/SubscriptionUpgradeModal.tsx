import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ImagePlus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  FREE_TIER_MAX_UNITS,
  PRO_TIER_MAX_UNITS,
  PRO_TIER_MONTHLY_FEE,
  formatEGP,
} from '@/data/chalets';
import { useModal } from '@/hooks/useModal';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  uploadSubscriptionReceipt,
  type RepoResult,
} from '@/services/agzstayRepository';
import type { HostSubscriptionRecord, PaymentMethod } from '@/types/chalet';

interface SubscriptionUpgradeModalProps {
  defaultHostName?: string;
  defaultHostPhone?: string;
  existingSubscription?: HostSubscriptionRecord | null;
  onClose: () => void;
  onSubmitUpgradeRequest: (payload: {
    hostName: string;
    hostPhone: string;
    paymentMethod: PaymentMethod;
    senderPhoneOrHandle: string;
    transferReference: string;
    receiptPath?: string;
  }) => Promise<RepoResult<HostSubscriptionRecord>>;
}

const PLATFORM_PAYMENT_ACCOUNTS: {
  id: PaymentMethod;
  label: string;
  target: string;
  hint: string;
}[] = [
  {
    id: 'instapay',
    label: 'إنستاباي (InstaPay)',
    target: 'agzstay.pay@instapay',
    hint: 'تحويل فوري بدون رسوم عبر تطبيق إنستاباي',
  },
  {
    id: 'vodafone-cash',
    label: 'فودافون كاش',
    target: '01000000000',
    hint: 'محفظة فودافون كاش الرسمية لتفعيل الباقات',
  },
  {
    id: 'orange-cash',
    label: 'أورنج كاش',
    target: '01000000000',
    hint: 'محفظة أورنج كاش لتحصيل الاشتراك الشهري',
  },
  {
    id: 'etisalat-cash',
    label: 'اتصالات كاش',
    target: '01000000000',
    hint: 'محفظة اتصالات كاش لتفعيل الاشتراك خلال دقائق',
  },
];

export function SubscriptionUpgradeModal({
  defaultHostName = '',
  defaultHostPhone = '',
  existingSubscription,
  onClose,
  onSubmitUpgradeRequest,
}: SubscriptionUpgradeModalProps) {
  const modalRef = useModal<HTMLDivElement>({ onClose });
  const [hostName, setHostName] = useState(
    existingSubscription?.hostName || defaultHostName
  );
  const [hostPhone, setHostPhone] = useState(
    existingSubscription?.hostPhone || defaultHostPhone
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('instapay');
  const [senderPhoneOrHandle, setSenderPhoneOrHandle] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [receiptPath, setReceiptPath] = useState<string | undefined>(undefined);
  const [receiptPreviewName, setReceiptPreviewName] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const selectedChannel =
    PLATFORM_PAYMENT_ACCOUNTS.find((a) => a.id === paymentMethod) ??
    PLATFORM_PAYMENT_ACCOUNTS[0];

  const handleCopyTarget = async () => {
    try {
      await navigator.clipboard?.writeText(selectedChannel.target);
      setCopiedTarget(true);
      setTimeout(() => setCopiedTarget(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupabaseConfigured) {
      setError('وضع تجريبي: رفع الإيصال معطل لعدم إعداد Supabase.');
      e.target.value = '';
      return;
    }
    setError('');
    setIsUploadingReceipt(true);
    try {
      const res = await uploadSubscriptionReceipt(file);
      if (res.error || !res.data) {
        setError(res.error || 'تعذر رفع إيصال التحويل.');
        e.target.value = '';
        return;
      }
      setReceiptPath(res.data.path);
      setReceiptPreviewName(file.name);
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('وضع تجريبي: إرسال طلب الترقية معطل لعدم إعداد Supabase.');
      return;
    }
    if (!hostName.trim()) {
      setError('يرجى إدخال اسم المالك أو المكتب.');
      return;
    }
    if (!/^01[0125][0-9]{8}$/.test(hostPhone.trim())) {
      setError('يرجى إدخال رقم موبايل مصري صحيح للمالك (١١ رقماً).');
      return;
    }
    if (!senderPhoneOrHandle.trim()) {
      setError('يرجى إدخال رقم المحول منه أو حساب إنستاباي المرسل.');
      return;
    }
    if (!transferReference.trim() && !receiptPath) {
      setError('يرجى إدخال رقم العملية المرجعي أو إرفاق صورة إيصال التحويل.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const res = await onSubmitUpgradeRequest({
        hostName: hostName.trim(),
        hostPhone: hostPhone.trim(),
        paymentMethod,
        senderPhoneOrHandle: senderPhoneOrHandle.trim(),
        transferReference: transferReference.trim() || `IMG-${Date.now().toString().slice(-6)}`,
        receiptPath,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="الترقية للباقة الاحترافية Pro"
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
              <Crown className="h-3.5 w-3.5 text-amber-600" />
              نظام باقات الملاك والوسطاء — إجازة ستاي
            </span>
            <h2 className="mt-1.5 text-xl font-extrabold text-slate-900 sm:text-2xl">
              اشترك في الباقة الاحترافية (Pro) وضاعف حجوزاتك
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Plans Comparison */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-sand-50/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-slate-800">
                الباقة الأساسية (Free)
              </span>
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                مجانية ١٠٠٪
              </span>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">٠ ج.م</div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success-600" />
                نشر وحدة إيجار واحدة ({FREE_TIER_MAX_UNITS} وحدة نشطة)
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success-600" />
                تقويم التوافر والأسعار وإدارة الطلبات
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success-600" />
                الظهور القياسي في نتائج البحث
              </li>
            </ul>
          </div>

          <div className="relative rounded-2xl border-2 border-amber-400 bg-gradient-to-bl from-amber-50 via-white to-secondary-50/50 p-4 shadow-sm">
            <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
              <Sparkles className="h-3 w-3" />
              الأكثر مبيعاً للملاك
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-primary-800">
                الباقة الاحترافية (Pro)
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                اشتراك رمزي
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-primary-700">
                {formatEGP(PRO_TIER_MONTHLY_FEE)}
              </span>
              <span className="text-xs font-semibold text-slate-500">/ شهرياً</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs font-semibold text-slate-700">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-secondary-600" />
                نشر وإدارة حتى {PRO_TIER_MAX_UNITS} وحدات نشطة
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-secondary-600" />
                تثبيت وأولوية قصوى في مقدمة نتائج البحث
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-secondary-600" />
                شارة ثقة &quot;مالك موثق / شريك مميز&quot; على جميع وحداتك
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-secondary-600" />
                تقارير مالية متقدمة للدخل السنوي ونسب الإشغال
              </li>
            </ul>
          </div>
        </div>

        {submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-3 text-base font-extrabold text-emerald-950">
              تم استلام طلب الاشتراك المرجعي بنجاح!
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800">
              حالة الطلب الآن: <strong>في انتظار مراجعة الإدارة (Pending Verification)</strong>.
              سيتم تفعيل الباقة الاحترافية وشارة &quot;شريك مميز&quot; لوحداتك فور مطابقة التحويل من لوحة الإدارة العامة.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-primary-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-primary-700"
            >
              العودة للوحة التحكم
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 border-t border-slate-100 pt-5">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-primary-800">
                <Wallet className="h-4 w-4 text-secondary-500" />
                ١. اختر وسيلة الدفع وحوّل قيمة الاشتراك ({formatEGP(PRO_TIER_MONTHLY_FEE)})
              </h3>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLATFORM_PAYMENT_ACCOUNTS.map((method) => {
                  const active = paymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition ${
                        active
                          ? 'border-secondary-500 bg-secondary-50 text-secondary-800 ring-2 ring-secondary-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-sand-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-secondary-600" />
                        <span>{method.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-secondary-200 bg-secondary-50/70 p-3.5 text-xs">
                <div>
                  <div className="font-bold text-secondary-900">{selectedChannel.label}</div>
                  <div className="text-[11px] text-secondary-700">{selectedChannel.hint}</div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
                  <span dir="ltr" className="font-extrabold text-primary-700">
                    {selectedChannel.target}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyTarget}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700 hover:bg-primary-100"
                  >
                    {copiedTarget ? (
                      <Check className="h-3 w-3 text-success-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedTarget ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-sand-50/60 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-primary-600" />
                ٢. نموذج تأكيد التحويل للتفعيل السريع
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    اسم المالك أو المكتب
                  </label>
                  <input
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="مثال: م. شريف عبد الرحمن"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    رقم موبايل المالك المسجل
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={hostPhone}
                    onChange={(e) => setHostPhone(e.target.value)}
                    placeholder="01000000000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    رقم المحول منه / حساب InstaPay المرسل
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={senderPhoneOrHandle}
                    onChange={(e) => setSenderPhoneOrHandle(e.target.value)}
                    placeholder="010xxxxxxxx أو name@instapay"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    رقم العملية المرجعي (Reference ID)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                    placeholder="مثال: IPN-84920174"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-secondary-200 bg-white px-3.5 py-2 text-xs font-bold text-secondary-700 hover:bg-secondary-50">
                  <ImagePlus className="h-4 w-4" />
                  <span>
                    {isUploadingReceipt
                      ? 'جاري رفع الإيصال...'
                      : receiptPath
                      ? `تم رفع الإيصال (${receiptPreviewName || 'مرفق'})`
                      : 'إرفاق لقطة شاشة للتحويل (اختياري)'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleReceiptUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-bold text-error-700">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isUploadingReceipt || isSubmitting || !isSupabaseConfigured}
                className="inline-flex items-center gap-1.5 rounded-xl bg-secondary-500 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-secondary-600 disabled:opacity-60"
              >
                <Crown className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'جاري الإرسال...'
                    : 'إرسال طلب تفعيل الباقة الاحترافية'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
