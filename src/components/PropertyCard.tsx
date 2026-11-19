import { useState } from 'react';
import {
  Award,
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  Camera,
  CheckCircle2,
  Crown,
  Heart,
  Home,
  MapPin,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  compareToMarketBenchmark,
  formatEGP,
  getAdvertiserBadgeInfo,
  getAmenityLabel,
  getRentalPriceForDuration,
  getUnitTypeLabel,
} from '@/data/chalets';
import type { Chalet, RentalDuration } from '@/types/chalet';
import {
  calculateNightsBetween,
  calculateStayPricing,
} from '@/utils/bookingPricing';

interface PropertyCardProps {
  property: Chalet;
  rentalDuration: RentalDuration;
  checkInDate?: string;
  checkOutDate?: string;
  isFavorite: boolean;
  isCompared: boolean;
  onToggleFavorite: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSelect: (property: Chalet) => void;
}

export function PropertyCard({
  property,
  rentalDuration,
  checkInDate = '',
  checkOutDate = '',
  isFavorite,
  isCompared,
  onToggleFavorite,
  onToggleCompare,
  onSelect,
}: PropertyCardProps) {
  const [imageError, setImageError] = useState(false);
  const badgeInfo = getAdvertiserBadgeInfo(property.owner.roleType, property.owner.brokerAgency);
  const rentalDisplay = getRentalPriceForDuration(property, rentalDuration);
  const marketComparison = compareToMarketBenchmark(property, rentalDuration);

  const selectedNights = calculateNightsBetween(checkInDate, checkOutDate);
  const stayQuote =
    selectedNights > 0
      ? calculateStayPricing(property, checkInDate, selectedNights, rentalDuration)
      : null;

  const durationBadgeLabel =
    rentalDuration === 'monthly'
      ? 'إيجار شهري'
      : rentalDuration === 'weekly'
      ? 'إيجار أسبوعي'
      : 'إيجار يومي';

  const isProPartner = property.hostTier === 'pro';

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
        isProPartner ? 'border-amber-300 ring-1 ring-amber-300/60' : 'border-slate-200/90'
      }`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary-100">
        {!imageError && property.images[0] ? (
          <img
            src={property.images[0]}
            alt={property.title}
            loading="lazy"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-primary-600 to-secondary-500 p-4 text-white">
            <Home className="h-10 w-10 text-sand-100" />
            <span className="mt-2 text-xs font-semibold">{property.resort}</span>
          </div>
        )}

        <div className="absolute right-3 top-3 flex flex-wrap items-center gap-1.5">
          {property.isDemo && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100/95 px-2.5 py-1 text-[11px] font-extrabold text-amber-900 shadow-sm">
              إعلان تجريبي
            </span>
          )}
          {isProPartner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-slate-900 shadow-sm">
              <Crown className="h-3 w-3" />
              مالك موثق / شريك مميز
            </span>
          )}
          <span className="rounded-full bg-secondary-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm">
            {stayQuote
              ? `متاح (${selectedNights.toLocaleString('ar-EG')} ليالٍ)`
              : durationBadgeLabel}
          </span>
          <span className="rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            {property.area || property.destinationLabel}
          </span>
        </div>

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompare(property.id);
            }}
            aria-label={isCompared ? 'إزالة من المقارنة' : 'إضافة للمقارنة'}
            className={`inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold shadow-sm backdrop-blur-sm transition ${
              isCompared
                ? 'bg-primary-600 text-white'
                : 'bg-white/95 text-slate-700 hover:bg-white'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            <span>{isCompared ? 'بالمقارنة' : 'قارن'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(property.id);
            }}
            aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm backdrop-blur-sm transition hover:scale-105 hover:bg-white"
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-accent-500 text-accent-500' : ''}`} />
          </button>
        </div>

        <div className="absolute bottom-3 right-3 flex flex-wrap items-center gap-1.5">
          {badgeInfo.variant === 'founding' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-slate-900 shadow-sm">
              <Award className="h-3.5 w-3.5" />
              {badgeInfo.label}
            </span>
          )}
          {badgeInfo.variant === 'owner' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              {badgeInfo.label}
            </span>
          )}
          {badgeInfo.variant === 'broker' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              <Briefcase className="h-3.5 w-3.5" />
              {badgeInfo.label}
            </span>
          )}

          {property.verifiedLivePhotos && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm">
              <Camera className="h-3 w-3" />
              صور حديثة على الطبيعة
            </span>
          )}

          {property.beachDistanceMeters > 0 && property.beachDistanceMeters <= 500 && (
            <span className="rounded-lg bg-slate-900/75 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              {property.beachDistanceMeters}م للبحر
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(property)}
            className="text-right focus:outline-none"
          >
            <h3 className="line-clamp-1 text-base font-bold text-slate-900 transition group-hover:text-primary-600">
              {property.title}
            </h3>
          </button>
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-warning-50 px-2 py-0.5 text-xs font-bold text-warning-700">
            <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
            <span>{property.reviewsCount > 0 ? property.rating.toFixed(1) : 'جديد'}</span>
            {property.reviewsCount > 0 && (
              <span className="font-medium text-warning-700/80">({property.reviewsCount})</span>
            )}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
            <MapPin className="h-3.5 w-3.5 text-secondary-500" />
            {property.resort}
          </span>
          <span>•</span>
          <span className="font-semibold text-primary-600">
            {getUnitTypeLabel(property.unitType)}
          </span>
          {property.areaSqm && (
            <>
              <span>•</span>
              <span>{property.areaSqm} م²</span>
            </>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {badgeInfo.variant === 'broker' ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800">
              <BadgeCheck className="h-3.5 w-3.5 text-sky-600" />
              <span>الجهة: {badgeInfo.sublabel}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700">
              <ShieldCheck className="h-3.5 w-3.5 text-success-500" />
              <span>مباشرة من المالك — عمولة ٠ ج.م</span>
            </div>
          )}

          {marketComparison && (
            <div
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${
                marketComparison.status === 'below'
                  ? 'bg-emerald-50 text-emerald-700'
                  : marketComparison.status === 'above'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-secondary-50 text-secondary-700'
              }`}
            >
              {marketComparison.status === 'below' ? (
                <TrendingDown className="h-3.5 w-3.5" />
              ) : marketComparison.status === 'above' ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>{marketComparison.label}</span>
            </div>
          )}
        </div>

        {stayQuote && stayQuote.periodNotes.length > 0 && (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] font-bold text-amber-900">
            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="line-clamp-2">{stayQuote.periodNotes.join(' • ')}</span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-sand-50 p-2.5 text-xs font-semibold text-slate-700">
          <div className="flex items-center justify-center gap-1">
            <BedDouble className="h-3.5 w-3.5 text-primary-600" />
            <span>{property.bedrooms} غرف</span>
          </div>
          <div className="flex items-center justify-center gap-1 border-x border-sand-200">
            <Bath className="h-3.5 w-3.5 text-primary-600" />
            <span>{property.bathrooms} حمام</span>
          </div>
          <div className="flex items-center justify-center gap-1">
            <Users className="h-3.5 w-3.5 text-primary-600" />
            <span>حتى {property.maxGuests}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {property.amenities.slice(0, 3).map((amenity) => (
            <span
              key={amenity}
              className="rounded-md bg-secondary-50 px-2 py-0.5 text-[11px] font-semibold text-secondary-700"
            >
              {getAmenityLabel(amenity)}
            </span>
          ))}
        </div>

        {stayQuote ? (
          <div className="mt-auto pt-3.5">
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-slate-700">
                  التكلفة الإجمالية ({selectedNights.toLocaleString('ar-EG')} ليالٍ)
                </span>
                <span className="text-base font-extrabold text-primary-700">
                  {formatEGP(stayQuote.subtotal)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600">
                <span>جدية الحجز ({stayQuote.depositLabel}):</span>
                <strong className="text-secondary-700">
                  {formatEGP(stayQuote.downPaymentAmount)}
                </strong>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-600">
                <span>المتبقي عند الاستلام:</span>
                <strong className="text-slate-900">
                  {formatEGP(stayQuote.remainingBalance)}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(property)}
              className="mt-2.5 min-h-[40px] w-full rounded-xl bg-secondary-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-secondary-600 sm:text-sm"
            >
              احجز الآن وراجع تفاصيل الليالي
            </button>
          </div>
        ) : (
          <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3.5">
            <div>
              <div className="text-lg font-extrabold text-primary-600">
                {formatEGP(rentalDisplay.price)}
              </div>
              <div className="text-[11px] text-slate-500">
                {rentalDisplay.unitLabel} •{' '}
                {badgeInfo.variant === 'broker' ? 'وسيط معتمد' : 'بدون عمولة'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(property)}
              className="min-h-[40px] rounded-xl bg-secondary-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-secondary-600 sm:text-sm"
            >
              التفاصيل والحجز
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
