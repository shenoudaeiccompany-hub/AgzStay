import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BedDouble, Heart, Home, LocateFixed, MapPin, Users, X } from 'lucide-react';
import { formatEGP, getShortPriceUnitLabel } from '@/data/chalets';
import type { Chalet } from '@/types/chalet';
import { buildResponsiveImageAttributes } from '@/utils/imageOptimization';

interface ChaletsMapViewProps {
  chalets: Chalet[];
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

export function ChaletsMapView({
  chalets,
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
      const priceText = escapeHtml(formatEGP(chalet.pricePerNight));
      const titleText = escapeHtml(chalet.title);
      const locationText = escapeHtml(
        chalet.areaOrVillage || chalet.city || chalet.governorate
      );

      const bgColor = isFocused ? '#C5A880' : '#1E3A5F';
      const textColor = isFocused ? '#1F2937' : '#FFFFFF';

      const icon = L.divIcon({
        className: 'agzstay-price-marker',
        iconSize: [115, 34],
        iconAnchor: [57, 17],
        html: `<div style="display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:9999px;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,0.22);border:2px solid #ffffff;cursor:pointer;background:${bgColor};color:${textColor};transform:${
          isFocused ? 'scale(1.08)' : 'scale(1)'
        };">${priceText}</div>`,
      });

      const marker = L.marker([chalet.coordinates.lat, chalet.coordinates.lng], {
        icon,
        zIndexOffset: isFocused ? 500 : 0,
      });

      marker.bindTooltip(
        `<div dir="rtl" style="font-family:'IBM Plex Sans Arabic',sans-serif;text-align:right;">
          <div style="font-weight:700;font-size:12px;color:#1E3A5F;">${titleText}</div>
          <div style="font-size:11px;color:#475569;">${locationText}</div>
        </div>`,
        { direction: 'top', offset: [0, -14] }
      );

      marker.on('click', () => {
        setFocusedChaletId(chalet.id);
        map.panTo([chalet.coordinates.lat, chalet.coordinates.lng], { animate: true });
      });

      marker.addTo(layerGroup);
    });
  }, [chalets, focusedChaletId]);

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
      <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-xs">
        <div
          ref={mapContainerRef}
          className="h-[500px] w-full sm:h-[560px]"
          aria-label="خريطة الوحدات العقارية في مصر"
        />

        <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-wrap items-center gap-2 sm:right-4 sm:top-4">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-[#1E3A5F] shadow-xs backdrop-blur-sm">
            <MapPin className="h-3.5 w-3.5 text-[#C5A880]" />
            <span>{chalets.length} وحدة على الخريطة</span>
          </span>

          <button
            type="button"
            onClick={handleRecenter}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#1F2937] shadow-xs backdrop-blur-sm transition hover:bg-white"
          >
            <LocateFixed className="h-3.5 w-3.5 text-[#1E3A5F]" />
            <span>عرض كل مصر</span>
          </button>
        </div>

        {focusedChalet && (
          <div className="absolute bottom-3 left-3 right-3 z-[400] sm:bottom-4 sm:left-auto sm:right-4 sm:w-96">
            <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-xl">
              <div className="flex gap-3 p-3">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
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
                    <div className="flex h-full w-full items-center justify-center bg-[#1E3A5F] text-white">
                      <Home className="h-7 w-7 text-[#C5A880]" />
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
                    className="absolute left-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-xs"
                  >
                    <Heart
                      className={`h-4 w-4 ${
                        favorites.includes(focusedChalet.id)
                          ? 'fill-[#C5A880] text-[#C5A880]'
                          : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-[#FAF9F6] px-2 py-0.5 text-[10px] font-bold text-[#1E3A5F]">
                      {focusedChalet.areaOrVillage || focusedChalet.city || focusedChalet.governorate}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFocusedChaletId(null)}
                      aria-label="إغلاق المعاينة"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <h3 className="mt-1 line-clamp-1 text-sm font-bold text-[#1F2937]">
                    {focusedChalet.title}
                  </h3>
                  <p className="line-clamp-1 text-xs text-[#6B7280]">
                    {focusedChalet.governorate} • {focusedChalet.city}
                  </p>

                  <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-[#6B7280]">
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="h-3 w-3 text-[#1E3A5F]" />
                      {focusedChalet.bedrooms} غرف
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3 text-[#1E3A5F]" />
                      حتى {focusedChalet.maxGuests}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-sm font-bold text-[#1E3A5F]">
                      {formatEGP(focusedChalet.pricePerNight)}{' '}
                      <span className="text-[11px] font-normal text-[#6B7280]">
                        {getShortPriceUnitLabel(focusedChalet)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectChalet(focusedChalet)}
                      className="min-h-[38px] rounded-xl bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#172E4D]"
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
    </div>
  );
}
