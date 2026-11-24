import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  Home,
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
  saveLocalJson,
} from '@/services/agzstayRepository';
import type {
  AdvertiserRoleLabel,
  Chalet,
  FilterState,
  PropertyType,
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
  searchQuery: '',
  governorate: 'الكل',
  city: 'الكل',
  areaOrVillage: 'الكل',
  propertyType: 'الكل',
  advertiserRole: 'الكل',
  maxPrice: null,
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
      if (query) {
        const haystack =
          `${chalet.title} ${chalet.governorate} ${chalet.city} ${chalet.areaOrVillage} ${chalet.propertyType} ${chalet.description} ${chalet.ownerName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (filters.sortBy) {
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
            initialCheckIn={filters.checkInDate}
            initialCheckOut={filters.checkOutDate}
            onBack={closeChaletDetail}
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
          />
        </Suspense>
      ) : activeSection === 'admin' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <AdminDashboard onDataChanged={() => void loadChalets(false)} />
        </Suspense>
      ) : (
        <>
          <HeroSearch
            filters={filters}
            viewMode={viewMode}
            totalResults={filteredChalets.length}
            totalAvailable={allDisplayChalets.length}
            onSearchChange={(searchQuery) => setFilters((prev) => ({ ...prev, searchQuery }))}
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

            {/* Section Header */}
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#1E3A5F] sm:text-2xl">
                  {filters.favoritesOnly ? 'وحداتك المفضلة' : 'الوحدات المتاحة للإيجار في مصر'}
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
                    سجّل دخولك برقم الهاتف في بوابة المعلن، أو اختر إحدى باقات الإعلان المميزة لعرض حتى ٢٠ وحدة.
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
