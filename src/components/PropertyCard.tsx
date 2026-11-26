import { useState } from 'react';
import {
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  Heart,
  Home,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import { formatEGP, getShortPriceUnitLabel, isMonthlyOnlyProperty } from '@/data/chalets';
import { ShareChaletButton } from '@/components/ShareChaletButton';
import type { Chalet } from '@/types/chalet';
import { buildResponsiveImageAttributes } from '@/utils/imageOptimization';

interface PropertyCardProps {
  property: Chalet;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (property: Chalet) => void;
}

export function PropertyCard({
  property,
  isFavorite,
  onToggleFavorite,
  onSelect,
}: PropertyCardProps) {
  const [imageError, setImageError] = useState(false);

  const responsiveImage = buildResponsiveImageAttributes(
    property.images[0] ?? '',
    '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px'
  );

  const locationDisplay = [property.governorate, property.city, property.areaOrVillage]
    .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
    .join(' • ');

  const isDirectOwner = property.advertiserRole === 'مالك مباشر';
  const periodWord = getShortPriceUnitLabel(property);

  return (
    <article
      onClick={() => onSelect(property)}
      className={`group flex cursor-pointer flex-col rounded-2xl border bg-white shadow-xs transition duration-300 hover:-translate-y-0.5 hover:shadow-md ${
        property.isFeatured ? 'border-[#C5A880]/80' : 'border-stone-200/70'
      }`}
    >
      {/* Uniform aspect-[4/3] Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-2xl bg-stone-100">
        {!imageError && responsiveImage.src ? (
          <img
            src={responsiveImage.src}
            srcSet={responsiveImage.srcSet}
            sizes={responsiveImage.sizes}
            alt={property.title}
            width={640}
            height={480}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#1E3A5F] p-4 text-white">
            <Home className="h-10 w-10 text-[#C5A880]" />
            <span className="mt-2 text-xs font-semibold">
              {property.areaOrVillage || property.governorate}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute right-3 top-3 flex flex-wrap items-center gap-1.5">
          {property.isFeatured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#C5A880] px-2.5 py-1 text-[11px] font-bold text-[#1F2937] shadow-xs">
              <Sparkles className="h-3 w-3" />
              إعلان مميز
            </span>
          )}
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#1E3A5F] shadow-xs backdrop-blur-sm">
            {property.propertyType}
          </span>
        </div>

        {/* Favorite Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(property.id);
          }}
          aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#1F2937] shadow-xs backdrop-blur-sm transition hover:scale-105"
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? 'fill-[#C5A880] text-[#C5A880]' : 'text-[#6B7280]'}`}
          />
        </button>

        {/* Bottom Advertiser Role & Verified Badges */}
        <div className="absolute bottom-3 right-3 flex flex-wrap items-center gap-1.5">
          {isDirectOwner ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              مالك مباشر
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1E3A5F]/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs backdrop-blur-sm">
              <Briefcase className="h-3.5 w-3.5 text-[#C5A880]" />
              مكتب / وسيط
            </span>
          )}
          {property.ownerVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-emerald-700 shadow-xs backdrop-blur-sm">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
              معلن موثق
            </span>
          )}
        </div>
      </div>

      {/* Balanced Whitespace Card Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-[#1F2937] transition group-hover:text-[#1E3A5F]">
            {property.title}
          </h3>
          {(property.ratingCount ?? 0) > 0 && property.ratingAvg && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#FAF6F0] px-2 py-0.5 text-[11px] font-bold text-[#1E3A5F]">
              <Star className="h-3 w-3 fill-[#C5A880] text-[#C5A880]" />
              <span>{property.ratingAvg.toFixed(1)}</span>
              <span className="font-normal text-[#6B7280]">({property.ratingCount})</span>
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#6B7280]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#C5A880]" />
          <span className="line-clamp-1 font-medium">{locationDisplay}</span>
        </div>

        {/* Minimal Specs Row */}
        <div className="mt-4 flex items-center gap-4 border-y border-stone-200/70 py-2.5 text-xs font-medium text-[#6B7280]">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5 text-[#1E3A5F]" />
            {property.bedrooms} غرف
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-3.5 w-3.5 text-[#1E3A5F]" />
            {property.bathrooms} حمام
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-[#1E3A5F]" />
            {property.maxGuests} أفراد
          </span>
        </div>

        {/* Clear Price + Action */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-[#1E3A5F]">
                {formatEGP(property.pricePerNight)}
              </span>
              <span className="text-xs font-semibold text-[#6B7280]">/ {periodWord}</span>
            </div>
            {!isMonthlyOnlyProperty(property) && (property.weekendPrice ?? 0) > 0 && (
              <span className="mt-0.5 block text-[11px] font-semibold text-[#9A7B4F]">
                الويك إند: {formatEGP(property.weekendPrice!)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ShareChaletButton chalet={property} variant="card" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(property);
              }}
              className="min-h-[40px] rounded-xl bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#172E4D]"
            >
              عرض التفاصيل
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
