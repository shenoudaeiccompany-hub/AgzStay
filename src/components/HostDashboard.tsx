import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCog,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Crown,
  Eye,
  Image as ImageIcon,
  MessageCircle,
  Phone,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { CancellationPolicyModal } from '@/components/CancellationPolicyModal';
import { HostCalendarPricingPanel } from '@/components/HostCalendarPricingPanel';
import { HostFinancialDashboard } from '@/components/HostFinancialDashboard';
import { RatingModal } from '@/components/RatingModal';
import { RenterTrustBadge } from '@/components/RenterTrustBadge';
import {
  FREE_TIER_MAX_UNITS,
  PRO_TIER_MAX_UNITS,
  PRO_TIER_MONTHLY_FEE,
  formatEGP,
} from '@/data/chalets';
import type {
  AppUser,
  BookingRequest,
  Chalet,
  HostSubscriptionRecord,
  OwnerVerificationSubmission,
  RenterTrustReview,
  RenterTrustTag,
} from '@/types/chalet';
import {
  addDaysIso,
  calculateFinancialMetrics,
  formatArabicDate,
  formatIsoDate,
} from '@/utils/bookingPricing';
import { getBookingReceiptSignedUrl } from '@/services/agzstayRepository';

interface HostDashboardProps {
  currentUser: AppUser | null;
  chalets: Chalet[];
  customChaletIds?: string[];
  bookings: BookingRequest[];
  renterTrustReviews: RenterTrustReview[];
  verification: OwnerVerificationSubmission | null;
  currentSubscription?: HostSubscriptionRecord | null;
  activeCustomUnitsCount?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBackToRenterMode: () => void;
  onOpenAuth: () => void;
  onOpenAddProperty: () => void;
  onOpenVerification: () => void;
  onOpenUpgradeModal: () => void;
  onApproveBookingRequest: (bookingId: string) => Promise<void> | void;
  onRejectBookingRequest: (bookingId: string, reason?: string) => Promise<void> | void;
  onConfirmBookingDeposit: (bookingId: string) => Promise<void> | void;
  onCompleteBookingStay: (bookingId: string) => Promise<void> | void;
  onCancelBookingWithPolicy: (bookingId: string) => Promise<void> | void;
  onUpdateChaletConfig: (
    chaletId: string,
    updates: Partial<
      Pick<
        Chalet,
        | 'title'
        | 'description'
        | 'availabilityStatus'
        | 'pricePerNight'
        | 'weeklyPrice'
        | 'monthlyPrice'
        | 'weekendPricePerNight'
        | 'peakPricePerNight'
        | 'securityDeposit'
        | 'downPaymentPercent'
        | 'depositType'
        | 'fixedDepositAmount'
        | 'includesPasses'
        | 'verifiedLivePhotos'
        | 'livePhotosVerifiedAt'
        | 'welcomeGuide'
        | 'blockedDates'
        | 'dateRules'
        | 'owner'
      >
    >
  ) => void;
  onDeleteCustomChalet?: (chaletId: string) => void;
  onAddRenterTrustReview: (payload: {
    bookingId: string;
    chaletId?: string;
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
  }) => void;
}

export function HostDashboard({
  currentUser,
  chalets,
  customChaletIds = [],
  bookings,
  renterTrustReviews,
  verification,
  currentSubscription,
  activeCustomUnitsCount = 0,
  loading = false,
  error = null,
  onRetry,
  onBackToRenterMode,
  onOpenAuth,
  onOpenAddProperty,
  onOpenVerification,
  onOpenUpgradeModal,
  onApproveBookingRequest,
  onRejectBookingRequest,
  onConfirmBookingDeposit,
  onCompleteBookingStay,
  onCancelBookingWithPolicy,
  onUpdateChaletConfig,
  onDeleteCustomChalet,
  onAddRenterTrustReview,
}: HostDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    'requests' | 'pricing' | 'financials' | 'renter-trust'
  >('requests');
  const [managedChaletId, setManagedChaletId] = useState<string>(chalets[0]?.id ?? '');
  const [ratingTargetBooking, setRatingTargetBooking] = useState<BookingRequest | null>(null);
  const [cancelTargetBooking, setCancelTargetBooking] = useState<BookingRequest | null>(null);
  const [rejectingBookingId, setRejectingBookingId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [loadingReceiptBookingId, setLoadingReceiptBookingId] = useState<string | null>(null);
  const [receiptPreviewModal, setReceiptPreviewModal] = useState<{
    booking: BookingRequest;
    url: string | null;
    error?: string;
  } | null>(null);

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);

  const managedChalet = useMemo(
    () => chalets.find((c) => c.id === managedChaletId) ?? chalets[0] ?? null,
    [chalets, managedChaletId]
  );

  const pendingCount = bookings.filter(
    (b) =>
      b.status === 'pending' ||
      b.status === 'approved' ||
      b.status === 'payment_submitted' ||
      b.status === 'pending_verification'
  ).length;
  const confirmedCount = bookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'completed'
  ).length;
  const ratedBookingIds = useMemo(
    () => new Set(renterTrustReviews.map((r) => r.bookingId)),
    [renterTrustReviews]
  );

  const handleOpenReceiptPreview = async (booking: BookingRequest) => {
    setLoadingReceiptBookingId(booking.id);
    try {
      const res = await getBookingReceiptSignedUrl(booking.receiptPath);
      setReceiptPreviewModal({
        booking,
        url: res.data,
        error: res.error ?? undefined,
      });
    } finally {
      setLoadingReceiptBookingId(null);
    }
  };

  const currentDate = useMemo(() => new Date(), []);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentFinancials = useMemo(
    () => calculateFinancialMetrics(chalets, bookings, currentYear, currentMonth, 'all'),
    [chalets, bookings, currentYear, currentMonth]
  );

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="rounded-3xl bg-gradient-to-bl from-primary-600 via-primary-700 to-primary-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-sand-100">
                <Building2 className="h-3.5 w-3.5 text-secondary-200" />
                لوحة تحكم المالك والوسيط المعتمد
              </span>
              {verification?.status === 'verified' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-500/20 px-3 py-1 text-xs font-bold text-success-50">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  حساب موثق ({verification.ownerName})
                </span>
              ) : verification?.status === 'pending' ? (
                <button
                  type="button"
                  onClick={onOpenVerification}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-slate-900 hover:bg-amber-300"
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  طلب التوثيق قيد مراجعة الإدارة
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenVerification}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white hover:bg-accent-600"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  فعّل توثيق حسابك الآن
                </button>
              )}
            </div>
            <h1 className="mt-2.5 text-2xl font-extrabold sm:text-3xl">
              إدارة الحجوزات، التسعير الديناميكي، والتقارير المالية
            </h1>
            <p className="mt-1 text-sm text-primary-100">
              أكد استلام جدية الحجز لإغلاق التواريخ، خصص أسعار الفترات وملاحظاتها، وتابع دخلك الإيجاري الشهري والسنوي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenAddProperty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-secondary-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-secondary-600"
            >
              <PlusCircle className="h-4 w-4" />
              <span>أضف وحدة جديدة (٣ خطوات)</span>
            </button>
            <button
              type="button"
              onClick={onBackToRenterMode}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-primary-700 hover:bg-sand-100"
            >
              <ArrowRight className="h-4 w-4" />
              <span>العودة لوضع المستأجر</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="text-xs text-primary-100">بانتظار تأكيد جدية الحجز</div>
            <div className="mt-1 text-2xl font-extrabold text-accent-300">{pendingCount}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="text-xs text-primary-100">حجوزات مؤكدة ({currentYear})</div>
            <div className="mt-1 text-2xl font-extrabold text-success-50">{confirmedCount}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="text-xs text-primary-100">الدخل الشهري المؤكد</div>
            <div className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
              {formatEGP(currentFinancials.monthlyIncome)}
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
            <div className="text-xs text-primary-100">الدخل السنوي ({currentYear})</div>
            <div className="mt-1 text-xl font-extrabold text-sand-100 sm:text-2xl">
              {formatEGP(currentFinancials.annualIncome)}
            </div>
          </div>
        </div>

        {/* Freemium vs Pro Membership Banner */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {currentSubscription?.tier === 'pro' && currentSubscription.status === 'active' ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 font-extrabold text-slate-900">
                  <Crown className="h-3.5 w-3.5" />
                  الباقة الاحترافية (Pro) — شريك مميز مفعّل
                </span>
                <span className="text-primary-50">
                  الوحدات المضافة: {activeCustomUnitsCount} / {PRO_TIER_MAX_UNITS} • سارية حتى{' '}
                  {formatArabicDate(currentSubscription.expiryDate)}
                </span>
              </>
            ) : currentSubscription?.status === 'pending-verification' ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-400 px-3 py-1 font-extrabold text-slate-900">
                  <Clock3 className="h-3.5 w-3.5" />
                  طلب الترقية للباقة الاحترافية قيد مراجعة الإدارة
                </span>
                <span className="text-primary-50">
                  مرجع التحويل: <strong dir="ltr">{currentSubscription.transferReference}</strong>
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 font-bold text-white">
                  الباقة الأساسية (مجانية ١٠٠٪)
                </span>
                <span className="text-primary-50">
                  الحد المتاح للنشر: {activeCustomUnitsCount} / {FREE_TIER_MAX_UNITS} وحدة • احصل على شارة &quot;شريك مميز&quot; والأولوية بالبحث وحتى {PRO_TIER_MAX_UNITS} وحدات.
                </span>
              </>
            )}
          </div>

          {!(currentSubscription?.tier === 'pro' && currentSubscription.status === 'active') && (
            <button
              type="button"
              onClick={onOpenUpgradeModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-amber-300"
            >
              <Crown className="h-4 w-4" />
              <span>
                {currentSubscription?.status === 'pending-verification'
                  ? 'عرض / تحديث طلب الاشتراك'
                  : `الترقية للباقة الاحترافية (${formatEGP(PRO_TIER_MONTHLY_FEE)} / شهرياً)`}
              </span>
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs font-bold text-primary-800">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>جاري تحميل وحداتك وطلبات الحجز...</span>
        </div>
      )}

      {error && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-xs font-bold text-error-800">
          <span>{error}</span>
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

      {!currentUser ? (
        <div className="mt-6 rounded-3xl border border-primary-100 bg-white p-8 text-center shadow-sm">
          <Building2 className="mx-auto h-12 w-12 text-primary-600" />
          <h2 className="mt-3 text-lg font-extrabold text-slate-900">
            سجّل الدخول للوصول إلى وحداتك وحجوزاتك
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            تظهر هنا وحداتك المملوكة فقط وطلبات الحجز المرتبطة بها وفق قواعد عزل الملكية الصارمة.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mt-4 rounded-xl bg-primary-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-primary-700"
          >
            تسجيل الدخول / إنشاء حساب
          </button>
        </div>
      ) : (
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'requests'
                ? 'bg-primary-600 text-white'
                : 'bg-sand-100 text-slate-700 hover:bg-sand-200'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            <span>طلبات الحجز الواردة ({bookings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'pricing'
                ? 'bg-primary-600 text-white'
                : 'bg-sand-100 text-slate-700 hover:bg-sand-200'
            }`}
          >
            <CalendarCog className="h-4 w-4" />
            <span>تقويم المالك والتسعير الديناميكي</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('financials')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'financials'
                ? 'bg-primary-600 text-white'
                : 'bg-sand-100 text-slate-700 hover:bg-sand-200'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>التقارير المالية والدخل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('renter-trust')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'renter-trust'
                ? 'bg-secondary-500 text-white'
                : 'bg-sand-100 text-slate-700 hover:bg-sand-200'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>سجل ثقة المستأجرين ({renterTrustReviews.length})</span>
          </button>
        </div>

        {activeTab === 'requests' && (
          <div className="mt-5 space-y-3">
            {bookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-sand-50 p-8 text-center text-sm text-slate-500">
                لا توجد طلبات حجز مسجلة بعد. عند قيام أي مستأجر بطلب حجز سيظهر هنا لتأكيد جدية الحجز وإغلاق التواريخ.
              </div>
            ) : (
              bookings.map((booking) => {
                const isAlreadyRated = ratedBookingIds.has(booking.id);
                const checkOut = booking.checkOut ?? addDaysIso(booking.checkIn, booking.nights);
                const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
                const remaining =
                  booking.remainingAmount ?? Math.max(0, booking.totalPrice - deposit);

                return (
                  <div
                    key={booking.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-sand-50/70 p-4 lg:flex-row lg:items-center"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            booking.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-900'
                              : booking.status === 'confirmed'
                              ? 'bg-success-50 text-success-700'
                              : booking.status === 'approved'
                              ? 'bg-sky-50 text-sky-800'
                              : booking.status === 'cancelled' ||
                                booking.status === 'rejected' ||
                                booking.status === 'expired'
                              ? 'bg-error-50 text-error-700'
                              : 'bg-warning-50 text-warning-700'
                          }`}
                        >
                          {booking.status === 'completed'
                            ? 'مكتمل — أُتيح التقييم'
                            : booking.status === 'confirmed'
                            ? 'مؤكد — التواريخ مغلقة ومقيدة بالدخل'
                            : booking.status === 'approved'
                            ? 'موافق مبدئياً — بانتظار رفع إيصال العربون'
                            : booking.status === 'payment_submitted' ||
                              booking.status === 'pending_verification'
                            ? 'المستأجر رفع الإيصال — بانتظار تأكيدك'
                            : booking.status === 'rejected'
                            ? 'مرفوض'
                            : booking.status === 'expired'
                            ? 'منتهي المهلة (٢٤ ساعة)'
                            : booking.status === 'cancelled'
                            ? booking.depositForfeited
                              ? 'ملغي — جدية الحجز مصادرة (<١٠ أيام)'
                              : 'ملغي — التواريخ مفتوحة'
                            : 'طلب جديد — بانتظار موافقتك خلال ٢٤ ساعة'}
                        </span>

                        {booking.inquiryChannel === 'whatsapp' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700">
                            <MessageCircle className="h-3 w-3" />
                            واتساب
                          </span>
                        )}
                        {booking.inquiryChannel === 'phone' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                            <Phone className="h-3 w-3" />
                            اتصال مباشر
                          </span>
                        )}

                        <span className="text-xs font-extrabold text-slate-900">
                          {booking.guestName} ({booking.guestPhone})
                        </span>

                        <RenterTrustBadge
                          reviews={renterTrustReviews}
                          renterPhone={booking.guestPhone}
                          compact
                        />
                      </div>

                      <div className="text-sm font-bold text-primary-700">
                        {booking.chaletTitle}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span>
                          الوصول: <strong>{formatArabicDate(booking.checkIn)}</strong> ← المغادرة:{' '}
                          <strong>{formatArabicDate(checkOut)}</strong> ({booking.nights} ليالٍ •{' '}
                          {booking.guests} أفراد)
                        </span>
                        <span>
                          الإجمالي: <strong className="text-primary-700">{formatEGP(booking.totalPrice)}</strong>
                        </span>
                        <span>
                          جدية الحجز: <strong className="text-secondary-700">{formatEGP(deposit)}</strong>
                        </span>
                        <span>
                          المتبقي عند الاستلام: <strong>{formatEGP(remaining)}</strong>
                        </span>
                      </div>

                      {booking.paymentReference && (
                        <div className="text-[11px] font-bold text-primary-700">
                          مرجع التحويل المرفق: <span dir="ltr">{booking.paymentReference}</span>
                        </div>
                      )}

                      {booking.rejectionReason && (
                        <div className="text-[11px] font-bold text-error-700">
                          سبب الرفض: {booking.rejectionReason}
                        </div>
                      )}

                      {booking.status === 'cancelled' && booking.depositForfeited && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>
                            تم تطبيق سياسة الـ ١٠ أيام: احتُفظ بجدية الحجز ({formatEGP(booking.forfeitedAmount ?? deposit)}) وإعادة فتح التواريخ.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {booking.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onApproveBookingRequest(booking.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>موافقة وإرسال بيانات الدفع</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingBookingId(
                                  rejectingBookingId === booking.id ? null : booking.id
                                );
                                setRejectionReasonInput('');
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-error-200 bg-white px-3 py-2 text-xs font-bold text-error-700 hover:bg-error-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>رفض الطلب</span>
                            </button>
                          </>
                        )}

                        {(booking.status === 'payment_submitted' ||
                          booking.status === 'pending_verification') && (
                          <>
                            {booking.receiptPath && (
                              <button
                                type="button"
                                disabled={loadingReceiptBookingId === booking.id}
                                onClick={() => handleOpenReceiptPreview(booking)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>
                                  {loadingReceiptBookingId === booking.id
                                    ? 'جاري الجلب...'
                                    : 'معاينة الإيصال'}
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onConfirmBookingDeposit(booking.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-success-700"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>تأكيد استلام جدية الحجز وإغلاق التواريخ</span>
                            </button>
                          </>
                        )}

                        {booking.status === 'confirmed' && checkOut <= todayIso && (
                          <button
                            type="button"
                            onClick={() => onCompleteBookingStay(booking.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>تأكيد اكتمال الإقامة</span>
                          </button>
                        )}

                        {(booking.status === 'approved' ||
                          booking.status === 'payment_submitted' ||
                          booking.status === 'pending_verification' ||
                          booking.status === 'confirmed') && (
                          <button
                            type="button"
                            onClick={() => setCancelTargetBooking(booking)}
                            className="inline-flex items-center gap-1 rounded-xl border border-error-500/30 bg-error-50 px-3 py-2 text-xs font-bold text-error-700 hover:bg-error-500 hover:text-white"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>إلغاء الحجز</span>
                          </button>
                        )}

                        {(booking.status === 'confirmed' || booking.status === 'completed') &&
                          (isAlreadyRated ? (
                            <span className="inline-flex items-center gap-1 rounded-xl bg-secondary-50 px-3 py-2 text-xs font-bold text-secondary-700">
                              <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
                              تم تقييم المستأجر
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRatingTargetBooking(booking)}
                              className="inline-flex items-center gap-1 rounded-xl border border-secondary-500 bg-white px-3 py-2 text-xs font-bold text-secondary-700 hover:bg-secondary-50"
                            >
                              <Star className="h-3.5 w-3.5 text-warning-500" />
                              تقييم المستأجر
                            </button>
                          ))}
                      </div>

                      {rejectingBookingId === booking.id && (
                        <div className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-error-200 bg-white p-2">
                          <input
                            type="text"
                            value={rejectionReasonInput}
                            onChange={(e) => setRejectionReasonInput(e.target.value)}
                            placeholder="سبب الرفض (اختياري)..."
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-sand-50 px-2.5 py-1.5 text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await onRejectBookingRequest(
                                booking.id,
                                rejectionReasonInput.trim() || undefined
                              );
                              setRejectingBookingId(null);
                              setRejectionReasonInput('');
                            }}
                            className="rounded-lg bg-error-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-error-700"
                          >
                            تأكيد الرفض
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'pricing' && (
          managedChalet ? (
            <HostCalendarPricingPanel
              chalets={chalets}
              customChaletIds={customChaletIds}
              managedChalet={managedChalet}
              bookings={bookings}
              onSelectManagedChalet={setManagedChaletId}
              onUpdateChaletConfig={onUpdateChaletConfig}
              onDeleteCustomChalet={onDeleteCustomChalet}
            />
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-sand-50 p-8 text-center text-sm text-slate-500">
              لا توجد وحدات مملوكة لحسابك بعد — أضف وحدتك الأولى لتخصيص التقويم والأسعار.
            </div>
          )
        )}

        {activeTab === 'financials' && (
          chalets.length > 0 ? (
            <HostFinancialDashboard chalets={chalets} bookings={bookings} />
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-sand-50 p-8 text-center text-sm text-slate-500">
              لا توجد وحدات مملوكة لحسابك بعد لعرض التقارير المالية.
            </div>
          )
        )}

        {activeTab === 'renter-trust' && (
          <div className="mt-5 space-y-4">
            <RenterTrustBadge reviews={renterTrustReviews} />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {renterTrustReviews.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-sand-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{item.renterName}</div>
                      <div className="text-[11px] text-slate-500">
                        بواسطة: {item.hostName} • {item.chaletTitle}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-bold text-warning-700">
                      <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
                      {item.rating.toFixed(1)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">{item.comment}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {ratingTargetBooking && (
        <RatingModal
          config={{
            type: 'host-to-renter',
            bookingId: ratingTargetBooking.id,
            chaletTitle: ratingTargetBooking.chaletTitle,
            renterName: ratingTargetBooking.guestName,
            renterPhone: ratingTargetBooking.guestPhone,
            hostName: ratingTargetBooking.ownerName,
            onSubmit: (payload) =>
              onAddRenterTrustReview({
                ...payload,
                chaletId: ratingTargetBooking.chaletId,
                renterId: ratingTargetBooking.renterId,
              }),
          }}
          onClose={() => setRatingTargetBooking(null)}
        />
      )}

      {cancelTargetBooking && (
        <CancellationPolicyModal
          booking={cancelTargetBooking}
          actor="host"
          onClose={() => setCancelTargetBooking(null)}
          onConfirmCancel={async (id) => {
            await onCancelBookingWithPolicy(id);
            setCancelTargetBooking(null);
          }}
        />
      )}

      {receiptPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة إيصال تحويل العربون"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  معاينة إيصال تحويل العربون
                </h3>
                <p className="text-[11px] text-slate-500">
                  {receiptPreviewModal.booking.guestName} • {receiptPreviewModal.booking.chaletTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPreviewModal(null)}
                aria-label="إغلاق المعاينة"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              {receiptPreviewModal.url ? (
                <img
                  src={receiptPreviewModal.url}
                  alt="إيصال التحويل"
                  className="max-h-80 w-full rounded-2xl border border-slate-200 bg-sand-50 object-contain"
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-sand-50 p-6 text-center text-xs text-slate-600">
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                  <p className="font-bold">
                    {receiptPreviewModal.error || 'لا يوجد إيصال مرفق.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
