import { useState } from 'react';
import {
  ArrowUpDown,
  BadgeCheck,
  ChevronDown,
  LayoutGrid,
  Map as MapIcon,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AMENITIES,
  UNIT_TYPES,
  VIEW_TYPES,
  formatEGP,
} from '@/data/chalets';
import type {
  AmenityId,
  FilterState,
  SortOption,
  UnitType,
  ViewMode,
  ViewType,
} from '@/types/chalet';

interface FilterBarProps {
  filters: FilterState;
  viewMode: ViewMode;
  totalResults: number;
  onToggleDirectOwnersOnly: () => void;
  onToggleAmenity: (amenity: AmenityId) => void;
  onUnitTypeChange: (unitType: UnitType | 'all') => void;
  onViewTypeChange: (viewType: ViewType | 'all') => void;
  onMinBedroomsChange: (bedrooms: number) => void;
  onTogglePassesOnly: () => void;
  onMaxPriceChange: (maxPrice: number | null) => void;
  onSortChange: (sort: SortOption) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onReset: () => void;
}

export function FilterBar({
  filters,
  viewMode,
  totalResults,
  onToggleDirectOwnersOnly,
  onToggleAmenity,
  onUnitTypeChange,
  onViewTypeChange,
  onMinBedroomsChange,
  onTogglePassesOnly,
  onMaxPriceChange,
  onSortChange,
  onViewModeChange,
  onReset,
}: FilterBarProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const rangeConfig =
    filters.rentalDuration === 'monthly'
      ? { min: 15000, max: 100000, step: 5000, label: 'الحد الأقصى/شهر:' }
      : filters.rentalDuration === 'weekly'
      ? { min: 6000, max: 50000, step: 2000, label: 'الحد الأقصى/أسبوع:' }
      : { min: 1500, max: 10000, step: 500, label: 'الحد الأقصى/يوم:' };

  const currentBudgetValue =
    filters.maxPrice !== null
      ? Math.min(rangeConfig.max, Math.max(rangeConfig.min, filters.maxPrice))
      : rangeConfig.max;

  const advancedCount =
    (filters.unitType !== 'all' ? 1 : 0) +
    (filters.viewType !== 'all' ? 1 : 0) +
    (filters.minBedrooms > 0 ? 1 : 0) +
    (filters.passesOnly ? 1 : 0) +
    filters.amenities.length;

  const hasActiveFilters =
    filters.governorate !== 'all' ||
    filters.area !== 'all' ||
    filters.checkInDate !== '' ||
    filters.checkOutDate !== '' ||
    filters.directOwnersOnly ||
    advancedCount > 0 ||
    filters.maxPrice !== null ||
    filters.minGuests > 1 ||
    filters.searchQuery.trim() !== '' ||
    filters.favoritesOnly;

  return (
    <section className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6">
        {/* Top Row: Quick Trust Switch, Budget Slider, Sort & Grid/Map View */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={filters.directOwnersOnly}
              onClick={onToggleDirectOwnersOnly}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                filters.directOwnersOnly
                  ? 'border-success-500 bg-success-50 text-success-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <ShieldCheck
                className={`h-4 w-4 ${
                  filters.directOwnersOnly ? 'text-success-500' : 'text-slate-400'
                }`}
              />
              <span>من المالك مباشرة فقط</span>
              <span
                className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition ${
                  filters.directOwnersOnly ? 'justify-start bg-success-500' : 'justify-end bg-slate-300'
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-white shadow-sm" />
              </span>
            </button>

            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-sand-50 px-3">
              <label htmlFor="max-price" className="text-xs font-bold text-slate-600">
                {rangeConfig.label}
              </label>
              <input
                id="max-price"
                type="range"
                min={rangeConfig.min}
                max={rangeConfig.max}
                step={rangeConfig.step}
                value={currentBudgetValue}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onMaxPriceChange(val >= rangeConfig.max ? null : val);
                }}
                className="w-24 accent-secondary-500 sm:w-28"
              />
              <span className="min-w-[74px] text-xs font-extrabold text-primary-700">
                {filters.maxPrice === null ? 'الكل' : formatEGP(currentBudgetValue)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setMobileExpanded((prev) => !prev)}
              aria-expanded={mobileExpanded}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition md:hidden ${
                mobileExpanded || advancedCount > 0
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>فلاتر متقدمة</span>
              {advancedCount > 0 && (
                <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {advancedCount}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${mobileExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 lg:justify-end">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-accent-200 bg-accent-50 px-3 text-xs font-bold text-accent-700 transition hover:bg-accent-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>إعادة ضبط ({totalResults})</span>
              </button>
            )}

            <div className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <select
                aria-label="ترتيب النتائج"
                value={filters.sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="featured">الأكثر تميزاً</option>
                <option value="price-asc">الأقل سعراً</option>
                <option value="price-desc">الأعلى سعراً</option>
                <option value="rating">الأعلى تقييماً</option>
              </select>
            </div>

            <div
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-sand-100 p-1"
              role="group"
              aria-label="طريقة العرض"
            >
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                aria-pressed={viewMode === 'grid'}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>الشبكة</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('map')}
                aria-pressed={viewMode === 'map'}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                  viewMode === 'map'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                <span>الخريطة</span>
              </button>
            </div>
          </div>
        </div>

        {/* Organized Detailed Filters Grid + Amenities */}
        <div
          className={`${
            mobileExpanded ? 'block' : 'hidden'
          } mt-3 space-y-3 border-t border-slate-100 pt-3 md:block`}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
            <select
              aria-label="نوع الوحدة"
              value={filters.unitType}
              onChange={(e) => onUnitTypeChange(e.target.value as UnitType | 'all')}
              className="h-9 rounded-xl border border-slate-200 bg-sand-50 px-3 text-xs font-bold text-slate-700 focus:border-secondary-500 focus:bg-white focus:outline-none"
            >
              {UNIT_TYPES.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>

            <select
              aria-label="الإطلالة"
              value={filters.viewType}
              onChange={(e) => onViewTypeChange(e.target.value as ViewType | 'all')}
              className="h-9 rounded-xl border border-slate-200 bg-sand-50 px-3 text-xs font-bold text-slate-700 focus:border-secondary-500 focus:bg-white focus:outline-none"
            >
              {VIEW_TYPES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>

            <select
              aria-label="عدد غرف النوم"
              value={filters.minBedrooms}
              onChange={(e) => onMinBedroomsChange(Number(e.target.value))}
              className="h-9 rounded-xl border border-slate-200 bg-sand-50 px-3 text-xs font-bold text-slate-700 focus:border-secondary-500 focus:bg-white focus:outline-none"
            >
              <option value={0}>كل الغرف</option>
              <option value={1}>غرفة واحدة+</option>
              <option value={2}>٢ غرفة+</option>
              <option value={3}>٣ غرف+</option>
              <option value={4}>٤ غرف+</option>
            </select>

            <button
              type="button"
              onClick={onTogglePassesOnly}
              aria-pressed={filters.passesOnly}
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                filters.passesOnly
                  ? 'border-success-500 bg-success-50 text-success-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              <span>شامل التصاريح / الخدمات</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 pl-1 text-xs font-bold text-slate-500">
              <SlidersHorizontal className="h-3.5 w-3.5 text-secondary-500" />
              <span>المميزات:</span>
            </span>
            {AMENITIES.map((amenity) => {
              const selected = filters.amenities.includes(amenity.id);
              return (
                <button
                  key={amenity.id}
                  type="button"
                  onClick={() => onToggleAmenity(amenity.id)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                    selected
                      ? 'border-secondary-500 bg-secondary-50 text-secondary-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-sand-50'
                  }`}
                >
                  {amenity.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
