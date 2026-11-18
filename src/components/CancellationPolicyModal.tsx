import { AlertTriangle, CalendarX2, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { formatEGP } from '@/data/chalets';
import type { BookingRequest } from '@/types/chalet';
import { daysUntilDate, formatArabicDate } from '@/utils/bookingPricing';

interface CancellationPolicyModalProps {
  booking: BookingRequest;
  actor: 'renter' | 'host';
  onClose: () => void;
  onConfirmCancel: (bookingId: string) => void;
}

export function CancellationPolicyModal({
  booking,
  actor,
  onClose,
  onConfirmCancel,
}: CancellationPolicyModalProps) {
  const daysNotice = daysUntilDate(booking.checkIn);
  const isUnderTenDays = daysNotice < 10;
  const depositAmount =
    booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
  const wasDepositConfirmed = booking.status === 'confirmed';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="تأكيد إلغاء الحجز"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                isUnderTenDays
                  ? 'bg-error-50 text-error-600'
                  : 'bg-success-50 text-success-600'
              }`}
            >
              {isUnderTenDays ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <CalendarX2 className="h-6 w-6" />
              )}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                تأكيد إلغاء الحجز
              </h3>
              <p className="text-xs text-slate-500">
                {booking.chaletTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-sand-50 p-3.5 text-xs">
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-500">تاريخ الوصول:</span>
            <strong className="text-slate-900">{formatArabicDate(booking.checkIn)}</strong>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-500">المدة المتبقية حتى الوصول:</span>
            <strong
              className={isUnderTenDays ? 'text-error-700' : 'text-success-700'}
            >
              {daysNotice <= 0
                ? 'اليوم أو تاريخ فائت'
                : `${daysNotice.toLocaleString('ar-EG')} ${daysNotice <= 10 ? 'أيام' : 'يوماً'}`}
            </strong>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-500">قيمة جدية الحجز:</span>
            <strong className="text-primary-700">{formatEGP(depositAmount)}</strong>
          </div>
        </div>

        {isUnderTenDays ? (
          <div className="mt-4 rounded-2xl border border-error-500/40 bg-error-50 p-4 text-xs leading-relaxed text-error-800">
            <div className="flex items-center gap-2 font-extrabold text-error-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>جدية الحجز غير مستردة لتجاوز مهلة الـ 10 أيام</span>
            </div>
            <p className="mt-1.5">
              {wasDepositConfirmed
                ? `لأن الإلغاء يتم قبل موعد الوصول بأقل من ١٠ أيام (${Math.max(0, daysNotice)} أيام متبقية)، يتم احتساب جدية الحجز (${formatEGP(depositAmount)}) لصالح المالك وفق سياسة الإلغاء المؤكدة، مع إعادة فتح التواريخ على التقويم تلقائياً.`
                : 'الإلغاء يتم قبل موعد الوصول بأقل من ١٠ أيام؛ في حال تحويل جدية الحجز لا تُرد وفق سياسة الـ ١٠ أيام. سيتم إغلاق الطلب وإعادة فتح التواريخ.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-success-500/30 bg-success-50 p-4 text-xs leading-relaxed text-success-800">
            <div className="flex items-center gap-2 font-extrabold text-success-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>إلغاء ضمن المهلة المجانية (١٠ أيام فأكثر)</span>
            </div>
            <p className="mt-1.5">
              يتبقى على موعد الوصول {daysNotice.toLocaleString('ar-EG')} يوماً (أكثر من ١٠ أيام).{' '}
              {actor === 'renter'
                ? 'يحق لك استرداد جدية الحجز بالكامل، وسيتم إعادة فتح التواريخ على تقويم الوحدة تلقائياً.'
                : 'تُعاد جدية الحجز للمستأجر عند الإلغاء، وتُفتح التواريخ للحجز فوراً.'}
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            تراجع وإبقاء الحجز
          </button>
          <button
            type="button"
            onClick={() => onConfirmCancel(booking.id)}
            className="rounded-xl bg-error-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-error-700"
          >
            تأكيد إلغاء الحجز وفتح التواريخ
          </button>
        </div>
      </div>
    </div>
  );
}
