import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import type { Coordinates } from '@/types/chalet';

interface MapPinPickerProps {
  coordinates: Coordinates;
  onChange: (coords: Coordinates) => void;
}

export function MapPinPicker({ coordinates, onChange }: MapPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [coordinates.lat, coordinates.lng],
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'masayef-price-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#FF7A00;color:#fff;border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,0.35);font-weight:bold;">📍</div>`,
    });

    const marker = L.marker([coordinates.lat, coordinates.lng], {
      icon: pinIcon,
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChangeRef.current({
        lat: Number(pos.lat.toFixed(5)),
        lng: Number(pos.lng.toFixed(5)),
      });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current({
        lat: Number(e.latlng.lat.toFixed(5)),
        lng: Number(e.latlng.lng.toFixed(5)),
      });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLatLng([coordinates.lat, coordinates.lng]);
    map.panTo([coordinates.lat, coordinates.lng], { animate: true });
  }, [coordinates.lat, coordinates.lng]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-bold text-slate-700">
          <MapPin className="h-3.5 w-3.5 text-accent-500" />
          اضغط على الخريطة أو اسحب الدبوس لتحديد موقع الشاليه بدقة
        </span>
        <span dir="ltr" className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
          {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
        </span>
      </div>

      <div
        ref={containerRef}
        className="h-48 w-full overflow-hidden rounded-2xl border border-slate-200"
        aria-label="تحديد موقع الشاليه على الخريطة"
      />
    </div>
  );
}
