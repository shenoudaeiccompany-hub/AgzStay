import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Headphones,
  History,
  Home,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { ArabicDateRangeField } from '@/components/ArabicCalendarPicker';
import { formatEGP } from '@/data/chalets';
import {
  cancelBookingViaRpc,
  fetchBookingAuditTimeline,
  fetchMyBookingsPage,
  getCurrentAuthUser,
  isValidEgyptianMobile,
  modifyBookingViaRpc,
  onAuthStateChange,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutAuth,
  signUpRenterAccount,
} from '@/services/agzstayRepository';
import type {
  AuthUserSummary,
  BookingAuditEvent,
  BookingRecord,
  BookingStatus,
  RouteSection,
} from '@/types/chalet';
import { calculateNightsBetween, formatArabicDate, formatIsoDate } from '@/utils/bookingPricing';

interface MyBookingsPageProps {
  onNavigate: (section: RouteSection) => void;
  onOpenSupport: (bookingId?: string) => void;
  onSelectChaletId?: (chaletId: string) => void;
}

type BookingFilterGroup = 'all' | 'active_review' | 'confirmed_group' | 'completed' | 'closed_group';

const PAGE_SIZE = 8;

const STATUS_META: Record<
  BookingStatus,
  { label: string; badgeClass: string; group: Exclude<BookingFilterGroup, 'all'> }
> = {
  pending: {
    label: 'قيد المراجعة',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    group: 'active_review',
  },
  pending_verification: {
    label: 'بانتظار المراجعة',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    group: 'active_review',
  },
  approved: {
    label: 'موافقة مبدئية',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    group: 'active_review',
  },
  payment_submitted: {
    label: 'تم رفع الإيصال',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    group: 'active_review',
  },
  confirmed: {
    label: 'مؤكد',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    group: 'confirmed_group',
  },
  modified: {
    label: 'معدّل',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    group: 'confirmed_group',
  },
  completed: {
    label: 'مكتمل',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    group: 'completed',
  },
  cancelled: {
    label: 'ملغى',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    group: 'closed_group',
  },
  rejected: {
    label: 'مرفوض',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    group: 'closed_group',
  },
  expired: {
    label: 'منتهي الصلاحية',
    badgeClass: 'bg-stone-100 text-stone-600 border-stone-200',
    group: 'closed_group',
  },
};

function canModifyOrCancel(status: BookingStatus): boolean {
  return (
    status === 'pending' ||
    status === 'pending_verification' ||
    status === 'approved' ||
    status === 'confirmed' ||
    status === 'modified'
  );
}

function formatDateTimeAr(isoString: string): string {
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function MyBookingsPage({
  onNavigate,
  onOpenSupport,
  onSelectChaletId,
}: MyBookingsPageProps) {
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);

  // Auth panel state
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  // Bookings list & pagination state
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');
  const [filterGroup, setFilterGroup] = useState<BookingFilterGroup>('all');
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Expandable audit timeline per booking (cached to avoid redundant requests)
  const [expandedTimelineIds, setExpandedTimelineIds] = useState<Record<string, boolean>>({});
  const [timelineByBookingId, setTimelineByBookingId] = useState<
    Record<string, BookingAuditEvent[]>
  >({});
  const [loadingTimelineId, setLoadingTimelineId] = useState<string | null>(null);

  // Modify booking modal state
  const [editingBooking, setEditingBooking] = useState<BookingRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editGuests, setEditGuests] = useState(2);
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Cancel booking modal state
  const [cancellingBooking, setCancellingBooking] = useState<BookingRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);

  const loadBookings = useCallback(async (targetPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoadingBookings(true);
    setListError('');
    try {
      const res = await fetchMyBookingsPage(targetPage, PAGE_SIZE);
      if (res.error || !res.data) {
        setListError(res.error ?? 'تعذر تحميل الحجوزات الآن.');
        return;
      }
      setBookings((prev) => (append ? [...prev, ...res.data!.items] : res.data!.items));
      setHasMore(res.data.hasMore);
      setPage(targetPage);
    } finally {
      setLoadingBookings(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setAuthChecking(true);
      try {
        const user = await getCurrentAuthUser();
        if (!active) return;
        setAuthUser(user);
        if (user) {
          await loadBookings(0, false);
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    };
    void init();

    const unsubscribe = onAuthStateChange((user) => {
      setAuthUser(user);
      if (user) {
        void loadBookings(0, false);
      } else {
        setBookings([]);
        setHasMore(false);
        setPage(0);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    if (filterGroup === 'all') return bookings;
    return bookings.filter((b) => STATUS_META[b.status]?.group === filterGroup);
  }, [bookings, filterGroup]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    if (authMode === 'forgot') {
      setAuthLoading(true);
      try {
        const res = await sendPasswordResetEmail(cleanEmail, '/bookings');
        if (res.error) {
          setAuthError(res.error);
          return;
        }
        setAuthNotice('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setAuthError('كلمة المرور يجب أن تتكون من ٦ أحرف على الأقل.');
      return;
    }

    if (authMode === 'signup') {
      if (fullName.trim().length < 2) {
        setAuthError('يرجى كتابة الاسم الكامل (حرفين على الأقل).');
        return;
      }
      if (!isValidEgyptianMobile(phone)) {
        setAuthError('يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015.');
        return;
      }
    }

    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const res = await signInWithEmailPassword(cleanEmail, password);
        if (res.error || !res.data) {
          setAuthError(res.error ?? 'تعذر تسجيل الدخول.');
          return;
        }
        setAuthUser(res.data);
        await loadBookings(0, false);
      } else {
        const res = await signUpRenterAccount({
          email: cleanEmail,
          password,
          name: fullName,
          phone,
        });
        if (res.error || !res.data) {
          setAuthError(res.error ?? 'تعذر إنشاء الحساب الجديد.');
          return;
        }
        if (res.data.needsEmailConfirmation) {
          setAuthNotice('تم إنشاء الحساب! يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول.');
          setAuthMode('login');
        } else {
          setAuthUser(res.data.user);
          await loadBookings(0, false);
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleToggleTimeline = async (bookingId: string) => {
    const isCurrentlyOpen = Boolean(expandedTimelineIds[bookingId]);
    setExpandedTimelineIds((prev) => ({ ...prev, [bookingId]: !isCurrentlyOpen }));
    if (isCurrentlyOpen || timelineByBookingId[bookingId]) {
      return;
    }
    setLoadingTimelineId(bookingId);
    try {
      const res = await fetchBookingAuditTimeline(bookingId);
      if (!res.error && res.data) {
        setTimelineByBookingId((prev) => ({ ...prev, [bookingId]: res.data! }));
      }
    } finally {
      setLoadingTimelineId(null);
    }
  };

  const openEditModal = (booking: BookingRecord) => {
    setEditingBooking(booking);
    setEditCheckIn(booking.checkIn);
    setEditCheckOut(booking.checkOut);
    setEditGuests(Math.max(1, booking.guests));
    setEditNote(booking.modificationNote ?? '');
    setEditError('');
  };

  const handleConfirmModify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    setEditError('');

    const nights = calculateNightsBetween(editCheckIn, editCheckOut);
    if (!editCheckIn || !editCheckOut || nights < 1) {
      setEditError('يرجى اختيار تاريخ وصول ومغادرة صحيحين (ليلة واحدة على الأقل).');
      return;
    }
    if (editCheckIn < todayIso) {
      setEditError('لا يمكن تحديد تاريخ وصول في الماضي.');
      return;
    }
    if (editGuests < 1 || editGuests > 25) {
      setEditError('يرجى تحديد عدد ضيوف صحيح.');
      return;
    }

    setSubmittingEdit(true);
    try {
      const res = await modifyBookingViaRpc({
        bookingId: editingBooking.id,
        checkIn: editCheckIn,
        checkOut: editCheckOut,
        guests: editGuests,
        note: editNote,
      });

      if (res.error || !res.data) {
        setEditError(res.error ?? 'تعذر حفظ تعديل الحجز.');
        return;
      }

      const updated = res.data;
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      // Invalidate cached audit timeline for this booking so next toggle loads latest audit entry
      setTimelineByBookingId((prev) => {
        const copy = { ...prev };
        delete copy[updated.id];
        return copy;
      });
      setEditingBooking(null);
      setActionBanner({
        type: 'success',
        text: `تم تعديل الحجز وإعادة احتساب السعر من الخادم بنجاح (${formatEGP(updated.totalPrice)}).`,
      });
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingBooking) return;
    setCancelError('');
    setSubmittingCancel(true);
    try {
      const res = await cancelBookingViaRpc(cancellingBooking.id, cancelReason);
      if (res.error || !res.data) {
        setCancelError(res.error ?? 'تعذر إلغاء الحجز الآن.');
        return;
      }

      const updated = res.data;
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setTimelineByBookingId((prev) => {
        const copy = { ...prev };
        delete copy[updated.id];
        return copy;
      });
      setCancellingBooking(null);
      setCancelReason('');
      setActionBanner({
        type: 'success',
        text: 'تم إلغاء الحجز وتسجيل التحديث في سجل العمليات بنجاح.',
      });
    } finally {
      setSubmittingCancel(false);
    }
  };

  if (authChecking) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6" aria-busy="true">
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-2xl border border-stone-200/70 bg-white p-6" />
          <div className="h-44 animate-pulse rounded-2xl border border-stone-200/70 bg-white p-6" />
          <div className="h-44 animate-pulse rounded-2xl border border-stone-200/70 bg-white p-6" />
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1E3A5F] text-white">
            <Lock className="h-6 w-6 text-[#C5A880]" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#1E3A5F]">حجوزاتي ومتابعة الطلبات</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280] sm:text-sm">
            سجّل دخولك لمتابعة حالة حجوزاتك، الاطلاع على سجل التحديثات، تعديل المواعيد، أو التواصل مع خدمة العملاء.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-[#FAF9F6] p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
                setAuthNotice('');
              }}
              className={`min-h-[42px] rounded-lg text-xs font-bold transition ${
                authMode === 'login' ? 'bg-[#1E3A5F] text-white' : 'text-[#6B7280]'
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthError('');
                setAuthNotice('');
              }}
              className={`min-h-[42px] rounded-lg text-xs font-bold transition ${
                authMode === 'signup' ? 'bg-[#1E3A5F] text-white' : 'text-[#6B7280]'
              }`}
            >
              إنشاء حساب مستأجر
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
            {authMode === 'signup' && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1F2937]">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="أحمد محمود"
                    className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1F2937]">
                    رقم الموبايل المصري
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-right text-sm focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#1F2937]">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-left text-sm focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {authMode !== 'forgot' && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#1F2937]">كلمة المرور</label>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setAuthError('');
                      }}
                      className="text-[11px] font-semibold text-[#1E3A5F] hover:underline"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-left text-sm focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            )}

            {authError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                role="alert"
              >
                {authError}
              </div>
            )}

            {authNotice && (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800"
                role="status"
              >
                {authNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-bold text-white shadow-xs hover:bg-[#172E4D] disabled:opacity-60"
            >
              {authLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span>
                {authMode === 'forgot'
                  ? 'إرسال رابط الاستعادة'
                  : authMode === 'signup'
                  ? 'إنشاء حساب وعرض حجوزاتي'
                  : 'تسجيل الدخول'}
              </span>
            </button>

            {authMode === 'forgot' && (
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="min-h-[40px] w-full text-xs font-bold text-[#6B7280] hover:text-[#1E3A5F]"
              >
                العودة لتسجيل الدخول
              </button>
            )}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F6] px-3 py-1 text-xs font-bold text-[#1E3A5F]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#C5A880]" />
            <span>حساب موثّق للوصول لحجوزاتك فقط</span>
          </span>
          <h1 className="mt-2.5 text-2xl font-bold text-[#1E3A5F]">حجوزاتي</h1>
          <p className="mt-1 text-xs text-[#6B7280]">
            مسجّل باسم: <span dir="ltr" className="font-semibold text-[#1F2937]">{authUser.email}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadBookings(0, false)}
            disabled={loadingBookings}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-2 text-xs font-bold text-[#1E3A5F] hover:bg-stone-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loadingBookings ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSupport()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C5A880] px-4 py-2 text-xs font-bold text-[#1F2937] hover:bg-[#b5976d]"
          >
            <Headphones className="h-4 w-4" />
            <span>خدمة العملاء</span>
          </button>

          <button
            type="button"
            onClick={() => void signOutAuth()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {actionBanner && (
        <div
          role={actionBanner.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-xs font-bold ${
            actionBanner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {actionBanner.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <span>{actionBanner.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            aria-label="إغلاق التنبيه"
            className="p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Status Filters */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: `الكل (${bookings.length})` },
            { id: 'active_review', label: 'قيد المراجعة' },
            { id: 'confirmed_group', label: 'مؤكد / معدّل' },
            { id: 'completed', label: 'مكتمل' },
            { id: 'closed_group', label: 'ملغى / منتهٍ' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterGroup(tab.id)}
            className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold transition ${
              filterGroup === tab.id
                ? 'bg-[#1E3A5F] text-white shadow-xs'
                : 'border border-stone-200/70 bg-white text-[#1F2937] hover:bg-stone-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bookings Content */}
      <div className="mt-5">
        {loadingBookings && bookings.length === 0 ? (
          <div className="space-y-4" aria-busy="true">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="h-44 animate-pulse rounded-2xl border border-stone-200/70 bg-white p-5"
              />
            ))}
          </div>
        ) : listError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-semibold text-red-800"
          >
            <p>{listError}</p>
            <button
              type="button"
              onClick={() => void loadBookings(0, false)}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-5 py-2 text-xs font-bold text-red-700 shadow-xs"
            >
              <RefreshCw className="h-4 w-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FAF9F6] text-[#1E3A5F]">
              <Home className="h-6 w-6 text-[#C5A880]" />
            </div>
            <h2 className="mt-3 text-base font-bold text-[#1F2937]">
              {bookings.length === 0
                ? 'لا توجد حجوزات مسجلة في حسابك بعد'
                : 'لا توجد حجوزات في هذا التصنيف'}
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              تصفّح الوحدات المتاحة واختر موعدك المناسب لإرسال طلب حجز موثّق.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#172E4D]"
            >
              <span>تصفح الوحدات المتاحة</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const statusInfo = STATUS_META[booking.status] ?? STATUS_META.pending;
              const isEditable = canModifyOrCancel(booking.status);
              const isTimelineOpen = Boolean(expandedTimelineIds[booking.id]);
              const timeline = timelineByBookingId[booking.id];
              const isTimelineLoading = loadingTimelineId === booking.id;

              return (
                <article
                  key={booking.id}
                  className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-start">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-0.5 text-xs font-bold ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.label}
                        </span>
                        <span className="rounded-full bg-[#FAF9F6] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#6B7280]" dir="ltr">
                          #{booking.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          أُنشئ في {formatArabicDate(booking.createdAt.slice(0, 10))}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-[#1E3A5F]">
                        {onSelectChaletId ? (
                          <button
                            type="button"
                            onClick={() => onSelectChaletId(booking.chaletId)}
                            className="text-right hover:underline"
                          >
                            {booking.chaletTitle}
                          </button>
                        ) : (
                          booking.chaletTitle
                        )}
                      </h2>

                      <p className="text-xs text-[#6B7280]">
                        {booking.destinationLabel || booking.resort} • المعلن: {booking.ownerName}
                      </p>
                    </div>

                    <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-2.5 text-right sm:min-w-[190px]">
                      <div className="text-[11px] font-semibold text-[#6B7280]">
                        الإجمالي المعتمد من النظام
                      </div>
                      <div className="mt-0.5 text-lg font-extrabold text-[#1E3A5F]">
                        {formatEGP(booking.totalPrice)}
                      </div>
                      {booking.depositAmount > 0 && (
                        <div className="mt-0.5 text-[11px] text-[#6B7280]">
                          المقدم/الجدية: {formatEGP(booking.depositAmount)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dates & Guest Details */}
                  <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                    <div className="flex items-center gap-2 rounded-xl bg-[#FAF9F6] px-3.5 py-2.5">
                      <Calendar className="h-4 w-4 shrink-0 text-[#C5A880]" />
                      <div>
                        <div className="text-[11px] text-[#6B7280]">الوصول والمغادرة</div>
                        <div className="font-bold text-[#1F2937]">
                          {formatArabicDate(booking.checkIn)} ← {formatArabicDate(booking.checkOut)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-[#FAF9F6] px-3.5 py-2.5">
                      <Clock className="h-4 w-4 shrink-0 text-[#C5A880]" />
                      <div>
                        <div className="text-[11px] text-[#6B7280]">المدة وعدد الليالي</div>
                        <div className="font-bold text-[#1F2937]">
                          {booking.nights.toLocaleString('ar-EG')} ليلة
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-[#FAF9F6] px-3.5 py-2.5">
                      <Users className="h-4 w-4 shrink-0 text-[#C5A880]" />
                      <div>
                        <div className="text-[11px] text-[#6B7280]">الضيوف</div>
                        <div className="font-bold text-[#1F2937]">
                          {booking.guests.toLocaleString('ar-EG')} أفراد ({booking.guestName})
                        </div>
                      </div>
                    </div>
                  </div>

                  {(booking.modificationNote || booking.cancellationReason || booking.rejectionReason) && (
                    <div className="mt-3 space-y-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-3 text-xs">
                      {booking.modificationNote && (
                        <p className="text-[#1E3A5F]">
                          <strong>ملاحظة التعديل:</strong> {booking.modificationNote}
                        </p>
                      )}
                      {booking.cancellationReason && (
                        <p className="text-red-700">
                          <strong>سبب الإلغاء:</strong> {booking.cancellationReason}
                        </p>
                      )}
                      {booking.rejectionReason && (
                        <p className="text-red-700">
                          <strong>سبب الرفض:</strong> {booking.rejectionReason}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-100 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {isEditable && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(booking)}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#1E3A5F]/20 bg-[#FAF9F6] px-4 py-2 text-xs font-bold text-[#1E3A5F] hover:bg-stone-100"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>تعديل الموعد / الضيوف</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingBooking(booking);
                              setCancelReason('');
                              setCancelError('');
                            }}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                          >
                            <XCircle className="h-4 w-4" />
                            <span>إلغاء الحجز</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenSupport(booking.id)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#C5A880]/70 bg-[#FAF6F0] px-4 py-2 text-xs font-bold text-[#1E3A5F] hover:bg-[#F3EBDE]"
                      >
                        <Headphones className="h-4 w-4 text-[#C5A880]" />
                        <span>طلب دعم لهذا الحجز</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleTimeline(booking.id)}
                      aria-expanded={isTimelineOpen}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white px-4 py-2 text-xs font-bold text-[#1F2937] hover:bg-stone-50"
                    >
                      <History className="h-4 w-4 text-[#C5A880]" />
                      <span>{isTimelineOpen ? 'إخفاء سجل التحديثات' : 'سجل التحديثات'}</span>
                    </button>
                  </div>

                  {/* Audit Timeline Drawer */}
                  {isTimelineOpen && (
                    <div className="mt-4 rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-4">
                      <h3 className="text-xs font-bold text-[#1E3A5F]">سجل التحديثات والعمليات</h3>
                      {isTimelineLoading ? (
                        <div className="mt-3 space-y-2" aria-busy="true">
                          <div className="h-7 animate-pulse rounded-lg bg-stone-200/70" />
                          <div className="h-7 animate-pulse rounded-lg bg-stone-200/70" />
                        </div>
                      ) : !timeline || timeline.length === 0 ? (
                        <p className="mt-2 text-xs text-[#6B7280]">
                          تم تسجيل الحجز في {formatDateTimeAr(booking.createdAt)} — لا توجد تحديثات إضافية بعد.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-2.5">
                          {timeline.map((ev) => (
                            <li
                              key={ev.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-2xs"
                            >
                              <span className="font-semibold text-[#1F2937]">{ev.summaryAr}</span>
                              <span className="text-[11px] text-[#6B7280]">
                                {formatDateTimeAr(ev.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadBookings(page + 1, true)}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-stone-200/70 bg-white px-6 py-2.5 text-sm font-bold text-[#1E3A5F] shadow-xs hover:bg-stone-50 disabled:opacity-60"
                >
                  {loadingMore && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{loadingMore ? 'جاري تحميل المزيد...' : 'عرض حجوزات أقدم'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modify Booking Modal */}
      {editingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="تعديل بيانات الحجز"
        >
          <div className="w-full max-w-lg rounded-2xl border border-stone-200/70 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#1E3A5F]">تعديل الحجز</h2>
                <p className="text-xs text-[#6B7280]">{editingBooking.chaletTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                aria-label="إغلاق"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[#6B7280] hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmModify} className="mt-4 space-y-4">
              <ArabicDateRangeField
                checkInDate={editCheckIn}
                checkOutDate={editCheckOut}
                minDateIso={todayIso}
                allowClear={false}
                onChange={(checkIn, checkOut) => {
                  setEditCheckIn(checkIn);
                  setEditCheckOut(checkOut);
                }}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1F2937]">
                    عدد الضيوف
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={editGuests}
                    onChange={(e) => setEditGuests(Math.max(1, Number(e.target.value) || 1))}
                    className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-bold text-[#1F2937]"
                  />
                </div>
                <div className="rounded-xl bg-[#FAF9F6] px-3.5 py-2.5 text-xs">
                  <div className="text-[#6B7280]">الليالي الجديدة</div>
                  <div className="mt-0.5 text-sm font-bold text-[#1E3A5F]">
                    {Math.max(0, calculateNightsBetween(editCheckIn, editCheckOut)).toLocaleString(
                      'ar-EG'
                    )}{' '}
                    ليالٍ
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1F2937]">
                  ملاحظة أو سبب التعديل (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="مثال: تقديم موعد الوصول يومين..."
                  className="w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>

              <p className="rounded-xl bg-[#FAF6F0] px-3.5 py-2.5 text-[11px] leading-relaxed text-[#1E3A5F]">
                سيتم التحقق من التوافر وإعادة احتساب السعر النهائي تلقائياً داخل قاعدة البيانات عند التأكيد.
              </p>

              {editError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                >
                  {editError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBooking(null)}
                  className="min-h-[44px] rounded-xl border border-stone-200/70 px-4 py-2 text-xs font-bold text-[#6B7280]"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-2 text-xs font-bold text-white hover:bg-[#172E4D] disabled:opacity-60"
                >
                  {submittingEdit && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>حفظ التعديل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {cancellingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد إلغاء الحجز"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200/70 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-base font-bold text-red-700">تأكيد إلغاء الحجز</h2>
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                aria-label="إغلاق"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[#6B7280] hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancel} className="mt-4 space-y-4">
              <p className="text-xs leading-relaxed text-[#4B5563]">
                هل أنت متأكد من رغبتك في إلغاء حجز{' '}
                <strong className="text-[#1F2937]">{cancellingBooking.chaletTitle}</strong>؟
              </p>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-950">
                {cancellingBooking.cancellationPolicy ||
                  'سياسة الإلغاء: إلغاء مجاني قبل موعد الوصول بـ ١٠ أيام على الأقل؛ بعد ذلك يُخصم مبلغ جدية الحجز (إن وُجد).'}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1F2937]">
                  سبب الإلغاء (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: تغيرت ظروف السفر..."
                  className="w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-3 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>

              {cancelError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                >
                  {cancelError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingBooking(null)}
                  className="min-h-[44px] rounded-xl border border-stone-200/70 px-4 py-2 text-xs font-bold text-[#6B7280]"
                >
                  الإبقاء على الحجز
                </button>
                <button
                  type="submit"
                  disabled={submittingCancel}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {submittingCancel && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>تأكيد الإلغاء</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
