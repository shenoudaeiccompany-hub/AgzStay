import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  Home,
  MessageCircle,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Umbrella,
  X,
} from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';
import { BookingsDrawer } from '@/components/BookingsDrawer';
import { FilterBar } from '@/components/FilterBar';
import { HeroSearch } from '@/components/HeroSearch';
import { Navbar } from '@/components/Navbar';
import { OwnerVerificationModal } from '@/components/OwnerVerificationModal';
import { PropertyCard } from '@/components/PropertyCard';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { SubscriptionUpgradeModal } from '@/components/SubscriptionUpgradeModal';
import { SwUpdateBanner } from '@/components/SwUpdateBanner';
import {
  getRentalPriceForDuration,
  resolveGovernorateId,
} from '@/data/chalets';
import { useAgzStayData } from '@/hooks/useAgzStayData';
import { useUrlRouting } from '@/hooks/useUrlRouting';
import { getSupabaseConfigStatus, isSupabaseConfigured } from '@/lib/supabase';
import {
  agzstayStorageKeys,
  loadLocalJson,
  saveLocalJson,
} from '@/services/agzstayRepository';
import {
  calculateNightsBetween,
  formatArabicDate,
  isChaletAvailableForRange,
} from '@/utils/bookingPricing';
import type {
  AmenityId,
  AppNotification,
  FilterState,
  GovernorateId,
  RentalDuration,
  SortOption,
  UnitType,
  UserMode,
  ViewMode,
  ViewType,
} from '@/types/chalet';

const PropertyDetailModal = lazy(() =>
  import('@/components/PropertyDetailModal').then((m) => ({ default: m.PropertyDetailModal }))
);
const AddPropertyModal = lazy(() =>
  import('@/components/AddPropertyModal').then((m) => ({ default: m.AddPropertyModal }))
);
const HostDashboard = lazy(() =>
  import('@/components/HostDashboard').then((m) => ({ default: m.HostDashboard }))
);
const ChaletsMapView = lazy(() =>
  import('@/components/ChaletsMapView').then((m) => ({ default: m.ChaletsMapView }))
);
const CompareModal = lazy(() =>
  import('@/components/CompareModal').then((m) => ({ default: m.CompareModal }))
);
const AdminDashboard = lazy(() =>
  import('@/components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const MarketPriceGuide = lazy(() =>
  import('@/components/MarketPriceGuide').then((m) => ({ default: m.MarketPriceGuide }))
);
const SupportContactModal = lazy(() =>
  import('@/components/SupportContactModal').then((m) => ({ default: m.SupportContactModal }))
);

const DEFAULT_FILTERS: FilterState = {
  searchQuery: '',
  rentalDuration: 'daily',
  checkInDate: '',
  checkOutDate: '',
  governorate: 'all',
  area: 'all',
  destination: 'all',
  amenities: [],
  unitType: 'all',
  viewType: 'all',
  minBedrooms: 0,
  passesOnly: false,
  directOwnersOnly: false,
  maxPrice: null,
  minGuests: 1,
  sortBy: 'featured',
  favoritesOnly: false,
};

function normalizeUnitType(unitType: UnitType | undefined): UnitType {
  if (unitType === 'ground-garden') return 'chalet';
  if (unitType === 'penthouse') return 'duplex';
  return unitType ?? 'chalet';
}

function LazySectionLoader() {
  return (
    <div
      className="mx-auto flex min-h-[240px] max-w-7xl items-center justify-center px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-primary-700 shadow-sm">
        <RefreshCw className="h-4 w-4 animate-spin text-secondary-500" />
        <span>جاري تحميل القسم...</span>
      </div>
    </div>
  );
}

export function App() {
  const {
    currentUser,
    setCurrentUser,
    allChalets,
    ownedChalets,
    activeBookedRanges,
    myBookings,
    hostBookings,
    adminBookings,
    allKnownBookings,
    combinedBookedRanges,
    reviews,
    renterTrustReviews,
    renterTrustAverage,
    reportCounts,
    ownerVerification,
    adminVerifications,
    currentHostSubscription,
    currentHostTier,
    adminSubscriptions,
    notifications,
    notificationsLoading,
    notificationsError,
    isInitialLoading,
    isPublicRefreshing,
    isUsingFallbackDemos,
    hideFallbackDemos,
    setHideFallbackDemos,
    publicLoadError,
    scopedDataLoading,
    scopedDataError,
    actionFeedback,
    setActionFeedback,
    loadPublicData,
    loadNotifications,
    loadUserScopedData,
    handleAddBooking,
    handleApproveBookingRequest,
    handleRejectBookingRequest,
    handleSubmitPaymentReceipt,
    handleConfirmBookingDeposit,
    handleCompleteBookingStay,
    handleRejectBookingAdmin,
    handleCancelBookingWithPolicy,
    handleRemoveBookingRecord,
    handleUpdateChaletConfig,
    handleAddProperty,
    handleDeleteCustomChalet,
    handleReportListing,
    handleAddReview,
    handleDeleteReview,
    handleAddRenterTrustReview,
    handleSubmitVerification,
    handleReviewVerification,
    handleSubmitUpgradeRequest,
    handleApproveSubscription,
    handleExpireSubscription,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleBecomeHost,
    handleSignOut: signOutSession,
  } = useAgzStayData();

  const {
    activeSection,
    setActiveSection,
    selectedChaletId,
    setSelectedChaletId,
  } = useUrlRouting();

  const [favorites, setFavorites] = useState<string[]>(() =>
    loadLocalJson<string[]>(agzstayStorageKeys.favorites, [])
  );
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    loadLocalJson<string[]>(agzstayStorageKeys.compareIds, [])
  );

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [userMode, setUserMode] = useState<UserMode>('renter');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isVerificationOpen, setIsVerificationOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  useEffect(() => saveLocalJson(agzstayStorageKeys.favorites, favorites), [favorites]);
  useEffect(() => saveLocalJson(agzstayStorageKeys.compareIds, compareIds), [compareIds]);

  const selectedChalet = useMemo(
    () =>
      allChalets.find(
        (c) =>
          c.id === selectedChaletId ||
          (c.unitNumber !== undefined && String(c.unitNumber) === selectedChaletId)
      ) ?? null,
    [allChalets, selectedChaletId]
  );

  const comparedChalets = useMemo(
    () =>
      compareIds
        .map((id) => allChalets.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [allChalets, compareIds]
  );

  const activeBrowseChaletsCount = useMemo(
    () => allChalets.filter((c) => (c.availabilityStatus ?? 'active') === 'active').length,
    [allChalets]
  );

  const filteredChalets = useMemo(() => {
    const query = filters.searchQuery.trim().toLowerCase();
    const hasValidDateRange =
      Boolean(filters.checkInDate && filters.checkOutDate) &&
      calculateNightsBetween(filters.checkInDate, filters.checkOutDate) > 0;

    const list = allChalets.filter((chalet) => {
      if ((chalet.availabilityStatus ?? 'active') !== 'active') return false;
      if (
        hasValidDateRange &&
        !isChaletAvailableForRange(
          chalet,
          combinedBookedRanges,
          filters.checkInDate,
          filters.checkOutDate
        )
      ) {
        return false;
      }
      if (
        filters.rentalDuration !== 'daily' &&
        chalet.supportedDurations &&
        !chalet.supportedDurations.includes(filters.rentalDuration)
      ) {
        return false;
      }
      if (filters.favoritesOnly && !favorites.includes(chalet.id)) return false;
      if (filters.directOwnersOnly && chalet.owner.roleType === 'broker') return false;
      if (filters.governorate !== 'all' && resolveGovernorateId(chalet) !== filters.governorate) {
        return false;
      }
      if (filters.area !== 'all' && filters.area.trim() !== '') {
        const locationText = `${chalet.area ?? ''} ${chalet.resort} ${chalet.title}`.toLowerCase();
        if (!locationText.includes(filters.area.toLowerCase())) return false;
      }
      if (filters.unitType !== 'all' && normalizeUnitType(chalet.unitType) !== filters.unitType) {
        return false;
      }
      if (filters.viewType !== 'all' && chalet.viewType !== filters.viewType) return false;
      if (filters.minBedrooms > 0 && chalet.bedrooms < filters.minBedrooms) return false;
      if (filters.passesOnly && !chalet.includesPasses) return false;
      if (filters.maxPrice !== null) {
        const durationPrice = getRentalPriceForDuration(chalet, filters.rentalDuration).price;
        if (durationPrice > filters.maxPrice) return false;
      }
      if (chalet.maxGuests < filters.minGuests) return false;
      if (
        filters.amenities.length > 0 &&
        !filters.amenities.every((a) => chalet.amenities.includes(a))
      ) {
        return false;
      }
      if (query) {
        const haystack =
          `${chalet.title} ${chalet.resort} ${chalet.area ?? ''} ${chalet.destinationLabel} ${chalet.description} ${chalet.owner.name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const getSortPrice = (c: (typeof list)[number]) =>
      getRentalPriceForDuration(c, filters.rentalDuration).price;

    return [...list].sort((a, b) => {
      switch (filters.sortBy) {
        case 'price-asc':
          return getSortPrice(a) - getSortPrice(b);
        case 'price-desc':
          return getSortPrice(b) - getSortPrice(a);
        case 'rating':
          return b.rating - a.rating;
        case 'featured':
        default: {
          const aFlagged = (reportCounts[a.id] ?? 0) >= 2 ? 1 : 0;
          const bFlagged = (reportCounts[b.id] ?? 0) >= 2 ? 1 : 0;
          if (aFlagged !== bFlagged) return aFlagged - bFlagged;
          const aPro = a.hostTier === 'pro' ? 1 : 0;
          const bPro = b.hostTier === 'pro' ? 1 : 0;
          if (aPro !== bPro) return bPro - aPro;
          return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.rating - a.rating;
        }
      }
    });
  }, [allChalets, combinedBookedRanges, favorites, filters, reportCounts]);

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleToggleAmenity = (amenity: AmenityId) => {
    setFilters((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const handleSelectNotification = (notification: AppNotification) => {
    if (!notification.isRead) {
      void handleMarkNotificationRead(notification.id);
    }
    if (
      notification.type.includes('verification') ||
      notification.type === 'booking_created' ||
      notification.type === 'booking_payment_submitted'
    ) {
      setUserMode('host');
      setActiveSection('host-dashboard');
      return;
    }
    if (notification.bookingId) {
      setIsBookingsOpen(true);
    }
  };

  const handleSignOut = async () => {
    await signOutSession();
    if (activeSection === 'admin') {
      setActiveSection('browse');
      setUserMode('renter');
    }
  };

  const handleSwitchUserMode = (mode: UserMode) => {
    setUserMode(mode);
    setActiveSection(mode === 'host' ? 'host-dashboard' : 'browse');
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const pendingHostInquiriesCount = hostBookings.filter(
    (b) =>
      b.status === 'pending' ||
      b.status === 'payment_submitted' ||
      b.status === 'pending_verification'
  ).length;

  const pendingAdminVerificationsCount =
    currentUser?.role === 'admin'
      ? adminSubscriptions.filter((s) => s.status === 'pending-verification').length +
        adminBookings.filter(
          (b) => b.status === 'pending_verification' || b.status === 'payment_submitted'
        ).length +
        adminVerifications.filter((v) => v.status === 'pending').length
      : 0;

  const durationTitleSuffix =
    filters.rentalDuration === 'monthly'
      ? 'للإيجار الشهري'
      : filters.rentalDuration === 'weekly'
      ? 'للإيجار الأسبوعي'
      : 'للإيجار اليومي';

  return (
    <div className="flex min-h-screen flex-col bg-sand-100">
      <SwUpdateBanner />

      {!isSupabaseConfigured && (
        <div
          className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-extrabold text-amber-950"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>
            وضع تجريبي: لا يتم حفظ أي بيانات —{' '}
            {(() => {
              const cfg = getSupabaseConfigStatus();
              if (cfg.urlPresent && !cfg.urlValid) {
                return 'صيغة VITE_SUPABASE_URL غير صالحة (يجب أن تبدأ بـ https://).';
              }
              return `المفقود: ${cfg.missingVars.join(' ، ')} (أو أعد النشر بعد ضبطها).`;
            })()}
          </span>
        </div>
      )}

      {actionFeedback && (
        <div
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl"
          role="alert"
        >
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="إغلاق التنبيه"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <PwaInstallBanner />

      <Navbar
        activeSection={activeSection}
        userMode={userMode}
        favoritesCount={favorites.length}
        bookingsCount={myBookings.length}
        pendingHostInquiriesCount={pendingHostInquiriesCount}
        pendingAdminVerificationsCount={pendingAdminVerificationsCount}
        renterTrustAverage={renterTrustAverage}
        favoritesOnly={filters.favoritesOnly}
        currentUser={currentUser}
        notifications={notifications}
        notificationsLoading={notificationsLoading}
        notificationsError={notificationsError}
        onRetryNotifications={() => {
          if (currentUser) void loadNotifications(currentUser.id);
        }}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onSelectNotification={handleSelectNotification}
        onSelectSection={(section) => {
          if (section === 'admin' && currentUser?.role !== 'admin') return;
          setActiveSection(section);
          if (section === 'host-dashboard') setUserMode('host');
          else if (section === 'browse') setUserMode('renter');
        }}
        onSwitchUserMode={handleSwitchUserMode}
        onToggleFavoritesOnly={() =>
          setFilters((prev) => ({ ...prev, favoritesOnly: !prev.favoritesOnly }))
        }
        onOpenBookings={() => setIsBookingsOpen(true)}
        onOpenAddProperty={() => setIsAddModalOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={handleSignOut}
        onResetFilters={resetFilters}
      />

      {activeSection === 'host-dashboard' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <HostDashboard
            currentUser={currentUser}
            chalets={ownedChalets}
            customChaletIds={ownedChalets.map((c) => c.id)}
            bookings={hostBookings}
            renterTrustReviews={renterTrustReviews}
            verification={ownerVerification}
            currentSubscription={currentHostSubscription}
            activeCustomUnitsCount={ownedChalets.length}
            loading={scopedDataLoading}
            error={scopedDataError}
            onRetry={() => void loadUserScopedData(currentUser)}
            onBackToRenterMode={() => handleSwitchUserMode('renter')}
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenAddProperty={() => setIsAddModalOpen(true)}
            onOpenVerification={() => setIsVerificationOpen(true)}
            onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
            onBecomeHost={handleBecomeHost}
            onApproveBookingRequest={handleApproveBookingRequest}
            onRejectBookingRequest={handleRejectBookingRequest}
            onConfirmBookingDeposit={handleConfirmBookingDeposit}
            onCompleteBookingStay={handleCompleteBookingStay}
            onCancelBookingWithPolicy={handleCancelBookingWithPolicy}
            onUpdateChaletConfig={handleUpdateChaletConfig}
            onDeleteCustomChalet={async (chaletId) => {
              const deleted = await handleDeleteCustomChalet(chaletId);
              if (deleted && selectedChaletId === chaletId) {
                setSelectedChaletId(null);
              }
            }}
            onAddRenterTrustReview={handleAddRenterTrustReview}
          />
        </Suspense>
      ) : activeSection === 'admin' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <AdminDashboard
            currentUser={currentUser}
            chalets={allChalets}
            bookings={adminBookings}
            subscriptions={adminSubscriptions}
            verifications={adminVerifications}
            loading={scopedDataLoading}
            error={scopedDataError}
            onRetry={() => void loadUserScopedData(currentUser)}
            onApproveBooking={handleConfirmBookingDeposit}
            onRejectBooking={handleRejectBookingAdmin}
            onApproveSubscription={handleApproveSubscription}
            onExpireSubscription={handleExpireSubscription}
            onReviewVerification={handleReviewVerification}
            onBackToBrowse={() => {
              setUserMode('renter');
              setActiveSection('browse');
            }}
          />
        </Suspense>
      ) : activeSection === 'price-guide' ? (
        <Suspense fallback={<LazySectionLoader />}>
          <MarketPriceGuide
            properties={allChalets}
            onSelectGovernorateAndBrowse={(searchHint) => {
              setFilters((prev) => ({ ...prev, searchQuery: searchHint }));
              setUserMode('renter');
              setActiveSection('browse');
            }}
            onBackToBrowse={() => {
              setUserMode('renter');
              setActiveSection('browse');
            }}
          />
        </Suspense>
      ) : (
        <>
          <HeroSearch
            searchQuery={filters.searchQuery}
            rentalDuration={filters.rentalDuration}
            checkInDate={filters.checkInDate}
            checkOutDate={filters.checkOutDate}
            governorate={filters.governorate}
            area={filters.area}
            minGuests={filters.minGuests}
            onSearchChange={(searchQuery) => setFilters((prev) => ({ ...prev, searchQuery }))}
            onRentalDurationChange={(rentalDuration: RentalDuration) =>
              setFilters((prev) => ({ ...prev, rentalDuration, maxPrice: null }))
            }
            onDateRangeChange={(checkInDate: string, checkOutDate: string) =>
              setFilters((prev) => ({ ...prev, checkInDate, checkOutDate }))
            }
            onGovernorateChange={(governorate: GovernorateId) =>
              setFilters((prev) => ({ ...prev, governorate, area: 'all' }))
            }
            onAreaChange={(area: string) => setFilters((prev) => ({ ...prev, area }))}
            onMinGuestsChange={(minGuests) => setFilters((prev) => ({ ...prev, minGuests }))}
            onOpenPriceGuide={() => setActiveSection('price-guide')}
          />

          <FilterBar
            filters={filters}
            viewMode={viewMode}
            totalResults={filteredChalets.length}
            onToggleDirectOwnersOnly={() =>
              setFilters((prev) => ({ ...prev, directOwnersOnly: !prev.directOwnersOnly }))
            }
            onToggleAmenity={handleToggleAmenity}
            onUnitTypeChange={(unitType: UnitType | 'all') =>
              setFilters((prev) => ({ ...prev, unitType }))
            }
            onViewTypeChange={(viewType: ViewType | 'all') =>
              setFilters((prev) => ({ ...prev, viewType }))
            }
            onMinBedroomsChange={(minBedrooms: number) =>
              setFilters((prev) => ({ ...prev, minBedrooms }))
            }
            onTogglePassesOnly={() =>
              setFilters((prev) => ({ ...prev, passesOnly: !prev.passesOnly }))
            }
            onMaxPriceChange={(maxPrice) => setFilters((prev) => ({ ...prev, maxPrice }))}
            onSortChange={(sortBy: SortOption) => setFilters((prev) => ({ ...prev, sortBy }))}
            onViewModeChange={setViewMode}
            onReset={resetFilters}
          />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
            {publicLoadError && (
              <div
                className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-xs font-bold text-error-800"
                role="alert"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {publicLoadError}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isPublicRefreshing}
                    onClick={() => void loadPublicData()}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-error-700 shadow-sm hover:bg-error-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isPublicRefreshing ? 'animate-spin' : ''}`} />
                    {isPublicRefreshing ? 'جاري التحديث...' : 'إعادة المحاولة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-error-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-primary-600" />
                    تواصل معنا
                  </button>
                </div>
              </div>
            )}

            {isUsingFallbackDemos && (
              <div
                className="mb-6 flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3.5 text-xs text-amber-950 sm:flex-row sm:items-center"
                role="status"
              >
                <div className="flex items-start gap-2.5">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-extrabold">
                      عرض وحدات تجريبية مؤقتة للمعاينة
                    </p>
                    <p className="mt-0.5 leading-relaxed text-amber-900">
                      لا توجد وحدات نشطة منشورة في قاعدة البيانات حالياً، لذا نعرض نماذج احتياطية مؤقتة لتجربة التصفح والبحث. بمجرد نشر أول وحدة حقيقية ستظهر مباشرة بدلاً منها.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isPublicRefreshing}
                    onClick={() => void loadPublicData()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isPublicRefreshing ? 'animate-spin' : ''}`} />
                    إعادة المحاولة
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-amber-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    تواصل معنا
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-secondary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-secondary-600"
                  >
                    أضف أول وحدة
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideFallbackDemos(true)}
                    className="inline-flex min-h-[40px] items-center rounded-xl px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    إخفاء المعاينة
                  </button>
                </div>
              </div>
            )}

            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-primary-700 sm:text-2xl">
                  {filters.favoritesOnly
                    ? 'قائمة وحداتك المفضلة'
                    : `شقق وشاليهات متاحة ${durationTitleSuffix}`}
                </h2>
                <p className="text-xs text-slate-500 sm:text-sm">
                  {isInitialLoading
                    ? 'جاري تحميل الوحدات من الخادم...'
                    : isUsingFallbackDemos
                    ? `يتم عرض ${filteredChalets.length} وحدة معاينة مؤقتة من أصل ${activeBrowseChaletsCount} نموذج تجريبي`
                    : `يتم عرض ${filteredChalets.length} وحدة مطابقة من إجمالي ${activeBrowseChaletsCount} وحدة نشطة في مصر`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {filters.favoritesOnly && (
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, favoritesOnly: false }))}
                    className="min-h-[44px] rounded-xl border border-primary-200 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
                  >
                    عرض جميع الوحدات
                  </button>
                )}

                <div className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-primary-700 shadow-sm">
                  <ShieldCheck className="h-4 w-4 text-success-500" />
                  <span>إيجار شفاف بدون رسوم خفية</span>
                </div>
              </div>
            </div>

            {filters.checkInDate &&
              filters.checkOutDate &&
              calculateNightsBetween(filters.checkInDate, filters.checkOutDate) > 0 && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-secondary-200 bg-secondary-50/80 px-4 py-2.5 text-xs text-secondary-900">
                  <div className="flex items-center gap-2 font-bold">
                    <CalendarCheck2 className="h-4 w-4 text-secondary-600" />
                    <span>
                      التواريخ المحددة: {formatArabicDate(filters.checkInDate)} ←{' '}
                      {formatArabicDate(filters.checkOutDate)} (
                      {calculateNightsBetween(
                        filters.checkInDate,
                        filters.checkOutDate
                      ).toLocaleString('ar-EG')}{' '}
                      ليالٍ) — تم استبعاد أي وحدة بها ليلة محجوزة أو مغلقة.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, checkInDate: '', checkOutDate: '' }))
                    }
                    className="min-h-[36px] rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-secondary-700 hover:bg-secondary-100"
                  >
                    عرض كل التواريخ
                  </button>
                </div>
              )}

            {isInitialLoading && filteredChalets.length === 0 ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="h-48 w-full rounded-xl bg-slate-200" />
                    <div className="mt-4 h-4 w-3/4 rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                    <div className="mt-6 h-10 w-full rounded-xl bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : filteredChalets.length === 0 ? (
              !isSupabaseConfigured && activeBrowseChaletsCount === 0 ? (
                <div className="rounded-3xl border border-dashed border-amber-300 bg-white p-8 text-center sm:p-10">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold text-slate-900">
                    لا توجد وحدات متاحة للعرض حالياً
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                    الاتصال بقاعدة البيانات غير مكتمل في هذه البيئة. يمكنك إعادة المحاولة أو إظهار الوحدات التجريبية مؤقتاً للمعاينة أو التواصل معنا للمساعدة.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={isPublicRefreshing}
                      onClick={() => void loadPublicData()}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${isPublicRefreshing ? 'animate-spin' : ''}`} />
                      {isPublicRefreshing ? 'جاري المحاولة...' : 'إعادة المحاولة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSupportOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100"
                    >
                      <MessageCircle className="h-4 w-4" />
                      تواصل معنا
                    </button>
                    {hideFallbackDemos && import.meta.env.VITE_SHOW_DEMO !== 'false' && (
                      <button
                        type="button"
                        onClick={() => setHideFallbackDemos(false)}
                        className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        عرض وحدات تجريبية مؤقتة
                      </button>
                    )}
                  </div>
                </div>
              ) : activeBrowseChaletsCount === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-10">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                    <Home className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold text-slate-900">
                    لا توجد وحدات متاحة حالياً
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                    لم يتم نشر وحدات نشطة بعد أو تعذر تحميل القائمة مؤقتاً. يمكنك إعادة المحاولة لتحديث الوحدات، أو التواصل معنا لطلب وحدة مناسبة، أو إضافة أول وحدة لك كمضيف.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={isPublicRefreshing}
                      onClick={() => void loadPublicData()}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${isPublicRefreshing ? 'animate-spin' : ''}`} />
                      {isPublicRefreshing ? 'جاري التحديث...' : 'إعادة المحاولة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSupportOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100"
                    >
                      <MessageCircle className="h-4 w-4" />
                      تواصل معنا
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(true)}
                      className="min-h-[44px] rounded-xl bg-secondary-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-secondary-600"
                    >
                      أضف أول وحدة الآن
                    </button>
                    {hideFallbackDemos && import.meta.env.VITE_SHOW_DEMO !== 'false' && (
                      <button
                        type="button"
                        onClick={() => setHideFallbackDemos(false)}
                        className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        عرض بيانات تجريبية مؤقتة
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                    <Umbrella className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">
                    لا توجد وحدات مطابقة لشروط البحث والتواريخ الحالية
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    جرّب تعديل تواريخ الوصول والمغادرة أو اختيار محافظة أخرى، أو تواصل معنا لنساعدك في إيجاد الوحدة المناسبة.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="min-h-[44px] rounded-xl bg-secondary-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-secondary-600"
                    >
                      عرض كل وحدات الإيجار في مصر
                    </button>
                    <button
                      type="button"
                      disabled={isPublicRefreshing}
                      onClick={() => void loadPublicData()}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${isPublicRefreshing ? 'animate-spin' : ''}`} />
                      إعادة المحاولة
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSupportOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100"
                    >
                      <MessageCircle className="h-4 w-4" />
                      تواصل معنا
                    </button>
                  </div>
                </div>
              )
            ) : viewMode === 'map' ? (
              <Suspense fallback={<LazySectionLoader />}>
                <ChaletsMapView
                  chalets={filteredChalets}
                  rentalDuration={filters.rentalDuration}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  onSelectChalet={(item) => setSelectedChaletId(item.id)}
                />
              </Suspense>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredChalets.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    rentalDuration={filters.rentalDuration}
                    checkInDate={filters.checkInDate}
                    checkOutDate={filters.checkOutDate}
                    isFavorite={favorites.includes(property.id)}
                    isCompared={compareIds.includes(property.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onToggleCompare={handleToggleCompare}
                    onSelect={(item) => setSelectedChaletId(item.id)}
                  />
                ))}
              </div>
            )}

            <section className="mt-14 rounded-3xl bg-gradient-to-l from-primary-600 to-primary-900 p-6 text-white shadow-lg sm:p-8">
              <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sand-100">
                    <Sparkles className="h-3.5 w-3.5 text-accent-300" />
                    <span>هل لديك شقة مفروشة أو شاليه أو فيلا للإيجار؟</span>
                  </div>
                  <h3 className="mt-2.5 text-xl font-extrabold sm:text-2xl">
                    انشر وحدتك للإيجار في دقيقتين واستقبل الطلبات مباشرة عبر واتساب والهاتف
                  </h3>
                  <p className="mt-1.5 text-sm text-primary-100">
                    اختر صفتك (مالك أصلي / مالك مؤسس / وسيط معتمد)، حدد أسعارك اليومية والأسبوعية والشهرية، وأدر تقويم التوافر مجاناً.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="min-h-[44px] shrink-0 rounded-xl bg-secondary-500 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-secondary-600"
                >
                  أضف وحدتك الآن
                </button>
              </div>
            </section>
          </main>
        </>
      )}

      {comparedChalets.length > 0 && activeSection === 'browse' && (
        <div className="sticky bottom-4 z-30 mx-auto mb-4 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-primary-200 bg-white/95 p-3 shadow-xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700">
                <Scale className="h-4 w-4" />
                المقارنة ({comparedChalets.length}/3):
              </span>
              {comparedChalets.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-primary-800"
                >
                  <span className="max-w-[120px] truncate">{c.resort}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleCompare(c.id)}
                    aria-label={`إزالة ${c.resort}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-primary-600 hover:bg-primary-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareIds([])}
                className="min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                مسح
              </button>
              <button
                type="button"
                onClick={() => setIsCompareOpen(true)}
                className="min-h-[44px] rounded-xl bg-secondary-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-secondary-600"
              >
                قارن الآن ({comparedChalets.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 font-bold text-primary-700">
            <Home className="h-4 w-4 text-secondary-500" />
            <span>
              AgzStay - إجازة ستاي — منصة مصر الشاملة للإيجار المفروش والشاليهات اليومي والأسبوعي والشهري
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span>القاهرة الكبرى • الإسكندرية • الساحل • السخنة • البحر الأحمر • الدلتا والصعيد</span>
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              تواصل معنا
            </button>
          </div>
        </div>
      </footer>

      {selectedChalet && (
        <Suspense fallback={<LazySectionLoader />}>
          <PropertyDetailModal
            currentUser={currentUser}
            chalet={selectedChalet}
            reviews={reviews.filter((r) => r.chaletId === selectedChalet.id)}
            allBookingsForChalet={allKnownBookings.filter((b) => b.chaletId === selectedChalet.id)}
            bookedRangesForChalet={activeBookedRanges.filter((r) => r.chaletId === selectedChalet.id)}
            defaultDuration={filters.rentalDuration}
            initialCheckIn={filters.checkInDate}
            initialCheckOut={filters.checkOutDate}
            reportsCount={reportCounts[selectedChalet.id] ?? 0}
            onClose={() => setSelectedChaletId(null)}
            onOpenAuth={() => setIsAuthOpen(true)}
            onSubmitBooking={handleAddBooking}
            onSubmitReview={handleAddReview}
            onDeleteReview={handleDeleteReview}
            onReportListing={handleReportListing}
          />
        </Suspense>
      )}

      {isAddModalOpen && (
        <Suspense fallback={<LazySectionLoader />}>
          <AddPropertyModal
            currentUser={currentUser}
            verification={ownerVerification}
            hostTier={currentHostTier}
            activeCustomUnitsCount={ownedChalets.length}
            onClose={() => setIsAddModalOpen(false)}
            onOpenAuth={() => setIsAuthOpen(true)}
            onAddProperty={handleAddProperty}
            onOpenVerification={() => setIsVerificationOpen(true)}
            onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
          />
        </Suspense>
      )}

      {isBookingsOpen && (
        <BookingsDrawer
          bookings={myBookings}
          chalets={allChalets}
          reviews={reviews}
          renterTrustReviews={renterTrustReviews}
          loading={scopedDataLoading}
          error={scopedDataError}
          onRetry={() => void loadUserScopedData(currentUser)}
          onClose={() => setIsBookingsOpen(false)}
          onSubmitPaymentReceipt={handleSubmitPaymentReceipt}
          onCancelBookingWithPolicy={handleCancelBookingWithPolicy}
          onRemoveBookingRecord={handleRemoveBookingRecord}
          onSubmitReview={handleAddReview}
          onOpenChalet={(chaletId) => setSelectedChaletId(chaletId)}
        />
      )}

      {isVerificationOpen && (
        <OwnerVerificationModal
          currentUser={currentUser}
          existingSubmission={ownerVerification}
          onClose={() => setIsVerificationOpen(false)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onSubmitVerification={handleSubmitVerification}
        />
      )}

      {isUpgradeModalOpen && (
        <SubscriptionUpgradeModal
          defaultHostName={ownerVerification?.ownerName || currentUser?.name || ''}
          defaultHostPhone={ownerVerification?.phone || currentUser?.phone || ''}
          existingSubscription={currentHostSubscription}
          onClose={() => setIsUpgradeModalOpen(false)}
          onSubmitUpgradeRequest={handleSubmitUpgradeRequest}
        />
      )}

      {isAuthOpen && (
        <AuthModal
          onClose={() => setIsAuthOpen(false)}
          onAuthenticated={(user) => {
            setCurrentUser(user);
            void loadUserScopedData(user);
          }}
        />
      )}

      {isCompareOpen && (
        <Suspense fallback={<LazySectionLoader />}>
          <CompareModal
            chalets={comparedChalets}
            onClose={() => setIsCompareOpen(false)}
            onRemoveChalet={handleToggleCompare}
            onSelectChalet={(c) => setSelectedChaletId(c.id)}
          />
        </Suspense>
      )}

      {isSupportOpen && (
        <Suspense fallback={null}>
          <SupportContactModal
            onClose={() => setIsSupportOpen(false)}
            onOpenAddProperty={() => setIsAddModalOpen(true)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
