import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Flag,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import {
  ArabicDateRangeField,
  ArabicSingleDateField,
} from '@/components/ArabicCalendarPicker';
import { ChaletGallery } from '@/components/ChaletGallery';
import { ChaletShareActions } from '@/components/ChaletShareActions';
import { ImageLightboxModal } from '@/components/ImageLightboxModal';
import { PropertyCard } from '@/components/PropertyCard';
import { ShareChaletButton } from '@/components/ShareChaletButton';
import { copyChaletLink, getChaletShareUrl } from '@/utils/shareChalet';
import {
  formatEGP,
  getAmenityLabel,
  getPriceUnitLabel,
  getShortPriceUnitLabel,
  isMonthlyOnlyProperty,
} from '@/data/chalets';
import {
  createBookingViaRpc,
  fetchChaletReviews,
  fetchMyProfile,
  fetchServerBookingQuote,
  getCurrentAuthUser,
  isValidEgyptianMobile,
  revealListingContact,
  submitChaletReviewRpc,
  submitListingReportRpc,
} from '@/services/agzstayRepository';
import type {
  BookingRecord,
  Chalet,
  ChaletReviewRecord,
  RouteSection,
  ServerBookingQuote,
} from '@/types/chalet';
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
  allChalets?: Chalet[];
  favorites?: string[];
  initialCheckIn?: string;
  initialCheckOut?: string;
  onBack: () => void;
  onSelectChalet?: (chalet: Chalet) => void;
  onToggleFavorite?: (id: string) => void;
  onNavigate?: (section: RouteSection) => void;
  onOpenSupport?: (bookingId?: string) => void;
}

const EXACT_RENTER_SECURITY_WARNING =
  'تنبيه أمني هام للمستأجر: لا تقم بدفع أي مبالغ مالية أو جدية حجز للمكاتب أو المُلاك إلا بعد التواصل على واتساب ومعرفة كافة التفاصيل، وإجراء المعاينة الفعلية للوحدة أو عند استلام المفتاح والتأكد الكامل من هوية الشخص الذي تتعامل معه.';

export function PropertyDetailPage({
  chalet,
  allChalets = [],
  favorites = [],
  initialCheckIn = '',
  initialCheckOut = '',
  onBack,
  onSelectChalet,
  onToggleFavorite,
  onNavigate,
  onOpenSupport,
}: PropertyDetailPageProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [quickCopied, setQuickCopied] = useState(false);

  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingContact, setRevealingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('سعر مختلف عن الحقيقة');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  const [reviews, setReviews] = useState<ChaletReviewRecord[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');

  // Guided 3-step booking state
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [stepValidationError, setStepValidationError] = useState('');
  const [loadingServerQuote, setLoadingServerQuote] = useState(false);
  const [serverQuote, setServerQuote] = useState<ServerBookingQuote | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingSubmitError, setBookingSubmitError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);
  const [isAuthenticatedUser, setIsAuthenticatedUser] = useState(false);

  useEffect(() => {
    setActiveImageIndex(0);
    setImageError(false);
    setReviewError('');
    setReviewSuccess('');
    setReportError('');
    setReportSuccess('');
    setContactError(null);
    setBookingStep(1);
    setPolicyAccepted(false);
    setStepValidationError('');
    setBookingSubmitError('');
    setServerQuote(null);
    setConfirmedBooking(null);

    if (chalet.isDemo) {
      setReviews([]);
      return;
    }

    let active = true;
    setLoadingReviews(true);
    void fetchChaletReviews(chalet.id).then((res) => {
      if (!active) return;
      setReviews(res.data ?? []);
      setLoadingReviews(false);
    });
    return () => {
      active = false;
    };
  }, [chalet.id, chalet.isDemo]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const user = await getCurrentAuthUser();
      if (!active) return;
      setIsAuthenticatedUser(Boolean(user));
      if (user) {
        const prof = await fetchMyProfile();
        if (!active || !prof.data) return;
        setGuestName((prev) => prev || prof.data?.name || '');
        setGuestPhone((prev) => prev || prof.data?.phone || '');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
    () => calculateInformationalQuote(chalet, nights, checkIn),
    [chalet, nights, checkIn]
  );

  const effectiveRatingCount =
    reviews.length > 0 ? reviews.length : chalet.ratingCount ?? 0;
  const effectiveRatingAvg =
    reviews.length > 0
      ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
      : chalet.ratingAvg ?? 0;

  const similarChalets = useMemo(() => {
    if (!allChalets.length) return [];
    const targetMonthly = isMonthlyOnlyProperty(chalet);
    return allChalets
      .filter((item) => item.id !== chalet.id && item.availabilityStatus === 'active')
      .map((item) => {
        let score = 0;
        if (item.city === chalet.city) score += 5;
        if (item.governorate === chalet.governorate) score += 3;
        if (isMonthlyOnlyProperty(item) === targetMonthly) score += 4;
        if (item.propertyType === chalet.propertyType) score += 2;
        if (item.ownerVerified) score += 1;
        const priceDiff = Math.abs(item.pricePerNight - chalet.pricePerNight);
        return { item, score, priceDiff };
      })
      .sort((a, b) => b.score - a.score || a.priceDiff - b.priceDiff)
      .slice(0, 3)
      .map((entry) => entry.item);
  }, [allChalets, chalet]);

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
    setStepValidationError('');
    setServerQuote(null);
    if (nextOut && calculateNightsBetween(nextIn, nextOut) > 0) {
      setCheckOut(nextOut);
    } else {
      setCheckOut(addDaysIso(nextIn, isMonthlyOnly ? 30 : 3));
    }
  };

  const validateStepOne = (): string | null => {
    if (!checkIn || checkIn < todayIso) {
      return 'يرجى اختيار تاريخ وصول صالح من اليوم فصاعداً.';
    }
    if (!isMonthlyOnly && (!checkOut || calculateNightsBetween(checkIn, checkOut) <= 0)) {
      return 'يرجى اختيار تاريخ مغادرة بعد تاريخ الوصول بليلة واحدة على الأقل.';
    }
    if (hasBlockedConflict) {
      return 'التواريخ المختارة تتعارض مع مواعيد محجوزة أو مغلقة، يرجى اختيار تواريخ أخرى.';
    }
    if (!isMonthlyOnly && (guests < 1 || guests > (chalet.maxGuests || 1))) {
      return `عدد الضيوف يجب أن يكون بين ١ و ${(chalet.maxGuests || 1).toLocaleString('ar-EG')} أفراد.`;
    }
    if (guestName.trim().length < 2) {
      return 'يرجى كتابة الاسم الكامل (حرفين على الأقل) للمتابعة.';
    }
    if (!isValidEgyptianMobile(guestPhone)) {
      return 'يرجى إدخال رقم موبايل مصري صحيح (١١ رقماً يبدأ بـ 010 أو 011 أو 012 أو 015).';
    }
    return null;
  };

  const handleProceedToReview = async () => {
    const validationErr = validateStepOne();
    if (validationErr) {
      setStepValidationError(validationErr);
      return;
    }
    setStepValidationError('');
    setBookingSubmitError('');

    if (!chalet.isDemo) {
      setLoadingServerQuote(true);
      try {
        const res = await fetchServerBookingQuote({
          chaletId: chalet.id,
          checkIn,
          checkOut: isMonthlyOnly ? addDaysIso(checkIn, 30) : checkOut,
          rentalDuration: isMonthlyOnly ? 'monthly' : nights >= 7 && nights % 7 === 0 ? 'weekly' : 'daily',
        });
        if (res.error) {
          setStepValidationError(res.error);
          return;
        }
        setServerQuote(res.data);
      } finally {
        setLoadingServerQuote(false);
      }
    }
    setBookingStep(2);
  };

  const handleConfirmBookingRequest = async () => {
    setBookingSubmitError('');
    if (!policyAccepted) {
      setBookingSubmitError('يرجى الموافقة على شروط الإلغاء ومواعيد الدخول والخروج أولاً.');
      return;
    }
    if (chalet.isDemo) {
      setBookingSubmitError('هذه وحدة تجريبية للمعاينة فقط — لإتمام حجز فعلي اختر وحدة منشورة.');
      return;
    }

    setSubmittingBooking(true);
    try {
      const duration = isMonthlyOnly
        ? 'monthly'
        : nights >= 7 && nights % 7 === 0
        ? 'weekly'
        : 'daily';
      const res = await createBookingViaRpc({
        chaletId: chalet.id,
        checkIn,
        nights: isMonthlyOnly ? 30 : nights,
        duration,
        guests: isMonthlyOnly ? 1 : guests,
        guestName,
        guestPhone,
        notes: bookingNotes,
        policyAccepted: true,
        channel: 'form',
      });
      if (res.error || !res.data) {
        setBookingSubmitError(res.error ?? 'تعذر إرسال طلب الحجز الآن.');
        return;
      }
      setConfirmedBooking(res.data);
      setBookingStep(3);
    } finally {
      setSubmittingBooking(false);
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

  const shareUrl = useMemo(() => getChaletShareUrl(chalet.id), [chalet.id]);

  const handleQuickCopyLink = async () => {
    await copyChaletLink(shareUrl);
    setQuickCopied(true);
    window.setTimeout(() => setQuickCopied(false), 2200);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportError('');
    setReportSuccess('');
    if (chalet.isDemo) {
      setReportError('هذه وحدة تجريبية للمعاينة فقط ولا يمكن إرسال بلاغ عليها.');
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await submitListingReportRpc(chalet.id, reportReason, reportDetails);
      if (res.error) {
        setReportError(res.error);
        return;
      }
      setReportSuccess('تم استلام بلاغك بنجاح وستقوم الإدارة بمراجعة الإعلان قريباً.');
      setReportDetails('');
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError('');
    setReviewSuccess('');
    if (chalet.isDemo) {
      setReviewError('هذه وحدة تجريبية للمعاينة فقط — التقييمات متاحة على الوحدات المنشورة فعلياً.');
      return;
    }
    if (reviewerName.trim().length < 2) {
      setReviewError('يرجى كتابة اسمك (حرفين على الأقل) قبل إرسال التقييم.');
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await submitChaletReviewRpc(chalet.id, reviewerName, reviewRating, reviewComment);
      if (res.error || !res.data) {
        setReviewError(res.error ?? 'تعذر إضافة التقييم الآن.');
        return;
      }
      setReviews((prev) => [res.data!, ...prev]);
      setReviewerName('');
      setReviewComment('');
      setReviewRating(5);
      setReviewSuccess('شكراً لك! تم إضافة تقييمك بنجاح.');
    } finally {
      setSubmittingReview(false);
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
            className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition ${
              quickCopied
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-stone-200/70 bg-white text-[#1E3A5F] hover:bg-[#FAF9F6]'
            }`}
          >
            {quickCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{quickCopied ? 'تم النسخ' : 'نسخ الرابط'}</span>
          </button>

          <ShareChaletButton chalet={chalet} variant="detail" />
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

              {chalet.ownerVerified && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                  معلن موثق
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

          {/* Guest Reviews & Ratings Section */}
          <section
            aria-label="تقييمات وآراء المستأجرين"
            className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-[#1E3A5F]">تقييمات وآراء الزوار</h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  تجارب حقيقية للمستأجرين مع المعلن والوحدة
                </p>
              </div>
              {effectiveRatingCount > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#FAF6F0] px-3.5 py-2 text-xs font-bold text-[#1E3A5F]">
                  <Star className="h-4 w-4 fill-[#C5A880] text-[#C5A880]" />
                  <span>{effectiveRatingAvg.toFixed(1)} من ٥</span>
                  <span className="font-medium text-[#6B7280]">
                    ({effectiveRatingCount.toLocaleString('ar-EG')} تقييم)
                  </span>
                </div>
              )}
            </div>

            {loadingReviews ? (
              <div className="py-6 text-center text-xs text-[#6B7280]">جاري تحميل التقييمات...</div>
            ) : reviews.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-[#FAF9F6] px-4 py-5 text-center text-xs text-[#6B7280]">
                لا توجد تقييمات مسجلة لهذه الوحدة بعد — كن أول من يشارك تجربته.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {reviews.map((rev) => (
                  <article
                    key={rev.id}
                    className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#1E3A5F]">{rev.reviewerName}</span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < rev.rating
                                ? 'fill-[#C5A880] text-[#C5A880]'
                                : 'text-stone-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {rev.comment && (
                      <p className="mt-2 text-xs leading-relaxed text-[#4B5563]">{rev.comment}</p>
                    )}
                    <span className="mt-2 block text-[10px] text-[#6B7280]">
                      {formatArabicDate(rev.createdAt.slice(0, 10))}
                    </span>
                  </article>
                ))}
              </div>
            )}

            {/* Add Review Form */}
            <form onSubmit={handleSubmitReview} className="mt-5 border-t border-stone-100 pt-5">
              <h3 className="text-xs font-bold text-[#1E3A5F]">أضف تقييمك للوحدة</h3>
              {chalet.isDemo ? (
                <p className="mt-2 rounded-xl bg-[#FAF9F6] px-3 py-2 text-[11px] font-medium text-[#6B7280]">
                  هذه وحدة تجريبية للمعاينة فقط — التقييمات متاحة على الوحدات المنشورة فعلياً.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#6B7280]">التقييم:</span>
                    <div className="flex items-center gap-1" role="group" aria-label="اختيار التقييم">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          aria-label={`${star} نجوم`}
                          className="p-1 transition hover:scale-110"
                        >
                          <Star
                            className={`h-5 w-5 ${
                              star <= reviewRating
                                ? 'fill-[#C5A880] text-[#C5A880]'
                                : 'text-stone-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={60}
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder="اسمك (مثال: محمود حسن)"
                      className="h-10 rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      maxLength={600}
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="تعليق مختصر عن تجربتك (اختياري)"
                      className="h-10 rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                    />
                  </div>

                  {reviewError && (
                    <p className="text-xs font-semibold text-red-700" role="alert">
                      {reviewError}
                    </p>
                  )}
                  {reviewSuccess && (
                    <p className="text-xs font-semibold text-emerald-700" role="status">
                      {reviewSuccess}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#172E4D] disabled:opacity-60"
                  >
                    {submittingReview && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>{submittingReview ? 'جاري النشر...' : 'نشر التقييم'}</span>
                  </button>
                </div>
              )}
            </form>
          </section>
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

            {/* Guided 3-Step Booking Stepper Header */}
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-1.5 text-center text-[11px] font-bold">
                {(
                  [
                    { step: 1, label: '١. الوحدة والتواريخ' },
                    { step: 2, label: '٢. السعر والشروط' },
                    { step: 3, label: '٣. تأكيد الحجز' },
                  ] as const
                ).map((item) => {
                  const active = bookingStep === item.step;
                  const done = bookingStep > item.step;
                  return (
                    <div
                      key={item.step}
                      className={`rounded-xl px-2 py-2 transition ${
                        active
                          ? 'bg-[#1E3A5F] text-white shadow-xs'
                          : done
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {bookingStep === 1 && (
              <>
                {/* Step 1: Dates, Guests & Contact Details */}
                <div className="mt-4 space-y-3.5">
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
                        onChange={(e) => {
                          setGuests(Number(e.target.value));
                          setStepValidationError('');
                        }}
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="booking-guest-name"
                        className="mb-1 block text-xs font-semibold text-[#6B7280]"
                      >
                        الاسم الكامل
                      </label>
                      <input
                        id="booking-guest-name"
                        type="text"
                        value={guestName}
                        onChange={(e) => {
                          setGuestName(e.target.value);
                          setStepValidationError('');
                        }}
                        placeholder="الاسم الثلاثي"
                        className="h-11 w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="booking-guest-phone"
                        className="mb-1 block text-xs font-semibold text-[#6B7280]"
                      >
                        رقم الموبايل المصري
                      </label>
                      <input
                        id="booking-guest-phone"
                        type="tel"
                        dir="ltr"
                        value={guestPhone}
                        onChange={(e) => {
                          setGuestPhone(e.target.value);
                          setStepValidationError('');
                        }}
                        placeholder="01012345678"
                        className="h-11 w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-right text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="booking-notes"
                      className="mb-1 block text-xs font-semibold text-[#6B7280]"
                    >
                      ملاحظات للمعلن (اختياري)
                    </label>
                    <input
                      id="booking-notes"
                      type="text"
                      maxLength={300}
                      value={bookingNotes}
                      onChange={(e) => setBookingNotes(e.target.value)}
                      placeholder="وقت الوصول المتوقع أو أي استفسار..."
                      className="h-11 w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                    />
                  </div>

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

                  {stepValidationError && (
                    <div
                      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
                      role="alert"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <span>{stepValidationError}</span>
                    </div>
                  )}
                </div>

                {/* Flexible Weekend & Seasonal Rate Info Strip */}
                {!isMonthlyOnly &&
                  ((chalet.weekendPrice ?? 0) > 0 || (chalet.seasonalPrice ?? 0) > 0) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(chalet.weekendPrice ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-[#C5A880]/60 bg-[#FAF6F0] px-2.5 py-1 text-[11px] font-bold text-[#1E3A5F]">
                          الويك إند (خميس/جمعة): {formatEGP(chalet.weekendPrice!)}
                        </span>
                      )}
                      {(chalet.seasonalPrice ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                          {chalet.seasonalLabel || 'سعر الموسم'}: {formatEGP(chalet.seasonalPrice!)}
                          {chalet.seasonalStart && chalet.seasonalEnd
                            ? ` (${formatArabicDate(chalet.seasonalStart)} - ${formatArabicDate(chalet.seasonalEnd)})`
                            : ''}
                        </span>
                      )}
                    </div>
                  )}

                {/* Estimated Quick Summary */}
                <div className="mt-4 space-y-2 rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4 text-xs">
                  <div className="flex items-center justify-between text-[#1E3A5F]">
                    <span className="font-bold">
                      {isMonthlyOnly
                        ? 'الإيجار الشهري المعلن'
                        : `الإجمالي التقديري (${quote.nights.toLocaleString('ar-EG')} ليالٍ)`}
                    </span>
                    <strong className="text-sm">{formatEGP(quote.subtotal)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>جدية الحجز:</span>
                    <strong className="text-[#1F2937]">
                      {quote.hasInformationalDeposit
                        ? quote.depositDisplayText
                        : 'تُحدد عند الاتفاق'}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={hasBlockedConflict || loadingServerQuote}
                  onClick={() => void handleProceedToReview()}
                  className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#172E4D] disabled:opacity-60"
                >
                  {loadingServerQuote && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>
                    {loadingServerQuote
                      ? 'جاري مراجعة السعر والتوافر...'
                      : 'الخطوة التالية: مراجعة السعر والشروط'}
                  </span>
                </button>
              </>
            )}

            {bookingStep === 2 && (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4 text-xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
                    <span className="font-bold text-[#1E3A5F]">ملخص السعر النهائي المعتمد</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      محتسب من الخادم
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>التواريخ:</span>
                    <span className="font-bold text-[#1F2937]">
                      {formatArabicDate(checkIn)} ←{' '}
                      {formatArabicDate(isMonthlyOnly ? addDaysIso(checkIn, 30) : checkOut)}
                    </span>
                  </div>

                  {!isMonthlyOnly && (
                    <div className="flex items-center justify-between text-[#6B7280]">
                      <span>عدد الضيوف:</span>
                      <span className="font-bold text-[#1F2937]">
                        {guests.toLocaleString('ar-EG')} أفراد
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>الإجمالي النهائي:</span>
                    <strong className="text-base text-[#1E3A5F]">
                      {formatEGP(serverQuote?.totalPrice ?? quote.subtotal)}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>جدية الحجز (العربون):</span>
                    <strong className="text-[#1F2937]">
                      {formatEGP(serverQuote?.depositAmount ?? quote.depositAmount)}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>المتبقي عند الاستلام:</span>
                    <strong className="text-[#1F2937]">
                      {formatEGP(
                        serverQuote?.remainingAmount ??
                          Math.max(0, quote.subtotal - quote.depositAmount)
                      )}
                    </strong>
                  </div>
                </div>

                {/* Check-in / Check-out & Cancellation Policy */}
                <div className="rounded-2xl border border-[#C5A880]/70 bg-[#FAF6F0] p-4 text-xs space-y-2">
                  <div className="font-bold text-[#1E3A5F]">مواعيد الدخول والخروج وسياسة الإلغاء</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl bg-white p-2.5">
                      <span className="block text-[#6B7280]">موعد الدخول</span>
                      <strong className="text-[#1E3A5F]">
                        {serverQuote?.checkinTime ?? '١٤:٠٠ (٢:٠٠ عصراً)'}
                      </strong>
                    </div>
                    <div className="rounded-xl bg-white p-2.5">
                      <span className="block text-[#6B7280]">موعد الخروج</span>
                      <strong className="text-[#1E3A5F]">
                        {serverQuote?.checkoutTime ?? '١٢:٠٠ (١٢:٠٠ ظهراً)'}
                      </strong>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#4B5563]">
                    <strong>سياسة الإلغاء:</strong>{' '}
                    {serverQuote?.cancellationPolicy ??
                      'إلغاء مجاني قبل موعد الوصول بـ ١٠ أيام على الأقل؛ بعد ذلك يُخصم مبلغ جدية الحجز (إن وُجد).'}
                  </p>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200/80 bg-white p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={policyAccepted}
                    onChange={(e) => {
                      setPolicyAccepted(e.target.checked);
                      setBookingSubmitError('');
                    }}
                    className="mt-0.5 h-4 w-4 rounded accent-[#1E3A5F]"
                  />
                  <span className="font-semibold leading-relaxed text-[#1F2937]">
                    أقر بقراءة ملخص السعر ومواعيد الدخول والخروج وشروط الإلغاء والموافقة عليها.
                  </span>
                </label>

                {!isAuthenticatedUser && !chalet.isDemo && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                    <p className="font-bold">يتطلب إرسال طلب الحجز الإلكتروني تسجيل الدخول أولاً.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate('bookings')}
                          className="min-h-[38px] rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          تسجيل الدخول / حسابي
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {bookingSubmitError && (
                  <div
                    className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
                    role="alert"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <span>{bookingSubmitError}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setBookingStep(1)}
                    className="min-h-[46px] flex-1 rounded-xl border border-stone-200/80 bg-white px-4 py-2.5 text-xs font-bold text-[#1E3A5F] hover:bg-[#FAF9F6]"
                  >
                    تعديل البيانات
                  </button>
                  <button
                    type="button"
                    disabled={submittingBooking}
                    onClick={() => void handleConfirmBookingRequest()}
                    className="inline-flex min-h-[46px] flex-[2] items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#172E4D] disabled:opacity-60"
                  >
                    {submittingBooking && <RefreshCw className="h-4 w-4 animate-spin" />}
                    <span>{submittingBooking ? 'جاري التأكيد...' : 'تأكيد وإرسال طلب الحجز'}</span>
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 3 && confirmedBooking && (
              <div className="mt-4 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                  <div>
                    <h3 className="text-sm font-extrabold text-emerald-950">
                      تم إرسال طلب الحجز بنجاح!
                    </h3>
                    <p className="mt-1 text-emerald-900">
                      رقم الحجز: <strong dir="ltr">{confirmedBooking.id}</strong> — الحالة:{' '}
                      <span className="rounded-full bg-white px-2 py-0.5 font-bold text-[#1E3A5F]">
                        قيد المراجعة
                      </span>
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 space-y-1.5 text-[#1F2937]">
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">التواريخ:</span>
                    <strong>
                      {formatArabicDate(confirmedBooking.checkIn)} ←{' '}
                      {formatArabicDate(confirmedBooking.checkOut)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">الإجمالي المعتمد:</span>
                    <strong className="text-[#1E3A5F]">
                      {formatEGP(confirmedBooking.totalPrice)}
                    </strong>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('bookings')}
                      className="min-h-[44px] w-full rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#172E4D]"
                    >
                      عرض تفاصيل الحجز في «حجوزاتي»
                    </button>
                  )}
                  {onOpenSupport && (
                    <button
                      type="button"
                      onClick={() => onOpenSupport(confirmedBooking.id)}
                      className="min-h-[42px] w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-[#1E3A5F] hover:bg-[#FAF9F6]"
                    >
                      طلب مساعدة أو تعديل لهذا الحجز
                    </button>
                  )}
                </div>
              </div>
            )}

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

              <button
                type="button"
                onClick={() => {
                  setReportError('');
                  setReportSuccess('');
                  setIsReportOpen(true);
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-[#6B7280] transition hover:bg-red-50 hover:text-red-700"
              >
                <Flag className="h-3.5 w-3.5" />
                <span>الإبلاغ عن مخالفة في هذا الإعلان</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Similar Listings Section */}
      {similarChalets.length > 0 && onSelectChalet && (
        <section aria-label="وحدات مشابهة" className="mt-12 border-t border-stone-200/70 pt-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1E3A5F] sm:text-xl">
                وحدات مشابهة في نفس المنطقة أو الفئة
              </h2>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                خيارات إضافية قد تناسب ميزانيتك وتواريخك
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similarChalets.map((item) => (
              <PropertyCard
                key={item.id}
                property={item}
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={onToggleFavorite ?? (() => {})}
                onSelect={onSelectChalet}
              />
            ))}
          </div>
        </section>
      )}

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

      {/* Listing Violation Report Modal */}
      {isReportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-listing-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-red-600" />
                <h2 id="report-listing-title" className="text-base font-bold text-[#1E3A5F]">
                  الإبلاغ عن إعلان مخالف
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsReportOpen(false)}
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-stone-100"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="mt-5 space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <p className="text-sm font-bold text-emerald-900">{reportSuccess}</p>
                <button
                  type="button"
                  onClick={() => setIsReportOpen(false)}
                  className="min-h-[42px] w-full rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-bold text-white"
                >
                  حسناً
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="report-reason"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    سبب البلاغ
                  </label>
                  <select
                    id="report-reason"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="h-11 w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                  >
                    <option value="سعر مختلف عن الحقيقة">سعر مختلف عن الحقيقة</option>
                    <option value="صور أو بيانات غير مطابقة للواقع">
                      صور أو بيانات غير مطابقة للواقع
                    </option>
                    <option value="رقم لا يرد أو غير صحيح">رقم لا يرد أو غير صحيح</option>
                    <option value="اشتباه احتيال أو طلب تحويل مسبق">
                      اشتباه احتيال أو طلب تحويل مسبق
                    </option>
                    <option value="وحدة مكررة أو غير متاحة">وحدة مكررة أو غير متاحة</option>
                    <option value="مخالفة أخرى">مخالفة أخرى</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="report-details"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    تفاصيل إضافية (اختياري)
                  </label>
                  <textarea
                    id="report-details"
                    rows={3}
                    maxLength={500}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="اكتب أي تفاصيل تساعد الإدارة في التحقق..."
                    className="w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] p-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                  />
                </div>

                {reportError && (
                  <div
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                    role="alert"
                  >
                    {reportError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReportOpen(false)}
                    className="min-h-[42px] rounded-xl border border-stone-200/70 px-4 py-2 text-xs font-bold text-[#6B7280]"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {submittingReport && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>{submittingReport ? 'جاري الإرسال...' : 'إرسال البلاغ'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
