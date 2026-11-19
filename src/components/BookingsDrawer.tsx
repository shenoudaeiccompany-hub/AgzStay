import { useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  Check,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  KeyRound,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
  Upload,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import { CancellationPolicyModal } from '@/components/CancellationPolicyModal';
import { ReviewForm } from '@/components/ChaletReviews';
import { RenterTrustBadge } from '@/components/RenterTrustBadge';
import { formatEGP } from '@/data/chalets';
import {
  revealOwnerContact,
  type RepoResult,
} from '@/services/agzstayRepository';
import type {
  BookingRequest,
  Chalet,
  ChaletReview,
  PropertyReviewTag,
  RenterTrustReview,
  RevealedOwnerContact,
} from '@/types/chalet';
import { addDaysIso, formatArabicDate } from '@/utils/bookingPricing';

interface BookingsDrawerProps {
  bookings: BookingRequest[];
  chalets: Chalet[];
  reviews: ChaletReview[];
  renterTrustReviews: RenterTrustReview[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
  onSubmitPaymentReceipt: (
    bookingId: string,
    file: File,
    reference?: string
  ) => Promise<RepoResult<BookingRequest>>;
  onCancelBookingWithPolicy: (id: string) => Promise<void> | void;
  onRemoveBookingRecord: (id: string) => void;
  onSubmitReview: (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => Promise<RepoResult<ChaletReview>> | void;
  onOpenChalet: (chaletId: string) => void;
}

function buildAgreementSummary(
  booking: BookingRequest,
  revealedContact?: RevealedOwnerContact
): string {
  const checkOut = booking.checkOut ?? addDaysIso(booking.checkIn, booking.nights);
  const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
  const remaining = booking.remainingAmount ?? Math.max(0, booking.totalPrice - deposit);
  const phoneLabel = revealedContact?.ownerPhone || booking.ownerPhone || 'متاح بعد تفعيل التواصل';
  const instaPayLabel = revealedContact?.instaPayHandle || booking.ownerInstaPay;
  const lines = [
    'ملخص اتفاق حجز — منصة AgzStay (إجازة ستاي)',
    `الوحدة: ${booking.chaletTitle}`,
    `الموقع: ${booking.destinationLabel} - ${booking.resort}`,
    `المعلن: ${booking.ownerName} (${phoneLabel})`,
    `المستأجر: ${booking.guestName} (${booking.guestPhone})`,
    `الوصول: ${formatArabicDate(booking.checkIn)} • المغادرة: ${formatArabicDate(checkOut)} (${booking.nights} ليالٍ • ${booking.guests} أفراد)`,
    `التكلفة الإجمالية للإقامة: ${formatEGP(booking.totalPrice)}`,
    `جدية الحجز (لا تُرد قبل الوصول بأقل من ١٠ أيام): ${formatEGP(deposit)}`,
    `المتبقي عند الاستلام: ${formatEGP(remaining)}`,
  ];
  if (instaPayLabel) {
    lines.push(`حساب إنستاباي للتحويل: ${instaPayLabel}`);
  }
  if (booking.securityDeposit !== undefined) {
    lines.push(`التأمين المسترد: ${formatEGP(booking.securityDeposit)}`);
  }
  lines.push('رسوم منصة AgzStay: ٠ ج.م');
  return lines.join('\n');
}

export function BookingsDrawer({
  bookings,
  chalets,
  reviews,
  renterTrustReviews,
  loading = false,
  error = null,
  onRetry,
  onClose,
  onSubmitPaymentReceipt,
  onCancelBookingWithPolicy,
  onRemoveBookingRecord,
  onSubmitReview,
  onOpenChalet,
}: BookingsDrawerProps) {
  const [activeReviewBookingId, setActiveReviewBookingId] = useState<string | null>(null);
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null);
  const [expandedWelcomeId, setExpandedWelcomeId] = useState<string | null>(null);
  const [copiedWifiId, setCopiedWifiId] = useState<string | null>(null);
  const [cancelTargetBooking, setCancelTargetBooking] = useState<BookingRequest | null>(null);
  const [revealedContacts, setRevealedContacts] = useState<Record<string, RevealedOwnerContact>>({});
  const [revealingChaletId, setRevealingChaletId] = useState<string | null>(null);
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [uploadingReceiptId, setUploadingReceiptId] = useState<string | null>(null);
  const [receiptUploadError, setReceiptUploadError] = useState<Record<string, string>>({});

  const handleRevealContact = async (chaletId: string) => {
    setRevealingChaletId(chaletId);
    const res = await revealOwnerContact(chaletId);
    setRevealingChaletId(null);
    if (res.data) {
      setRevealedContacts((prev) => ({ ...prev, [chaletId]: res.data! }));
    }
  };

  const handleReceiptSelect = async (
    bookingId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setReceiptUploadError((prev) => ({
        ...prev,
        [bookingId]: 'الحد الأقصى لحجم الإيصال هو ٥ ميجابايت.',
      }));
      event.target.value = '';
      return;
    }

    setReceiptUploadError((prev) => ({ ...prev, [bookingId]: '' }));
    setUploadingReceiptId(bookingId);
    try {
      const res = await onSubmitPaymentReceipt(
        bookingId,
        file,
        paymentReferences[bookingId]?.trim() || undefined
      );
      if (res.error) {
        setReceiptUploadError((prev) => ({
          ...prev,
          [bookingId]: res.error || 'تعذر رفع الإيصال.',
        }));
      }
    } finally {
      setUploadingReceiptId(null);
      event.target.value = '';
    }
  };

  const handleCopySummary = async (booking: BookingRequest) => {
    try {
      await navigator.clipboard?.writeText(
        buildAgreementSummary(booking, revealedContacts[booking.chaletId])
      );
      setCopiedBookingId(booking.id);
      setTimeout(() => setCopiedBookingId((prev) => (prev === booking.id ? null : prev)), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyWifi = async (bookingId: string, password: string) => {
    try {
      await navigator.clipboard?.writeText(password);
      setCopiedWifiId(bookingId);
      setTimeout(() => setCopiedWifiId((prev) => (prev === bookingId ? null : prev)), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="طلباتي وسجل الثقة"
    >
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-secondary-500" />
            <h2 className="text-lg font-bold text-slate-900">
              طلباتي واستفساراتي ({bookings.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <RenterTrustBadge reviews={renterTrustReviews} />

          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-xs font-bold text-primary-800">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>جاري تحديث حالة طلباتك...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-error-200 bg-error-50 px-3 py-2.5 text-xs font-bold text-error-800">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-error-700"
                >
                  إعادة
                </button>
              )}
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-sand-50 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <CalendarCheck2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">لا توجد طلبات أو استفسارات بعد</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                عند إرسال طلب حجز لأي وحدة سيظهر هنا لمتابعته والتواصل مع المالك وتقييم التجربة بعد اكتمال الإقامة.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const revealed = revealedContacts[booking.chaletId];
                const effectivePhone = revealed?.ownerPhone || booking.ownerPhone || '';
                const effectiveInstaPay =
                  revealed?.instaPayHandle || booking.ownerInstaPay || effectivePhone;
                const whatsappNumber = effectivePhone
                  ? effectivePhone.startsWith('0')
                    ? `2${effectivePhone}`
                    : effectivePhone
                  : '';
                const existingReview = reviews.find((r) => r.bookingId === booking.id);
                const isReviewing = activeReviewBookingId === booking.id;
                const checkOut = booking.checkOut ?? addDaysIso(booking.checkIn, booking.nights);
                const canReview = booking.status === 'completed';
                const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
                const remaining =
                  booking.remainingAmount ?? Math.max(0, booking.totalPrice - deposit);
                const canRevealContactNow =
                  booking.status === 'approved' ||
                  booking.status === 'payment_submitted' ||
                  booking.status === 'pending_verification' ||
                  booking.status === 'confirmed' ||
                  booking.status === 'completed';

                return (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-slate-200 bg-sand-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            booking.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-900'
                              : booking.status === 'confirmed'
                              ? 'bg-success-50 text-success-700'
                              : booking.status === 'approved'
                              ? 'bg-sky-100 text-sky-900'
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
                            ? 'مؤكد — التواريخ محجوزة باسمك'
                            : booking.status === 'approved'
                            ? 'وافق المالك — ارفع إيصال العربون الآن'
                            : booking.status === 'payment_submitted' ||
                              booking.status === 'pending_verification'
                            ? 'تم رفع الإيصال — بانتظار تأكيد المالك'
                            : booking.status === 'rejected'
                            ? 'مرفوض من المالك'
                            : booking.status === 'expired'
                            ? 'انتهت المهلة (٢٤ ساعة)'
                            : booking.status === 'cancelled'
                            ? booking.depositForfeited
                              ? 'ملغي — جدية الحجز مصادرة (<١٠ أيام)'
                              : 'ملغي — التواريخ مفتوحة'
                            : 'قيد الانتظار — بانتظار موافقة المالك (٢٤ ساعة)'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenChalet(booking.chaletId);
                          }}
                          className="mt-1.5 block text-right text-sm font-bold text-slate-900 transition hover:text-primary-600"
                        >
                          {booking.chaletTitle}
                        </button>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3.5 w-3.5 text-secondary-500" />
                          <span>
                            {booking.destinationLabel} • {booking.resort}
                          </span>
                        </div>
                      </div>

                      {(booking.status === 'cancelled' ||
                        booking.status === 'rejected' ||
                        booking.status === 'expired') && (
                        <button
                          type="button"
                          onClick={() => onRemoveBookingRecord(booking.id)}
                          aria-label="حذف من العرض"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-error-50 hover:text-error-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-white p-2.5 text-xs">
                      <div>
                        <span className="text-slate-400">الوصول ← المغادرة</span>
                        <div className="font-bold text-slate-800">
                          {formatArabicDate(booking.checkIn)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          حتى {formatArabicDate(checkOut)} ({booking.nights} ليالٍ)
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">جدية الحجز</span>
                        <div className="font-bold text-secondary-700">{formatEGP(deposit)}</div>
                        <div className="text-[10px] text-slate-500">
                          متبقي: {formatEGP(remaining)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">الإجمالي</span>
                        <div className="font-bold text-primary-700">
                          {formatEGP(booking.totalPrice)}
                        </div>
                      </div>
                    </div>

                    {booking.status === 'pending' && (
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>
                          ينتهي الطلب تلقائياً خلال ٢٤ ساعة إذا لم يوافق المالك، وتظهر بيانات التحويل فور الموافقة.
                        </span>
                      </div>
                    )}

                    {booking.rejectionReason && (
                      <div className="mt-2.5 rounded-xl bg-error-50 px-3 py-2 text-[11px] font-bold text-error-700">
                        سبب الرفض: {booking.rejectionReason}
                      </div>
                    )}

                    {booking.status === 'approved' && (
                      <div className="mt-3 space-y-2.5 rounded-2xl border border-secondary-200 bg-secondary-50/75 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2 font-extrabold text-secondary-900">
                          <span className="inline-flex items-center gap-1.5">
                            <CreditCard className="h-4 w-4 text-secondary-600" />
                            تحويل العربون ({formatEGP(deposit)}) ورفع الإيصال
                          </span>
                        </div>

                        <div className="rounded-xl bg-white px-3 py-2 text-[11px] text-slate-700">
                          {effectiveInstaPay ? (
                            <div className="flex items-center justify-between gap-2">
                              <span>حساب التحويل / InstaPay:</span>
                              <strong dir="ltr" className="text-primary-700">
                                {effectiveInstaPay}
                              </strong>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRevealContact(booking.chaletId)}
                              className="font-bold text-primary-700 underline"
                            >
                              اضغط هنا لإظهار رقم وحساب تحويل المالك
                            </button>
                          )}
                        </div>

                        <input
                          type="text"
                          dir="ltr"
                          value={paymentReferences[booking.id] ?? ''}
                          onChange={(e) =>
                            setPaymentReferences((prev) => ({
                              ...prev,
                              [booking.id]: e.target.value,
                            }))
                          }
                          placeholder="رقم مرجع التحويل (اختياري)"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs focus:border-secondary-500 focus:outline-none"
                        />

                        {receiptUploadError[booking.id] && (
                          <p className="text-[11px] font-bold text-error-700">
                            {receiptUploadError[booking.id]}
                          </p>
                        )}

                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-secondary-500 bg-white px-3 py-2.5 text-[11px] font-bold text-secondary-800 hover:bg-secondary-50">
                          <Upload className="h-4 w-4 text-secondary-600" />
                          <span>
                            {uploadingReceiptId === booking.id
                              ? 'جاري رفع الإيصال...'
                              : 'رفع صورة إيصال التحويل (PNG / JPG / PDF)'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            disabled={uploadingReceiptId === booking.id}
                            onChange={(e) => void handleReceiptSelect(booking.id, e)}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    )}

                    {booking.status === 'cancelled' && booking.depositForfeited && (
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-error-50 px-3 py-2 text-[11px] font-bold text-error-700">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          جدية الحجز غير مستردة لتجاوز مهلة الـ 10 أيام ({formatEGP(booking.forfeitedAmount ?? deposit)})
                        </span>
                      </div>
                    )}

                    {(booking.status === 'confirmed' || booking.status === 'completed') && (() => {
                      const matchedChalet = chalets.find((c) => c.id === booking.chaletId);
                      const guide = matchedChalet?.welcomeGuide;
                      const mapsHref =
                        guide?.mapsUrl ||
                        (matchedChalet?.coordinates
                          ? `https://maps.google.com/?q=${matchedChalet.coordinates.lat},${matchedChalet.coordinates.lng}`
                          : `https://maps.google.com/?q=${encodeURIComponent(booking.resort)}`);
                      const isExpanded = expandedWelcomeId === booking.id;
                      const caretakerContact = guide?.caretakerPhone || effectivePhone;

                      return (
                        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/75 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-900">
                              <KeyRound className="h-4 w-4 text-emerald-600" />
                              بطاقة الترحيب التلقائية وتعليمات الدخول
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedWelcomeId(isExpanded ? null : booking.id)
                              }
                              className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm hover:bg-emerald-100"
                            >
                              {isExpanded ? 'إخفاء' : 'عرض التفاصيل'}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-2.5 space-y-2 border-t border-emerald-200/80 pt-2.5 text-[11px] text-slate-800">
                              <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2">
                                <div className="flex items-center gap-1.5">
                                  <Wifi className="h-3.5 w-3.5 text-secondary-600" />
                                  <span>
                                    واي فاي: <strong>{guide?.wifiName || 'AgzStay_Guest'}</strong> • كلمة السر:{' '}
                                    <strong dir="ltr">{guide?.wifiPassword || 'سيُرسل من المالك'}</strong>
                                  </span>
                                </div>
                                {guide?.wifiPassword && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyWifi(booking.id, guide.wifiPassword)}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700"
                                  >
                                    {copiedWifiId === booking.id ? (
                                      <Check className="h-3 w-3 text-success-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    <span>{copiedWifiId === booking.id ? 'نُسخ' : 'نسخ'}</span>
                                  </button>
                                )}
                              </div>

                              <div className="rounded-xl bg-white px-2.5 py-2 leading-relaxed">
                                <span className="font-bold text-primary-800">تعليمات البوابة والكمبوند: </span>
                                <span>
                                  {guide?.gateInstructions ||
                                    'يُرجى التواصل مع المشرف قبل الوصول بـ ٣٠ دقيقة لتسليم المفاتيح وتصاريح الدخول.'}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2">
                                <span>
                                  المشرف / الحارس:{' '}
                                  <strong>{guide?.caretakerName || booking.ownerName}</strong>
                                  {caretakerContact ? (
                                    <>
                                      {' '}(
                                      <a
                                        href={`tel:${caretakerContact}`}
                                        className="font-bold text-primary-700 underline"
                                      >
                                        {caretakerContact}
                                      </a>
                                      )
                                    </>
                                  ) : null}
                                </span>

                                <a
                                  href={mapsHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-secondary-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-secondary-600"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span>خرائط جوجل</span>
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                      <span className="text-xs font-semibold text-slate-600">
                        المعلن: {booking.ownerName}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopySummary(booking)}
                          className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
                        >
                          {copiedBookingId === booking.id ? (
                            <Check className="h-3 w-3 text-success-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>
                            {copiedBookingId === booking.id ? 'تم النسخ' : 'ملخص الاتفاق'}
                          </span>
                        </button>

                        {effectivePhone ? (
                          <>
                            <a
                              href={`tel:${effectivePhone}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                            >
                              <Phone className="h-3 w-3" />
                              اتصال
                            </a>
                            <a
                              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                                buildAgreementSummary(booking, revealed)
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-success-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-success-700"
                            >
                              <MessageCircle className="h-3 w-3" />
                              واتساب
                            </a>
                          </>
                        ) : (
                          canRevealContactNow && (
                            <button
                              type="button"
                              disabled={revealingChaletId === booking.chaletId}
                              onClick={() => handleRevealContact(booking.chaletId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-secondary-300 bg-secondary-50 px-2.5 py-1.5 text-xs font-bold text-secondary-800 hover:bg-secondary-100 disabled:opacity-60"
                            >
                              <Phone className="h-3 w-3" />
                              <span>
                                {revealingChaletId === booking.chaletId
                                  ? 'جاري الجلب...'
                                  : 'عرض رقم المالك'}
                              </span>
                            </button>
                          )
                        )}

                        {booking.status !== 'cancelled' &&
                          booking.status !== 'completed' &&
                          booking.status !== 'rejected' &&
                          booking.status !== 'expired' && (
                          <button
                            type="button"
                            onClick={() => setCancelTargetBooking(booking)}
                            className="inline-flex items-center gap-1 rounded-lg border border-error-500/30 bg-error-50 px-2.5 py-1.5 text-xs font-bold text-error-700 hover:bg-error-500 hover:text-white"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>إلغاء الحجز</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 border-t border-slate-200 pt-3">
                      {existingReview ? (
                        <div className="rounded-xl bg-white p-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-success-700">تقييمك المنشور</span>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-3.5 w-3.5 ${
                                    star <= existingReview.rating
                                      ? 'fill-warning-500 text-warning-500'
                                      : 'fill-slate-100 text-slate-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-2 text-slate-600">
                            {existingReview.comment}
                          </p>
                        </div>
                      ) : isReviewing ? (
                        <ReviewForm
                          booking={booking}
                          compact
                          onCancel={() => setActiveReviewBookingId(null)}
                          onSubmit={async (payload) => {
                            const res = await onSubmitReview(payload);
                            if (!res || !res.error) {
                              setActiveReviewBookingId(null);
                            }
                            return res;
                          }}
                        />
                      ) : canReview ? (
                        <button
                          type="button"
                          onClick={() => setActiveReviewBookingId(booking.id)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-secondary-200 bg-secondary-50 py-2 text-xs font-bold text-secondary-700 transition hover:bg-secondary-100"
                        >
                          <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
                          <span>قيّم الوحدة والمعلن</span>
                        </button>
                      ) : (
                        <div className="rounded-xl bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-500">
                          يُفتح التقييم تلقائياً بعد اكتمال الإقامة (completed) بعد تاريخ المغادرة ({formatArabicDate(checkOut)})
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {cancelTargetBooking && (
        <CancellationPolicyModal
          booking={cancelTargetBooking}
          actor="renter"
          onClose={() => setCancelTargetBooking(null)}
          onConfirmCancel={async (id) => {
            await onCancelBookingWithPolicy(id);
            setCancelTargetBooking(null);
          }}
        />
      )}
    </div>
  );
}
