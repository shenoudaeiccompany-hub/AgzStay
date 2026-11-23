import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Crown,
  Database,
  Eye,
  Image as ImageIcon,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { formatEGP } from '@/data/chalets';
import { useModal } from '@/hooks/useModal';
import {
  getSupabaseConfigStatus,
  testSupabaseUnitsConnection,
  type SupabaseUnitsTestResult,
} from '@/lib/supabase';
import {
  getBookingReceiptSignedUrl,
  getVerificationDocSignedUrl,
  type RepoResult,
} from '@/services/agzstayRepository';
import type {
  AppUser,
  BookingRequest,
  Chalet,
  HostSubscriptionRecord,
  OwnerVerificationSubmission,
  PaymentMethod,
  SubscriptionStatus,
} from '@/types/chalet';
import { formatArabicDate } from '@/utils/bookingPricing';

interface AdminDashboardProps {
  currentUser: AppUser | null;
  chalets: Chalet[];
  bookings: BookingRequest[];
  subscriptions: HostSubscriptionRecord[];
  verifications: OwnerVerificationSubmission[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onApproveBooking: (bookingId: string) => Promise<void> | void;
  onRejectBooking: (bookingId: string, reason?: string) => Promise<void> | void;
  onApproveSubscription: (subscriptionId: string) => Promise<void> | void;
  onExpireSubscription: (subscriptionId: string) => Promise<void> | void;
  onReviewVerification: (
    verificationId: string,
    decision: 'verified' | 'unverified',
    rejectionReason?: string
  ) => Promise<RepoResult<OwnerVerificationSubmission>> | void;
  onBackToBrowse: () => void;
}

const SUPABASE_SETUP_SQL = `-- شغّل ملف الترحيل الكامل في Supabase SQL Editor:
-- supabase/migrations/001_init.sql
-- يتضمن: profiles, chalets, chalet_contacts, bookings (btree_gist no overlap),
-- reviews, renter_trust_reviews, listing_reports, owner_verifications, host_subscriptions
-- مع سياسات RLS الكاملة وباكتات chalet-images و verification-docs و receipts`;

function getPaymentMethodLabel(method?: PaymentMethod): string {
  switch (method) {
    case 'instapay':
      return 'إنستاباي (InstaPay)';
    case 'vodafone-cash':
      return 'فودافون كاش';
    case 'orange-cash':
      return 'أورنج كاش';
    case 'etisalat-cash':
      return 'اتصالات كاش';
    default:
      return 'غير محدد';
  }
}

export function AdminDashboard({
  currentUser,
  chalets,
  bookings,
  subscriptions,
  verifications,
  loading = false,
  error = null,
  onRetry,
  onApproveBooking,
  onRejectBooking,
  onApproveSubscription,
  onExpireSubscription,
  onReviewVerification,
  onBackToBrowse,
}: AdminDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [supabaseResult, setSupabaseResult] = useState<SupabaseUnitsTestResult | null>(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [showSqlGuide, setShowSqlGuide] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [loadingReceiptBookingId, setLoadingReceiptBookingId] = useState<string | null>(null);
  const [loadingVerificationId, setLoadingVerificationId] = useState<string | null>(null);
  const [rejectingVerId, setRejectingVerId] = useState<string | null>(null);
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [receiptModalState, setReceiptModalState] = useState<{
    booking?: BookingRequest;
    title: string;
    subtitle: string;
    imageUrl: string | null;
    isSignedUrl: boolean;
    error?: string;
  } | null>(null);
  const receiptModalRef = useModal<HTMLDivElement>({
    isOpen: Boolean(receiptModalState),
    onClose: () => setReceiptModalState(null),
  });

  const supabaseConfig = useMemo(() => getSupabaseConfigStatus(), []);

  const pendingVerifications = useMemo(
    () => verifications.filter((v) => v.status === 'pending'),
    [verifications]
  );

  const pendingBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === 'payment_submitted' ||
          b.status === 'pending_verification' ||
          b.status === 'pending' ||
          b.status === 'approved'
      ),
    [bookings]
  );

  const pendingSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === 'pending-verification'),
    [subscriptions]
  );

  const activeProCount = useMemo(
    () => subscriptions.filter((s) => s.tier === 'pro' && s.status === 'active').length,
    [subscriptions]
  );

  const totalSubscriptionRevenue = useMemo(
    () =>
      subscriptions
        .filter((s) => s.tier === 'pro' && (s.status === 'active' || s.status === 'expired'))
        .reduce((sum, s) => sum + s.monthlyFee, 0),
    [subscriptions]
  );

  const filteredSubscriptions = useMemo(() => {
    if (statusFilter === 'all') return subscriptions;
    return subscriptions.filter((s) => s.status === statusFilter);
  }, [subscriptions, statusFilter]);

  const forfeitedDisputes = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === 'cancelled' && (b.depositForfeited || (b.forfeitedAmount ?? 0) > 0)
      ),
    [bookings]
  );

  const handleTestSupabaseUnits = async () => {
    setIsTestingSupabase(true);
    try {
      const result = await testSupabaseUnitsConnection();
      setSupabaseResult(result);
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard?.writeText(SUPABASE_SETUP_SQL);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handlePreviewBookingReceipt = async (booking: BookingRequest) => {
    setLoadingReceiptBookingId(booking.id);
    try {
      const result = await getBookingReceiptSignedUrl(booking.receiptPath);
      setReceiptModalState({
        booking,
        title: 'معاينة إيصال تحويل العربون (InstaPay)',
        subtitle: `${booking.guestName} • ${booking.chaletTitle}`,
        imageUrl: result.data,
        isSignedUrl: Boolean(result.data),
        error: result.error ?? undefined,
      });
    } finally {
      setLoadingReceiptBookingId(null);
    }
  };

  const handlePreviewVerificationDoc = async (ver: OwnerVerificationSubmission) => {
    const key = ver.id || ver.documentPath || ver.ownerName;
    setLoadingVerificationId(key);
    try {
      const result = await getVerificationDocSignedUrl(ver.documentPath);
      setReceiptModalState({
        title: 'معاينة مستند توثيق المالك',
        subtitle: `${ver.ownerName} • ${ver.documentNumber}`,
        imageUrl: result.data,
        isSignedUrl: Boolean(result.data),
        error: result.error ?? undefined,
      });
    } finally {
      setLoadingVerificationId(null);
    }
  };

  const handlePreviewSubReceipt = async (sub: HostSubscriptionRecord) => {
    const result = await getBookingReceiptSignedUrl(sub.receiptPath);
    setReceiptModalState({
      title: 'معاينة إيصال اشتراك Pro',
      subtitle: `${sub.hostName} • مرجع: ${sub.transferReference || '—'}`,
      imageUrl: result.data,
      isSignedUrl: Boolean(result.data),
      error: result.error ?? undefined,
    });
  };

  if (currentUser?.role !== 'admin') {
    return (
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <div className="rounded-3xl border border-error-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-12 w-12 text-error-500" />
          <h1 className="mt-3 text-xl font-extrabold text-slate-900">
            هذه الصفحة مخصصة للإدارة العامة فقط
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            لا يملك حسابك الحالي صلاحية <code className="font-mono">admin</code> للوصول إلى لوحة الإدارة.
          </p>
          <button
            type="button"
            onClick={onBackToBrowse}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-primary-700"
          >
            <ArrowRight className="h-4 w-4" />
            <span>العودة لتصفح الوحدات</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      {loading && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs font-bold text-primary-800">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>جاري تحديث بيانات الإدارة العامة من الخادم...</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-xs font-bold text-error-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-error-600" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-error-700 shadow-sm hover:bg-error-100"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      )}

      {/* Admin Hero Header */}
      <div className="rounded-3xl bg-gradient-to-bl from-slate-900 via-primary-900 to-primary-700 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-amber-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              لوحة تحكم الإدارة العامة (Super Admin Hub)
            </span>
            <h1 className="mt-2.5 text-2xl font-extrabold sm:text-3xl">
              مراقبة الاشتراكات، توثيق التحويلات، وسجل النزاعات
            </h1>
            <p className="mt-1 text-sm text-primary-100">
              مراجعة طلبات توثيق الملاك، تحويلات إنستاباي للاشتراك، النزاعات القانونية، واختبار اتصال Supabase بجدول chalets.
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToBrowse}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-primary-800 hover:bg-sand-100"
          >
            <ArrowRight className="h-4 w-4" />
            <span>العودة لتصفح الوحدات</span>
          </button>
        </div>

        {/* Platform Analytics Summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-primary-100">
              <span>إجمالي الوحدات المسجلة</span>
              <Building2 className="h-4 w-4 text-secondary-300" />
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-white">
              {chalets.length.toLocaleString('ar-EG')}
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-primary-100">
              <span>مشتركي Pro النشطين</span>
              <Crown className="h-4 w-4 text-amber-300" />
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-amber-300">
              {activeProCount.toLocaleString('ar-EG')}
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-primary-100">
              <span>طلبات بانتظار المراجعة</span>
              <Clock3 className="h-4 w-4 text-warning-300" />
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-warning-300">
              {(pendingSubscriptions.length + pendingVerifications.length).toLocaleString('ar-EG')}
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-primary-100">
              <span>إيرادات الاشتراكات</span>
              <Wallet className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="mt-1.5 text-xl font-extrabold text-emerald-300 sm:text-2xl">
              {formatEGP(totalSubscriptionRevenue)}
            </div>
          </div>
        </div>
      </div>

      {/* Supabase Environment & chalets/bookings Diagnostic Panel */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-primary-800">
              <Database className="h-5 w-5 text-secondary-500" />
              فحص الاتصال بقاعدة البيانات Supabase (chalets &amp; bookings &amp; receipts)
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              يتحقق هذا الفحص من جاهزية مفاتيح البيئة (VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY) ويختبر قراءة الصفوف من جدولي chalets و bookings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSqlGuide((prev) => !prev)}
              className="rounded-xl border border-slate-200 bg-sand-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-sand-100"
            >
              {showSqlGuide ? 'إخفاء أكواد SQL' : 'أكواد SQL وإعداد Buckets'}
            </button>
            <button
              type="button"
              onClick={handleTestSupabaseUnits}
              disabled={isTestingSupabase}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isTestingSupabase ? 'animate-spin' : ''}`} />
              <span>{isTestingSupabase ? 'جاري الاختبار...' : 'اختبار الاتصال بـ Supabase الآن'}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            className={`rounded-2xl border p-3.5 text-xs ${
              supabaseConfig.urlPresent && supabaseConfig.urlValid
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="font-extrabold">VITE_SUPABASE_URL</div>
            <div className="mt-1">
              {supabaseConfig.urlPresent && supabaseConfig.urlValid
                ? `مضبوط (${supabaseConfig.urlHost})`
                : 'غير مضبوط أو غير صالح في البيئة الحالية (أضفه عبر لوحة Secrets في AI Studio)'}
            </div>
          </div>

          <div
            className={`rounded-2xl border p-3.5 text-xs ${
              supabaseConfig.anonKeyPresent
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="font-extrabold">VITE_SUPABASE_ANON_KEY</div>
            <div className="mt-1">
              {supabaseConfig.anonKeyPresent
                ? 'مضبوط وجاهز للاستخدام في العميل'
                : 'مفقود — أضف المفتاح العام (anon key) من إعدادات مشروع Supabase في لوحة Secrets'}
            </div>
          </div>
        </div>

        {supabaseResult && (
          <div className="mt-3 space-y-2">
            <div
              className={`rounded-2xl border p-4 text-xs ${
                supabaseResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-error-200 bg-error-50 text-error-800'
              }`}
            >
              {supabaseResult.ok ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-extrabold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      نجحت قراءة جدول {supabaseResult.tableName || 'chalets'}! عدد السجلات المتاحة:{' '}
                      {supabaseResult.count.toLocaleString('ar-EG')}
                    </span>
                  </div>
                  {supabaseResult.sampleRows.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {supabaseResult.sampleRows.map((row) => (
                        <span
                          key={row.id}
                          className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800"
                        >
                          {row.title}
                          {row.pricePerNight ? ` (${formatEGP(row.pricePerNight)})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2 font-bold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error-600" />
                  <span>جدول chalets: {supabaseResult.error}</span>
                </div>
              )}
            </div>

            {supabaseResult.configured && (
              <div
                className={`rounded-2xl border p-3.5 text-xs ${
                  supabaseResult.bookingsOk
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {supabaseResult.bookingsOk ? (
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      جدول bookings متصل بنجاح! عدد الحجوزات المسجلة:{' '}
                      {(supabaseResult.bookingsCount ?? 0).toLocaleString('ar-EG')}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 font-bold">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      جدول bookings غير جاهز أو ينقصه صلاحيات RLS:{' '}
                      {supabaseResult.bookingsError || 'راجع أكواد SQL'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showSqlGuide && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-900 p-4 text-xs text-slate-100">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-amber-300">
                الخطوات اليدوية في Supabase: شغّل ملف الترحيل الكامل في SQL Editor لإنشاء الجداول والباكتات (chalet-images, verification-docs, receipts):
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20"
              >
                {sqlCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{sqlCopied ? 'تم نسخ SQL' : 'نسخ كود SQL'}</span>
              </button>
            </div>
            <pre dir="ltr" className="max-h-60 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-200">
              {SUPABASE_SETUP_SQL}
            </pre>
          </div>
        )}
      </div>

      {/* Owner Verification Review Hub */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-primary-800">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              مراجعة طلبات توثيق الملاك (Owner Verifications)
            </h2>
            <p className="text-xs text-slate-500">
              اعرض مستند الملكية أو كارنيه القرية عبر رابط مؤقت آمن، ثم اعتمد التوثيق لترقية الحساب إلى مالك موثق.
            </p>
          </div>
          <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-bold text-warning-800">
            {pendingVerifications.length} طلب بانتظار التوثيق
          </span>
        </div>

        {verifications.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-sand-50 p-6 text-center text-xs text-slate-500">
            لا توجد طلبات توثيق ملاك مسجلة حالياً.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {verifications.map((ver) => {
              const docKey = ver.id || ver.documentPath || ver.ownerName;
              const isLoadingDoc = loadingVerificationId === docKey;
              return (
                <div
                  key={docKey}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-sand-50/70 p-4 lg:flex-row lg:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          ver.status === 'verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ver.status === 'pending'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-error-50 text-error-700'
                        }`}
                      >
                        {ver.status === 'verified'
                          ? 'موثق (Verified)'
                          : ver.status === 'pending'
                          ? 'قيد المراجعة (Pending)'
                          : 'غير موثق / مرفوض'}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {ver.ownerName}
                      </span>
                      <span dir="ltr" className="text-xs font-bold text-slate-600">
                        ({ver.phone})
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      نوع المستند: <strong>{ver.documentType}</strong> • الرقم:{' '}
                      <strong>{ver.documentNumber}</strong>
                    </div>
                    {ver.rejectionReason && (
                      <div className="text-[11px] font-bold text-error-700">
                        سبب الرفض المسجل: {ver.rejectionReason}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isLoadingDoc}
                        onClick={() => handlePreviewVerificationDoc(ver)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>{isLoadingDoc ? 'جاري الجلب...' : 'معاينة المستند (Signed URL)'}</span>
                      </button>

                      {ver.id && ver.status !== 'verified' && (
                        <button
                          type="button"
                          onClick={() => onReviewVerification(ver.id!, 'verified')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-success-700"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>اعتماد وترقية لمالك</span>
                        </button>
                      )}

                      {ver.id && ver.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingVerId(rejectingVerId === ver.id ? null : ver.id!);
                            setRejectionReasonDraft('');
                            setRejectionError('');
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-error-200 bg-white px-3 py-2 text-xs font-bold text-error-700 hover:bg-error-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>رفض مع ذكر السبب</span>
                        </button>
                      )}
                    </div>

                    {ver.id && rejectingVerId === ver.id && (
                      <div className="w-full max-w-md space-y-2 rounded-xl border border-error-200 bg-white p-3">
                        <label
                          htmlFor={`reject-reason-${ver.id}`}
                          className="block text-[11px] font-bold text-error-800"
                        >
                          سبب رفض طلب التوثيق (يصل للمالك في الإشعار ونافذة التوثيق):
                        </label>
                        <input
                          id={`reject-reason-${ver.id}`}
                          type="text"
                          value={rejectionReasonDraft}
                          onChange={(e) => {
                            setRejectionReasonDraft(e.target.value);
                            setRejectionError('');
                          }}
                          placeholder="مثال: الصورة غير واضحة أو الرقم غير مطابق"
                          className="w-full rounded-lg border border-slate-200 bg-sand-50 px-2.5 py-1.5 text-xs focus:border-error-500 focus:outline-none"
                        />
                        {rejectionError && (
                          <p className="text-[11px] font-bold text-error-600">{rejectionError}</p>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setRejectingVerId(null)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                          >
                            تراجع
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!rejectionReasonDraft.trim()) {
                                setRejectionError('يرجى كتابة سبب الرفض.');
                                return;
                              }
                              await onReviewVerification(
                                ver.id!,
                                'unverified',
                                rejectionReasonDraft.trim()
                              );
                              setRejectingVerId(null);
                              setRejectionReasonDraft('');
                            }}
                            className="rounded-lg bg-error-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-error-700"
                          >
                            تأكيد الرفض
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Bookings & Receipt Verification Hub */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-primary-800">
              <CalendarCheck2 className="h-5 w-5 text-secondary-500" />
              مراجعة الحجوزات المعلقة وإيصالات InstaPay (pending_verification)
            </h2>
            <p className="text-xs text-slate-500">
              اعرض إيصال العربون (٢٥٪) بأمان عبر Signed URL من باكت receipts، ثم اعتمد الحجز لإغلاق التواريخ نهائياً أو ارفضه لإعادة فتحها.
            </p>
          </div>
          <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-bold text-warning-800">
            {pendingBookings.length} حجز بانتظار المراجعة
          </span>
        </div>

        {pendingBookings.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-sand-50 p-6 text-center text-xs text-slate-500">
            لا توجد حجوزات معلقة بانتظار المراجعة حالياً.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {pendingBookings.map((booking) => {
              const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
              const isLoadingReceipt = loadingReceiptBookingId === booking.id;

              return (
                <div
                  key={booking.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-secondary-200 bg-sand-50/70 p-4 lg:flex-row lg:items-center"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-warning-100 px-2.5 py-0.5 text-[11px] font-bold text-warning-900">
                        {booking.status === 'payment_submitted' || booking.status === 'pending_verification'
                          ? 'إيصال عربون مرفق (payment_submitted)'
                          : booking.status === 'approved'
                          ? 'موافق مبدئياً — بانتظار رفع الإيصال (approved)'
                          : 'طلب حجز مبدئي (pending)'}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {booking.guestName}
                      </span>
                      <span dir="ltr" className="text-xs font-bold text-slate-600">
                        ({booking.guestPhone})
                      </span>
                    </div>

                    <div className="text-xs font-bold text-primary-700">
                      {booking.chaletTitle} — {booking.resort}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                      <span>
                        التواريخ: <strong>{formatArabicDate(booking.checkIn)}</strong> ←{' '}
                        <strong>{booking.checkOut ? formatArabicDate(booking.checkOut) : '—'}</strong> ({booking.nights} ليالٍ)
                      </span>
                      <span>
                        الإجمالي: <strong>{formatEGP(booking.totalPrice)}</strong>
                      </span>
                      <span>
                        العربون (٢٥٪):{' '}
                        <strong className="text-secondary-700">{formatEGP(deposit)}</strong>
                      </span>
                    </div>

                    {booking.notes && (
                      <p className="text-[11px] text-slate-500">ملاحظات: {booking.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePreviewBookingReceipt(booking)}
                      disabled={isLoadingReceipt}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>
                        {isLoadingReceipt
                          ? 'جاري الفتح...'
                          : booking.receiptPath || booking.receiptPreviewUrl
                          ? 'معاينة الإيصال (Signed URL)'
                          : 'تفاصيل الإيصال'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onApproveBooking(booking.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-success-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>قبول الحجز (confirmed)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRejectBooking(booking.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-error-200 bg-white px-3 py-2 text-xs font-bold text-error-700 hover:bg-error-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>رفض الحجز (cancelled)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment Verification Hub */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-primary-800">
              <Crown className="h-5 w-5 text-amber-500" />
              مركز مراجعة تحويلات الاشتراك الاحترافي (Payment Verification Hub)
            </h2>
            <p className="text-xs text-slate-500">
              راجع أرقام التحويل المرجعية عبر إنستاباي أو المحافظ الإلكترونية واضغط لتفعيل الباقة ٣٠ يوماً.
            </p>
          </div>
          <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-bold text-warning-800">
            {pendingSubscriptions.length} طلب معلق
          </span>
        </div>

        {pendingSubscriptions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-sand-50 p-6 text-center text-xs text-slate-500">
            لا توجد تحويلات اشتراك معلقة في الوقت الحالي. كل الطلبات تمت مراجعتها.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {pendingSubscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 lg:flex-row lg:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-warning-100 px-2.5 py-0.5 text-[11px] font-bold text-warning-900">
                      بانتظار المطابقة (Pending Verification)
                    </span>
                    <span className="text-sm font-extrabold text-slate-900">
                      {sub.hostName}
                    </span>
                    <span dir="ltr" className="text-xs font-bold text-slate-600">
                      ({sub.hostPhone})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                    <span>
                      الوسيلة: <strong>{getPaymentMethodLabel(sub.paymentMethod)}</strong>
                    </span>
                    <span>
                      المرسل: <strong dir="ltr">{sub.senderPhoneOrHandle || '—'}</strong>
                    </span>
                    <span>
                      المرجع: <strong dir="ltr" className="text-primary-700">{sub.transferReference || '—'}</strong>
                    </span>
                    <span>
                      المبلغ: <strong className="text-emerald-700">{formatEGP(sub.monthlyFee)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sub.receiptPath && (
                    <button
                      type="button"
                      onClick={() => handlePreviewSubReceipt(sub)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>عرض الإيصال</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onApproveSubscription(sub.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-success-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>موافقة وتفعيل Pro (Approve & Activate)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExpireSubscription(sub.id)}
                    className="inline-flex items-center gap-1 rounded-xl border border-error-200 bg-white px-3 py-2 text-xs font-bold text-error-700 hover:bg-error-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>رفض / إنهاء</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription Tracker Table */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-sand-50 px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              متتبع اشتراكات الملاك (Subscription Tracker)
            </h2>
            <p className="text-xs text-slate-500">
              عرض كامل للباقات (Free / Pro)، تواريخ البداية والانتهاء، وحالة كل حساب.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'active', label: 'نشط (Active)' },
                { id: 'pending-verification', label: 'قيد المراجعة' },
                { id: 'expired', label: 'منتهي (Expired)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === tab.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">المالك / المكتب</th>
                <th className="px-4 py-3">الباقة</th>
                <th className="px-4 py-3">بداية الاشتراك</th>
                <th className="px-4 py-3">تاريخ الانتهاء</th>
                <th className="px-4 py-3">مرجع الدفع</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">إجراء إداري</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSubscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-sand-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{sub.hostName}</div>
                    <div dir="ltr" className="text-[11px] text-slate-500">
                      {sub.hostPhone}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {sub.tier === 'pro' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                        <Crown className="h-3 w-3 text-amber-600" />
                        الاحترافية Pro ({formatEGP(sub.monthlyFee)})
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                        الأساسية Free (٠ ج.م)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {formatArabicDate(sub.startDate)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {formatArabicDate(sub.expiryDate)}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">
                    {sub.transferReference ? (
                      <span dir="ltr" className="font-bold text-primary-700">
                        {sub.transferReference}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sub.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    ) : sub.status === 'pending-verification' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold text-warning-800">
                        <Clock3 className="h-3 w-3" />
                        Pending Verification
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-error-50 px-2.5 py-1 text-[11px] font-bold text-error-700">
                        <XCircle className="h-3 w-3" />
                        Expired
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sub.status !== 'active' || sub.tier === 'free' ? (
                      <button
                        type="button"
                        onClick={() => onApproveSubscription(sub.id)}
                        className="rounded-lg bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 hover:bg-primary-100"
                      >
                        تفعيل Pro
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onExpireSubscription(sub.id)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-error-50 hover:text-error-700"
                      >
                        تعليق / إنهاء
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispute Log Table */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-amber-50/60 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-amber-950">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              سجل النزاعات ومصادرة جدية الحجز (Dispute Log)
            </h2>
            <p className="text-xs text-amber-800">
              توثيق الحجوزات الملغاة قبل موعد الوصول بأقل من ١٠ أيام وفقاً لإقرار الشروط الموافق عليه من المستأجر.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-amber-900 shadow-sm">
            {forfeitedDisputes.length} حالة مسجلة
          </span>
        </div>

        {forfeitedDisputes.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد حالات مصادرة لجدية الحجز مسجلة حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">تاريخ الإلغاء</th>
                  <th className="px-4 py-3">الوحدة والمالك</th>
                  <th className="px-4 py-3">المستأجر</th>
                  <th className="px-4 py-3">مهلة الإشعار</th>
                  <th className="px-4 py-3">قيمة الجدية المصادرة</th>
                  <th className="px-4 py-3">السبب / الملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forfeitedDisputes.map((item) => (
                  <tr key={item.id} className="hover:bg-sand-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {item.cancelledAt
                        ? formatArabicDate(item.cancelledAt.split('T')[0])
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{item.resort}</div>
                      <div className="text-[11px] text-slate-500">المالك: {item.ownerName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{item.guestName}</div>
                      <div dir="ltr" className="text-[11px] text-slate-500">
                        {item.guestPhone}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-error-50 px-2.5 py-0.5 text-[11px] font-bold text-error-700">
                        قبل الوصول بـ {(item.cancellationDaysNotice ?? 0).toLocaleString('ar-EG')} أيام
                      </span>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-amber-800">
                      {formatEGP(item.forfeitedAmount ?? item.depositAmount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.notes || 'تجاوز مهلة الإلغاء المجاني (أقل من ١٠ أيام)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {receiptModalState && (
        <div
          ref={receiptModalRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={receiptModalState.title}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {receiptModalState.title}
                </h3>
                <p className="text-xs text-slate-500">
                  {receiptModalState.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModalState(null)}
                aria-label="إغلاق المعاينة"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              {receiptModalState.imageUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-600">مصدر المعاينة:</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700">
                      رابط مؤقت آمن Supabase Signed URL (300 ثانية)
                    </span>
                  </div>
                  <img
                    src={receiptModalState.imageUrl}
                    alt="معاينة المستند"
                    width={512}
                    height={320}
                    loading="lazy"
                    decoding="async"
                    className="max-h-80 w-full rounded-2xl border border-slate-200 bg-sand-50 object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-sand-50 p-6 text-center text-xs text-slate-600">
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                  <p className="font-bold">
                    {receiptModalState.error || 'لا يوجد ملف مرفق للمعاينة.'}
                  </p>
                </div>
              )}
            </div>

            {receiptModalState.booking && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onApproveBooking(receiptModalState.booking!.id);
                    setReceiptModalState(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-500 py-2.5 text-xs font-bold text-white hover:bg-success-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>قبول الحجز (confirmed)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRejectBooking(receiptModalState.booking!.id);
                    setReceiptModalState(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-error-200 bg-error-50 py-2.5 text-xs font-bold text-error-700 hover:bg-error-100"
                >
                  <XCircle className="h-4 w-4" />
                  <span>رفض الحجز (cancelled)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
