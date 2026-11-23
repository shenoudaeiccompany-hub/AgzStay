import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DESTINATION_DEFAULT_COORDINATES,
  INITIAL_CHALETS,
  PRO_TIER_MONTHLY_FEE,
} from '@/data/chalets';
import {
  approveBookingRequestRpc,
  becomeHostAccount,
  cancelBookingWithPolicyRpc,
  completeBookingStayRpc,
  confirmBookingPaymentRpc,
  createBookingCompat,
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
  markAllNotificationsAsRead,
  markNotificationAsRead,
  onAuthStateChange,
  rejectBookingRequestRpc,
  reviewOwnerVerificationAdmin,
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
  formatIsoDate,
  type BookingRangeLike,
} from '@/utils/bookingPricing';
import type {
  AppNotification,
  AppUser,
  BookedDateRange,
  BookingRequest,
  BookingStatus,
  Chalet,
  ChaletReview,
  HostSubscriptionRecord,
  HostTier,
  OwnerVerificationSubmission,
  PaymentMethod,
  PropertyReviewTag,
  RenterTrustReview,
  RenterTrustTag,
  UnitType,
} from '@/types/chalet';

function normalizeUnitType(unitType: UnitType | undefined): UnitType {
  if (unitType === 'ground-garden') return 'chalet';
  if (unitType === 'penthouse') return 'duplex';
  return unitType ?? 'chalet';
}

export function useAgzStayData() {
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
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => {
      setActionFeedback((curr) => (curr === msg ? null : curr));
    }, 4500);
  }, []);

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

  const loadUserScopedData = useCallback(async (user: AppUser | null) => {
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
  }, []);

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

  // Realtime booking & notification updates
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

    return combined;
  }, [myChalets, publicChalets, showDemoListings]);

  const ownedChalets = useMemo(
    () =>
      currentUser
        ? allChalets.filter((c) => !c.isDemo && c.ownerId === currentUser.id)
        : [],
    [allChalets, currentUser]
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

  const renterTrustAverage = useMemo(() => {
    if (renterTrustReviews.length === 0) return 5.0;
    return (
      renterTrustReviews.reduce((sum, r) => sum + r.rating, 0) / renterTrustReviews.length
    );
  }, [renterTrustReviews]);

  const refreshBookedRangesAndUser = useCallback(async () => {
    if (currentUser) {
      await loadUserScopedData(currentUser);
    }
    const rangesRes = await fetchAllActiveBookedRanges();
    if (rangesRes.data) setActiveBookedRanges(rangesRes.data);
  }, [currentUser, loadUserScopedData]);

  const handleAddBooking = async (
    payload: Omit<BookingRequest, 'id' | 'status' | 'createdAt'> & {
      status?: BookingStatus;
    }
  ): Promise<RepoResult<BookingRequest>> => {
    const res = await createBookingCompat({
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
    await refreshBookedRangesAndUser();
  };

  const handleRejectBookingRequest = async (bookingId: string, reason?: string) => {
    const res = await rejectBookingRequestRpc(bookingId, reason);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم رفض طلب الحجز وإشعار المستأجر.');
    await refreshBookedRangesAndUser();
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
      await refreshBookedRangesAndUser();
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
    await refreshBookedRangesAndUser();
  };

  const handleCompleteBookingStay = async (bookingId: string) => {
    const res = await completeBookingStayRpc(bookingId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم تحديد الإقامة كمكتملة وإتاحة التقييم للمستأجر.');
    await refreshBookedRangesAndUser();
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
    await refreshBookedRangesAndUser();
  };

  const handleCancelBookingWithPolicy = async (bookingId: string) => {
    const res = await cancelBookingWithPolicyRpc(bookingId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast('تم إلغاء الحجز وتطبيق سياسة الـ ١٠ أيام من الخادم.');
    await refreshBookedRangesAndUser();
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
    setMyChalets((prev) => prev.map((c) => (c.id === chaletId ? res.data : c)));
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

  const handleDeleteCustomChalet = async (chaletId: string): Promise<boolean> => {
    if (!currentUser) return false;
    const res = await deleteChalet(chaletId, currentUser.id);
    if (res.error) {
      showToast(res.error);
      return false;
    }
    setMyChalets((prev) => prev.filter((item) => item.id !== chaletId));
    setPublicChalets((prev) => prev.filter((item) => item.id !== chaletId));
    return true;
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

  const handleBecomeHost = async (type: 'owner' | 'broker' = 'owner') => {
    const res = await becomeHostAccount(type);
    if (res.error) {
      showToast(res.error);
      return;
    }
    if (res.data) {
      setCurrentUser(res.data);
      await loadUserScopedData(res.data);
    }
    showToast(
      type === 'broker'
        ? 'تم تفعيل حسابك كوسيط عقاري بنجاح.'
        : 'تم تفعيل حسابك كمالك وحدة بنجاح.'
    );
  };

  const handleSignOut = async () => {
    await signOutUser();
    setCurrentUser(null);
    await loadUserScopedData(null);
  };

  return {
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
    handleSignOut,
  };
}
