import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  Camera,
  CheckCircle2,
  Compass,
  Crown,
  Flag,
  MapPin,
  MessageCircle,
  Phone,
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
import { BookingRequestForm } from '@/components/BookingRequestForm';
import { ChaletGallery } from '@/components/ChaletGallery';
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
import { useModal } from '@/hooks/useModal';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchChaletBookedRanges,
  revealOwnerContact,
  subscribeToBookingsChanges,
  type RepoResult,
} from '@/services/agzstayRepository';
import type {
  AppUser,
  BookedDateRange,
  BookingRequest,
  BookingStatus,
  Chalet,
  ChaletReview,
  NearbyHighlight,
  PropertyReviewTag,
  RentalDuration,
  RevealedOwnerContact,
} from '@/types/chalet';
import {
  addDaysIso,
  calculateNightsBetween,
  calculateStayPricing,
  formatArabicDate,
  formatIsoDate,
  getConfirmedBookedDatesForChalet,
  getOccupiedDatesForChalet,
} from '@/utils/bookingPricing';

interface PropertyDetailModalProps {
  currentUser: AppUser | null;
  chalet: Chalet;
  reviews: ChaletReview[];
  allBookingsForChalet: BookingRequest[];
  bookedRangesForChalet?: BookedDateRange[];
  defaultDuration?: RentalDuration;
  initialCheckIn?: string;
  initialCheckOut?: string;
  reportsCount?: number;
  onClose: () => void;
  onOpenAuth: () => void;
  onSubmitBooking: (
    booking: Omit<BookingRequest, 'id' | 'status' | 'createdAt'> & { status?: BookingStatus }
  ) => Promise<RepoResult<BookingRequest>>;
  onSubmitReview: (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => Promise<RepoResult<ChaletReview>>;
  onDeleteReview: (reviewId: string) => void;
  onReportListing?: (payload: {
    chaletId: string;
    reason: string;
    details: string;
  }) => Promise<RepoResult<boolean>>;
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
  currentUser,
  chalet,
  reviews,
  allBookingsForChalet,
  bookedRangesForChalet = [],
  defaultDuration = 'daily',
  initialCheckIn = '',
  initialCheckOut = '',
  reportsCount = 0,
  onClose,
  onOpenAuth,
  onSubmitBooking,
  onSubmitReview,
  onDeleteReview,
  onReportListing,
}: PropertyDetailModalProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const modalRef = useModal<HTMLDivElement>({
    onClose,
    closeOnEscape: !isLightboxOpen,
  });

  const badgeInfo = getAdvertiserBadgeInfo(chalet.owner.roleType, chalet.owner.brokerAgency);
  const today = useMemo(() => formatIsoDate(new Date()), []);
  const [remoteRanges, setRemoteRanges] = useState<BookedDateRange[]>([]);
  const [revealedContact, setRevealedContact] = useState<RevealedOwnerContact | null>(null);

  const hasUserActiveBooking = useMemo(
    () =>
      Boolean(
        currentUser &&
          allBookingsForChalet.some(
            (b) =>
              b.chaletId === chalet.id &&
              b.renterId === currentUser.id &&
              (b.status === 'approved' ||
                b.status === 'payment_submitted' ||
                b.status === 'pending_verification' ||
                b.status === 'confirmed' ||
                b.status === 'completed')
          )
      ),
    [allBookingsForChalet, chalet.id, currentUser]
  );

  const isOwnerOrAdmin = useMemo(
    () =>
      Boolean(
        currentUser &&
          (currentUser.role === 'admin' || chalet.ownerId === currentUser.id)
      ),
    [chalet.ownerId, currentUser]
  );

  useEffect(() => {
    let active = true;
    const loadRanges = () => {
      void fetchChaletBookedRanges(chalet.id).then((res) => {
        if (active && res.data) {
          setRemoteRanges(res.data);
        }
      });
    };
    loadRanges();
    const unsubscribe = subscribeToBookingsChanges(loadRanges, chalet.id);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chalet.id]);

  useEffect(() => {
    let active = true;
    if (!chalet.isDemo && (hasUserActiveBooking || isOwnerOrAdmin)) {
      void revealOwnerContact(chalet.id).then((res) => {
        if (active && res.data) {
          setRevealedContact(res.data);
        }
      });
    } else {
      setRevealedContact(null);
    }
    return () => {
      active = false;
    };
  }, [chalet.id, chalet.isDemo, hasUserActiveBooking, isOwnerOrAdmin]);

  const combinedRanges = useMemo(
    () => [...bookedRangesForChalet, ...remoteRanges, ...allBookingsForChalet],
    [allBookingsForChalet, bookedRangesForChalet, remoteRanges]
  );

  const occupiedDates = useMemo(
    () => getOccupiedDatesForChalet(chalet, combinedRanges),
    [chalet, combinedRanges]
  );
  const confirmedBookedDates = useMemo(
    () => getConfirmedBookedDatesForChalet(chalet.id, combinedRanges),
    [chalet.id, combinedRanges]
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
  const [rentalDuration, setRentalDuration] = useState<RentalDuration>(defaultDuration);
  const [checkIn, setCheckIn] = useState(initialAvailableDate);
  const [checkOut, setCheckOut] = useState(initialComputedCheckOut);
  const [guests, setGuests] = useState(Math.min(4, chalet.maxGuests));
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState('');

  const nights = Math.max(1, calculateNightsBetween(checkIn, checkOut));

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
  };

  const handleCheckOutChange = (nextOut: string) => {
    if (!nextOut) return;
    if (calculateNightsBetween(checkIn, nextOut) <= 0) {
      setCheckOut(addDaysIso(checkIn, 1));
    } else {
      setCheckOut(nextOut);
    }
  };

  const pricing = useMemo(
    () => calculateStayPricing(chalet, checkIn, nights, rentalDuration),
    [chalet, checkIn, nights, rentalDuration]
  );

  const canSeeOwnerContact =
    !chalet.isDemo && (hasUserActiveBooking || isOwnerOrAdmin);
  const effectiveOwnerPhone = canSeeOwnerContact
    ? revealedContact?.ownerPhone || chalet.owner.phone || ''
    : '';
  const effectiveInstaPay = canSeeOwnerContact
    ? revealedContact?.instaPayHandle || chalet.owner.instaPayHandle || effectiveOwnerPhone
    : '';

  const whatsappNumber = effectiveOwnerPhone
    ? effectiveOwnerPhone.startsWith('0')
      ? `2${effectiveOwnerPhone}`
      : effectiveOwnerPhone
    : '';

  const whatsappDirectMessage = useMemo(
    () =>
      [
        `مرحباً ${chalet.owner.name}، أرغب في حجز "${chalet.title}" (${chalet.resort}) عبر منصة AgzStay.`,
        `تاريخ الوصول: ${formatArabicDate(checkIn)}`,
        `تاريخ المغادرة: ${formatArabicDate(checkOut)}`,
        `المدة: ${nights.toLocaleString('ar-EG')} ليالٍ • ${guests.toLocaleString('ar-EG')} أفراد`,
        `الإجمالي: ${formatEGP(pricing.subtotal)} • العربون (${pricing.depositLabel}): ${formatEGP(pricing.downPaymentAmount)}`,
      ].join('\n'),
    [
      chalet.owner.name,
      chalet.resort,
      chalet.title,
      checkIn,
      checkOut,
      guests,
      nights,
      pricing.depositLabel,
      pricing.downPaymentAmount,
      pricing.subtotal,
    ]
  );

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onReportListing) return;
    if (!isSupabaseConfigured || !currentUser) {
      setReportError('يرجى تسجيل الدخول أولاً لإرسال البلاغ.');
      return;
    }
    setReportError('');
    const res = await onReportListing({
      chaletId: chalet.id,
      reason: reportReason,
      details: reportDetails.trim(),
    });
    if (res.error) {
      setReportError(res.error);
      return;
    }
    setReportSubmitted(true);
    setReportDetails('');
  };

  return (
    <div
      ref={modalRef}
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
          className="sticky left-4 top-4 z-20 float-left ml-4 mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md transition hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>

        <ChaletGallery
          images={chalet.images}
          title={chalet.title}
          resort={chalet.resort}
          activeImageIndex={activeImageIndex}
          imageError={imageError}
          onImageError={() => setImageError(true)}
          onSelectImage={selectImage}
          onOpenLightbox={() => setIsLightboxOpen(true)}
        />

        <div className="grid grid-cols-1 gap-6 p-5 sm:p-7 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {chalet.isDemo && (
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                    إعلان تجريبي للعرض
                  </span>
                )}
                <span className="rounded-full bg-secondary-500 px-3 py-1 text-xs font-extrabold text-white">
                  للإيجار المباشر
                </span>
                {chalet.hostTier === 'pro' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-slate-900">
                    <Crown className="h-3.5 w-3.5" />
                    مالك موثق / شريك مميز
                  </span>
                )}
                {chalet.verifiedLivePhotos && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    <Camera className="h-3.5 w-3.5 text-emerald-600" />
                    صور حديثة على الطبيعة{chalet.livePhotosVerifiedAt ? ` (${chalet.livePhotosVerifiedAt})` : ''}
                  </span>
                )}
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

                {canSeeOwnerContact && effectiveOwnerPhone ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${effectiveOwnerPhone}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-primary-700 transition hover:bg-primary-50"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      اتصال مباشر
                    </a>
                    <a
                      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                        whatsappDirectMessage
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-success-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-success-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      واتساب
                    </a>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600">
                    {currentUser
                      ? 'تظهر أرقام الهاتف وواتساب المعلن تلقائياً فور موافقة المالك'
                      : 'سجّل الدخول وأرسل طلب حجز لإظهار رقم هاتف المعلن وواتساب'}
                  </div>
                )}
              </div>

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
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-error-600"
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
                          className="min-h-[36px] px-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          إلغاء
                        </button>
                      </div>
                      <select
                        aria-label="سبب البلاغ"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-sand-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
                      {reportError && (
                        <p className="text-[11px] font-bold text-error-600">{reportError}</p>
                      )}
                      <button
                        type="submit"
                        className="min-h-[44px] w-full rounded-lg bg-error-500 py-1.5 text-xs font-bold text-white hover:bg-error-700"
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
              currentUserId={currentUser?.id}
              onSubmitReview={onSubmitReview}
              onDeleteReview={onDeleteReview}
            />
          </div>

          <div className="lg:col-span-5">
            <BookingRequestForm
              currentUser={currentUser}
              chalet={chalet}
              today={today}
              rentalDuration={rentalDuration}
              onDurationChange={handleDurationChange}
              checkIn={checkIn}
              checkOut={checkOut}
              nights={nights}
              onCheckInChange={handleCheckInChange}
              onCheckOutChange={handleCheckOutChange}
              guests={guests}
              onGuestsChange={setGuests}
              occupiedDates={occupiedDates}
              confirmedBookedDates={confirmedBookedDates}
              pricing={pricing}
              badgeVariant={badgeInfo.variant}
              canSeeOwnerContact={canSeeOwnerContact}
              effectiveOwnerPhone={effectiveOwnerPhone}
              effectiveInstaPay={effectiveInstaPay}
              whatsappNumber={whatsappNumber}
              whatsappDirectMessage={whatsappDirectMessage}
              onOpenAuth={onOpenAuth}
              onCloseModal={onClose}
              onSubmitBooking={onSubmitBooking}
            />
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
