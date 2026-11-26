import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  Home,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Umbrella,
} from 'lucide-react';
import { HeroSearch } from '@/components/HeroSearch';
import { Navbar } from '@/components/Navbar';
import { PropertyCard } from '@/components/PropertyCard';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { SwUpdateBanner } from '@/components/SwUpdateBanner';
import { INITIAL_CHALETS } from '@/data/chalets';
import { useUrlRouting } from '@/hooks/useUrlRouting';
import { getSupabaseConfigStatus, isSupabaseConfigured } from '@/lib/supabase';
import {
  agzstayStorageKeys,
  fetchAllChaletsFromDb,
  loadLocalJson,
  onAuthStateChange,
  saveLocalJson,
} from '@/services/agzstayRepository';
import type {
  AdvertiserRoleLabel,
  AmenityId,
  Chalet,
  FilterState,
  PropertyType,
  RentalSegment,
  SortOption,
  ViewMode,
} from '@/types/chalet';
import {
  calculateNightsBetween,
  formatArabicDate,
  isChaletAvailableForRange,
} from '@/utils/bookingPricing';

const PropertyDetailPage = lazy(() =>
  import('@/components/PropertyDetailPage').then((m) => ({ default: m.PropertyDetailPage }))
);
const PricingPage = lazy(() =>
  import('@/components/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const OwnerPortal = lazy(() =>
  import('@/components/OwnerPortal').then((m) => ({ default: m.OwnerPortal }))
);
const AdminDashboard = lazy(() =>
  import('@/components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const ChaletsMapView = lazy(() =>
  import('@/components/ChaletsMapView').then((m) => ({ default: m.ChaletsMapView }))
);
const SupportContactModal = lazy(() =>
  import('@/components/SupportContactModal').then((m) => ({ default: m.SupportContactModal }))
);

const DEFAULT_FILTERS: FilterState = {
  rentalSegment: 'all',
  searchQuery: '',
  governorate: 'الكل',
  city: 'الكل',
  areaOrVillage: 'الكل',
  propertyType: 'الكل',
  advertiserRole: 'الكل',
  maxPrice: null,
  minBedrooms: null,
  minGuests: null,
  amenities: [],
  verifiedOnly: false,
  checkInDate: '',
  checkOutDate: '',
  sortBy: 'featured',
  favoritesOnly: false,
};

function LazySectionLoader() {
  return (
    <div
      className="mx-auto flex min-h-[280px] max-w-7xl items-center justify-center px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex items-center gap-2 rounded-2xl border border-stone-200/70 bg-white px-5 py-3 text-sm font-bold text-[#1E3A5F] shadow-xs">
        <RefreshCw className="h-4 w-4 animate-spin text-[#C5A880]" />
        <span>جاري تحميل الصفحة...</span>
      </div>
    </div>
  );
}

export function App() {
  const {
    activeSection,
    selectedChaletId,
    navigateToSection,
    openChaletDetail,
    closeChaletDetail,
  } = useUrlRouting();

  const [dbChalets, setDbChalets] = useState<Chalet[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hideFallbackDemos, setHideFallbackDemos] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => {
    try {
      return (
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery')
      );
    } catch {
      return false;
    }
  });

  const [favorites, setFavorites] = useState<string[]>(() =>
    loadLocalJson<string[]>(agzstayStorageKeys.favorites, [])
  );
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => saveLocalJson(agzstayStorageKeys.favorites, favorites), [favorites]);

  const loadChalets = useCallback(async (initial = false) => {
    if (initial) setIsInitialLoading(true);
    else setIsRefreshing(true);
    setLoadError(null);

    try {
      const res = await fetchAllChaletsFromDb(false);
      if (res.error) {
        setLoadError(res.error);
      } else {
        setDbChalets(res.data ?? []);
      }
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadChalets(true);
  }, [loadChalets]);

  useEffect(() => {
    if (isPasswordRecovery && activeSection !== 'owner') {
      navigateToSection('owner');
    }
  }, [isPasswordRecovery, activeSection, navigateToSection]);

  useEffect(() => {
    return onAuthStateChange((_user, event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        navigateToSection('owner');
      }
    });
  }, [navigateToSection]);

  const allowDemoFallback = import.meta.env.VITE_SHOW_DEMO !== 'false';
  const isUsingFallbackDemos =
    !isInitialLoading && dbChalets.length === 0 && !hideFallbackDemos && allowDemoFallback;

  const allDisplayChalets = useMemo(
    () => (dbChalets.length > 0 ? dbChalets : isUsingFallbackDemos ? INITIAL_CHALETS : []),
    [dbChalets, isUsingFallbackDemos]
  );

  const selectedChalet = useMemo(
    () => allDisplayChalets.find((c) => c.id === selectedChaletId) ?? null,
    [allDisplayChalets, selectedChaletId]
  );

  const filteredChalets = useMemo(() => {
    const query = filters.searchQuery.trim().toLowerCase();
    const hasValidDateRange =
      Boolean(filters.checkInDate && filters.checkOutDate) &&
      calculateNightsBetween(filters.checkInDate, filters.checkOutDate) > 0;

    const list = allDisplayChalets.filter((chalet) => {
      if (chalet.availabilityStatus !== 'active') return false;
      if (filters.rentalSegment === 'vacation' && chalet.propertyType === 'شقة فاضية') {
        return false;
      }
      if (filters.rentalSegment === 'monthly' && chalet.propertyType !== 'شقة فاضية') {
        return false;
      }
      if (
        hasValidDateRange &&
        chalet.propertyType !== 'شقة فاضية' &&
        !isChaletAvailableForRange(chalet, filters.checkInDate, filters.checkOutDate)
      ) {
        return false;
      }
      if (filters.favoritesOnly && !favorites.includes(chalet.id)) return false;
      if (filters.governorate !== 'الكل' && chalet.governorate !== filters.governorate) {
        return false;
      }
      if (filters.city !== 'الكل' && chalet.city !== filters.city) {
        return false;
      }
      if (filters.areaOrVillage !== 'الكل' && chalet.areaOrVillage !== filters.areaOrVillage) {
        return false;
      }
      if (filters.propertyType !== 'الكل' && chalet.propertyType !== filters.propertyType) {
        return false;
      }
      if (
        filters.advertiserRole !== 'الكل' &&
        chalet.advertiserRole !== filters.advertiserRole
      ) {
        return false;
      }
      if (filters.maxPrice !== null && chalet.pricePerNight > filters.maxPrice) {
        return false;
      }
      if (filters.minBedrooms !== null && chalet.bedrooms < filters.minBedrooms) {
        return false;
      }
      if (filters.minGuests !== null && chalet.maxGuests < filters.minGuests) {
        return false;
      }
      if (filters.verifiedOnly && !chalet.ownerVerified) {
        return false;
      }
      if (
        filters.amenities.length > 0 &&
        !filters.amenities.every((a) => chalet.amenities.includes(a))
      ) {
        return false;
      }
      if (query) {
        const haystack =
          `${chalet.title} ${chalet.governorate} ${chalet.city} ${chalet.areaOrVillage} ${chalet.propertyType} ${chalet.description} ${chalet.ownerName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (filters.sortBy) {
        case 'rating-desc': {
          const avgDiff = (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0);
          if (avgDiff !== 0) return avgDiff;
          const cntDiff = (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
          if (cntDiff !== 0) return cntDiff;
          return Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
        }
        case 'price-asc':
          return a.pricePerNight - b.pricePerNight;
        case 'price-desc':
          return b.pricePerNight - a.pricePerNight;
        case 'featured':
        default:
          return Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
      }
    });
  }, [allDisplayChalets, favorites, filters]);

  const popularDestinations = useMemo(() => {
    const activeUnits = allDisplayChalets.filter((c) => c.availabilityStatus === 'active');
    return [
      {
        id: 'north-coast',
        label: 'الساحل الشمالي',
        subtitle: 'مراسي، هاسيندا، العلمين',
        count: activeUnits.filter((c) => c.city.includes('الساحل الشمالي')).length,
        isMonthly: false,
        apply: () =>
          setFilters({
            ...DEFAULT_FILTERS,
            rentalSegment: 'vacation',
            governorate: 'مطروح',
            city: 'الساحل الشمالي - العلمين وسيدي عبد الرحمن',
          }),
        isActive: filters.governorate === 'مطروح' && filters.city.includes('الساحل الشمالي'),
      },
      {
        id: 'ain-sokhna',
        label: 'العين السخنة',
        subtitle: 'المونت جلالة، بورتو، ستيلا',
        count: activeUnits.filter((c) => c.city === 'العين السخنة').length,
        isMonthly: false,
        apply: () =>
          setFilters({
            ...DEFAULT_FILTERS,
            rentalSegment: 'vacation',
            governorate: 'السويس',
            city: 'العين السخنة',
          }),
        isActive: filters.governorate === 'السويس' && filters.city === 'العين السخنة',
      },
      {
        id: 'marsa-matrouh',
        label: 'مرسى مطروح',
        subtitle: 'عجيبة، الأبيض، وسط المدينة',
        count: activeUnits.filter((c) => c.city === 'مرسى مطروح').length,
        isMonthly: false,
        apply: () =>
          setFilters({
            ...DEFAULT_FILTERS,
            rentalSegment: 'vacation',
            governorate: 'مطروح',
            city: 'مرسى مطروح',
          }),
        isActive: filters.governorate === 'مطروح' && filters.city === 'مرسى مطروح',
      },
      {
        id: 'sharm',
        label: 'شرم الشيخ',
        subtitle: 'خليج نعمة، سوهو، نبق',
        count: activeUnits.filter((c) => c.city === 'شرم الشيخ').length,
        isMonthly: false,
        apply: () =>
          setFilters({
            ...DEFAULT_FILTERS,
            rentalSegment: 'vacation',
            governorate: 'جنوب سيناء',
            city: 'شرم الشيخ',
          }),
        isActive: filters.governorate === 'جنوب سيناء' && filters.city === 'شرم الشيخ',
      },
      {
        id: 'monthly-apartments',
        label: 'شقق إيجار شهري',
        subtitle: 'سكن عائلي ومغتربين بدون عمولات',
        count: activeUnits.filter((c) => c.propertyType === 'شقة فاضية').length,
        isMonthly: true,
        apply: () =>
          setFilters({
            ...DEFAULT_FILTERS,
            rentalSegment: 'monthly',
          }),
        isActive: filters.rentalSegment === 'monthly' && filters.governorate === 'الكل',
      },
    ];
  }, [allDisplayChalets, filters.city, filters.governorate, filters.rentalSegment]);

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const resetHomeAndFilters = () => {
    resetFilters();
    navigateToSection('home');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6] text-[#1F2937]">
      <SwUpdateBanner />

      {!isSupabaseConfigured && (
        <div
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950"
          role="status"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            {(() => {
              const cfg = getSupabaseConfigStatus();
              if (cfg.urlPresent && !cfg.urlValid) {
                return 'صيغة رابط Supabase غير صالحة في الإعدادات — يتم عرض وحدات معاينة مؤقتة.';
              }
              return `وضع معاينة مؤقت: لم يتم ضبط ${cfg.missingVars.join(' ، ')} بعد.`;
            })()}
          </span>
        </div>
      )}

      <PwaInstallBanner />

      <Navbar
        activeSection={activeSection}
        favoritesCount={favorites.length}
        favoritesOnly={filters.favoritesOnly}
        onNavigate={navigateToSection}
        onToggleFavoritesOnly={() =>
          setFilters((prev) => ({ ...prev, favoritesOnly: !prev.favoritesOnly }))
        }
        onResetHome={resetHomeAndFilters}
      />

      {selectedChalet ? (
        <Suspense fallback={<LazySectionLoader />}>
          <PropertyDetailPage
            chalet={selectedChalet}
            allChalets={allDisplayChalets}
            favorites={favorites}
            initialCheckIn={filters.checkInDate}
            initialCheckOut={filters.checkOutDate}
            onBack={closeChaletDetail}
            onToggleFavorite={handleToggleFavorite}
            onSelectChalet={(item) => {
              openChaletDetail(item.id);
              try {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } catch {
                // ignore
              }
            }}
          />
        </Suspense>
      ) : activeSection === 'pricing' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <PricingPage
            onNavigate={navigateToSection}
            onSubscriptionSubmitted={() => void loadChalets(false)}
          />
        </Suspense>
      ) : activeSection === 'owner' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <OwnerPortal
            onNavigate={navigateToSection}
            onDataChanged={() => void loadChalets(false)}
            isPasswordRecovery={isPasswordRecovery}
            onPasswordRecoveryComplete={() => setIsPasswordRecovery(false)}
          />
        </Suspense>
      ) : activeSection === 'admin' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <AdminDashboard
            onNavigate={navigateToSection}
            onDataChanged={() => void loadChalets(false)}
          />
        </Suspense>
      ) : (
        <>
          <HeroSearch
            filters={filters}
            viewMode={viewMode}
            totalResults={filteredChalets.length}
            totalAvailable={allDisplayChalets.length}
            onSearchChange={(searchQuery) => setFilters((prev) => ({ ...prev, searchQuery }))}
            onRentalSegmentChange={(rentalSegment: RentalSegment) =>
              setFilters((prev) => {
                const nextPropertyType =
                  rentalSegment === 'monthly'
                    ? 'الكل'
                    : rentalSegment === 'vacation' && prev.propertyType === 'شقة فاضية'
                    ? 'الكل'
                    : prev.propertyType;
                return {
                  ...prev,
                  rentalSegment,
                  propertyType: nextPropertyType,
                  checkInDate: rentalSegment === 'monthly' ? '' : prev.checkInDate,
                  checkOutDate: rentalSegment === 'monthly' ? '' : prev.checkOutDate,
                };
              })
            }
            onGovernorateChange={(governorate) =>
              setFilters((prev) => ({
                ...prev,
                governorate,
                city: 'الكل',
                areaOrVillage: 'الكل',
              }))
            }
            onCityChange={(city) =>
              setFilters((prev) => ({ ...prev, city, areaOrVillage: 'الكل' }))
            }
            onAreaChange={(areaOrVillage) => setFilters((prev) => ({ ...prev, areaOrVillage }))}
            onPropertyTypeChange={(propertyType: PropertyType | 'الكل') =>
              setFilters((prev) => ({ ...prev, propertyType }))
            }
            onAdvertiserRoleChange={(advertiserRole: AdvertiserRoleLabel | 'الكل') =>
              setFilters((prev) => ({ ...prev, advertiserRole }))
            }
            onMaxPriceChange={(maxPrice) => setFilters((prev) => ({ ...prev, maxPrice }))}
            onMinBedroomsChange={(minBedrooms) => setFilters((prev) => ({ ...prev, minBedrooms }))}
            onMinGuestsChange={(minGuests) => setFilters((prev) => ({ ...prev, minGuests }))}
            onToggleAmenity={(amenity: AmenityId) =>
              setFilters((prev) => ({
                ...prev,
                amenities: prev.amenities.includes(amenity)
                  ? prev.amenities.filter((a) => a !== amenity)
                  : [...prev.amenities, amenity],
              }))
            }
            onVerifiedOnlyChange={(verifiedOnly) => setFilters((prev) => ({ ...prev, verifiedOnly }))}
            onDateRangeChange={(checkInDate, checkOutDate) =>
              setFilters((prev) => ({ ...prev, checkInDate, checkOutDate }))
            }
            onSortChange={(sortBy: SortOption) => setFilters((prev) => ({ ...prev, sortBy }))}
            onViewModeChange={setViewMode}
            onReset={resetFilters}
          />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
            {loadError && (
              <div
                className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-xs font-bold text-red-800 shadow-xs"
                role="alert"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {loadError}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={() => void loadChalets(false)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-red-700 shadow-xs hover:bg-red-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'جاري التحديث...' : 'إعادة المحاولة'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-1.5 text-xs font-bold text-[#1E3A5F] shadow-xs hover:bg-stone-50"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>تواصل معنا</span>
                  </button>
                </div>
              </div>
            )}

            {isUsingFallbackDemos && (
              <div
                className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-[#C5A880]/60 bg-white px-5 py-4 text-xs shadow-xs sm:flex-row sm:items-center"
                role="status"
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#C5A880]" />
                  <div>
                    <p className="font-bold text-[#1E3A5F]">عرض وحدات تجريبية مؤقتة للمعاينة</p>
                    <p className="mt-1 leading-relaxed text-[#6B7280]">
                      لا توجد وحدات منشورة في قاعدة البيانات بعد، لذا نعرض نماذج تجريبية مؤقتة في مصر لتجربة البحث والتصفية. ستظهر وحداتك الحقيقية تلقائياً فور إضافتها من بوابة المعلن.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={() => void loadChalets(false)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-1.5 font-semibold text-[#1E3A5F] hover:bg-stone-100"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>إعادة المحاولة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-1.5 font-semibold text-[#1E3A5F] hover:bg-stone-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>تواصل معنا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToSection('owner')}
                    className="inline-flex min-h-[38px] items-center rounded-xl bg-[#1E3A5F] px-3.5 py-1.5 font-bold text-white hover:bg-[#172E4D]"
                  >
                    أضف أول وحدة
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideFallbackDemos(true)}
                    className="inline-flex min-h-[38px] items-center rounded-xl px-2.5 py-1.5 font-semibold text-[#6B7280] hover:bg-stone-100"
                  >
                    إخفاء
                  </button>
                </div>
              </div>
            )}

            {/* Popular Egyptian Destinations Quick Cards */}
            {!filters.favoritesOnly && (
              <section aria-label="وجهات مصرية شائعة" className="mb-10">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#1E3A5F] sm:text-lg">
                      استكشف الوجهات الأكثر طلباً في مصر
                    </h2>
                    <p className="text-xs text-[#6B7280]">
                      اختر وجهتك المفضلة للوصول السريع إلى الوحدات المتاحة
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {popularDestinations.map((dest) => (
                    <button
                      key={dest.id}
                      type="button"
                      onClick={() => {
                        dest.apply();
                        try {
                          document
                            .getElementById('listings-section')
                            ?.scrollIntoView({ behavior: 'smooth' });
                        } catch {
                          // ignore
                        }
                      }}
                      className={`group flex flex-col justify-between rounded-2xl border p-4 text-right shadow-xs transition hover:-translate-y-0.5 ${
                        dest.isActive
                          ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                          : 'border-stone-200/70 bg-white text-[#1F2937] hover:border-[#C5A880]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                            dest.isActive ? 'bg-white/15 text-[#C5A880]' : 'bg-[#FAF9F6] text-[#1E3A5F]'
                          }`}
                        >
                          {dest.isMonthly ? (
                            <Building2 className="h-4 w-4" />
                          ) : (
                            <MapPin className="h-4 w-4 text-[#C5A880]" />
                          )}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            dest.isActive
                              ? 'bg-white/15 text-white'
                              : 'bg-[#FAF9F6] text-[#6B7280]'
                          }`}
                        >
                          {dest.count.toLocaleString('ar-EG')} وحدة
                        </span>
                      </div>
                      <div className="mt-3">
                        <span className="block text-sm font-bold">{dest.label}</span>
                        <span
                          className={`mt-0.5 block line-clamp-1 text-[11px] ${
                            dest.isActive ? 'text-slate-200' : 'text-[#6B7280]'
                          }`}
                        >
                          {dest.subtitle}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Section Header */}
            <div id="listings-section" className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#1E3A5F] sm:text-2xl">
                  {filters.favoritesOnly
                    ? 'وحداتك المفضلة'
                    : filters.rentalSegment === 'vacation'
                    ? 'مصايف وإيجار يومي وأسبوعي'
                    : filters.rentalSegment === 'monthly'
                    ? 'شقق الإيجار الشهري والسكني'
                    : 'الوحدات المتاحة للإيجار في مصر'}
                </h2>
                <p className="mt-1 text-xs text-[#6B7280] sm:text-sm">
                  {isInitialLoading
                    ? 'جاري تحميل الوحدات من قاعدة البيانات...'
                    : `عرض ${filteredChalets.length.toLocaleString('ar-EG')} وحدة من إجمالي ${allDisplayChalets.length.toLocaleString('ar-EG')}`}
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-stone-200/70 bg-white px-4 py-2 text-xs font-semibold text-[#1E3A5F] shadow-xs">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>المعاينة والاتفاق مباشرة مع المعلن</span>
              </div>
            </div>

            {filters.checkInDate &&
              filters.checkOutDate &&
              calculateNightsBetween(filters.checkInDate, filters.checkOutDate) > 0 && (
                <div className="mb-7 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#C5A880]/60 bg-white px-5 py-3.5 text-xs shadow-xs">
                  <span className="inline-flex items-center gap-2 font-semibold text-[#1E3A5F]">
                    <CalendarCheck2 className="h-4 w-4 text-[#C5A880]" />
                    <span>
                      التواريخ المحددة: {formatArabicDate(filters.checkInDate)} ←{' '}
                      {formatArabicDate(filters.checkOutDate)} (
                      {calculateNightsBetween(
                        filters.checkInDate,
                        filters.checkOutDate
                      ).toLocaleString('ar-EG')}{' '}
                      ليالٍ)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, checkInDate: '', checkOutDate: '' }))
                    }
                    className="rounded-lg bg-[#FAF9F6] px-3 py-1 font-bold text-[#1E3A5F] hover:bg-stone-100"
                  >
                    عرض كل التواريخ
                  </button>
                </div>
              )}

            {/* Loading Skeletons / Empty State / Grid / Map */}
            {isInitialLoading && filteredChalets.length === 0 ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-96 animate-pulse rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs"
                  >
                    <div className="aspect-[4/3] w-full rounded-xl bg-stone-200" />
                    <div className="mt-4 h-4 w-3/4 rounded bg-stone-200" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-stone-100" />
                    <div className="mt-6 h-10 w-full rounded-xl bg-stone-100" />
                  </div>
                ))}
              </div>
            ) : filteredChalets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center shadow-xs">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FAF9F6] text-[#1E3A5F]">
                  {allDisplayChalets.length === 0 ? (
                    <Home className="h-7 w-7 text-[#C5A880]" />
                  ) : (
                    <Umbrella className="h-7 w-7 text-[#C5A880]" />
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#1F2937]">
                  {allDisplayChalets.length === 0
                    ? 'لا توجد وحدات متاحة للعرض حالياً'
                    : 'لا توجد وحدات مطابقة لشروط البحث الحالية'}
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm text-[#6B7280]">
                  {allDisplayChalets.length === 0
                    ? 'يمكنك إعادة المحاولة لتحديث القائمة، أو التواصل معنا لطلب مساعدة، أو إضافة أول وحدة عبر بوابة المعلن.'
                    : 'جرّب تعديل المحافظة أو نوع العقار أو التواريخ المحددة، أو تواصل معنا لمساعدتك.'}
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {allDisplayChalets.length > 0 && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="min-h-[44px] rounded-xl bg-[#1E3A5F] px-5 py-2 text-sm font-bold text-white hover:bg-[#172E4D]"
                    >
                      عرض جميع الوحدات
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={() => void loadChalets(false)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-2 text-sm font-bold text-[#1E3A5F] hover:bg-stone-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'جاري التحديث...' : 'إعادة المحاولة'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white px-4 py-2 text-sm font-bold text-[#1E3A5F] hover:bg-[#FAF9F6]"
                  >
                    <MessageCircle className="h-4 w-4 text-[#C5A880]" />
                    <span>تواصل معنا</span>
                  </button>

                  {hideFallbackDemos && dbChalets.length === 0 && allowDemoFallback && (
                    <button
                      type="button"
                      onClick={() => setHideFallbackDemos(false)}
                      className="min-h-[44px] rounded-xl border border-[#C5A880] bg-white px-4 py-2 text-sm font-bold text-[#1E3A5F] hover:bg-[#FAF9F6]"
                    >
                      عرض وحدات تجريبية
                    </button>
                  )}
                </div>
              </div>
            ) : viewMode === 'map' ? (
              <Suspense fallback={<LazySectionLoader />}>
                <ChaletsMapView
                  chalets={filteredChalets}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  onSelectChalet={(item) => openChaletDetail(item.id)}
                />
              </Suspense>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredChalets.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    isFavorite={favorites.includes(property.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onSelect={(item) => openChaletDetail(item.id)}
                  />
                ))}
              </div>
            )}

            {/* Minimalist Owner CTA Banner */}
            <section className="mt-16 rounded-2xl border border-stone-200/70 bg-[#1E3A5F] p-7 text-white shadow-xs sm:p-9">
              <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#C5A880]">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>للملاك وأصحاب المكاتب العقارية</span>
                  </span>
                  <h3 className="mt-3 text-xl font-bold sm:text-2xl">
                    اعرض وحدتك الآن مجاناً واستقبل طلبات المستأجرين مباشرة عبر واتساب
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    سجّل دخولك بحسابك الموثق في بوابة المعلن، أو اختر إحدى باقات الإعلان المميزة لعرض حتى ٢٠ وحدة.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigateToSection('owner')}
                    className="min-h-[44px] rounded-xl bg-[#C5A880] px-5 py-2.5 text-sm font-bold text-[#1F2937] transition hover:bg-[#b5976d]"
                  >
                    بوابة المعلن
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToSection('pricing')}
                    className="min-h-[44px] rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
                  >
                    باقات الإعلان
                  </button>
                </div>
              </div>
            </section>
          </main>
        </>
      )}

      {/* Clean Minimalist Footer */}
      <footer className="mt-auto border-t border-stone-200/70 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-[#6B7280] sm:flex-row sm:px-6">
          <div className="font-semibold text-[#1E3A5F]">
            AgzStay — إجازة ستاي © {new Date().getFullYear()} • دليل الإيجار المباشر في مصر
          </div>
          <div className="flex flex-wrap items-center gap-5 font-semibold">
            <button
              type="button"
              onClick={() => navigateToSection('pricing')}
              className="transition hover:text-[#1E3A5F]"
            >
              الباقات
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('owner')}
              className="transition hover:text-[#1E3A5F]"
            >
              بوابة المعلن
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('admin')}
              className="transition hover:text-[#1E3A5F]"
            >
              الإدارة
            </button>
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="transition hover:text-[#1E3A5F]"
            >
              تواصل معنا
            </button>
          </div>
        </div>
      </footer>

      {isSupportOpen && (
        <Suspense fallback={null}>
          <SupportContactModal
            onClose={() => setIsSupportOpen(false)}
            onOpenAddProperty={() => navigateToSection('owner')}
          />
        </Suspense>
      )}
    </div>
  );
}
export default App;
