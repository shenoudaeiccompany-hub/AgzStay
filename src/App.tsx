import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Home, Scale, ShieldCheck, Sparkles, Umbrella, X } from 'lucide-react';
import { AddPropertyModal } from '@/components/AddPropertyModal';
import { AuthModal } from '@/components/AuthModal';
import { BookingsDrawer } from '@/components/BookingsDrawer';
import { ChaletsMapView } from '@/components/ChaletsMapView';
import { CompareModal } from '@/components/CompareModal';
import { FilterBar } from '@/components/FilterBar';
import { HeroSearch } from '@/components/HeroSearch';
import { HostDashboard } from '@/components/HostDashboard';
import { MarketPriceGuide } from '@/components/MarketPriceGuide';
import { Navbar } from '@/components/Navbar';
import { OwnerVerificationModal } from '@/components/OwnerVerificationModal';
import { PropertyCard } from '@/components/PropertyCard';
import { PropertyDetailModal } from '@/components/PropertyDetailModal';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import {
  DESTINATION_DEFAULT_COORDINATES,
  INITIAL_CHALETS,
  getRentalPriceForDuration,
  resolveGovernorateId,
} from '@/data/chalets';
import {
  fetchRemoteChalets,
  loadInitialBookings,
  loadInitialRenterTrustReviews,
  loadInitialVerification,
  loadLocalJson,
  masayefStorageKeys,
  persistRemoteBooking,
  persistRemoteChalet,
  persistRemoteRenterTrustReview,
  persistRemoteReport,
  persistRemoteReview,
  saveLocalJson,
  signOutUser,
} from '@/services/masayefRepository';
import {
  calculateNightsBetween,
  daysUntilDate,
  formatArabicDate,
  isChaletAvailableForRange,
} from '@/utils/bookingPricing';
import type {
  AmenityId,
  AppSectionTab,
  AppUser,
  BookingRequest,
  Chalet,
  ChaletReview,
  FilterState,
  GovernorateId,
  ListingReport,
  OwnerVerificationSubmission,
  PropertyReviewTag,
  RentalDuration,
  RenterTrustReview,
  RenterTrustTag,
  SortOption,
  UnitType,
  UserMode,
  ViewMode,
  ViewType,
} from '@/types/chalet';

type ChaletConfigOverride = Partial<
  Pick<
    Chalet,
    | 'title'
    | 'description'
    | 'availabilityStatus'
    | 'pricePerNight'
    | 'weeklyPrice'
    | 'monthlyPrice'
    | 'weekendPricePerNight'
    | 'peakPricePerNight'
    | 'securityDeposit'
    | 'downPaymentPercent'
    | 'depositType'
    | 'fixedDepositAmount'
    | 'includesPasses'
    | 'blockedDates'
    | 'dateRules'
    | 'owner'
  >
>;

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

export function App() {
  const [remoteChalets, setRemoteChalets] = useState<Chalet[]>([]);
  const [customChalets, setCustomChalets] = useState<Chalet[]>(() =>
    loadLocalJson<Chalet[]>(masayefStorageKeys.customChalets, [])
  );
  const [chaletOverrides, setChaletOverrides] = useState<Record<string, ChaletConfigOverride>>(
    () => loadLocalJson<Record<string, ChaletConfigOverride>>(masayefStorageKeys.chaletOverrides, {})
  );
  const [favorites, setFavorites] = useState<string[]>(() =>
    loadLocalJson<string[]>(masayefStorageKeys.favorites, [])
  );
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    loadLocalJson<string[]>(masayefStorageKeys.compareIds, [])
  );
  const [bookings, setBookings] = useState<BookingRequest[]>(() =>
    loadInitialBookings()
  );
  const [reviews, setReviews] = useState<ChaletReview[]>(() =>
    loadLocalJson<ChaletReview[]>(masayefStorageKeys.reviews, [])
  );
  const [renterTrustReviews, setRenterTrustReviews] = useState<RenterTrustReview[]>(() =>
    loadInitialRenterTrustReviews()
  );
  const [reports, setReports] = useState<ListingReport[]>(() =>
    loadLocalJson<ListingReport[]>(masayefStorageKeys.reports, [])
  );
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() =>
    loadLocalJson<AppUser | null>(masayefStorageKeys.user, null)
  );
  const [ownerVerification, setOwnerVerification] =
    useState<OwnerVerificationSubmission | null>(() => loadInitialVerification());

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [userMode, setUserMode] = useState<UserMode>('renter');
  const [activeSection, setActiveSection] = useState<AppSectionTab>('browse');
  const [selectedChaletId, setSelectedChaletId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('chalet');
    } catch {
      return null;
    }
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isVerificationOpen, setIsVerificationOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetchRemoteChalets().then((data) => {
      if (active && data) {
        setRemoteChalets(data);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selectedChaletId) {
        url.searchParams.set('chalet', selectedChaletId);
      } else {
        url.searchParams.delete('chalet');
      }
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Ignore history API errors
    }
  }, [selectedChaletId]);

  useEffect(() => saveLocalJson(masayefStorageKeys.favorites, favorites), [favorites]);
  useEffect(() => saveLocalJson(masayefStorageKeys.compareIds, compareIds), [compareIds]);
  useEffect(() => saveLocalJson(masayefStorageKeys.bookings, bookings), [bookings]);
  useEffect(() => saveLocalJson(masayefStorageKeys.customChalets, customChalets), [customChalets]);
  useEffect(
    () => saveLocalJson(masayefStorageKeys.chaletOverrides, chaletOverrides),
    [chaletOverrides]
  );
  useEffect(() => saveLocalJson(masayefStorageKeys.reviews, reviews), [reviews]);
  useEffect(
    () => saveLocalJson(masayefStorageKeys.renterReviews, renterTrustReviews),
    [renterTrustReviews]
  );
  useEffect(() => saveLocalJson(masayefStorageKeys.reports, reports), [reports]);
  useEffect(() => saveLocalJson(masayefStorageKeys.user, currentUser), [currentUser]);
  useEffect(
    () => saveLocalJson(masayefStorageKeys.verification, ownerVerification),
    [ownerVerification]
  );

  const allChalets = useMemo(() => {
    const normalizedCustom = customChalets
      .filter((item) => (item.listingMode as string | undefined) !== 'sale')
      .map((chalet) => ({
        ...chalet,
        listingMode: 'rent' as const,
        unitType: normalizeUnitType(chalet.unitType),
        viewType: chalet.viewType ?? 'city-nile',
        includesPasses: chalet.includesPasses ?? true,
        coordinates:
          chalet.coordinates ?? DESTINATION_DEFAULT_COORDINATES[chalet.destination],
      }));

    const seenIds = new Set<string>();
    const combined = [...normalizedCustom, ...remoteChalets, ...INITIAL_CHALETS].filter(
      (item) => {
        if ((item.listingMode as string | undefined) === 'sale') return false;
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      }
    );

    return combined.map((chalet) => {
      const override = chaletOverrides[chalet.id];
      const mergedChalet = override ? { ...chalet, ...override } : chalet;
      const chaletReviews = reviews.filter((r) => r.chaletId === mergedChalet.id);

      if (chaletReviews.length === 0) {
        return mergedChalet;
      }
      const addedSum = chaletReviews.reduce((acc, r) => acc + r.rating, 0);
      const totalCount = mergedChalet.reviewsCount + chaletReviews.length;
      const weightedAverage =
        (mergedChalet.rating * mergedChalet.reviewsCount + addedSum) / totalCount;

      return {
        ...mergedChalet,
        rating: Math.round(weightedAverage * 100) / 100,
        reviewsCount: totalCount,
      };
    });
  }, [chaletOverrides, customChalets, remoteChalets, reviews]);

  const selectedChalet = useMemo(
    () => allChalets.find((c) => c.id === selectedChaletId) ?? null,
    [allChalets, selectedChaletId]
  );

  const comparedChalets = useMemo(
    () =>
      compareIds
        .map((id) => allChalets.find((c) => c.id === id))
        .filter((c): c is Chalet => Boolean(c)),
    [allChalets, compareIds]
  );

  const reportCountByChaletId = useMemo(() => {
    const map = new Map<string, number>();
    reports.forEach((r) => {
      map.set(r.chaletId, (map.get(r.chaletId) ?? 0) + 1);
    });
    return map;
  }, [reports]);

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
      if ((chalet.availabilityStatus ?? 'active') !== 'active') {
        return false;
      }
      if (
        hasValidDateRange &&
        !isChaletAvailableForRange(
          chalet,
          bookings,
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
      if (filters.favoritesOnly && !favorites.includes(chalet.id)) {
        return false;
      }
      if (filters.directOwnersOnly && chalet.owner.roleType === 'broker') {
        return false;
      }
      if (filters.governorate !== 'all' && resolveGovernorateId(chalet) !== filters.governorate) {
        return false;
      }
      if (filters.area !== 'all' && filters.area.trim() !== '') {
        const locationText = `${chalet.area ?? ''} ${chalet.resort} ${chalet.title}`.toLowerCase();
        if (!locationText.includes(filters.area.toLowerCase())) {
          return false;
        }
      }
      if (filters.unitType !== 'all' && normalizeUnitType(chalet.unitType) !== filters.unitType) {
        return false;
      }
      if (filters.viewType !== 'all' && chalet.viewType !== filters.viewType) {
        return false;
      }
      if (filters.minBedrooms > 0 && chalet.bedrooms < filters.minBedrooms) {
        return false;
      }
      if (filters.passesOnly && !chalet.includesPasses) {
        return false;
      }
      if (filters.maxPrice !== null) {
        const durationPrice = getRentalPriceForDuration(chalet, filters.rentalDuration).price;
        if (durationPrice > filters.maxPrice) {
          return false;
        }
      }
      if (chalet.maxGuests < filters.minGuests) {
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
          `${chalet.title} ${chalet.resort} ${chalet.area ?? ''} ${chalet.destinationLabel} ${chalet.description} ${chalet.owner.name}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });

    const getSortPrice = (c: Chalet) => getRentalPriceForDuration(c, filters.rentalDuration).price;

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
          const aFlagged = (reportCountByChaletId.get(a.id) ?? 0) >= 2 ? 1 : 0;
          const bFlagged = (reportCountByChaletId.get(b.id) ?? 0) >= 2 ? 1 : 0;
          if (aFlagged !== bFlagged) return aFlagged - bFlagged;
          return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.rating - a.rating;
        }
      }
    });
  }, [allChalets, bookings, favorites, filters, reportCountByChaletId]);

  const renterTrustAverage = useMemo(() => {
    if (renterTrustReviews.length === 0) return 5.0;
    return (
      renterTrustReviews.reduce((sum, r) => sum + r.rating, 0) / renterTrustReviews.length
    );
  }, [renterTrustReviews]);

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), id];
      }
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

  const handleAddBooking = (
    payload: Omit<BookingRequest, 'id' | 'status' | 'createdAt'>
  ) => {
    const newBooking: BookingRequest = {
      ...payload,
      id: `booking-${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setBookings((prev) => [newBooking, ...prev]);
    void persistRemoteBooking(newBooking);
  };

  const handleConfirmBookingDeposit = (bookingId: string) => {
    setBookings((prev) =>
      prev.map((item) => {
        if (item.id !== bookingId) return item;
        const confirmedBooking: BookingRequest = {
          ...item,
          status: 'confirmed',
          confirmedAt: new Date().toISOString(),
        };
        void persistRemoteBooking(confirmedBooking);
        return confirmedBooking;
      })
    );
  };

  const handleCancelBookingWithPolicy = (bookingId: string) => {
    setBookings((prev) =>
      prev.map((item) => {
        if (item.id !== bookingId) return item;
        const daysNotice = daysUntilDate(item.checkIn);
        const isForfeited = daysNotice < 10;
        const deposit = item.depositAmount ?? Math.round(item.totalPrice * 0.25);
        const cancelledBooking: BookingRequest = {
          ...item,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancellationDaysNotice: daysNotice,
          depositForfeited: isForfeited,
          forfeitedAmount: isForfeited && item.status === 'confirmed' ? deposit : 0,
        };
        void persistRemoteBooking(cancelledBooking);
        return cancelledBooking;
      })
    );
  };

  const handleRemoveBookingRecord = (id: string) => {
    setBookings((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateChaletConfig = (
    chaletId: string,
    updates: ChaletConfigOverride
  ) => {
    setChaletOverrides((prev) => ({
      ...prev,
      [chaletId]: { ...(prev[chaletId] ?? {}), ...updates },
    }));
  };

  const handleAddProperty = (property: Chalet) => {
    setCustomChalets((prev) => [property, ...prev]);
    void persistRemoteChalet(property);
  };

  const handleDeleteCustomChalet = (chaletId: string) => {
    setCustomChalets((prev) => prev.filter((item) => item.id !== chaletId));
    setChaletOverrides((prev) => {
      const next = { ...prev };
      delete next[chaletId];
      return next;
    });
    if (selectedChaletId === chaletId) {
      setSelectedChaletId(null);
    }
  };

  const handleReportListing = (payload: {
    chaletId: string;
    reason: string;
    details: string;
  }) => {
    const newReport: ListingReport = {
      ...payload,
      id: `report-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setReports((prev) => [newReport, ...prev]);
    void persistRemoteReport(newReport);
  };

  const handleAddReview = (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => {
    const newReview: ChaletReview = {
      ...payload,
      id: `review-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setReviews((prev) => [newReview, ...prev]);
    void persistRemoteReview(newReview);
  };

  const handleDeleteReview = (reviewId: string) => {
    setReviews((prev) => prev.filter((item) => item.id !== reviewId));
  };

  const handleAddRenterTrustReview = (payload: {
    bookingId: string;
    chaletTitle: string;
    renterName: string;
    renterPhone: string;
    hostName: string;
    rating: number;
    punctualityScore: number;
    propertyCareScore: number;
    tags: RenterTrustTag[];
    comment: string;
  }) => {
    const newTrustReview: RenterTrustReview = {
      ...payload,
      id: `trust-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setRenterTrustReviews((prev) => [newTrustReview, ...prev]);
    void persistRemoteRenterTrustReview(newTrustReview);
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    void signOutUser();
  };

  const handleSwitchUserMode = (mode: UserMode) => {
    setUserMode(mode);
    setActiveSection(mode === 'host' ? 'host-dashboard' : 'browse');
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const pendingHostInquiriesCount = bookings.filter((b) => b.status === 'pending').length;

  const durationTitleSuffix =
    filters.rentalDuration === 'monthly'
      ? 'للإيجار الشهري'
      : filters.rentalDuration === 'weekly'
      ? 'للإيجار الأسبوعي'
      : 'للإيجار اليومي';

  return (
    <div className="flex min-h-screen flex-col bg-sand-100">
      <PwaInstallBanner />

      <Navbar
        activeSection={activeSection}
        userMode={userMode}
        favoritesCount={favorites.length}
        bookingsCount={bookings.length}
        pendingHostInquiriesCount={pendingHostInquiriesCount}
        renterTrustAverage={renterTrustAverage}
        favoritesOnly={filters.favoritesOnly}
        currentUser={currentUser}
        onSelectSection={(section) => {
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
        <HostDashboard
          chalets={allChalets}
          customChaletIds={customChalets.map((c) => c.id)}
          bookings={bookings}
          renterTrustReviews={renterTrustReviews}
          verification={ownerVerification}
          onBackToRenterMode={() => handleSwitchUserMode('renter')}
          onOpenAddProperty={() => setIsAddModalOpen(true)}
          onOpenVerification={() => setIsVerificationOpen(true)}
          onConfirmBookingDeposit={handleConfirmBookingDeposit}
          onCancelBookingWithPolicy={handleCancelBookingWithPolicy}
          onUpdateChaletConfig={handleUpdateChaletConfig}
          onDeleteCustomChalet={handleDeleteCustomChalet}
          onAddRenterTrustReview={handleAddRenterTrustReview}
        />
      ) : activeSection === 'price-guide' ? (
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
            onMinBedroomsChange={(minBedrooms) => setFilters((prev) => ({ ...prev, minBedrooms }))}
            onTogglePassesOnly={() =>
              setFilters((prev) => ({ ...prev, passesOnly: !prev.passesOnly }))
            }
            onMaxPriceChange={(maxPrice) => setFilters((prev) => ({ ...prev, maxPrice }))}
            onSortChange={(sortBy: SortOption) => setFilters((prev) => ({ ...prev, sortBy }))}
            onViewModeChange={setViewMode}
            onReset={resetFilters}
          />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-extrabold text-primary-700">
                  {filters.favoritesOnly
                    ? 'الوحدات المفضلة'
                    : `الشقق المفروشة والشاليهات المتاحة ${durationTitleSuffix}`}
                </h2>
                <p className="text-sm text-slate-600">
                  عرض {filteredChalets.length} من أصل {activeBrowseChaletsCount} وحدة إيجار موثقة في مختلف المحافظات
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-primary-700 shadow-sm">
                <ShieldCheck className="h-4 w-4 text-success-500" />
                <span>شفافية تسعيرية كاملة — ملاك موثقون ووسطاء معتمدون</span>
              </div>
            </div>

            {filters.checkInDate &&
              filters.checkOutDate &&
              calculateNightsBetween(filters.checkInDate, filters.checkOutDate) > 0 && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-secondary-200 bg-secondary-50/80 px-4 py-3 text-xs font-bold text-secondary-900">
                  <div className="flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 shrink-0 text-secondary-600" />
                    <span>
                      يتم عرض الوحدات المتاحة بالكامل فقط من{' '}
                      {formatArabicDate(filters.checkInDate)} إلى{' '}
                      {formatArabicDate(filters.checkOutDate)} (
                      {calculateNightsBetween(filters.checkInDate, filters.checkOutDate).toLocaleString('ar-EG')}{' '}
                      ليالٍ) — تم استبعاد أي وحدة بها ليلة محجوزة أو مغلقة.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, checkInDate: '', checkOutDate: '' }))
                    }
                    className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-secondary-700 hover:bg-secondary-100"
                  >
                    عرض كل التواريخ
                  </button>
                </div>
              )}

            {filteredChalets.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                  <Umbrella className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  لا توجد وحدات مطابقة لشروط البحث والتواريخ الحالية
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  جرّب تعديل تواريخ الوصول والمغادرة أو اختيار محافظة أخرى لعرض الوحدات المتاحة.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 rounded-xl bg-secondary-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-secondary-600"
                >
                  عرض كل وحدات الإيجار في مصر
                </button>
              </div>
            ) : viewMode === 'map' ? (
              <ChaletsMapView
                chalets={filteredChalets}
                rentalDuration={filters.rentalDuration}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onSelectChalet={(item) => setSelectedChaletId(item.id)}
              />
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
                  className="shrink-0 rounded-xl bg-secondary-500 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-secondary-600"
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
                    className="rounded-full p-0.5 text-primary-600 hover:bg-primary-100"
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
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                مسح
              </button>
              <button
                type="button"
                onClick={() => setIsCompareOpen(true)}
                className="rounded-xl bg-secondary-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-secondary-600"
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
          <div>القاهرة الكبرى • الإسكندرية • الساحل • السخنة • البحر الأحمر • الدلتا والصعيد</div>
        </div>
      </footer>

      {selectedChalet && (
        <PropertyDetailModal
          chalet={selectedChalet}
          reviews={reviews.filter((r) => r.chaletId === selectedChalet.id)}
          allBookingsForChalet={bookings.filter((b) => b.chaletId === selectedChalet.id)}
          defaultDuration={filters.rentalDuration}
          initialCheckIn={filters.checkInDate}
          initialCheckOut={filters.checkOutDate}
          reportsCount={reportCountByChaletId.get(selectedChalet.id) ?? 0}
          onClose={() => setSelectedChaletId(null)}
          onSubmitBooking={handleAddBooking}
          onSubmitReview={handleAddReview}
          onDeleteReview={handleDeleteReview}
          onReportListing={handleReportListing}
        />
      )}

      {isAddModalOpen && (
        <AddPropertyModal
          verification={ownerVerification}
          onClose={() => setIsAddModalOpen(false)}
          onAddProperty={handleAddProperty}
          onOpenVerification={() => setIsVerificationOpen(true)}
        />
      )}

      {isBookingsOpen && (
        <BookingsDrawer
          bookings={bookings}
          reviews={reviews}
          renterTrustReviews={renterTrustReviews}
          onClose={() => setIsBookingsOpen(false)}
          onCancelBookingWithPolicy={handleCancelBookingWithPolicy}
          onRemoveBookingRecord={handleRemoveBookingRecord}
          onSubmitReview={handleAddReview}
          onOpenChalet={(chaletId) => setSelectedChaletId(chaletId)}
        />
      )}

      {isVerificationOpen && (
        <OwnerVerificationModal
          existingSubmission={ownerVerification}
          onClose={() => setIsVerificationOpen(false)}
          onSubmitVerification={setOwnerVerification}
        />
      )}

      {isAuthOpen && (
        <AuthModal
          onClose={() => setIsAuthOpen(false)}
          onAuthenticated={setCurrentUser}
        />
      )}

      {isCompareOpen && (
        <CompareModal
          chalets={comparedChalets}
          onClose={() => setIsCompareOpen(false)}
          onRemoveChalet={handleToggleCompare}
          onSelectChalet={(c) => setSelectedChaletId(c.id)}
        />
      )}
    </div>
  );
}

export default App;
