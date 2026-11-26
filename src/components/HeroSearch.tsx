import {
  ArrowUpDown,
  Briefcase,
  Building2,
  LayoutGrid,
  Map as MapIcon,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  Umbrella,
} from 'lucide-react';
import { ArabicDateRangeField } from '@/components/ArabicCalendarPicker';
import { ADVERTISER_ROLES, PROPERTY_TYPES, formatEGP } from '@/data/chalets';
import {
  ALL_GOVERNORATE_NAMES,
  getAreasForCity,
  getCitiesForGovernorate,
} from '@/data/egyptLocations';
import type {
  AdvertiserRoleLabel,
  FilterState,
  PropertyType,
  RentalSegment,
  SortOption,
  ViewMode,
} from '@/types/chalet';

interface HeroSearchProps {
  filters: FilterState;
  viewMode: ViewMode;
  totalResults: number;
  totalAvailable: number;
  onSearchChange: (val: string) => void;
  onRentalSegmentChange: (segment: RentalSegment) => void;
  onGovernorateChange: (gov: string) => void;
  onCityChange: (city: string) => void;
  onAreaChange: (area: string) => void;
  onPropertyTypeChange: (type: PropertyType | 'الكل') => void;
  onAdvertiserRoleChange: (role: AdvertiserRoleLabel | 'الكل') => void;
  onMaxPriceChange: (maxPrice: number | null) => void;
  onDateRangeChange: (checkIn: string, checkOut: string) => void;
  onSortChange: (sort: SortOption) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onReset: () => void;
}

const MAX_BUDGET_SLIDER = 30000;

export function HeroSearch({
  filters,
  viewMode,
  totalResults,
  totalAvailable,
  onSearchChange,
  onRentalSegmentChange,
  onGovernorateChange,
  onCityChange,
  onAreaChange,
  onPropertyTypeChange,
  onAdvertiserRoleChange,
  onMaxPriceChange,
  onDateRangeChange,
  onSortChange,
  onViewModeChange,
  onReset,
}: HeroSearchProps) {
  const cities = getCitiesForGovernorate(filters.governorate);
  const areas = getAreasForCity(filters.governorate, filters.city);

  const segmentPropertyTypes =
    filters.rentalSegment === 'vacation'
      ? PROPERTY_TYPES.filter((t) => t !== 'شقة فاضية')
      : filters.rentalSegment === 'monthly'
      ? (['الكل', 'شقة فاضية'] as const)
      : PROPERTY_TYPES;

  const hasAnyFilter =
    filters.rentalSegment !== 'all' ||
    filters.searchQuery.trim() !== '' ||
    filters.governorate !== 'الكل' ||
    filters.city !== 'الكل' ||
    filters.areaOrVillage !== 'الكل' ||
    filters.propertyType !== 'الكل' ||
    filters.advertiserRole !== 'الكل' ||
    filters.maxPrice !== null ||
    filters.checkInDate !== '' ||
    filters.checkOutDate !== '' ||
    filters.favoritesOnly;

  const sliderVal =
    filters.maxPrice !== null
      ? Math.min(MAX_BUDGET_SLIDER, Math.max(500, filters.maxPrice))
      : MAX_BUDGET_SLIDER;

  return (
    <section className="border-b border-stone-200/70 bg-[#FAF9F6] py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Serene Minimalist Hero Heading */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200/70 bg-white px-4 py-1.5 text-xs font-semibold text-[#1E3A5F] shadow-xs">
            ٢٧ محافظة مصرية • إيجار يومي وأسبوعي وشهري • تواصل مباشر عبر واتساب
          </span>
          <h1 className="mt-5 text-2xl font-bold leading-snug text-[#1E3A5F] sm:text-4xl">
            AgzStay - إجازة ستاي | شاليهات، شقق مفروشة، وشقق فاضية للإيجار في مصر
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7280] sm:text-base">
            منصة هادئة وشفافة لحجز الشاليهات والشقق المفروشة والشقق الفاضية والفيلات في كل محافظات مصر مباشرة مع المُلاك والمكاتب العقارية بدون عمولات خفية.
          </p>
        </div>

        {/* Unified White Search & Filter Card */}
        <div className="mx-auto mt-8 max-w-6xl rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6">
          {/* Segmented Mode Tabs: All / Vacation Daily / Monthly Residential */}
          <div
            role="tablist"
            aria-label="تصنيف نوع الإيجار"
            className="mb-5 flex flex-wrap items-center gap-2 border-b border-stone-100 pb-4"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filters.rentalSegment === 'all'}
              onClick={() => onRentalSegmentChange('all')}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
                filters.rentalSegment === 'all'
                  ? 'bg-[#1E3A5F] text-white shadow-xs'
                  : 'border border-stone-200/70 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880]'
              }`}
            >
              <LayoutGrid className="h-4 w-4 text-[#C5A880]" />
              <span>كل الوحدات</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={filters.rentalSegment === 'vacation'}
              onClick={() => onRentalSegmentChange('vacation')}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
                filters.rentalSegment === 'vacation'
                  ? 'bg-[#1E3A5F] text-white shadow-xs'
                  : 'border border-stone-200/70 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880]'
              }`}
            >
              <Umbrella className="h-4 w-4 text-[#C5A880]" />
              <span>مصايف وإيجار يومي</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={filters.rentalSegment === 'monthly'}
              onClick={() => onRentalSegmentChange('monthly')}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
                filters.rentalSegment === 'monthly'
                  ? 'bg-[#1E3A5F] text-white shadow-xs'
                  : 'border border-stone-200/70 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880]'
              }`}
            >
              <Building2 className="h-4 w-4 text-[#C5A880]" />
              <span>إيجار شهري وسكني</span>
            </button>
          </div>

          {/* Row 1: 3 Cascading Locations + Keyword Search */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Level 1: Governorate */}
            <div>
              <label
                htmlFor="hero-gov"
                className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
              >
                المحافظة
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C5A880]" />
                <select
                  id="hero-gov"
                  value={filters.governorate}
                  onChange={(e) => onGovernorateChange(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-stone-200/80 bg-[#FAF9F6] pl-3 pr-9 text-xs font-semibold text-[#1F2937] transition focus:border-[#1E3A5F] focus:bg-white focus:outline-none sm:text-sm"
                >
                  <option value="الكل">كل المحافظات</option>
                  {ALL_GOVERNORATE_NAMES.map((gov) => (
                    <option key={gov} value={gov}>
                      {gov}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level 2: City */}
            <div>
              <label
                htmlFor="hero-city"
                className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
              >
                المدينة / المركز
              </label>
              <div className="relative">
                <Navigation className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C5A880]" />
                <select
                  id="hero-city"
                  value={filters.city}
                  disabled={cities.length === 0}
                  onChange={(e) => onCityChange(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-stone-200/80 bg-[#FAF9F6] pl-3 pr-9 text-xs font-semibold text-[#1F2937] transition focus:border-[#1E3A5F] focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                >
                  <option value="الكل">كل المدن</option>
                  {cities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level 3: Area / Village / Resort */}
            <div>
              <label
                htmlFor="hero-area"
                className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
              >
                القرية / المنطقة
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                <select
                  id="hero-area"
                  value={filters.areaOrVillage}
                  disabled={areas.length === 0}
                  onChange={(e) => onAreaChange(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-stone-200/80 bg-[#FAF9F6] pl-3 pr-9 text-xs font-semibold text-[#1F2937] transition focus:border-[#1E3A5F] focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                >
                  <option value="الكل">كل القرى والمناطق</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Keyword search */}
            <div>
              <label
                htmlFor="hero-search"
                className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
              >
                كلمة بحث
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                <input
                  id="hero-search"
                  type="text"
                  value={filters.searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="مثال: مراسي، السخنة، التجمع..."
                  className="h-11 w-full rounded-xl border border-stone-200/80 bg-[#FAF9F6] pl-3 pr-9 text-xs text-[#1F2937] placeholder:text-[#6B7280]/70 transition focus:border-[#1E3A5F] focus:bg-white focus:outline-none sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Property Type + Advertiser Role + Max Price + Dates */}
          <div className="mt-4 grid grid-cols-1 gap-3.5 border-t border-stone-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Property Type */}
            <div>
              <label
                htmlFor="filter-property-type"
                className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
              >
                نوع الوحدة
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C5A880]" />
                <select
                  id="filter-property-type"
                  value={filters.propertyType}
                  onChange={(e) => onPropertyTypeChange(e.target.value as PropertyType | 'الكل')}
                  className="h-11 w-full appearance-none rounded-xl border border-stone-200/80 bg-[#FAF9F6] pl-3 pr-9 text-xs font-semibold text-[#1F2937] transition focus:border-[#1E3A5F] focus:bg-white focus:outline-none sm:text-sm"
                >
                  {segmentPropertyTypes.map((type) => (
                    <option key={type} value={type}>
                      {type === 'الكل' ? 'كل أنواع الوحدات' : type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Advertiser Role */}
            <div>
              <label
                htmlFor="filter-advertiser-role"
                className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
              >
                صفة المعلن
              </label>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C5A880]" />
                <select
                  id="filter-advertiser-role"
                  value={filters.advertiserRole}
                  onChange={(e) =>
                    onAdvertiserRoleChange(e.target.value as AdvertiserRoleLabel | 'الكل')
                  }
                  className="h-11 w-full appearance-none rounded-xl border border-stone-200/80 bg-[#FAF9F6] pl-3 pr-9 text-xs font-semibold text-[#1F2937] transition focus:border-[#1E3A5F] focus:bg-white focus:outline-none sm:text-sm"
                >
                  {ADVERTISER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role === 'الكل' ? 'كل المعلنين' : role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Max Price Slider */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label htmlFor="filter-max-price" className="font-semibold text-[#6B7280]">
                  {filters.rentalSegment === 'monthly'
                    ? 'الحد الأقصى للإيجار الشهري'
                    : filters.rentalSegment === 'vacation'
                    ? 'الحد الأقصى لسعر الليلة'
                    : 'الحد الأقصى للسعر'}
                </label>
                <span className="font-bold text-[#1E3A5F]">
                  {filters.maxPrice === null ? 'الكل' : formatEGP(sliderVal)}
                </span>
              </div>
              <div className="flex h-11 items-center rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3">
                <input
                  id="filter-max-price"
                  type="range"
                  min={500}
                  max={MAX_BUDGET_SLIDER}
                  step={500}
                  value={sliderVal}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onMaxPriceChange(val >= MAX_BUDGET_SLIDER ? null : val);
                  }}
                  className="w-full accent-[#1E3A5F]"
                />
              </div>
            </div>

            {/* Visual Calendar Range Picker: Check-in & Check-out */}
            <div className="sm:col-span-2 lg:col-span-2">
              {filters.rentalSegment === 'monthly' ? (
                <div className="flex h-full min-h-[68px] items-center gap-2.5 rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-4 py-2.5 text-xs text-[#4B5563]">
                  <Building2 className="h-4 w-4 shrink-0 text-[#C5A880]" />
                  <span>
                    وضع الإيجار الشهري والسكني: تُعرض الشقق المتاحة بعقود شهرية أو سنوية — اختر المحافظة والميزانية وحدد موعد المعاينة من صفحة الوحدة.
                  </span>
                </div>
              ) : (
                <ArabicDateRangeField
                  checkInDate={filters.checkInDate}
                  checkOutDate={filters.checkOutDate}
                  onChange={onDateRangeChange}
                />
              )}
            </div>
          </div>

          {/* Row 3: Quick Property Pills + Result Count + Sort + Reset + View Switch */}
          <div className="mt-4 flex flex-col gap-3 border-t border-stone-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {segmentPropertyTypes.map((type) => {
                const active = filters.propertyType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onPropertyTypeChange(type)}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      active
                        ? 'bg-[#1E3A5F] text-white shadow-xs'
                        : 'border border-stone-200/70 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880]'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 lg:justify-end">
              <span className="inline-flex h-10 items-center rounded-xl bg-[#FAF9F6] px-3.5 text-xs font-semibold text-[#6B7280]">
                النتائج:{' '}
                <strong className="mx-1 text-[#1E3A5F]">
                  {totalResults.toLocaleString('ar-EG')}
                </strong>
                من {totalAvailable.toLocaleString('ar-EG')}
              </span>

              <div className="flex h-10 items-center gap-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3">
                <ArrowUpDown className="h-3.5 w-3.5 text-[#6B7280]" />
                <select
                  aria-label="ترتيب الوحدات"
                  value={filters.sortBy}
                  onChange={(e) => onSortChange(e.target.value as SortOption)}
                  className="bg-transparent text-xs font-semibold text-[#1F2937] focus:outline-none"
                >
                  <option value="featured">المميزة أولاً</option>
                  <option value="price-asc">الأقل سعراً</option>
                  <option value="price-desc">الأعلى سعراً</option>
                </select>
              </div>

              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#C5A880] bg-[#FAF9F6] px-3.5 text-xs font-semibold text-[#1E3A5F] transition hover:bg-[#C5A880]/15"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>إعادة ضبط</span>
                </button>
              )}

              <div
                className="inline-flex h-10 items-center rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-1"
                role="group"
                aria-label="طريقة العرض"
              >
                <button
                  type="button"
                  onClick={() => onViewModeChange('grid')}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#1E3A5F] shadow-xs'
                      : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>شبكة</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange('map')}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition ${
                    viewMode === 'map'
                      ? 'bg-[#1E3A5F] text-white shadow-xs'
                      : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  <span>خريطة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
