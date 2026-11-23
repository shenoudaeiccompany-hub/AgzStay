import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BedDouble,
  Heart,
  Home,
  LocateFixed,
  MapPin,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react';
import { formatEGP, getRentalPriceForDuration } from '@/data/chalets';
import type { Chalet, RentalDuration } from '@/types/chalet';
import { buildResponsiveImageAttributes } from '@/utils/imageOptimization';

interface ChaletsMapViewProps {
  chalets: Chalet[];
  rentalDuration?: RentalDuration;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectChalet: (chalet: Chalet) => void;
}

const EGYPT_CENTER: [number, number] = [29.6, 31.1];

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMarkerPriceText(chalet: Chalet, duration: RentalDuration): string {
  const { price } = getRentalPriceForDuration(chalet, duration);
  return formatEGP(price);
}

export function ChaletsMapView({
  chalets,
  rentalDuration = 'daily',
  favorites,
  onToggleFavorite,
  onSelectChalet,
}: ChaletsMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [focusedChaletId, setFocusedChaletId] = useState<string | null>(
    chalets[0]?.id ?? null
  );
  const [imageErrorId, setImageErrorId] = useState<string | null>(null);

  const focusedChalet = useMemo(
    () => chalets.find((c) => c.id === focusedChaletId) ?? null,
    [chalets, focusedChaletId]
  );

  const fitMapToChalets = (map: L.Map, items: Chalet[]) => {
    if (items.length === 0) {
      map.setView(EGYPT_CENTER, 6);
      return;
    }
    if (items.length === 1) {
      const only = items[0];
      map.setView([only.coordinates.lat, only.coordinates.lng], 12, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(
      items.map((c) => [c.coordinates.lat, c.coordinates.lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [52, 52], maxZoom: 12, animate: true });
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: EGYPT_CENTER,
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    markersLayerRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    chalets.forEach((chalet) => {
      const isFocused = chalet.id === focusedChaletId;
      const priceText = escapeHtml(getMarkerPriceText(chalet, rentalDuration));
      const titleText = escapeHtml(chalet.title);
      const resortText = escapeHtml(chalet.resort);

      const bgColor = isFocused ? '#087E8B' : '#0B3954';

      const icon = L.divIcon({
        className: 'agzstay-price-marker',
        iconSize: [115, 34],
        iconAnchor: [57, 17],
        html: `<div style="display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:9999px;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,0.28);border:2px solid #ffffff;cursor:pointer;transition:transform 0.15s ease;background:${bgColor};color:#ffffff;transform:${
          isFocused ? 'scale(1.1)' : 'scale(1)'
        };">${priceText}</div>`,
      });

      const marker = L.marker([chalet.coordinates.lat, chalet.coordinates.lng], {
        icon,
        zIndexOffset: isFocused ? 500 : 0,
      });

      marker.bindTooltip(
        `<div dir="rtl" style="font-family:Cairo,sans-serif;text-align:right;">
          <div style="font-weight:700;font-size:12px;color:#0B3954;">${titleText}</div>
          <div style="font-size:11px;color:#475569;">${resortText}</div>
        </div>`,
        { direction: 'top', offset: [0, -14] }
      );

      marker.on('click', () => {
        setFocusedChaletId(chalet.id);
        map.panTo([chalet.coordinates.lat, chalet.coordinates.lng], { animate: true });
      });

      marker.addTo(layerGroup);
    });
  }, [chalets, focusedChaletId, rentalDuration]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    fitMapToChalets(map, chalets);

    if (chalets.length > 0 && !chalets.some((c) => c.id === focusedChaletId)) {
      setFocusedChaletId(chalets[0].id);
    }
  }, [chalets, focusedChaletId]);

  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    fitMapToChalets(map, chalets);
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
        <div
          ref={mapContainerRef}
          className="h-[520px] w-full sm:h-[580px]"
          aria-label="خريطة الوحدات العقارية في مصر"
        />

        <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-wrap items-center gap-2 sm:right-4 sm:top-4">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-primary-700 shadow-md backdrop-blur-sm">
            <MapPin className="h-3.5 w-3.5 text-secondary-500" />
            <span>{chalets.length} وحدة على الخريطة</span>
          </span>

          <button
            type="button"
            onClick={handleRecenter}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-md backdrop-blur-sm transition hover:bg-white"
          >
            <LocateFixed className="h-3.5 w-3.5 text-primary-600" />
            <span>عرض كل مصر</span>
          </button>
        </div>

        {focusedChalet && (
          <div className="absolute bottom-3 left-3 right-3 z-[400] sm:bottom-4 sm:left-auto sm:right-4 sm:w-96">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex gap-3 p-3">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-primary-100">
                  {imageErrorId !== focusedChalet.id && focusedChalet.images[0] ? (
                    <img
                      {...buildResponsiveImageAttributes(focusedChalet.images[0], '96px')}
                      alt={focusedChalet.title}
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                      onError={() => setImageErrorId(focusedChalet.id)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-600 to-secondary-500 text-white">
                      <Home className="h-7 w-7 text-sand-100" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(focusedChalet.id)}
                    aria-label={
                      favorites.includes(focusedChalet.id)
                        ? 'إزالة من المفضلة'
                        : 'إضافة إلى المفضلة'
                    }
                    className="absolute left-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
                  >
                    <Heart
                      className={`h-4 w-4 ${
                        favorites.includes(focusedChalet.id)
                          ? 'fill-accent-500 text-accent-500'
                          : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                        {focusedChalet.area || focusedChalet.destinationLabel}
                      </span>
                      {focusedChalet.owner.verified && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success-700">
                          <ShieldCheck className="h-3 w-3 text-success-500" />
                          موثق
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setFocusedChaletId(null)}
                      aria-label="إغلاق المعاينة"
                      className="flex h-11 w-11 -m-2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <h3 className="mt-1 line-clamp-1 text-sm font-bold text-slate-900">
                    {focusedChalet.title}
                  </h3>
                  <p className="line-clamp-1 text-xs text-slate-500">{focusedChalet.resort}</p>

                  <div className="mt-1.5 flex items-center gap-3 text-[11px] font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-warning-500 text-warning-500" />
                      {focusedChalet.reviewsCount > 0
                        ? focusedChalet.rating.toFixed(1)
                        : 'جديد'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="h-3 w-3 text-primary-500" />
                      {focusedChalet.bedrooms} غرف
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3 text-primary-500" />
                      حتى {focusedChalet.maxGuests}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-sm font-bold text-primary-700">
                      {getMarkerPriceText(focusedChalet, rentalDuration)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectChalet(focusedChalet)}
                      className="min-h-[44px] rounded-xl bg-secondary-500 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-secondary-600"
                    >
                      التفاصيل
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {chalets.length > 0 && (
        <div className="no-scrollbar flex items-center gap-2.5 overflow-x-auto pb-1">
          {chalets.map((chalet) => {
            const active = chalet.id === focusedChaletId;
            return (
              <button
                key={chalet.id}
                type="button"
                onClick={() => {
                  setFocusedChaletId(chalet.id);
                  mapInstanceRef.current?.setView(
                    [chalet.coordinates.lat, chalet.coordinates.lng],
                    12,
                    { animate: true }
                  );
                }}
                className={`shrink-0 rounded-2xl border px-3.5 py-2 text-right transition ${
                  active
                    ? 'border-secondary-500 bg-secondary-50 text-secondary-900 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold">{chalet.resort}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-primary-700">
                  {getMarkerPriceText(chalet, rentalDuration)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
