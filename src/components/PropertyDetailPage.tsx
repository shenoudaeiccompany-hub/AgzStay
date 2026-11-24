import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bath,
  BedDouble,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  ArabicDateRangeField,
  ArabicSingleDateField,
} from '@/components/ArabicCalendarPicker';
import { ChaletGallery } from '@/components/ChaletGallery';
import { ChaletShareActions } from '@/components/ChaletShareActions';
import { ImageLightboxModal } from '@/components/ImageLightboxModal';
import {
  formatEGP,
  getAmenityLabel,
  getPriceUnitLabel,
  getShortPriceUnitLabel,
  isMonthlyOnlyProperty,
} from '@/data/chalets';
import { revealListingContact } from '@/services/agzstayRepository';
import type { Chalet } from '@/types/chalet';
import {
  addDaysIso,
  buildWhatsAppPhoneUrl,
  calculateInformationalQuote,
  calculateNightsBetween,
  findConflictingDates,
  formatArabicDate,
  formatIsoDate,
  getBlockedDatesSet,
} from '@/utils/bookingPricing';

interface PropertyDetailPageProps {
  chalet: Chalet;
  initialCheckIn?: string;
  initialCheckOut?: string;
  onBack: () => void;
}

const EXACT_RENTER_SECURITY_WARNING =
  'تنبيه أمني هام للمستأجر: لا تقم بدفع أي مبالغ مالية أو جدية حجز للمكاتب أو المُلاك إلا بعد التواصل على واتساب ومعرفة كافة التفاصيل، وإجراء المعاينة الفعلية للوحدة أو عند استلام المفتاح والتأكد الكامل من هوية الشخص الذي تتعامل معه.';

export function PropertyDetailPage({
  chalet,
  initialCheckIn = '',
  initialCheckOut = '',
  onBack,
}: PropertyDetailPageProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [quickCopied, setQuickCopied] = useState(false);

  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingContact, setRevealingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const blockedSet = useMemo(() => getBlockedDatesSet(chalet), [chalet]);

  const initialAvailableDate = useMemo(() => {
    if (initialCheckIn && !blockedSet.has(initialCheckIn)) return initialCheckIn;
    const probe = new Date();
    for (let i = 0; i < 45; i += 1) {
      const candidate = formatIsoDate(probe);
      if (!blockedSet.has(candidate)) return candidate;
      probe.setDate(probe.getDate() + 1);
    }
    return todayIso;
  }, [blockedSet, initialCheckIn, todayIso]);

  const [checkIn, setCheckIn] = useState(initialAvailableDate);
  const [checkOut, setCheckOut] = useState(() => {
    if (
      initialCheckIn &&
      initialCheckOut &&
      calculateNightsBetween(initialCheckIn, initialCheckOut) > 0
    ) {
      return initialCheckOut;
    }
    return addDaysIso(initialAvailableDate, isMonthlyOnlyProperty(chalet) ? 30 : 3);
  });
  const [guests, setGuests] = useState(Math.min(2, chalet.maxGuests || 2));

  const isMonthlyOnly = isMonthlyOnlyProperty(chalet);
  const isBroker = chalet.advertiserRole === 'مكتب / وسيط';

  const nights = Math.max(1, calculateNightsBetween(checkIn, checkOut));
  const conflictingDates = useMemo(
    () => (isMonthlyOnly ? [] : findConflictingDates(checkIn, nights, blockedSet)),
    [blockedSet, checkIn, isMonthlyOnly, nights]
  );
  const hasBlockedConflict = conflictingDates.length > 0;

  const quote = useMemo(
    () => calculateInformationalQuote(chalet, nights),
    [chalet, nights]
  );

  const locationDisplay = [chalet.governorate, chalet.city, chalet.areaOrVillage]
    .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
    .join(' • ');

  const selectImage = (index: number) => {
    const total = chalet.images.length;
    if (total === 0) return;
    setImageError(false);
    setActiveImageIndex((index + total) % total);
  };

  const handleDateRangeSelect = (nextIn: string, nextOut: string) => {
    setCheckIn(nextIn);
    if (nextOut && calculateNightsBetween(nextIn, nextOut) > 0) {
      setCheckOut(nextOut);
    } else {
      setCheckOut(addDaysIso(nextIn, isMonthlyOnly ? 30 : 3));
    }
  };

  const whatsappMessage = useMemo(() => {
    const lines = [
      `مرحباً ${chalet.ownerName}، أتواصل معك بخصوص وحدة "${chalet.title}" (${locationDisplay}) عبر منصة AgzStay - إجازة ستاي.`,
      `نوع الوحدة: ${chalet.propertyType}`,
    ];
    if (isMonthlyOnly) {
      lines.push(`تاريخ المعاينة / السكن المقترح: ${formatArabicDate(checkIn)}`);
      lines.push(`الإيجار الشهري المعلن: ${formatEGP(quote.subtotal)}`);
    } else {
      lines.push(
        `التواريخ المطلوبة: من ${formatArabicDate(checkIn)} إلى ${formatArabicDate(checkOut)} (${nights.toLocaleString('ar-EG')} ليالٍ)`
      );
      lines.push(`عدد الأفراد: ${guests.toLocaleString('ar-EG')}`);
      lines.push(`التكلفة التقديرية: ${formatEGP(quote.subtotal)}`);
    }
    if (quote.hasInformationalDeposit) {
      lines.push(
        `جدية الحجز (${chalet.depositType === 'fixed' ? 'مبلغ ثابت' : 'نسبة مئوية'}): ${quote.depositDisplayText} (تُدفع للمعلن بعد التواصل والمعاينة)`
      );
    } else {
      lines.push('جدية الحجز: تُحدد مباشرة مع المعلن بعد التواصل والمعاينة');
    }
    return lines.join('\n');
  }, [
    chalet.depositType,
    chalet.ownerName,
    chalet.propertyType,
    chalet.title,
    checkIn,
    checkOut,
    guests,
    isMonthlyOnly,
    locationDisplay,
    nights,
    quote.depositDisplayText,
    quote.hasInformationalDeposit,
    quote.subtotal,
  ]);

  const effectivePhone = chalet.isDemo
    ? (chalet.ownerPhone ?? '').trim()
    : (revealedPhones[chalet.id] ?? '').trim();
  const hasRevealedPhone = effectivePhone.replace(/\D/g, '').length >= 8;
  const whatsappHref = hasRevealedPhone ? buildWhatsAppPhoneUrl(effectivePhone, whatsappMessage) : '';

  const ensureContactPhone = async (): Promise<string | null> => {
    if (effectivePhone) return effectivePhone;
    setRevealingContact(true);
    setContactError(null);
    try {
      const res = await revealListingContact(chalet.id);
      if (res.error || !res.data) {
        setContactError(res.error ?? 'رقم التواصل غير متاح حالياً لهذا الإعلان.');
        return null;
      }
      setRevealedPhones((prev) => ({ ...prev, [chalet.id]: res.data }));
      return res.data;
    } finally {
      setRevealingContact(false);
    }
  };

  const handleOpenWhatsApp = async () => {
    if (hasBlockedConflict) return;
    const phone = await ensureContactPhone();
    if (!phone) return;
    const url = buildWhatsAppPhoneUrl(phone, whatsappMessage);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRevealPhoneOnly = async () => {
    await ensureContactPhone();
  };

  const sortedBlockedDates = useMemo(
    () => [...chalet.blockedDates].filter((d) => d >= todayIso).sort(),
    [chalet.blockedDates, todayIso]
  );

  const shareUrl = useMemo(() => {
    const encodedId = encodeURIComponent(chalet.id);
    try {
      return `${window.location.origin}/chalet/${encodedId}`;
    } catch {
      return `https://agzstay.com/chalet/${encodedId}`;
    }
  }, [chalet.id]);

  const quickWhatsAppShareHref = useMemo(() => {
    const summary = `${chalet.title} — ${locationDisplay} (${formatEGP(
      quote.unitPrice
    )} ${getShortPriceUnitLabel(chalet)}) عبر AgzStay\n${shareUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(summary)}`;
  }, [chalet, locationDisplay, quote.unitPrice, shareUrl]);

  const handleQuickCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setQuickCopied(true);
      window.setTimeout(() => setQuickCopied(false), 2200);
    } catch {
      setQuickCopied(true);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-8 sm:px-6 sm:py-10 lg:pb-12">
      {/* Top Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-stone-200/70 bg-white px-4 py-2 text-xs font-semibold text-[#1E3A5F] shadow-xs transition hover:border-stone-300 hover:bg-[#FAF9F6] sm:text-sm"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة إلى الوحدات</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {chalet.isFeatured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#C5A880] px-3 py-1 text-xs font-bold text-[#1F2937] shadow-xs">
              <Sparkles className="h-3.5 w-3.5" />
              إعلان مميز
            </span>
          )}
          <span className="rounded-full border border-stone-200/70 bg-white px-3.5 py-1 text-xs font-semibold text-[#1E3A5F] shadow-xs">
            {chalet.propertyType}
          </span>

          <button
            type="button"
            onClick={() => void handleQuickCopyLink()}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition ${
              quickCopied
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-stone-200/70 bg-white text-[#1E3A5F] hover:bg-[#FAF9F6]'
            }`}
          >
            {quickCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{quickCopied ? 'تم النسخ' : 'نسخ الرابط'}</span>
          </button>

          <a
            href={quickWhatsAppShareHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>مشاركة الإعلان</span>
          </a>
        </div>
      </div>

      {/* Organized Image Gallery */}
      <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-xs">
        <ChaletGallery
          images={chalet.images}
          title={chalet.title}
          resort={chalet.areaOrVillage || chalet.city || chalet.governorate}
          activeImageIndex={activeImageIndex}
          imageError={imageError}
          onImageError={() => setImageError(true)}
          onSelectImage={selectImage}
          onOpenLightbox={() => setIsLightboxOpen(true)}
        />
      </div>

      {/* Main Details & Sticky WhatsApp Booking Card */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Unit Details Column (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              {isBroker ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1E3A5F] px-3 py-1 text-xs font-semibold text-white">
                  <Briefcase className="h-3.5 w-3.5 text-[#C5A880]" />
                  مكتب / وسيط
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  مالك مباشر
                </span>
              )}

              <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/70 bg-[#FAF9F6] px-3 py-1 text-xs font-semibold text-[#1F2937]">
                <MapPin className="h-3.5 w-3.5 text-[#C5A880]" />
                {locationDisplay}
              </span>
            </div>

            <h1 className="mt-4 text-xl font-bold leading-snug text-[#1F2937] sm:text-2xl">
              {chalet.title}
            </h1>

            <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4 text-center">
              <div>
                <BedDouble className="mx-auto h-5 w-5 text-[#1E3A5F]" />
                <div className="mt-1.5 text-xs font-bold text-[#1F2937] sm:text-sm">
                  {chalet.bedrooms} غرف نوم
                </div>
              </div>
              <div className="border-x border-stone-200/80">
                <Bath className="mx-auto h-5 w-5 text-[#1E3A5F]" />
                <div className="mt-1.5 text-xs font-bold text-[#1F2937] sm:text-sm">
                  {chalet.bathrooms} حمام
                </div>
              </div>
              <div>
                <Users className="mx-auto h-5 w-5 text-[#1E3A5F]" />
                <div className="mt-1.5 text-xs font-bold text-[#1F2937] sm:text-sm">
                  حتى {chalet.maxGuests} أفراد
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-base font-bold text-[#1E3A5F]">تفاصيل الوحدة</h2>
              <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-[#6B7280]">
                {chalet.description || 'وحدة مميزة متاحة للإيجار المباشر عبر منصة AgzStay.'}
              </p>
            </div>

            {chalet.amenities.length > 0 && (
              <div className="mt-6 border-t border-stone-100 pt-6">
                <h2 className="text-base font-bold text-[#1E3A5F]">المرافق والمميزات</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {chalet.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#1F2937]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#C5A880]" />
                      {getAmenityLabel(amenity)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {chalet.rules.length > 0 && (
              <div className="mt-6 border-t border-stone-100 pt-6">
                <h2 className="text-base font-bold text-[#1E3A5F]">شروط وملاحظات المعلن</h2>
                <ul className="mt-3 space-y-2 text-sm text-[#6B7280]">
                  {chalet.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C5A880]" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sortedBlockedDates.length > 0 && (
              <div className="mt-6 border-t border-stone-100 pt-6">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#1E3A5F]">
                  <Calendar className="h-4 w-4 text-[#C5A880]" />
                  <span>التواريخ المحجوزة / المغلقة حالياً</span>
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sortedBlockedDates.slice(0, 14).map((iso) => (
                    <span
                      key={iso}
                      className="rounded-lg border border-red-200/80 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 line-through"
                    >
                      {formatArabicDate(iso)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <ChaletShareActions chalet={chalet} />
        </div>

        {/* Sticky Sidebar Booking & Direct Contact Card (5 cols) */}
        <aside className="lg:col-span-5">
          <div className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs lg:sticky lg:top-24">
            <div className="flex items-baseline justify-between border-b border-stone-100 pb-4">
              <div>
                <span className="block text-xs font-semibold text-[#6B7280]">
                  {getPriceUnitLabel(chalet)}
                </span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-[#1E3A5F]">
                    {formatEGP(quote.unitPrice)}
                  </span>
                  <span className="text-xs font-semibold text-[#6B7280]">
                    / {getShortPriceUnitLabel(chalet)}
                  </span>
                </div>
              </div>
              <div className="text-left">
                <span className="block text-[11px] font-medium text-[#6B7280]">المعلن</span>
                <span className="text-xs font-bold text-[#1F2937]">{chalet.ownerName}</span>
              </div>
            </div>

            {/* Date & Guests Selection */}
            <div className="mt-5 space-y-3.5">
              {isMonthlyOnly ? (
                <ArabicSingleDateField
                  label="تاريخ المعاينة / السكن المقترح"
                  value={checkIn}
                  minDateIso={todayIso}
                  onChange={(nextIn) => handleDateRangeSelect(nextIn, addDaysIso(nextIn, 30))}
                />
              ) : (
                <ArabicDateRangeField
                  checkInDate={checkIn}
                  checkOutDate={checkOut}
                  minDateIso={todayIso}
                  blockedDates={blockedSet}
                  allowClear={false}
                  onChange={handleDateRangeSelect}
                />
              )}

              {!isMonthlyOnly && (
                <div>
                  <label
                    htmlFor="detail-guests"
                    className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
                  >
                    عدد الأفراد
                  </label>
                  <select
                    id="detail-guests"
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="h-11 w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                  >
                    {Array.from({ length: Math.max(1, chalet.maxGuests) }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {(i + 1).toLocaleString('ar-EG')} أفراد
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hasBlockedConflict && (
                <div
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>
                    عذراً، بعض التواريخ المختارة مغلقة من قِبل المعلن:{' '}
                    {conflictingDates.map(formatArabicDate).join(' ، ')}. يرجى اختيار تواريخ أخرى.
                  </span>
                </div>
              )}
            </div>

            {/* Clear Deposit & Pricing Summary (`deposit_type` + `deposit_value`) */}
            <div className="mt-5 space-y-2.5 rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4 text-xs">
              {!isMonthlyOnly ? (
                <div className="flex items-center justify-between text-[#6B7280]">
                  <span>
                    {formatEGP(quote.unitPrice)} × {quote.nights.toLocaleString('ar-EG')} ليالٍ
                  </span>
                  <strong className="text-sm text-[#1E3A5F]">{formatEGP(quote.subtotal)}</strong>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[#6B7280]">
                  <span>قيمة الإيجار الشهري المعلنة</span>
                  <strong className="text-sm text-[#1E3A5F]">{formatEGP(quote.subtotal)}</strong>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-stone-200/70 pt-2.5 text-[#1F2937]">
                <span className="font-medium text-[#6B7280]">
                  جدية الحجز ({chalet.depositType === 'fixed' ? 'مبلغ ثابت' : 'نسبة مئوية'}):
                </span>
                <strong className="text-[#1E3A5F]">
                  {quote.hasInformationalDeposit
                    ? quote.depositDisplayText
                    : 'تُحدد عند التواصل والاتفاق'}
                </strong>
              </div>
            </div>

            {/* Mandatory Security Alert Box Above WhatsApp CTA */}
            <div
              className={`mt-5 rounded-2xl border p-4 text-xs leading-relaxed ${
                isBroker
                  ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-xs'
                  : 'border-[#C5A880] bg-[#FAF6F0] text-[#1F2937]'
              }`}
              role="note"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    isBroker ? 'text-amber-700' : 'text-[#1E3A5F]'
                  }`}
                />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-[#1E3A5F]">
                      تنبيه أمني قبل التواصل أو الدفع
                    </span>
                    {isBroker && (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                        معلن: مكتب / وسيط
                      </span>
                    )}
                  </div>
                  <p className="font-semibold leading-relaxed">{EXACT_RENTER_SECURITY_WARNING}</p>
                  {isBroker && (
                    <p className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-[11px] font-bold text-amber-950">
                      تحذير خاص بالوسيط: هذا الإعلان مقدم من مكتب / وسيط عقاري — لا تحوّل أي عربون قبل المعاينة الفعلية للوحدة، ومراجعة إثبات الشخصية والتفويض الرسمي، والاتفاق على كافة الشروط عبر واتساب أولاً.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {contactError && (
              <div
                className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{contactError}</span>
              </div>
            )}

            {/* Protected Contact Reveal & Direct WhatsApp / Phone Actions */}
            <div className="mt-5 space-y-2.5">
              {hasBlockedConflict ? (
                <button
                  type="button"
                  disabled
                  className="flex min-h-[48px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-stone-200 px-4 py-3 text-sm font-bold text-[#6B7280]"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>يرجى اختيار تواريخ متاحة أولاً</span>
                </button>
              ) : hasRevealedPhone ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>تواصل مع المعلن عبر واتساب لتأكيد الحجز</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled={revealingContact}
                  onClick={() => void handleOpenWhatsApp()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {revealingContact ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-5 w-5" />
                  )}
                  <span>
                    {revealingContact
                      ? 'جاري تجهيز رقم التواصل...'
                      : 'تواصل مع المعلن عبر واتساب لتأكيد الحجز'}
                  </span>
                </button>
              )}

              {hasRevealedPhone ? (
                <a
                  href={`tel:${effectivePhone}`}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-stone-200/80 bg-white px-4 py-2.5 text-xs font-bold text-[#1E3A5F] transition hover:bg-[#FAF9F6]"
                >
                  <Phone className="h-4 w-4 text-[#C5A880]" />
                  <span>
                    اتصال هاتفي مباشر (<span dir="ltr">{effectivePhone}</span>)
                  </span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled={revealingContact}
                  onClick={() => void handleRevealPhoneOnly()}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-stone-200/80 bg-white px-4 py-2.5 text-xs font-bold text-[#1E3A5F] transition hover:bg-[#FAF9F6] disabled:opacity-60"
                >
                  <Phone className="h-4 w-4 text-[#C5A880]" />
                  <span>إظهار رقم هاتف المعلن للاتصال المباشر</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Comfortable Mobile Sticky Bottom Contact Bar */}
      {!hasBlockedConflict && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <div>
              <span className="block text-[11px] font-medium text-[#6B7280]">
                {getPriceUnitLabel(chalet)}
              </span>
              <span className="text-base font-bold text-[#1E3A5F]">
                {formatEGP(quote.unitPrice)}{' '}
                <span className="text-[11px] font-semibold text-[#6B7280]">
                  / {getShortPriceUnitLabel(chalet)}
                </span>
              </span>
            </div>
            {hasRevealedPhone ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                <span>تواصل عبر واتساب</span>
              </a>
            ) : (
              <button
                type="button"
                disabled={revealingContact}
                onClick={() => void handleOpenWhatsApp()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{revealingContact ? 'جاري الفتح...' : 'تواصل عبر واتساب'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {isLightboxOpen && (
        <ImageLightboxModal
          images={chalet.images}
          title={chalet.title}
          initialIndex={activeImageIndex}
          onIndexChange={(idx) => {
            setImageError(false);
            setActiveImageIndex(idx);
          }}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </main>
  );
}
