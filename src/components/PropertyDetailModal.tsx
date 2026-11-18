import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  CreditCard,
  Flag,
  Home,
  MapPin,
  Maximize2,
  MessageCircle,
  MessageSquareText,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Star,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Umbrella,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { ChaletReviews } from '@/components/ChaletReviews';
import { ChaletShareActions } from '@/components/ChaletShareActions';
import { ImageLightboxModal } from '@/components/ImageLightboxModal';
import {
  compareToMarketBenchmark,
  formatEGP,
  getAdvertiserBadgeInfo,
  getAmenityLabel,
  getUnitTypeLabel,
  getViewTypeLabel,
} from '@/data/chalets';
import {
  addDaysIso,
  calculateNightsBetween,
  calculateStayPricing,
  daysUntilDate,
  findConflictingDates,
  formatArabicDate,
  formatIsoDate,
  getConfirmedBookedDatesForChalet,
  getOccupiedDatesForChalet,
} from '@/utils/bookingPricing';
import type {
  BookingRequest,
  Chalet,
  ChaletReview,
  NearbyHighlight,
  PropertyReviewTag,
  RentalDuration,
} from '@/types/chalet';

interface PropertyDetailModalProps {
  chalet: Chalet;
  reviews: ChaletReview[];
  allBookingsForChalet: BookingRequest[];
  defaultDuration?: RentalDuration;
  initialCheckIn?: string;
  initialCheckOut?: string;
  reportsCount?: number;
  onClose: () => void;
  onSubmitBooking: (booking: Omit<BookingRequest, 'id' | 'status' | 'createdAt'>) => void;
  onSubmitReview: (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => void;
  onDeleteReview: (reviewId: string) => void;
  onReportListing?: (payload: { chaletId: string; reason: string; details: string }) => void;
}

function getHighlightIcon(category: NearbyHighlight['category']) {
  switch (category) {
    case 'market':
      return <ShoppingBag className="h-4 w-4 text-primary-600" />;
    case 'dining':
      return <Utensils className="h-4 w-4 text-accent-600" />;
    case 'pharmacy':
      return <Stethoscope className="h-4 w-4 text-error-500" />;
    case 'beach':
    default:
      return <Umbrella className="h-4 w-4 text-secondary-600" />;
  }
}

const REPORT_REASONS = [
  'يطلب عمولة سمسرة رغم شارة مالك',
  'السعر الفعلي أعلى من المعلن',
  'صور غير مطابقة للواقع',
  'الوحدة غير متاحة',
];

export function PropertyDetailModal({
  chalet,
  reviews,
  allBookingsForChalet,
  defaultDuration = 'daily',
  initialCheckIn = '',
  initialCheckOut = '',
  reportsCount = 0,
  onClose,
  onSubmitBooking,
  onSubmitReview,
  onDeleteReview,
  onReportListing,
}: PropertyDetailModalProps) {
  const badgeInfo = getAdvertiserBadgeInfo(chalet.owner.roleType, chalet.owner.brokerAgency);
  const today = useMemo(() => formatIsoDate(new Date()), []);
  const occupiedDates = useMemo(
    () => getOccupiedDatesForChalet(chalet, allBookingsForChalet),
    [chalet, allBookingsForChalet]
  );
  const confirmedBookedDates = useMemo(
    () => getConfirmedBookedDatesForChalet(chalet.id, allBookingsForChalet),
    [chalet.id, allBookingsForChalet]
  );

  const initialAvailableDate = useMemo(() => {
    if (initialCheckIn) return initialCheckIn;
    const probe = new Date();
    for (let i = 0; i < 30; i += 1) {
      const candidate = formatIsoDate(probe);
      if (!occupiedDates.has(candidate)) return candidate;
      probe.setDate(probe.getDate() + 1);
    }
    return today;
  }, [initialCheckIn, occupiedDates, today]);

  const defaultNightsCount =
    defaultDuration === 'monthly' ? 30 : defaultDuration === 'weekly' ? 7 : 4;

  const initialComputedCheckOut = useMemo(() => {
    if (
      initialCheckIn &&
      initialCheckOut &&
      calculateNightsBetween(initialCheckIn, initialCheckOut) > 0
    ) {
      return initialCheckOut;
    }
    return addDaysIso(initialAvailableDate, defaultNightsCount);
  }, [defaultNightsCount, initialAvailableDate, initialCheckIn, initialCheckOut]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [rentalDuration, setRentalDuration] = useState<RentalDuration>(defaultDuration);
  const [checkIn, setCheckIn] = useState(initialAvailableDate);
  const [checkOut, setCheckOut] = useState(initialComputedCheckOut);
  const [guests, setGuests] = useState(Math.min(4, chalet.maxGuests));
  const [splitFamilies, setSplitFamilies] = useState(2);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [instaPayCopied, setInstaPayCopied] = useState(false);
  const [directContactLogged, setDirectContactLogged] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const nights = Math.max(1, calculateNightsBetween(checkIn, checkOut));
  const daysBeforeCheckIn = daysUntilDate(checkIn, today);

  const marketComparison = useMemo(
    () => compareToMarketBenchmark(chalet, rentalDuration),
    [chalet, rentalDuration]
  );

  const selectImage = (index: number) => {
    const total = chalet.images.length;
    if (total === 0) return;
    setImageError(false);
    setActiveImageIndex((index + total) % total);
  };

  const handleDurationChange = (nextDuration: RentalDuration) => {
    setRentalDuration(nextDuration);
    const nextNights =
      nextDuration === 'monthly' ? 30 : nextDuration === 'weekly' ? 7 : 4;
    setCheckOut(addDaysIso(checkIn, nextNights));
  };

  const handleCheckInChange = (nextIn: string) => {
    if (!nextIn) return;
    setCheckIn(nextIn);
    if (calculateNightsBetween(nextIn, checkOut) <= 0) {
      setCheckOut(addDaysIso(nextIn, nights));
    }
    setFormError('');
  };

  const handleCheckOutChange = (nextOut: string) => {
    if (!nextOut) return;
    if (calculateNightsBetween(checkIn, nextOut) <= 0) {
      setCheckOut(addDaysIso(checkIn, 1));
    } else {
      setCheckOut(nextOut);
    }
    setFormError('');
  };

  const conflicts = useMemo(
    () => findConflictingDates(checkIn, nights, occupiedDates),
    [checkIn, nights, occupiedDates]
  );

  const pricing = useMemo(
    () => calculateStayPricing(chalet, checkIn, nights, rentalDuration),
    [chalet, checkIn, nights, rentalDuration]
  );

  const perFamilyShare = Math.round(pricing.subtotal / Math.max(1, splitFamilies));

  const whatsappNumber = chalet.owner.phone.startsWith('0')
    ? `2${chalet.owner.phone}`
    : chalet.owner.phone;

  const instaPayTarget = chalet.owner.instaPayHandle || chalet.owner.phone;

  const logDirectInquiry = (channel: 'whatsapp' | 'phone') => {
    onSubmitBooking({
      chaletId: chalet.id,
      chaletTitle: chalet.title,
      resort: chalet.resort,
      destinationLabel: chalet.destinationLabel,
      ownerName: chalet.owner.name,
      ownerPhone: chalet.owner.phone,
      ownerInstaPay: instaPayTarget,
      guestName: guestName.trim() || 'زائر منصة AgzStay',
      guestPhone: guestPhone.trim() || '01000000000',
      checkIn,
      checkOut,
      nights,
      rentalDuration,
      inquiryChannel: channel,
      guests,
      totalPrice: pricing.subtotal,
      depositAmount: pricing.downPaymentAmount,
      remainingAmount: pricing.remainingBalance,
      securityDeposit: pricing.securityDeposit,
      policyAccepted,
      notes:
        channel === 'whatsapp'
          ? 'تم فتح محادثة واتساب مباشرة مع المعلن'
          : 'تم الضغط على اتصال هاتفي مباشر بالمعلن',
    });
    setDirectContactLogged(
      channel === 'whatsapp'
        ? 'تم تسجيل استفسار الواتساب تلقائياً في لوحة تحكم المعلن وقائمة طلباتك.'
        : 'تم تسجيل محاولة الاتصال المباشر تلقائياً في لوحة تحكم المعلن.'
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (conflicts.length > 0) {
      setFormError(
        `التواريخ المختارة تتعارض مع مواعيد محجوزة أو مغلقة (${conflicts.map(formatArabicDate).join('، ')}). يرجى اختيار موعد متاح من التقويم.`
      );
      return;
    }
    if (!guestName.trim()) {
      setFormError('يرجى إدخال اسمك الكامل.');
      return;
    }
    if (!/^01[0125][0-9]{8}$/.test(guestPhone.trim())) {
      setFormError('يرجى إدخال رقم هاتف مصري صحيح مكون من ١١ رقماً.');
      return;
    }
    if (!policyAccepted) {
      setFormError(
        'يرجى الموافقة على سياسة الإلغاء وعدم استرداد جدية الحجز قبل الوصول بأقل من ١٠ أيام.'
      );
      return;
    }
    setFormError('');
    onSubmitBooking({
      chaletId: chalet.id,
      chaletTitle: chalet.title,
      resort: chalet.resort,
      destinationLabel: chalet.destinationLabel,
      ownerName: chalet.owner.name,
      ownerPhone: chalet.owner.phone,
      ownerInstaPay: instaPayTarget,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      checkIn,
      checkOut,
      nights,
      rentalDuration,
      inquiryChannel: 'form',
      guests,
      totalPrice: pricing.subtotal,
      depositAmount: pricing.downPaymentAmount,
      remainingAmount: pricing.remainingBalance,
      securityDeposit: pricing.securityDeposit,
      policyAccepted: true,
      notes: notes.trim(),
    });
    setSubmitted(true);
  };

  const agreementSummaryText = useMemo(() => {
    const durationLabel =
      rentalDuration === 'monthly' ? 'شهري' : rentalDuration === 'weekly' ? 'أسبوعي' : 'يومي';
    const lines = [
      'ملخص طلب حجز مبدئي — منصة AgzStay (إجازة ستاي)',
      `الوحدة: ${chalet.title}`,
      `الموقع: ${chalet.destinationLabel}${chalet.area ? ` - ${chalet.area}` : ''} (${chalet.resort})`,
      `المعلن: ${chalet.owner.name} (${badgeInfo.label}) — ${chalet.owner.phone}`,
      `حساب إنستاباي لجدية الحجز: ${instaPayTarget}`,
      `المستأجر: ${guestName.trim() || 'غير محدد'} (${guestPhone.trim() || 'غير محدد'})`,
      `نظام الإيجار: ${durationLabel} • الوصول: ${formatArabicDate(checkIn)} ← المغادرة: ${formatArabicDate(checkOut)} (${nights} ليالٍ • ${guests} أفراد)`,
      `التكلفة الإجمالية للإقامة: ${formatEGP(pricing.subtotal)}`,
      `جدية الحجز المطلوبة (${pricing.depositLabel}): ${formatEGP(pricing.downPaymentAmount)}`,
      `المتبقي عند الاستلام: ${formatEGP(pricing.remainingBalance)}`,
      `التأمين المسترد: ${formatEGP(pricing.securityDeposit)}`,
      'سياسة الإلغاء: جدية الحجز لا تُرد في حال إلغاء الحجز قبل موعد الوصول بأقل من 10 أيام.',
      `تصاريح القرية والخدمات: ${chalet.includesPasses ? 'مشمولة بدون رسوم إضافية' : 'غير مشمولة / تُسدد عند البوابة'}`,
      'رسوم منصة AgzStay: ٠ ج.م',
    ];
    return lines.join('\n');
  }, [
    badgeInfo.label,
    chalet,
    checkIn,
    checkOut,
    guestName,
    guestPhone,
    guests,
    instaPayTarget,
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
      // Ignore clipboard failure
    }
  };

  const handleCopyInstaPay = async () => {
    try {
      await navigator.clipboard?.writeText(instaPayTarget);
      setInstaPayCopied(true);
      setTimeout(() => setInstaPayCopied(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onReportListing) return;
    onReportListing({
      chaletId: chalet.id,
      reason: reportReason,
      details: reportDetails.trim(),
    });
    setReportSubmitted(true);
    setReportDetails('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={chalet.title}
    >
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق النافذة"
          className="sticky left-4 top-4 z-20 float-left ml-4 mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md transition hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-slate-100">
          <div className="group relative h-64 w-full overflow-hidden bg-primary-100 sm:h-80">
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              aria-label="عرض الصور بحجم الشاشة الكاملة"
              className="block h-full w-full cursor-zoom-in focus:outline-none"
            >
              {!imageError && chalet.images[activeImageIndex] ? (
                <img
                  src={chalet.images[activeImageIndex]}
                  alt={chalet.title}
                  onError={() => setImageError(true)}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-primary-600 to-secondary-500 text-white">
                  <Home className="h-12 w-12 text-sand-100" />
                  <span className="mt-2 text-sm font-semibold">{chalet.resort}</span>
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900/75 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-slate-900"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>
                تكبير المعرض ({activeImageIndex + 1}/{chalet.images.length})
              </span>
            </button>

            {chalet.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectImage(activeImageIndex - 1);
                  }}
                  aria-label="الصورة السابقة"
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectImage(activeImageIndex + 1);
                  }}
                  aria-label="الصورة التالية"
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {chalet.images.length > 1 && (
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2.5 sm:px-6">
              {chalet.images.map((src, idx) => {
                const isActive = idx === activeImageIndex;
                return (
                  <button
                    key={`${src}-${idx}`}
                    type="button"
                    onClick={() => selectImage(idx)}
                    onDoubleClick={() => {
                      selectImage(idx);
                      setIsLightboxOpen(true);
                    }}
                    aria-label={`اختيار صورة ${idx + 1}`}
                    className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                      isActive
                        ? 'border-primary-600 ring-2 ring-primary-600/20'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={src}
                      alt={`${chalet.title} - مصغرة ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 p-5 sm:p-7 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary-500 px-3 py-1 text-xs font-extrabold text-white">
                  للإيجار المباشر
                </span>
                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                  {chalet.destinationLabel}
                  {chalet.area ? ` • ${chalet.area}` : ''}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  <Compass className="h-3.5 w-3.5 text-secondary-500" />
                  {getUnitTypeLabel(chalet.unitType)} • {getViewTypeLabel(chalet.viewType)}
                </span>
                {chalet.includesPasses && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-bold text-success-700">
                    <BadgeCheck className="h-3.5 w-3.5 text-success-500" />
                    شامل التصاريح / الخدمات
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-bold text-warning-700">
                  <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
                  {chalet.reviewsCount > 0 ? chalet.rating.toFixed(1) : 'جديد'} ({chalet.reviewsCount} تقييم)
                </span>
              </div>

              <h2 className="mt-2.5 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {chalet.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-secondary-500" />
                <span>{chalet.resort}</span>
                {chalet.areaSqm && (
                  <>
                    <span>•</span>
                    <span>المساحة: {chalet.areaSqm} م²</span>
                  </>
                )}
                {chalet.beachDistanceMeters > 0 && (
                  <>
                    <span>•</span>
                    <span>يبعد {chalet.beachDistanceMeters}م عن البحر</span>
                  </>
                )}
              </div>
            </div>

            <ChaletShareActions chalet={chalet} />

            {reportsCount > 0 && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="font-bold">
                    تنبيه شفافية: تم تسجيل {reportsCount.toLocaleString('ar-EG')} بلاغ مراجعة على هذه الوحدة
                  </div>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    ننصح بالتحقق من السعر الإجمالي وشروط العمولة كتابياً قبل تحويل أي عربون.
                  </p>
                </div>
              </div>
            )}

            {marketComparison && (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3.5 text-xs ${
                  marketComparison.status === 'below'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : marketComparison.status === 'above'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-secondary-200 bg-secondary-50 text-secondary-900'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {marketComparison.status === 'below' ? (
                    <TrendingDown className="h-4 w-4 text-emerald-600" />
                  ) : marketComparison.status === 'above' ? (
                    <TrendingUp className="h-4 w-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-secondary-600" />
                  )}
                  <span>
                    مقارنة بمؤشر السوق ({marketComparison.benchmarkArea}): {marketComparison.label}
                  </span>
                </div>
                <span className="font-semibold opacity-90">
                  المتوسط الاسترشادي: {formatEGP(marketComparison.benchmarkAvg)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-sand-50 p-3.5 text-center">
              <div>
                <BedDouble className="mx-auto h-5 w-5 text-primary-600" />
                <div className="mt-1 text-sm font-bold text-slate-900">{chalet.bedrooms} غرف نوم</div>
              </div>
              <div className="border-x border-sand-200">
                <Bath className="mx-auto h-5 w-5 text-primary-600" />
                <div className="mt-1 text-sm font-bold text-slate-900">{chalet.bathrooms} حمام</div>
              </div>
              <div>
                <Users className="mx-auto h-5 w-5 text-primary-600" />
                <div className="mt-1 text-sm font-bold text-slate-900">حتى {chalet.maxGuests} أفراد</div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">تفاصيل الوحدة</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{chalet.description}</p>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">المميزات والخدمات</h3>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {chalet.amenities.map((amenity) => (
                  <span
                    key={amenity}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-secondary-200 bg-secondary-50/70 px-3 py-1.5 text-xs font-semibold text-secondary-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-secondary-600" />
                    {getAmenityLabel(amenity)}
                  </span>
                ))}
              </div>
            </div>

            {chalet.nearbyHighlights && chalet.nearbyHighlights.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-sand-50/80 p-4">
                <h3 className="text-sm font-bold text-slate-900">الخدمات القريبة من الموقع</h3>
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {chalet.nearbyHighlights.map((item, idx) => (
                    <div
                      key={`${item.name}-${idx}`}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2"
                    >
                      {getHighlightIcon(item.category)}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-slate-800">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.distance}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-base font-bold text-slate-900">شروط وقواعد الإقامة</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                {chalet.rules.map((rule, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary-500" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-sand-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-slate-900">{chalet.owner.name}</span>
                    {badgeInfo.variant === 'founding' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-extrabold text-slate-900">
                        <Award className="h-3.5 w-3.5" />
                        {badgeInfo.label}
                      </span>
                    )}
                    {badgeInfo.variant === 'owner' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-bold text-success-700">
                        <ShieldCheck className="h-3.5 w-3.5 text-success-500" />
                        {badgeInfo.label}
                      </span>
                    )}
                    {badgeInfo.variant === 'broker' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                        <Briefcase className="h-3.5 w-3.5 text-sky-600" />
                        {badgeInfo.label} ({badgeInfo.sublabel})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {chalet.owner.responseTime} • عضو منذ {chalet.owner.memberSince}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${chalet.owner.phone}`}
                    onClick={() => logDirectInquiry('phone')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-primary-700 transition hover:bg-primary-50"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    اتصال مباشر
                  </a>
                  <a
                    href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                      `مرحباً ${chalet.owner.name}، أستفسر عن إيجار "${chalet.title}" عبر تطبيق AgzStay - إجازة ستاي.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => logDirectInquiry('whatsapp')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-success-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    واتساب
                  </a>
                </div>
              </div>
              {directContactLogged && (
                <p className="mt-2.5 rounded-xl bg-success-50 px-3 py-2 text-xs font-bold text-success-700">
                  {directContactLogged}
                </p>
              )}

              {onReportListing && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  {reportSubmitted ? (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>تم تسجيل بلاغك ومراجعته في مؤشر الشفافية لحماية المستخدمين.</span>
                    </div>
                  ) : !isReportOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsReportOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-error-600"
                    >
                      <Flag className="h-3.5 w-3.5 text-error-500" />
                      <span>إبلاغ عن سمسرة مخفية أو سعر وهمي</span>
                    </button>
                  ) : (
                    <form
                      onSubmit={handleReportSubmit}
                      className="space-y-2.5 rounded-xl border border-amber-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          الإبلاغ عن مخالفة تسعير أو سمسرة
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsReportOpen(false)}
                          className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                        >
                          إلغاء
                        </button>
                      </div>
                      <select
                        aria-label="سبب البلاغ"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-sand-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                      >
                        {REPORT_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={2}
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        placeholder="تفاصيل إضافية (مثال: طلب مبلغ أعلى عند الاتصال)..."
                        className="w-full rounded-lg border border-slate-200 bg-sand-50 px-2.5 py-1.5 text-xs text-slate-800"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-error-500 py-1.5 text-xs font-bold text-white hover:bg-error-700"
                      >
                        إرسال البلاغ الآن
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            <ChaletReviews
              chaletRating={chalet.rating}
              totalReviewsCount={chalet.reviewsCount}
              reviews={reviews}
              bookingsForChalet={allBookingsForChalet}
              onSubmitReview={onSubmitReview}
              onDeleteReview={onDeleteReview}
            />
          </div>

          <div className="lg:col-span-5">
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
                  {badgeInfo.variant === 'broker' ? 'وسيط معتمد' : '٠٪ عمولة وسيط'}
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
                    onClick={() => handleDurationChange(d.id as RentalDuration)}
                    className={`rounded-lg py-1.5 text-xs font-bold transition ${
                      rentalDuration === d.id
                        ? 'bg-secondary-500 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                    `مرحباً ${chalet.owner.name}، أرغب في حجز "${chalet.title}" (${chalet.resort}) عبر AgzStay.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => logDirectInquiry('whatsapp')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-500 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-success-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>تواصل عبر واتساب</span>
                </a>
                <a
                  href={`tel:${chalet.owner.phone}`}
                  onClick={() => logDirectInquiry('phone')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary-600 bg-primary-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
                >
                  <Phone className="h-4 w-4" />
                  <span>اتصال بالمعلن</span>
                </a>
              </div>

              {submitted ? (
                <div className="space-y-4 py-4">
                  <div className="text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 text-warning-600">
                      <CheckCircle2 className="h-8 w-8 text-success-500" />
                    </div>
                    <span className="mt-2 inline-block rounded-full bg-warning-50 px-3 py-0.5 text-[11px] font-bold text-warning-800">
                      حالة الطلب: في انتظار تأكيد جدية الحجز
                    </span>
                    <h3 className="mt-2 text-lg font-bold text-slate-900">
                      تم تسجيل طلب الحجز بنجاح
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      أرسل جدية الحجز ({formatEGP(pricing.downPaymentAmount)}) عبر إنستاباي أو تواصل مع المعلن ({chalet.owner.name}) لتأكيد الاستلام وإغلاق التواريخ على التقويم فوراً.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-secondary-200 bg-secondary-50/80 p-3.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-secondary-900">
                      <span className="inline-flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4 text-secondary-600" />
                        تفاصيل تحويل جدية الحجز (InstaPay)
                      </span>
                      <span className="font-extrabold text-primary-700">
                        {formatEGP(pricing.downPaymentAmount)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                      <span dir="ltr" className="font-bold text-slate-900">
                        {instaPayTarget}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyInstaPay}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 hover:bg-primary-100"
                      >
                        {instaPayCopied ? (
                          <Check className="h-3 w-3 text-success-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{instaPayCopied ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-primary-100 bg-sand-50 p-3.5 text-right text-xs">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-extrabold text-primary-800">ملخص الحجز المبدئي</span>
                      <span className="rounded-md bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700">
                        ٠٪ عمولة منصة
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans leading-relaxed text-slate-700">
                      {agreementSummaryText}
                    </pre>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleCopyAgreement}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary-200 bg-white py-2 text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        {summaryCopied ? (
                          <Check className="h-3.5 w-3.5 text-success-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{summaryCopied ? 'تم النسخ!' : 'نسخ الملخص'}</span>
                      </button>
                      <a
                        href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                          agreementSummaryText
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-500 py-2 text-xs font-bold text-white hover:bg-success-700"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>إرسال عبر واتساب</span>
                      </a>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
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
                        handleCheckInChange(iso);
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
                      <label
                        htmlFor="detail-checkin"
                        className="mb-1 block text-xs font-bold text-slate-700"
                      >
                        تاريخ الوصول
                      </label>
                      <input
                        id="detail-checkin"
                        type="date"
                        min={today}
                        value={checkIn}
                        onChange={(e) => handleCheckInChange(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="detail-checkout"
                        className="mb-1 block text-xs font-bold text-slate-700"
                      >
                        تاريخ المغادرة ({nights.toLocaleString('ar-EG')} ليالٍ)
                      </label>
                      <input
                        id="detail-checkout"
                        type="date"
                        min={addDaysIso(checkIn, 1)}
                        value={checkOut}
                        onChange={(e) => handleCheckOutChange(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
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

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label
                        htmlFor="booking-guests"
                        className="mb-1 block text-xs font-bold text-slate-700"
                      >
                        عدد الأفراد
                      </label>
                      <select
                        id="booking-guests"
                        value={guests}
                        onChange={(e) => setGuests(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
                      >
                        {Array.from({ length: chalet.maxGuests }, (_, i) => i + 1).map((g) => (
                          <option key={g} value={g}>
                            {g} {g === 1 ? 'فرد' : 'أفراد'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="booking-name"
                      className="mb-1 block text-xs font-bold text-slate-700"
                    >
                      الاسم الكامل
                    </label>
                    <input
                      id="booking-name"
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="مثال: أحمد محمود"
                      className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-phone"
                      className="mb-1 block text-xs font-bold text-slate-700"
                    >
                      رقم الموبايل (مصر)
                    </label>
                    <input
                      id="booking-phone"
                      type="tel"
                      dir="ltr"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-left text-sm text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-notes"
                      className="mb-1 block text-xs font-bold text-slate-700"
                    >
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

                  {/* Booking.com-style Dynamic Price Breakdown */}
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
                                item.source === 'custom'
                                  ? 'font-bold text-amber-800'
                                  : 'font-semibold'
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

                  {/* InstaPay Preview */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-[11px] text-slate-700">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <CreditCard className="h-3.5 w-3.5 text-secondary-600" />
                      التحويل المباشر (إنستاباي):
                    </span>
                    <span dir="ltr" className="font-extrabold text-primary-700">
                      {instaPayTarget}
                    </span>
                  </div>

                  {/* 10-Day Non-Refundable Deposit Policy Box */}
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
                    <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[11px] font-bold text-slate-800">
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
                        أوافق على سياسة الإلغاء وعدم استرداد جدية الحجز في حال الإلغاء قبل الوصول بأقل من ١٠ أيام.
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

                  {formError && (
                    <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={conflicts.length > 0}
                    className="w-full rounded-xl bg-primary-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    احجز الآن — إرسال طلب الحجز للمعلن
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
