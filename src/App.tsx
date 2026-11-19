import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  Home,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Umbrella,
  X,
} from 'lucide-react';
import { AddPropertyModal } from '@/components/AddPropertyModal';
import { AdminDashboard } from '@/components/AdminDashboard';
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
import { SubscriptionUpgradeModal } from '@/components/SubscriptionUpgradeModal';
import {
  DESTINATION_DEFAULT_COORDINATES,
  INITIAL_CHALETS,
  PRO_TIER_MONTHLY_FEE,
  getRentalPriceForDuration,
  resolveGovernorateId,
} from '@/data/chalets';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  agzstayStorageKeys,
  approveBookingRequestRpc,
  cancelBookingWithPolicyRpc,
  completeBookingStayRpc,
  confirmBookingPaymentRpc,
  createBooking,
  createChalet,
  createListingReport,
  createRenterTrustReview,
  createReview,
  deleteChalet,
  deleteReview,
  fetchAllActiveBookedRanges,
  fetchAllBookingsAdmin,
  fetchAllReviews,
  fetchAllSubscriptionsAdmin,
  fetchAllVerificationsAdmin,
  fetchChaletReportCounts,
  fetchHostChaletBookings,
  fetchMyBookings,
  fetchMyChalets,
  fetchMyNotifications,
  fetchMySubscriptions,
  fetchMyVerification,
  fetchPublicChalets,
  fetchRenterTrustReviews,
  getCurrentUser,
  loadLocalJson,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  onAuthStateChange,
  rejectBookingRequestRpc,
  reviewOwnerVerificationAdmin,
  saveLocalJson,
  signOutUser,
  submitHostSubscription,
  submitOwnerVerification,
  subscribeToBookingsChanges,
  subscribeToNotifications,
  syncBookingLifecycleStatusesRpc,
  updateChalet,
  updateSubscriptionStatusAdmin,
  type RepoResult,
} from '@/services/agzstayRepository';
import { getPaymentProvider } from '@/services/payments/paymentProvider';
import {
  addDaysIso,
  calculateNightsBetween,
  formatArabicDate,
  formatIsoDate,
  isChaletAvailableForRange,
  type BookingRangeLike,
} from '@/utils/bookingPricing';
import type {
  AmenityId,
  AppNotification,
  AppSectionTab,
  AppUser,
  BookedDateRange,
  BookingRequest,
  BookingStatus,
  Chalet,
  ChaletReview,
  FilterState,
  GovernorateId,
  HostSubscriptionRecord,
  HostTier,
  OwnerVerificationSubmission,
  PaymentMethod,
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
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [publicChalets, setPublicChalets] = useState<Chalet[]>([]);
  const [myChalets, setMyChalets] = useState<Chalet[]>([]);
  const [activeBookedRanges, setActiveBookedRanges] = useState<BookedDateRange[]>([]);
  const [myBookings, setMyBookings] = useState<BookingRequest[]>([]);
  const [hostBookings, setHostBookings] = useState<BookingRequest[]>([]);
  const [adminBookings, setAdminBookings] = useState<BookingRequest[]>([]);
  const [reviews, setReviews] = useState<ChaletReview[]>([]);
  const [renterTrustReviews, setRenterTrustReviews] = useState<RenterTrustReview[]>([]);
  const [reportCounts, setReportCounts] = useState<Record<string, number>>({});
  const [ownerVerification, setOwnerVerification] =
    useState<OwnerVerificationSubmission | null>(null);
  const [adminVerifications, setAdminVerifications] = useState<OwnerVerificationSubmission[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<HostSubscriptionRecord[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<HostSubscriptionRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [publicLoadError, setPublicLoadError] = useState<string | null>(null);
  const [scopedDataLoading, setScopedDataLoading] = useState(false);
  const [scopedDataError, setScopedDataError] = useState<string | null>(null);

  // Client-only UI preferences (strictly allowed in localStorage)
  const [favorites, setFavorites] = useState<string[]>(() =>
    loadLocalJson<string[]>(agzstayStorageKeys.favorites, [])
  );
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    loadLocalJson<string[]>(agzstayStorageKeys.compareIds, [])
  );

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [userMode, setUserMode] = useState<UserMode>('renter');
  const [activeSection, setActiveSection] = useState<AppSectionTab>(() => {
    try {
      return window.location.pathname === '/admin' ? 'admin' : 'browse';
    } catch {
      return 'browse';
    }
  });
  const [selectedChaletId, setSelectedChaletId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('unit') || params.get('chalet');
      if (fromQuery) return fromQuery;
      const pathMatch = window.location.pathname.match(/\/(?:unit|chalet)\/([^/]+)/);
      return pathMatch?.[1] ?? null;
    } catch {
      return null;
    }
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isVerificationOpen, setIsVerificationOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadPublicData = useCallback(async () => {
    setPublicLoadError(null);
    try {
      const [chaletsRes, rangesRes, reviewsRes, reportsRes, trustRes] = await Promise.all([
        fetchPublicChalets(),
        fetchAllActiveBookedRanges(),
        fetchAllReviews(),
        fetchChaletReportCounts(),
        fetchRenterTrustReviews(),
      ]);

      if (chaletsRes.error) {
        setPublicLoadError(chaletsRes.error);
      } else if (chaletsRes.data) {
        setPublicChalets(chaletsRes.data);
      }
      if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
      if (reviewsRes.data) setReviews(reviewsRes.data);
      if (reportsRes.data) setReportCounts(reportsRes.data);
      if (trustRes.data) setRenterTrustReviews(trustRes.data);
    } catch {
      setPublicLoadError('تعذر تحميل بيانات الوحدات من الخادم. يرجى المحاولة مجدداً.');
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async (userId: string) => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    const notifRes = await fetchMyNotifications(userId);
    if (notifRes.error) {
      setNotificationsError(notifRes.error);
    } else {
      setNotifications(notifRes.data ?? []);
    }
    setNotificationsLoading(false);
  }, []);

  const loadUserScopedData = useCallback(
    async (user: AppUser | null) => {
      if (!user) {
        setMyChalets([]);
        setMyBookings([]);
        setHostBookings([]);
        setAdminBookings([]);
        setOwnerVerification(null);
        setAdminVerifications([]);
        setMySubscriptions([]);
        setAdminSubscriptions([]);
        setNotifications([]);
        setNotificationsError(null);
        setScopedDataError(null);
        setScopedDataLoading(false);
        return;
      }

      setScopedDataLoading(true);
      setScopedDataError(null);

      try {
        await syncBookingLifecycleStatusesRpc();

        const [ownedRes, myBookingsRes, verRes, subRes, notifRes] = await Promise.all([
          fetchMyChalets(user.id),
          fetchMyBookings(user.id),
          fetchMyVerification(user.id),
          fetchMySubscriptions(user.id),
          fetchMyNotifications(user.id),
        ]);

        const firstErr =
          ownedRes.error || myBookingsRes.error || verRes.error || subRes.error || null;
        if (firstErr) {
          setScopedDataError(firstErr);
        }

        const ownedList = ownedRes.data ?? [];
        setMyChalets(ownedList);
        if (myBookingsRes.data) setMyBookings(myBookingsRes.data);
        setOwnerVerification(verRes.data ?? null);
        if (subRes.data) setMySubscriptions(subRes.data);
        if (notifRes.error) {
          setNotificationsError(notifRes.error);
        } else {
          setNotificationsError(null);
          setNotifications(notifRes.data ?? []);
        }

        if (ownedList.length > 0) {
          const hostBookRes = await fetchHostChaletBookings(ownedList.map((c) => c.id));
          if (hostBookRes.error) {
            setScopedDataError((prev) => prev ?? hostBookRes.error);
          } else if (hostBookRes.data) {
            setHostBookings(hostBookRes.data);
          }
        } else {
          setHostBookings([]);
        }

        if (user.role === 'admin') {
          const [allBookRes, allVerRes, allSubRes] = await Promise.all([
            fetchAllBookingsAdmin(),
            fetchAllVerificationsAdmin(),
            fetchAllSubscriptionsAdmin(),
          ]);
          const adminErr = allBookRes.error || allVerRes.error || allSubRes.error || null;
          if (adminErr) {
            setScopedDataError((prev) => prev ?? adminErr);
          }
          if (allBookRes.data) setAdminBookings(allBookRes.data);
          if (allVerRes.data) setAdminVerifications(allVerRes.data);
          if (allSubRes.data) setAdminSubscriptions(allSubRes.data);
        } else {
          setAdminBookings([]);
          setAdminVerifications([]);
          setAdminSubscriptions([]);
        }
      } catch {
        setScopedDataError('تعذر مزامنة بيانات حسابك. يرجى المحاولة مرة أخرى.');
      } finally {
        setScopedDataLoading(false);
      }
    },
    []
  );

  // Initial hydration + auth state listener
  useEffect(() => {
    let active = true;
    void syncBookingLifecycleStatusesRpc().then(() => {
      if (active) void loadPublicData();
    });
    void getCurrentUser().then((res) => {
      if (!active) return;
      setCurrentUser(res.data ?? null);
      void loadUserScopedData(res.data ?? null);
    });

    const unsubAuth = onAuthStateChange((user) => {
      if (!active) return;
      setCurrentUser(user);
      void loadUserScopedData(user);
    });

    return () => {
      active = false;
      unsubAuth();
    };
  }, [loadPublicData, loadUserScopedData]);

  // Realtime booking & notification changes
  useEffect(() => {
    const unsubBookings = subscribeToBookingsChanges(() => {
      void fetchAllActiveBookedRanges().then((res) => {
        if (res.data) setActiveBookedRanges(res.data);
      });
      if (currentUser) {
        void loadUserScopedData(currentUser);
      }
    });

    const unsubNotifications = currentUser
      ? subscribeToNotifications(currentUser.id, () => {
          void loadNotifications(currentUser.id);
        })
      : () => {};

    return () => {
      unsubBookings();
      unsubNotifications();
    };
  }, [currentUser, loadNotifications, loadUserScopedData]);

  // Sync /admin route with browser history
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/admin') {
        setActiveSection('admin');
      } else if (activeSection === 'admin') {
        setActiveSection('browse');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeSection]);

  useEffect(() => {
    try {
      const currentPath = window.location.pathname;
      if (activeSection === 'admin' && currentPath !== '/admin') {
        window.history.pushState(null, '', `/admin${window.location.search}`);
      } else if (activeSection !== 'admin' && currentPath === '/admin') {
        window.history.pushState(null, '', `/${window.location.search}`);
      }
    } catch {
      // Ignore history API errors
    }
  }, [activeSection]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('chalet');
      if (selectedChaletId) {
        url.searchParams.set('unit', selectedChaletId);
      } else {
        url.searchParams.delete('unit');
      }
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Ignore history API errors
    }
  }, [selectedChaletId]);

  useEffect(() => saveLocalJson(agzstayStorageKeys.favorites, favorites), [favorites]);
  useEffect(() => saveLocalJson(agzstayStorageKeys.compareIds, compareIds), [compareIds]);

  const currentHostSubscription = useMemo(
    () => mySubscriptions[0] ?? null,
    [mySubscriptions]
  );

  const currentHostTier: HostTier =
    currentHostSubscription?.tier === 'pro' && currentHostSubscription.status === 'active'
      ? 'pro'
      : 'free';

  const showDemoListings =
    import.meta.env.VITE_SHOW_DEMO === 'true' ||
    (import.meta.env.DEV && publicChalets.length === 0);

  const allChalets = useMemo<Chalet[]>(() => {
    const seenIds = new Set<string>();
    const combined: Chalet[] = [];

    const pushUnique = (list: Chalet[]) => {
      list.forEach((item) => {
        if (seenIds.has(item.id)) return;
        seenIds.add(item.id);
        combined.push({
          ...item,
          listingMode: 'rent',
          unitType: normalizeUnitType(item.unitType),
          viewType: item.viewType ?? 'city-nile',
          includesPasses: item.includesPasses ?? true,
          coordinates:
            item.coordinates ?? DESTINATION_DEFAULT_COORDINATES[item.destination],
        });
      });
    };

    pushUnique(myChalets);
    pushUnique(publicChalets);
    if (showDemoListings) {
      pushUnique(INITIAL_CHALETS);
    }

    // Ratings & reviewsCount are aggregated server-side by Postgres trigger
    return combined;
  }, [myChalets, publicChalets, showDemoListings]);

  // Strict owner isolation for HostDashboard
  const ownedChalets = useMemo(
    () =>
      currentUser
        ? allChalets.filter((c) => !c.isDemo && c.ownerId === currentUser.id)
        : [],
    [allChalets, currentUser]
  );

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
        .filter((c): c is Chalet => Boolean(c)),
    [allChalets, compareIds]
  );

  const allKnownBookings = useMemo(() => {
    const map = new Map<string, BookingRequest>();
    [...myBookings, ...hostBookings, ...adminBookings].forEach((b) => {
      map.set(b.id, b);
    });
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [adminBookings, hostBookings, myBookings]);

  const combinedBookedRanges = useMemo<BookingRangeLike[]>(() => {
    const list: BookingRangeLike[] = activeBookedRanges.map((r) => ({
      chaletId: r.chaletId,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
    }));
    allKnownBookings.forEach((b) => {
      list.push({
        chaletId: b.chaletId,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        nights: b.nights,
        status: b.status,
      });
    });
    return list;
  }, [activeBookedRanges, allKnownBookings]);

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

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => {
      setActionFeedback((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  const handleAddBooking = async (
    payload: Omit<BookingRequest, 'id' | 'status' | 'createdAt'> & {
      status?: BookingStatus;
    }
  ): Promise<RepoResult<BookingRequest>> => {
    const res = await createBooking({
      ...payload,
      status: payload.status ?? 'pending',
    });
    if (res.data) {
      setMyBookings((prev) => [res.data, ...prev]);
      const rangesRes = await fetchAllActiveBookedRanges();
      if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
      if (currentUser) {
        void loadNotifications(currentUser.id);
      }
      showToast('تم إرسال طلب الحجز بنجاح وبانتظار موافقة المالك.');
    }
    return res;
  };

  const handleApproveBookingRequest = async (bookingId: string) => {
    const res = await approveBookingRequestRpc(bookingId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تمت الموافقة المبدئية على الطلب وإرسال بيانات الدفع للمستأجر.');
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  };

  const handleRejectBookingRequest = async (bookingId: string, reason?: string) => {
    const res = await rejectBookingRequestRpc(bookingId, reason);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم رفض طلب الحجز وإشعار المستأجر.');
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  };

  const handleSubmitPaymentReceipt = async (
    bookingId: string,
    file: File,
    reference?: string
  ): Promise<RepoResult<BookingRequest>> => {
    const provider = getPaymentProvider('manual_transfer');
    const res = await provider.submitPaymentProof({ bookingId, file, reference });
    if (res.data) {
      showToast('تم رفع إيصال العربون بنجاح وبانتظار تأكيد المالك.');
      if (currentUser) {
        await loadUserScopedData(currentUser);
      }
      const rangesRes = await fetchAllActiveBookedRanges();
      if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
    }
    return res;
  };

  const handleConfirmBookingDeposit = async (bookingId: string) => {
    const res = await confirmBookingPaymentRpc(bookingId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم تأكيد استلام العربون وتأكيد الحجز نهائياً.');
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  };

  const handleCompleteBookingStay = async (bookingId: string) => {
    const res = await completeBookingStayRpc(bookingId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم تحديد الإقامة كمكتملة وإتاحة التقييم للمستأجر.');
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  };

  const handleRejectBookingAdmin = async (bookingId: string, reason?: string) => {
    const res = await rejectBookingRequestRpc(
      bookingId,
      reason || 'تم رفض طلب الحجز من مراجعة الإدارة'
    );
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم رفض الطلب من الإدارة.');
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  };

  const handleCancelBookingWithPolicy = async (bookingId: string) => {
    const res = await cancelBookingWithPolicyRpc(bookingId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم إلغاء الحجز وتطبيق سياسة الـ ١٠ أيام من الخادم.');
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  };

  const handleRemoveBookingRecord = (id: string) => {
    setMyBookings((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateChaletConfig = async (
    chaletId: string,
    updates: Partial<Chalet>
  ) => {
    if (!currentUser) return;
    const res = await updateChalet(chaletId, currentUser.id, updates);
    if (res.error || !res.data) {
      showToast(res.error || 'تعذر حفظ تعديلات الوحدة.');
      return;
    }
    setMyChalets((prev) =>
      prev.map((c) => (c.id === chaletId ? res.data : c))
    );
    void loadPublicData();
  };

  const handleAddProperty = async (property: Chalet): Promise<RepoResult<Chalet>> => {
    const res = await createChalet({
      ...property,
      ownerPhone: property.owner.phone ?? '01000000000',
      instaPayHandle: property.owner.instaPayHandle,
    });
    if (res.data) {
      setMyChalets((prev) => [res.data, ...prev]);
      void loadPublicData();
    }
    return res;
  };

  const handleDeleteCustomChalet = async (chaletId: string) => {
    if (!currentUser) return;
    const res = await deleteChalet(chaletId, currentUser.id);
    if (res.error) {
      showToast(res.error);
      return;
    }
    setMyChalets((prev) => prev.filter((item) => item.id !== chaletId));
    setPublicChalets((prev) => prev.filter((item) => item.id !== chaletId));
    if (selectedChaletId === chaletId) {
      setSelectedChaletId(null);
    }
  };

  const handleReportListing = async (payload: {
    chaletId: string;
    reason: string;
    details: string;
  }): Promise<RepoResult<boolean>> => {
    const res = await createListingReport(payload);
    if (res.data) {
      const countsRes = await fetchChaletReportCounts();
      if (countsRes.data) setReportCounts(countsRes.data);
    }
    return res;
  };

  const handleAddReview = async (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }): Promise<RepoResult<ChaletReview>> => {
    const res = await createReview(payload);
    if (res.data) {
      setReviews((prev) => [res.data, ...prev]);
      void loadPublicData();
    }
    return res;
  };

  const handleDeleteReview = async (reviewId: string) => {
    const res = await deleteReview(reviewId);
    if (res.data) {
      setReviews((prev) => prev.filter((item) => item.id !== reviewId));
      void loadPublicData();
    }
  };

  const handleAddRenterTrustReview = async (payload: {
    bookingId: string;
    chaletId?: string;
    renterId?: string;
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
    if (!payload.chaletId) {
      showToast('تعذر تحديد معرف الوحدة لتقييم المستأجر.');
      return;
    }
    const res = await createRenterTrustReview({
      bookingId: payload.bookingId,
      chaletId: payload.chaletId,
      renterId: payload.renterId,
      chaletTitle: payload.chaletTitle,
      renterName: payload.renterName,
      renterPhone: payload.renterPhone,
      hostName: payload.hostName,
      rating: payload.rating,
      punctualityScore: payload.punctualityScore,
      propertyCareScore: payload.propertyCareScore,
      tags: payload.tags,
      comment: payload.comment,
    });
    if (res.error || !res.data) {
      showToast(res.error || 'تعذر حفظ تقييم ثقة المستأجر.');
      return;
    }
    setRenterTrustReviews((prev) => [res.data, ...prev]);
  };

  const handleSubmitVerification = async (payload: {
    ownerName: string;
    phone: string;
    documentType: OwnerVerificationSubmission['documentType'];
    documentNumber: string;
    documentPath: string;
    documentPreviewName: string;
  }): Promise<RepoResult<OwnerVerificationSubmission>> => {
    const res = await submitOwnerVerification(payload);
    if (res.data) {
      setOwnerVerification(res.data);
      showToast('تم إرسال مستند التوثيق للمراجعة الإدارية.');
    }
    return res;
  };

  const handleReviewVerification = async (
    verificationId: string,
    decision: 'verified' | 'unverified',
    rejectionReason?: string
  ): Promise<RepoResult<OwnerVerificationSubmission>> => {
    const res = await reviewOwnerVerificationAdmin(verificationId, decision, rejectionReason);
    if (res.data) {
      setAdminVerifications((prev) =>
        prev.map((v) => (v.id === verificationId ? res.data : v))
      );
      void loadPublicData();
      if (currentUser) {
        void loadUserScopedData(currentUser);
      }
      showToast(
        decision === 'verified'
          ? 'تم اعتماد توثيق المالك وتفعيل شارة التوثيق.'
          : 'تم رفض طلب التوثيق مع تسجيل السبب للمالك.'
      );
    } else if (res.error) {
      showToast(res.error);
    }
    return res;
  };

  const handleSubmitUpgradeRequest = async (payload: {
    hostName: string;
    hostPhone: string;
    paymentMethod: PaymentMethod;
    senderPhoneOrHandle: string;
    transferReference: string;
    receiptPath?: string;
  }): Promise<RepoResult<HostSubscriptionRecord>> => {
    const startDate = formatIsoDate(new Date());
    const expiryDate = addDaysIso(startDate, 30);

    const res = await submitHostSubscription({
      ...payload,
      monthlyFee: PRO_TIER_MONTHLY_FEE,
      startDate,
      expiryDate,
    });
    if (res.data) {
      setMySubscriptions((prev) => [res.data, ...prev]);
    }
    return res;
  };

  const handleApproveSubscription = async (subscriptionId: string) => {
    const today = formatIsoDate(new Date());
    const expiry = addDaysIso(today, 30);
    const res = await updateSubscriptionStatusAdmin(subscriptionId, 'active', {
      startDate: today,
      expiryDate: expiry,
    });
    if (res.error) {
      showToast(res.error);
      return;
    }
    if (res.data) {
      setAdminSubscriptions((prev) =>
        prev.map((s) => (s.id === subscriptionId ? res.data : s))
      );
    }
  };

  const handleExpireSubscription = async (subscriptionId: string) => {
    const res = await updateSubscriptionStatusAdmin(subscriptionId, 'expired');
    if (res.error) {
      showToast(res.error);
      return;
    }
    if (res.data) {
      setAdminSubscriptions((prev) =>
        prev.map((s) => (s.id === subscriptionId ? res.data : s))
      );
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await markNotificationAsRead(id);
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!currentUser) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsAsRead(currentUser.id);
  };

  const handleSelectNotification = (notification: AppNotification) => {
    if (!notification.isRead) {
      void handleMarkNotificationRead(notification.id);
    }
    if (notification.type.includes('verification')) {
      setUserMode('host');
      setActiveSection('host-dashboard');
      return;
    }
    if (
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
    await signOutUser();
    setCurrentUser(null);
    await loadUserScopedData(null);
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
      {!isSupabaseConfigured && (
        <div
          className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-extrabold text-amber-950"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>وضع تجريبي: لا يتم حفظ أي بيانات — قم بضبط مفاتيح Supabase للتشغيل الفعلي.</span>
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
            className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
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
          if (section === 'admin' && currentUser?.role !== 'admin') {
            return;
          }
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
          onApproveBookingRequest={handleApproveBookingRequest}
          onRejectBookingRequest={handleRejectBookingRequest}
          onConfirmBookingDeposit={handleConfirmBookingDeposit}
          onCompleteBookingStay={handleCompleteBookingStay}
          onCancelBookingWithPolicy={handleCancelBookingWithPolicy}
          onUpdateChaletConfig={handleUpdateChaletConfig}
          onDeleteCustomChalet={handleDeleteCustomChalet}
          onAddRenterTrustReview={handleAddRenterTrustReview}
        />
      ) : activeSection === 'admin' ? (
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
            {publicLoadError && (
              <div
                role="alert"
                className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{publicLoadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadPublicData()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة المحاولة
                </button>
              </div>
            )}

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
      )}

      {isAddModalOpen && (
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
