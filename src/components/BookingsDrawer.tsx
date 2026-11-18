import { useState } from 'react';
import {
  CalendarCheck2,
  Check,
  Copy,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { CancellationPolicyModal } from '@/components/CancellationPolicyModal';
import { ReviewForm } from '@/components/ChaletReviews';
import { RenterTrustBadge } from '@/components/RenterTrustBadge';
import { formatEGP } from '@/data/chalets';
import type {
  BookingRequest,
  ChaletReview,
  PropertyReviewTag,
  RenterTrustReview,
} from '@/types/chalet';
import { addDaysIso, formatArabicDate } from '@/utils/bookingPricing';

interface BookingsDrawerProps {
  bookings: BookingRequest[];
  reviews: ChaletReview[];
  renterTrustReviews: RenterTrustReview[];
  onClose: () => void;
  onCancelBookingWithPolicy: (id: string) => void;
  onRemoveBookingRecord: (id: string) => void;
  onSubmitReview: (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => void;
  onOpenChalet: (chaletId: string) => void;
}

function buildAgreementSummary(booking: BookingRequest): string {
  const checkOut = booking.checkOut ?? addDaysIso(booking.checkIn, booking.nights);
  const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
  const remaining = booking.remainingAmount ?? Math.max(0, booking.totalPrice - deposit);
  const lines = [
    'ملخص اتفاق حجز — منصة AgzStay (إجازة ستاي)',
    `الوحدة: ${booking.chaletTitle}`,
    `الموقع: ${booking.destinationLabel} - ${booking.resort}`,
    `المعلن: ${booking.ownerName} (${booking.ownerPhone})`,
    `المستأجر: ${booking.guestName} (${booking.guestPhone})`,
    `الوصول: ${formatArabicDate(booking.checkIn)} • المغادرة: ${formatArabicDate(checkOut)} (${booking.nights} ليالٍ • ${booking.guests} أفراد)`,
    `التكلفة الإجمالية للإقامة: ${formatEGP(booking.totalPrice)}`,
    `جدية الحجز (لا تُرد قبل الوصول بأقل من ١٠ أيام): ${formatEGP(deposit)}`,
    `المتبقي عند الاستلام: ${formatEGP(remaining)}`,
  ];
  if (booking.ownerInstaPay) {
    lines.push(`حساب إنستاباي للتحويل: ${booking.ownerInstaPay}`);
  }
  if (booking.securityDeposit !== undefined) {
    lines.push(`التأمين المسترد: ${formatEGP(booking.securityDeposit)}`);
  }
  lines.push('رسوم منصة AgzStay: ٠ ج.م');
  return lines.join('\n');
}

export function BookingsDrawer({
  bookings,
  reviews,
  renterTrustReviews,
  onClose,
  onCancelBookingWithPolicy,
  onRemoveBookingRecord,
  onSubmitReview,
  onOpenChalet,
}: BookingsDrawerProps) {
  const [activeReviewBookingId, setActiveReviewBookingId] = useState<string | null>(null);
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null);
  const [cancelTargetBooking, setCancelTargetBooking] = useState<BookingRequest | null>(null);

  const handleCopySummary = async (booking: BookingRequest) => {
    try {
      await navigator.clipboard?.writeText(buildAgreementSummary(booking));
      setCopiedBookingId(booking.id);
      setTimeout(() => setCopiedBookingId((prev) => (prev === booking.id ? null : prev)), 2500);
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

          {bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-sand-50 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <CalendarCheck2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">لا توجد طلبات أو استفسارات بعد</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                عند إرسال طلب حجز أو التواصل المباشر عبر واتساب/الاتصال مع أي معلن سيظهر هنا لمتابعته وتقييمه.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const whatsappNumber = booking.ownerPhone.startsWith('0')
                  ? `2${booking.ownerPhone}`
                  : booking.ownerPhone;
                const existingReview = reviews.find((r) => r.bookingId === booking.id);
                const isReviewing = activeReviewBookingId === booking.id;
                const checkOut = booking.checkOut ?? addDaysIso(booking.checkIn, booking.nights);
                const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
                const remaining =
                  booking.remainingAmount ?? Math.max(0, booking.totalPrice - deposit);

                return (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-slate-200 bg-sand-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            booking.status === 'confirmed'
                              ? 'bg-success-50 text-success-700'
                              : booking.status === 'cancelled'
                              ? 'bg-error-50 text-error-700'
                              : 'bg-warning-50 text-warning-700'
                          }`}
                        >
                          {booking.status === 'confirmed'
                            ? 'مؤكد — التواريخ محجوزة باسمك'
                            : booking.status === 'cancelled'
                            ? booking.depositForfeited
                              ? 'ملغي — جدية الحجز مصادرة (<١٠ أيام)'
                              : 'ملغي — التواريخ مفتوحة'
                            : 'في انتظار تأكيد جدية الحجز'}
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

                      {booking.status === 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => onRemoveBookingRecord(booking.id)}
                          aria-label="حذف من السجل"
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

                    {booking.status === 'cancelled' && booking.depositForfeited && (
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-error-50 px-3 py-2 text-[11px] font-bold text-error-700">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          جدية الحجز غير مستردة لتجاوز مهلة الـ 10 أيام ({formatEGP(booking.forfeitedAmount ?? deposit)})
                        </span>
                      </div>
                    )}

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
                        <a
                          href={`tel:${booking.ownerPhone}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <Phone className="h-3 w-3" />
                          اتصال
                        </a>
                        <a
                          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                            buildAgreementSummary(booking)
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-success-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-success-700"
                        >
                          <MessageCircle className="h-3 w-3" />
                          واتساب
                        </a>
                        {booking.status !== 'cancelled' && (
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
                          onSubmit={(payload) => {
                            onSubmitReview(payload);
                            setActiveReviewBookingId(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveReviewBookingId(booking.id)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-secondary-200 bg-secondary-50 py-2 text-xs font-bold text-secondary-700 transition hover:bg-secondary-100"
                        >
                          <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
                          <span>قيّم الوحدة والمعلن</span>
                        </button>
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
          onConfirmCancel={(id) => {
            onCancelBookingWithPolicy(id);
            setCancelTargetBooking(null);
          }}
        />
      )}
    </div>
  );
}
