import {
  BarChart3,
  Calendar,
  CalendarClock,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { GOVERNORATES, RENTAL_DURATIONS } from '@/data/chalets';
import type { GovernorateId, RentalDuration } from '@/types/chalet';
import {
  addDaysIso,
  calculateNightsBetween,
  formatArabicDate,
  formatIsoDate,
} from '@/utils/bookingPricing';

interface HeroSearchProps {
  searchQuery: string;
  rentalDuration: RentalDuration;
  checkInDate: string;
  checkOutDate: string;
  governorate: GovernorateId;
  area: string;
  minGuests: number;
  onSearchChange: (value: string) => void;
  onRentalDurationChange: (duration: RentalDuration) => void;
  onDateRangeChange: (checkIn: string, checkOut: string) => void;
  onGovernorateChange: (gov: GovernorateId) => void;
  onAreaChange: (area: string) => void;
  onMinGuestsChange: (guests: number) => void;
  onOpenPriceGuide: () => void;
}

export function HeroSearch({
  searchQuery,
  rentalDuration,
  checkInDate,
  checkOutDate,
  governorate,
  area,
  minGuests,
  onSearchChange,
  onRentalDurationChange,
  onDateRangeChange,
  onGovernorateChange,
  onAreaChange,
  onMinGuestsChange,
  onOpenPriceGuide,
}: HeroSearchProps) {
  const activeGovernorate = GOVERNORATES.find((g) => g.id === governorate);
  const availableAreas = activeGovernorate?.areas ?? [];
  const todayIso = formatIsoDate(new Date());
  const stayNights = calculateNightsBetween(checkInDate, checkOutDate);

  const handleCheckInChange = (nextCheckIn: string) => {
    if (!nextCheckIn) {
      onDateRangeChange('', '');
      return;
    }
    const minOut = addDaysIso(nextCheckIn, 1);
    const nextCheckOut =
      checkOutDate && checkOutDate > nextCheckIn ? checkOutDate : addDaysIso(nextCheckIn, 4);
    onDateRangeChange(nextCheckIn, nextCheckOut >= minOut ? nextCheckOut : minOut);
  };

  const handleCheckOutChange = (nextCheckOut: string) => {
    if (!nextCheckOut) {
      onDateRangeChange(checkInDate, '');
      return;
    }
    const baseIn = checkInDate || todayIso;
    if (nextCheckOut <= baseIn) {
      onDateRangeChange(baseIn, addDaysIso(baseIn, 1));
    } else {
      onDateRangeChange(baseIn, nextCheckOut);
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-bl from-primary-600 via-primary-700 to-primary-900 text-white">
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-secondary-500/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-sand-100/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-semibold text-sand-100 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent-300" />
              <span>منصة مصر الشاملة للإيجار المفروش والشاليهات بتسعير ديناميكي شفاف</span>
            </div>
            <h1 className="text-2xl font-extrabold leading-snug sm:text-4xl">
              احجز شقتك المفروشة أو شاليهك بتواريخ مؤكدة وسعر شامل لكل ليلة
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-primary-100 sm:text-base">
              اختر تواريخ الوصول والمغادرة لإخفاء الوحدات المحجوزة تلقائياً وحساب التكلفة الإجمالية، جدية الحجز، والمتبقي عند الاستلام بشفافية كاملة.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenPriceGuide}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 self-start rounded-2xl border border-sand-200/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-sand-100 backdrop-blur-sm transition hover:bg-white/20"
          >
            <BarChart3 className="h-4 w-4 text-secondary-200" />
            <span>مؤشر أسعار السوق الاسترشادي</span>
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-white/15 bg-white p-4 text-slate-900 shadow-2xl sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary-700">
                <CalendarClock className="h-4 w-4 text-secondary-500" />
                اختر نظام الإيجار:
              </span>
              <div
                className="inline-flex rounded-xl border border-slate-200 bg-sand-100 p-1"
                role="tablist"
                aria-label="مدة الإيجار"
              >
                {RENTAL_DURATIONS.map((dur) => {
                  const active = rentalDuration === dur.id;
                  return (
                    <button
                      key={dur.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onRentalDurationChange(dur.id)}
                      className={`min-h-[36px] rounded-lg px-4 py-1.5 text-xs font-bold transition sm:text-sm ${
                        active
                          ? 'bg-secondary-500 text-white shadow-sm'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {dur.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {stayNights > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                  <Calendar className="h-3.5 w-3.5 text-secondary-500" />
                  <span>
                    {formatArabicDate(checkInDate)} ← {formatArabicDate(checkOutDate)} (
                    {stayNights.toLocaleString('ar-EG')} ليالٍ)
                  </span>
                  <button
                    type="button"
                    onClick={() => onDateRangeChange('', '')}
                    aria-label="مسح التواريخ"
                    className="rounded-full p-0.5 text-primary-600 hover:bg-primary-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onDateRangeChange(addDaysIso(todayIso, 3), addDaysIso(todayIso, 7))
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-secondary-200 bg-secondary-50 px-3 py-1 text-xs font-bold text-secondary-700 transition hover:bg-secondary-100"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>جرب البحث لفترة ٤ ليالٍ ({formatArabicDate(addDaysIso(todayIso, 3))})</span>
                </button>
              )}

              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-xs font-bold text-success-700">
                <ShieldCheck className="h-3.5 w-3.5 text-success-500" />
                <span>تواصل مباشر بدون عمولات خفية</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-2">
              <label htmlFor="gov-select" className="mb-1.5 block text-xs font-bold text-slate-600">
                المحافظة / النطاق
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-500" />
                <select
                  id="gov-select"
                  value={governorate}
                  onChange={(e) => onGovernorateChange(e.target.value as GovernorateId)}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-sand-50 pl-2 pr-8 text-xs font-semibold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none sm:text-sm"
                >
                  {GOVERNORATES.map((gov) => (
                    <option key={gov.id} value={gov.id}>
                      {gov.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="area-select" className="mb-1.5 block text-xs font-bold text-slate-600">
                المنطقة / القرية
              </label>
              <div className="relative">
                <Navigation className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-500" />
                <select
                  id="area-select"
                  value={area}
                  disabled={availableAreas.length === 0}
                  onChange={(e) => onAreaChange(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-sand-50 pl-2 pr-8 text-xs font-semibold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  <option value="all">
                    {availableAreas.length === 0 ? 'كل المناطق' : 'كل المناطق والقرى'}
                  </option>
                  {availableAreas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="hero-checkin"
                className="mb-1.5 block text-xs font-bold text-slate-600"
              >
                تاريخ الوصول
              </label>
              <input
                id="hero-checkin"
                type="date"
                min={todayIso}
                value={checkInDate}
                onChange={(e) => handleCheckInChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 text-xs font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="hero-checkout"
                className="mb-1.5 block text-xs font-bold text-slate-600"
              >
                تاريخ المغادرة
              </label>
              <input
                id="hero-checkout"
                type="date"
                min={checkInDate ? addDaysIso(checkInDate, 1) : addDaysIso(todayIso, 1)}
                value={checkOutDate}
                onChange={(e) => handleCheckOutChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 text-xs font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="search-chalets" className="mb-1.5 block text-xs font-bold text-slate-600">
                ابحث بالمنطقة أو الكمبوند
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="search-chalets"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="مثال: مراسي، الجونة..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-sand-50 pl-2 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-secondary-500 focus:bg-white focus:outline-none sm:text-sm"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="guests-select" className="mb-1.5 block text-xs font-bold text-slate-600">
                عدد الأفراد
              </label>
              <div className="relative">
                <Users className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  id="guests-select"
                  value={minGuests}
                  onChange={(e) => onMinGuestsChange(Number(e.target.value))}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-sand-50 pl-2 pr-8 text-xs font-semibold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none sm:text-sm"
                >
                  <option value={1}>أي عدد</option>
                  <option value={2}>٢ أفراد+</option>
                  <option value={4}>٤ أفراد+</option>
                  <option value={6}>٦ أفراد+</option>
                  <option value={8}>٨ أفراد+</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {GOVERNORATES.map((gov) => {
                const active = governorate === gov.id;
                return (
                  <button
                    key={gov.id}
                    type="button"
                    onClick={() => onGovernorateChange(gov.id)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-sand-100 text-slate-700 hover:bg-sand-200'
                    }`}
                  >
                    {gov.label}
                  </button>
                );
              })}
            </div>
            <span className="hidden text-[11px] font-bold text-primary-600 xl:inline">
              تصفية صارمة للتوافر حسب التواريخ • أسعار بالجنيه المصري
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
