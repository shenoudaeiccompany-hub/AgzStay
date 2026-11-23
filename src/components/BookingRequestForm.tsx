import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  MessageCircle,
  MessageSquareText,
  Phone,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { formatEGP } from '@/data/chalets';
import { isSupabaseConfigured } from '@/lib/supabase';
import { uploadPaymentReceipt, type RepoResult } from '@/services/agzstayRepository';
import type {
  AppUser,
  BookingRequest,
  BookingStatus,
  Chalet,
  RentalDuration,
} from '@/types/chalet';
import { toArabicError } from '@/utils/arabicErrors';
import {
  addDaysIso,
  calculateStayPricing,
  daysUntilDate,
  findConflictingDates,
  formatArabicDate,
  type StayPricingBreakdown,
} from '@/utils/bookingPricing';

interface BookingRequestFormProps {
  currentUser: AppUser | null;
  chalet: Chalet;
  today: string;
  rentalDuration: RentalDuration;
  onDurationChange: (nextDuration: RentalDuration) => void;
  checkIn: string;
  checkOut: string;
  nights: number;
  onCheckInChange: (nextIn: string) => void;
  onCheckOutChange: (nextOut: string) => void;
  guests: number;
  onGuestsChange: (guests: number) => void;
  occupiedDates: Set<string>;
  confirmedBookedDates: Set<string>;
  pricing: StayPricingBreakdown;
  badgeVariant: 'founding' | 'owner' | 'broker';
  canSeeOwnerContact: boolean;
  effectiveOwnerPhone: string;
  effectiveInstaPay: string;
  whatsappNumber: string;
  whatsappDirectMessage: string;
  onOpenAuth: () => void;
  onCloseModal: () => void;
  onSubmitBooking: (
    booking: Omit<BookingRequest, 'id' | 'status' | 'createdAt'> & { status?: BookingStatus }
  ) => Promise<RepoResult<BookingRequest>>;
}

export function BookingRequestForm({
  currentUser,
  chalet,
  today,
  rentalDuration,
  onDurationChange,
  checkIn,
  checkOut,
  nights,
  onCheckInChange,
  onCheckOutChange,
  guests,
  onGuestsChange,
  occupiedDates,
  confirmedBookedDates,
  pricing,
  badgeVariant,
  canSeeOwnerContact,
  effectiveOwnerPhone,
  effectiveInstaPay,
  whatsappNumber,
  whatsappDirectMessage,
  onOpenAuth,
  onCloseModal,
  onSubmitBooking,
}: BookingRequestFormProps) {
  const [guestName, setGuestName] = useState(currentUser?.name ?? '');
  const [guestPhone, setGuestPhone] = useState(currentUser?.phone ?? '');
  const [notes, setNotes] = useState('');
  const [splitFamilies, setSplitFamilies] = useState(2);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<BookingStatus>('pending');
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [instaPayCopied, setInstaPayCopied] = useState(false);
  const [formError, setFormError] = useState('');

  const supportWhatsapp =
    (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined)?.replace(/\D/g, '') || '';
  const directWhatsappTarget =
    canSeeOwnerContact && whatsappNumber ? whatsappNumber : supportWhatsapp;
  const directWhatsappHref = directWhatsappTarget
    ? `https://wa.me/${directWhatsappTarget}?text=${encodeURIComponent(whatsappDirectMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappDirectMessage)}`;

  const daysBeforeCheckIn = daysUntilDate(checkIn, today);
  const conflicts = useMemo(
    () => findConflictingDates(checkIn, nights, occupiedDates),
    [checkIn, nights, occupiedDates]
  );

  const perFamilyShare = Math.round(pricing.subtotal / Math.max(1, splitFamilies));

  const agreementSummaryText = useMemo(() => {
    const durationLabel =
      rentalDuration === 'monthly' ? 'شهري' : rentalDuration === 'weekly' ? 'أسبوعي' : 'يومي';
    const advertiserLabel =
      badgeVariant === 'broker'
        ? 'وسيط معتمد'
        : badgeVariant === 'founding'
        ? 'مالك مؤسس'
        : 'مالك مباشر';
    return [
      'ملخص طلب حجز مبدئي — منصة AgzStay (إجازة ستاي)',
      `الوحدة: ${chalet.title}`,
      `الموقع: ${chalet.destinationLabel}${chalet.area ? ` - ${chalet.area}` : ''} (${chalet.resort})`,
      `المعلن: ${chalet.owner.name} (${advertiserLabel})${effectiveOwnerPhone ? ` — ${effectiveOwnerPhone}` : ''}`,
      effectiveInstaPay ? `حساب إنستاباي لجدية الحجز: ${effectiveInstaPay}` : '',
      `المستأجر: ${guestName.trim() || 'غير محدد'} (${guestPhone.trim() || 'غير محدد'})`,
      `نظام الإيجار: ${durationLabel} • الوصول: ${formatArabicDate(checkIn)} ← المغادرة: ${formatArabicDate(checkOut)} (${nights} ليالٍ • ${guests} أفراد)`,
      `التكلفة الإجمالية للإقامة: ${formatEGP(pricing.subtotal)}`,
      `جدية الحجز المطلوبة (${pricing.depositLabel}): ${formatEGP(pricing.downPaymentAmount)}`,
      `المتبقي عند الاستلام: ${formatEGP(pricing.remainingBalance)}`,
      `التأمين المسترد: ${formatEGP(pricing.securityDeposit)}`,
      'سياسة الإلغاء: جدية الحجز لا تُرد في حال إلغاء الحجز قبل موعد الوصول بأقل من 10 أيام.',
      `تصاريح القرية والخدمات: ${chalet.includesPasses ? 'مشمولة بدون رسوم إضافية' : 'غير مشمولة / تُسدد عند البوابة'}`,
      'رسوم منصة AgzStay: ٠ ج.م',
    ]
      .filter(Boolean)
      .join('\n');
  }, [
    badgeVariant,
    chalet,
    checkIn,
    checkOut,
    effectiveInstaPay,
    effectiveOwnerPhone,
    guestName,
    guestPhone,
    guests,
    nights,
    pricing,
    rentalDuration,
  ]);

  const handleCopyAgreement = async () => {
    try {
      await navigator.clipboard?.writeText(agreementSummaryText);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2500);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleCopyInstaPay = async () => {
    if (!effectiveInstaPay) return;
    try {
      await navigator.clipboard?.writeText(effectiveInstaPay);
      setInstaPayCopied(true);
      setTimeout(() => setInstaPayCopied(false), 2200);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chalet.isDemo) {
      setFormError('هذا إعلان تجريبي للعرض فقط — أضف وحدة حقيقية من المالك لإجراء حجز.');
      return;
    }
    if (!isSupabaseConfigured) {
      setFormError('وضع تجريبي: الحجز معطل لعدم إعداد Supabase.');
      return;
    }
    if (!currentUser) {
      setFormError(toArabicError({ message: 'not_authenticated' }));
      return;
    }
    if (chalet.ownerId && chalet.ownerId === currentUser.id) {
      setFormError(toArabicError({ message: 'cannot_book_own' }));
      return;
    }
    if (!checkIn || !checkOut || checkOut <= checkIn || nights <= 0) {
      setFormError(toArabicError({ message: 'invalid_dates' }));
      return;
    }
    if (guests < 1 || guests > chalet.maxGuests) {
      setFormError(toArabicError({ message: 'invalid_guests' }));
      return;
    }
    if (conflicts.length > 0) {
      setFormError(
        `${toArabicError({ message: 'dates_unavailable' })} (${conflicts.map(formatArabicDate).join('، ')}). يرجى اختيار موعد متاح من التقويم.`
      );
      return;
    }
    if (!guestName.trim()) {
      setFormError('يرجى إدخال اسمك الكامل.');
      return;
    }
    if (!/^01[0125][0-9]{8}$/.test(guestPhone.trim())) {
      setFormError(toArabicError({ message: 'phone_invalid' }));
      return;
    }
    if (!policyAccepted) {
      setFormError(toArabicError({ message: 'policy_not_accepted' }));
      return;
    }

    // Recompute latest server-safe quote right before submit
    const freshPricing = calculateStayPricing(chalet, checkIn, nights, rentalDuration);

    setFormError('');
    setIsSubmittingBooking(true);
    try {
      let uploadedReceiptPath: string | undefined;
      if (receiptFile) {
        const uploadRes = await uploadPaymentReceipt(receiptFile);
        if (uploadRes.error || !uploadRes.data) {
          setFormError(uploadRes.error || 'تعذر رفع إيصال InstaPay.');
          return;
        }
        uploadedReceiptPath = uploadRes.data.path;
      }

      const targetStatus: BookingStatus = uploadedReceiptPath
        ? 'pending_verification'
        : 'pending';

      const bookingResult = await onSubmitBooking({
        chaletId: chalet.id,
        chaletTitle: chalet.title,
        resort: chalet.resort,
        destinationLabel: chalet.destinationLabel,
        ownerName: chalet.owner.name,
        ownerPhone: effectiveOwnerPhone || undefined,
        ownerInstaPay: effectiveInstaPay || undefined,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        checkIn,
        checkOut,
        nights,
        rentalDuration,
        inquiryChannel: 'form',
        guests,
        totalPrice: freshPricing.subtotal,
        depositAmount: freshPricing.downPaymentAmount,
        remainingAmount: freshPricing.remainingBalance,
        securityDeposit: freshPricing.securityDeposit,
        policyAccepted: true,
        receiptPath: uploadedReceiptPath,
        paymentReference: paymentReference.trim() || undefined,
        status: targetStatus,
        notes: notes.trim(),
      });

      if (bookingResult.error) {
        setFormError(bookingResult.error);
        return;
      }

      setSubmittedStatus(bookingResult.data?.status ?? targetStatus);
      setSubmitted(true);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  return (
    <div className="sticky top-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
        <div>
          <span className="text-2xl font-extrabold text-primary-600">
            {formatEGP(
              rentalDuration === 'monthly'
                ? chalet.monthlyPrice ?? Math.round(chalet.pricePerNight * 22)
                : rentalDuration === 'weekly'
                ? chalet.weeklyPrice ?? Math.round(chalet.pricePerNight * 6.2)
                : chalet.pricePerNight
            )}
          </span>
          <span className="mr-1 text-xs text-slate-500">
            / {rentalDuration === 'monthly' ? 'شهر' : rentalDuration === 'weekly' ? 'أسبوع' : 'ليلة عادية'}
          </span>
        </div>
        <span className="rounded-lg bg-secondary-50 px-2.5 py-1 text-xs font-bold text-secondary-700">
          {badgeVariant === 'broker' ? 'وسيط معتمد' : '٠٪ عمولة وسيط'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-sand-100 p-1">
        {[
          { id: 'daily', label: 'يومي' },
          { id: 'weekly', label: 'أسبوعي' },
          { id: 'monthly', label: 'شهري' },
        ].map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onDurationChange(d.id as RentalDuration)}
            className={`min-h-[44px] rounded-lg py-1.5 text-xs font-bold transition ${
              rentalDuration === d.id
                ? 'bg-secondary-500 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-primary-100 bg-primary-50/70 p-2.5 text-xs">
        <div>
          <span className="block text-[11px] text-slate-600">
            الإجمالي ({nights.toLocaleString('ar-EG')} ليالٍ)
          </span>
          <strong className="text-sm font-extrabold text-primary-800">
            {formatEGP(pricing.subtotal)}
          </strong>
        </div>
        <div className="border-r border-primary-200 pr-2.5">
          <span className="block text-[11px] text-secondary-700">
            عربون الحجز ({pricing.depositLabel})
          </span>
          <strong className="text-sm font-extrabold text-secondary-700">
            {formatEGP(pricing.downPaymentAmount)}
          </strong>
        </div>
      </div>

      {canSeeOwnerContact && effectiveOwnerPhone ? (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={directWhatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-success-500 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-success-700"
          >
            <MessageCircle className="h-4 w-4" />
            <span>واتساب المعلن</span>
          </a>
          <a
            href={`tel:${effectiveOwnerPhone}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-primary-600 bg-primary-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
          >
            <Phone className="h-4 w-4" />
            <span>اتصال بالمعلن</span>
          </a>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
          <a
            href={directWhatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            <span>واتساب مباشر برسالة جاهزة (اسم الوحدة والتواريخ)</span>
          </a>
          <p className="text-center text-[11px] font-semibold text-emerald-900">
            يجهّز رسالة تتضمن «{chalet.resort}» وتواريخ {formatArabicDate(checkIn)} ←{' '}
            {formatArabicDate(checkOut)} وعربون {formatEGP(pricing.downPaymentAmount)}.
          </p>
        </div>
      )}

      {submitted ? (
        <div className="space-y-4 py-4">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 text-warning-600">
              <CheckCircle2 className="h-8 w-8 text-success-500" />
            </div>
            <span className="mt-2 inline-block rounded-full bg-warning-50 px-3 py-0.5 text-[11px] font-bold text-warning-800">
              {submittedStatus === 'pending_verification'
                ? 'حالة الحجز: قيد التحقق من الإيصال (pending_verification)'
                : 'حالة الطلب: بانتظار موافقة المالك (مهلة ٢٤ ساعة)'}
            </span>
            <h3 className="mt-2 text-lg font-bold text-slate-900">
              {submittedStatus === 'pending_verification'
                ? 'تم إرسال الحجز وإيصال InstaPay للمراجعة'
                : 'تم إرسال طلب الحجز بنجاح'}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {submittedStatus === 'pending_verification'
                ? `تم حفظ الإيصال في حاوية receipts وإغلاق التواريخ مؤقتاً لحين مراجعة الإدارة والمالك وتأكيد العربون (${formatEGP(pricing.downPaymentAmount)}).`
                : `سيراجع المالك طلبك خلال ٢٤ ساعة. فور الموافقة سيصلك إشعار وتظهر بيانات التحويل لرفع إيصال العربون (${formatEGP(pricing.downPaymentAmount)}) داخل قائمة "طلباتي".`}
            </p>
          </div>

          {effectiveInstaPay && (
            <div className="rounded-2xl border border-secondary-200 bg-secondary-50/80 p-3.5 text-xs">
              <div className="flex items-center justify-between font-bold text-secondary-900">
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-secondary-600" />
                  بيانات الدفع المتاحة (InstaPay):
                </span>
                <button
                  type="button"
                  onClick={handleCopyInstaPay}
                  aria-label="نسخ حساب إنستاباي"
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-secondary-700 shadow-sm"
                >
                  {instaPayCopied ? (
                    <Check className="h-3 w-3 text-success-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{instaPayCopied ? 'تم النسخ' : effectiveInstaPay}</span>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-primary-100 bg-sand-50 p-3.5 text-xs">
            <div className="flex items-center justify-between font-bold text-primary-700">
              <span>ملخص الاتفاق النهائي</span>
              <span>٠٪ عمولة منصة</span>
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-600">
              {agreementSummaryText}
            </pre>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyAgreement}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-primary-200 bg-white py-2 text-xs font-bold text-primary-700 hover:bg-primary-50"
              >
                {summaryCopied ? (
                  <Check className="h-3.5 w-3.5 text-success-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{summaryCopied ? 'تم النسخ!' : 'نسخ الملخص'}</span>
              </button>
              <a
                href={directWhatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-success-500 py-2 text-xs font-bold text-white hover:bg-success-700"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>إرسال عبر واتساب</span>
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseModal}
            className="min-h-[44px] w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
          >
            العودة للتصفح
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5 border-t border-slate-100 pt-3">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-700">
              تقويم التوافر والأسعار اليومية (متاح / محجوز)
            </span>
            <AvailabilityCalendar
              chalet={chalet}
              selectedCheckIn={checkIn}
              nights={nights}
              occupiedDates={occupiedDates}
              confirmedBookedDates={confirmedBookedDates}
              showPrices
              onSelectDate={(iso) => {
                setFormError('');
                onCheckInChange(iso);
              }}
            />
          </div>

          {conflicts.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-error-50 p-2.5 text-xs font-semibold text-error-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error-500" />
              <span>
                يوجد تعارض مع مواعيد محجوزة ({conflicts.map(formatArabicDate).join('، ')}). يرجى اختيار تواريخ متاحة.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="detail-checkin" className="mb-1 block text-xs font-bold text-slate-700">
                تاريخ الوصول
              </label>
              <input
                id="detail-checkin"
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => {
                  setFormError('');
                  onCheckInChange(e.target.value);
                }}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="detail-checkout" className="mb-1 block text-xs font-bold text-slate-700">
                تاريخ المغادرة ({nights.toLocaleString('ar-EG')} ليالٍ)
              </label>
              <input
                id="detail-checkout"
                type="date"
                min={addDaysIso(checkIn, 1)}
                value={checkOut}
                onChange={(e) => {
                  setFormError('');
                  onCheckOutChange(e.target.value);
                }}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {pricing.periodNotes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-extrabold">
                <MessageSquareText className="h-3.5 w-3.5 text-amber-600" />
                <span>ملاحظات المالك لهذه الفترة:</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] font-semibold">
                {pricing.periodNotes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="booking-guests" className="mb-1 block text-xs font-bold text-slate-700">
              عدد الأفراد
            </label>
            <select
              id="booking-guests"
              value={guests}
              onChange={(e) => onGuestsChange(Number(e.target.value))}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
            >
              {Array.from({ length: chalet.maxGuests }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  {g} {g === 1 ? 'فرد' : 'أفراد'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="booking-name" className="mb-1 block text-xs font-bold text-slate-700">
              الاسم الكامل
            </label>
            <input
              id="booking-name"
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="مثال: أحمد محمود"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="booking-phone" className="mb-1 block text-xs font-bold text-slate-700">
              رقم الموبايل (مصر)
            </label>
            <input
              id="booking-phone"
              type="tel"
              dir="ltr"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="01000000000"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-left text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="booking-notes" className="mb-1 block text-xs font-bold text-slate-700">
              ملاحظات للمعلن (اختياري)
            </label>
            <textarea
              id="booking-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="موعد الوصول أو أي استفسار إضافي..."
              className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 rounded-xl bg-primary-50/70 p-3 text-xs">
            {pricing.durationDiscountApplied ? (
              <div className="flex items-center justify-between text-secondary-700">
                <span>
                  تسعير {rentalDuration === 'monthly' ? 'شهري مخفض' : 'أسبوعي مخفض'} ({nights} ليلة)
                </span>
                <span className="font-bold">{formatEGP(pricing.subtotal)}</span>
              </div>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto pl-1">
                {pricing.nightDetails.map((item) => (
                  <div
                    key={item.isoDate}
                    className="flex items-center justify-between text-[11px] text-slate-600"
                  >
                    <span>
                      {formatArabicDate(item.isoDate)}{' '}
                      {item.source === 'custom'
                        ? '(سعر فترة مخصص)'
                        : item.source === 'peak'
                        ? '(ذروة)'
                        : item.source === 'weekend'
                        ? '(ويك إند)'
                        : '(ليلة عادية)'}
                    </span>
                    <span
                      className={
                        item.source === 'custom' ? 'font-bold text-amber-800' : 'font-semibold'
                      }
                    >
                      {formatEGP(item.rate)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-success-700">
              <span>رسوم منصة AgzStay</span>
              <span className="font-bold">٠ ج.م</span>
            </div>
            <div className="flex items-center justify-between border-t border-primary-100 pt-2 text-sm font-extrabold text-primary-800">
              <span>التكلفة الإجمالية للإقامة</span>
              <span>{formatEGP(pricing.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-secondary-800">
              <span>قيمة جدية الحجز ({pricing.depositLabel})</span>
              <span className="font-extrabold">{formatEGP(pricing.downPaymentAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span>المتبقي عند الاستلام</span>
              <span className="font-bold">{formatEGP(pricing.remainingBalance)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>تأمين مسترد عند المغادرة</span>
              <span className="font-bold">{formatEGP(pricing.securityDeposit)}</span>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-secondary-200 bg-sand-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2 font-bold text-slate-800">
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-secondary-600" />
                دفع عربون جدية الحجز ({pricing.depositLabel}):
              </span>
              <span className="font-extrabold text-secondary-700">
                {formatEGP(pricing.downPaymentAmount)}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600">
              يمكنك إرسال طلب الحجز مجاناً أولاً، أو إرفاق صورة إيصال InstaPay الآن ليُحفظ الحجز مباشرة بحالة{' '}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px] font-bold text-primary-700" dir="ltr">
                pending_verification
              </code>{' '}
              وتُغلق التواريخ لحين مراجعة الإدارة.
            </p>

            {!chalet.isDemo && isSupabaseConfigured && (
              <div className="space-y-2 border-t border-secondary-200/70 pt-2">
                <input
                  type="text"
                  dir="ltr"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="رقم مرجع تحويل InstaPay (اختياري)"
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-900 focus:border-secondary-500 focus:outline-none"
                />

                {receiptFile ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-900">
                    <span className="truncate">تم اختيار الإيصال: {receiptFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setReceiptFile(null)}
                      aria-label="إزالة ملف الإيصال"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 hover:bg-slate-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-secondary-400 bg-white px-3 py-2 text-[11px] font-bold text-secondary-800 hover:bg-secondary-50">
                    <Upload className="h-4 w-4 text-secondary-600" />
                    <span>إرفاق إيصال InstaPay إلى حاوية receipts (اختياري)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          setFormError('الحد الأقصى لحجم إيصال InstaPay هو ٥ ميجابايت.');
                          e.target.value = '';
                          return;
                        }
                        setFormError('');
                        setReceiptFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <div className="flex items-start gap-2 font-bold">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                سياسة الإلغاء: جدية الحجز لا تُرد في حال إلغاء الحجز قبل موعد الوصول بأقل من 10 أيام
              </span>
            </div>
            {daysBeforeCheckIn < 10 && (
              <p className="mt-1 text-[11px] font-semibold text-error-700">
                تنبيه: موعد الوصول المختار يبعد {Math.max(0, daysBeforeCheckIn).toLocaleString('ar-EG')} أيام فقط، لذا تصبح جدية الحجز غير مستردة فور التأكيد.
              </p>
            )}
            <label className="mt-2.5 flex min-h-[44px] cursor-pointer items-start gap-2 text-[11px] font-bold text-slate-800">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => {
                  setPolicyAccepted(e.target.checked);
                  setFormError('');
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded accent-secondary-500"
              />
              <span>
                أوافق على سياسة المنصة وأقر بأن جدية الحجز لا تُرد في حال الإلغاء قبل موعد الوصول بأقل من 10 أيام، وأن AgzStay منصة تقنية وليست طرفاً في التسوية المالية النهائية.
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-secondary-200 bg-secondary-50/60 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-secondary-800">
                <Calculator className="h-3.5 w-3.5" />
                تقسيم التكلفة للعائلات
              </span>
              <select
                aria-label="عدد الأسر للتقسيم"
                value={splitFamilies}
                onChange={(e) => setSplitFamilies(Number(e.target.value))}
                className="rounded-lg border border-secondary-200 bg-white px-2 py-1 text-xs font-bold text-secondary-800"
              >
                {[1, 2, 3, 4, 5, 6].map((f) => (
                  <option key={f} value={f}>
                    {f} {f === 1 ? 'أسرة' : 'أسر'}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-secondary-700">
              <span>نصيب الأسرة الواحدة:</span>
              <span className="text-sm font-bold text-secondary-900">
                {formatEGP(perFamilyShare)}
              </span>
            </div>
          </div>

          {!currentUser && isSupabaseConfigured && !chalet.isDemo && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-center text-xs">
              <p className="font-bold text-primary-900">سجّل دخولك أولاً لإتمام طلب الحجز</p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="mt-2 min-h-[44px] rounded-xl bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
              >
                تسجيل الدخول / إنشاء حساب
              </button>
            </div>
          )}

          {chalet.isDemo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-bold text-amber-900">
              هذا إعلان تجريبي للعرض فقط — لا يمكن حجزه فعلياً.
            </div>
          )}

          {formError && (
            <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={
              conflicts.length > 0 ||
              isSubmittingBooking ||
              !isSupabaseConfigured ||
              Boolean(chalet.isDemo) ||
              !currentUser
            }
            className="min-h-[44px] w-full rounded-xl bg-primary-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmittingBooking
              ? receiptFile
                ? 'جاري رفع الإيصال وحفظ الحجز...'
                : 'جاري تسجيل طلب الحجز...'
              : receiptFile
              ? `إرسال الحجز وإيصال InstaPay (${formatEGP(pricing.downPaymentAmount)})`
              : `إرسال طلب الحجز للمالك (عربون ${pricing.depositLabel}: ${formatEGP(pricing.downPaymentAmount)})`}
          </button>
        </form>
      )}
    </div>
  );
}
