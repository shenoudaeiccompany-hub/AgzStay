import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Headphones,
  HelpCircle,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Ticket,
  X,
} from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import {
  fetchMyBookingsPage,
  fetchMyProfile,
  fetchMySupportTicketsPage,
  getCurrentAuthUser,
  isValidEgyptianMobile,
  submitSupportTicketRpc,
} from '@/services/agzstayRepository';
import type {
  AuthUserSummary,
  BookingRecord,
  RouteSection,
  SupportTicketCategory,
  SupportTicketRecord,
  SupportTicketStatus,
} from '@/types/chalet';
import { formatArabicDate } from '@/utils/bookingPricing';

interface SupportContactModalProps {
  initialBookingId?: string;
  onClose: () => void;
  onOpenAddProperty?: () => void;
  onNavigate?: (section: RouteSection) => void;
}

export interface SupportCenterContentProps {
  initialBookingId?: string;
  onClose?: () => void;
  onOpenAddProperty?: () => void;
  onNavigate?: (section: RouteSection) => void;
}

const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() ||
  'shenouda.eiccompany@gmail.com';
const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined)?.replace(/\D/g, '') || '';

const CATEGORY_OPTIONS: { id: SupportTicketCategory; label: string }[] = [
  { id: 'inquiry', label: 'استفسار عام' },
  { id: 'booking_modify', label: 'طلب تعديل حجز' },
  { id: 'booking_cancel', label: 'طلب إلغاء حجز' },
  { id: 'complaint', label: 'شكوى أو ملاحظة' },
  { id: 'technical', label: 'مشكلة تقنية' },
];

const TICKET_STATUS_META: Record<
  SupportTicketStatus,
  { label: string; className: string }
> = {
  open: {
    label: 'قيد المراجعة',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  replied: {
    label: 'تم الرد',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  closed: {
    label: 'مغلق',
    className: 'bg-stone-100 text-stone-600 border-stone-200',
  },
};

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'كيف تتم خطوات الحجز في منصة AgzStay؟',
    a: 'تبدأ باختيار الوحدة وتواريخ الوصول والمغادرة وعدد الضيوف (١)، ثم مراجعة السعر النهائي المعتمد من النظام ومواعيد الدخول والخروج وسياسة الإلغاء (٢)، وأخيراً تأكيد إرسال الطلب (٣) ليظهر في صفحة «حجوزاتي» فوراً.',
  },
  {
    q: 'ما هي سياسة الإلغاء المجاني؟',
    a: 'يتاح الإلغاء المجاني قبل موعد الوصول بـ ١٠ أيام على الأقل. بعد ذلك، وفي حال الاتفاق على مبلغ جدية حجز، يُخصم وفق السياسة المعلنة لكل وحدة.',
  },
  {
    q: 'هل يجب دفع أي مبلغ قبل المعاينة الفعلية؟',
    a: 'ننصح دائماً بعدم دفع أي مبالغ مالية أو جدية حجز إلا بعد التواصل المباشر مع المعلن، ومعاينة الوحدة فعلياً أو عند استلام المفتاح والتأكد من هوية المؤجّر.',
  },
  {
    q: 'كيف أعدّل موعد حجزي أو ألغيه؟',
    a: 'من صفحة «حجوزاتي» يمكنك الضغط مباشرة على زر «تعديل الموعد / الضيوف» أو «إلغاء الحجز»، أو إرسال طلب دعم مرتبط برقم الحجز من هنا وسيتابع فريقنا معك فوراً.',
  },
  {
    q: 'ما الفرق بين شارة «معلن موثق» والإعلان العادي؟',
    a: 'المعلن الموثق قدّم مستندات الملكية أو التفويض والبطاقة أو كارنيه القرية للإدارة وتمت مراجعتها واعتمادها، مما يمنحك ثقة أعلى عند التواصل.',
  },
];

export function SupportCenterContent({
  initialBookingId = '',
  onClose,
  onOpenAddProperty,
  onNavigate,
}: SupportCenterContentProps) {
  const [activeTab, setActiveTab] = useState<'form' | 'faq' | 'tickets'>('form');
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [userBookings, setUserBookings] = useState<BookingRecord[]>([]);

  // Support ticket form state
  const [category, setCategory] = useState<SupportTicketCategory>(
    initialBookingId ? 'booking_modify' : 'inquiry'
  );
  const [bookingId, setBookingId] = useState(initialBookingId);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{
    ticketCode: string;
    status: SupportTicketStatus;
  } | null>(null);

  // My tickets state
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [ticketsPage, setTicketsPage] = useState(0);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState('');

  // FAQ state
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [emailCopied, setEmailCopied] = useState(false);

  const loadTickets = useCallback(async (page = 0, append = false) => {
    setLoadingTickets(true);
    setTicketsError('');
    try {
      const res = await fetchMySupportTicketsPage(page, 8);
      if (res.error || !res.data) {
        setTicketsError(res.error ?? 'تعذر تحميل تذاكر الدعم.');
        return;
      }
      setTickets((prev) => (append ? [...prev, ...res.data!.items] : res.data!.items));
      setHasMoreTickets(res.data.hasMore);
      setTicketsPage(page);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const user = await getCurrentAuthUser();
      if (!active) return;
      setAuthUser(user);
      if (user) {
        setContactEmail((prev) => prev || user.email || '');
        const [profileRes, bookingsRes] = await Promise.all([
          fetchMyProfile(),
          fetchMyBookingsPage(0, 25),
        ]);
        if (!active) return;
        if (profileRes.data) {
          setContactName((prev) => prev || profileRes.data!.name);
          setContactPhone((prev) => prev || profileRes.data!.phone);
        }
        if (bookingsRes.data) {
          setUserBookings(bookingsRes.data.items);
        }
        void loadTickets(0, false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, [loadTickets]);

  useEffect(() => {
    if (initialBookingId) {
      setBookingId(initialBookingId);
      setCategory('booking_modify');
      setActiveTab('form');
    }
  }, [initialBookingId]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard?.writeText(SUPPORT_EMAIL);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreatedTicket(null);

    if (contactName.trim().length < 2) {
      setFormError('يرجى إدخال الاسم الكامل (حرفين على الأقل).');
      return;
    }

    const cleanPhone = contactPhone.trim();
    const cleanEmail = contactEmail.trim();
    if (!authUser && !cleanPhone && !cleanEmail) {
      setFormError('يرجى إدخال رقم هاتف مصري أو بريد إلكتروني لنتمكن من الرد عليك.');
      return;
    }
    if (cleanPhone && !isValidEgyptianMobile(cleanPhone)) {
      setFormError('رقم الهاتف غير صحيح؛ يرجى إدخال رقم مصري يبدأ بـ 010 أو 011 أو 012 أو 015.');
      return;
    }
    if (cleanEmail && !cleanEmail.includes('@')) {
      setFormError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }
    if (subject.trim().length < 3) {
      setFormError('يرجى كتابة عنوان مختصر وواضح للطلب (٣ أحرف على الأقل).');
      return;
    }
    if (message.trim().length < 8) {
      setFormError('يرجى توضيح تفاصيل الطلب أو المشكلة (٨ أحرف على الأقل).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitSupportTicketRpc({
        category,
        subject,
        message,
        bookingId: bookingId || undefined,
        contactName,
        contactEmail: cleanEmail,
        contactPhone: cleanPhone,
      });

      if (res.error || !res.data) {
        setFormError(res.error ?? 'تعذر إرسال طلب الدعم الآن.');
        return;
      }

      setCreatedTicket({
        ticketCode: res.data.ticketCode,
        status: res.data.status,
      });
      setSubject('');
      setMessage('');
      if (authUser) {
        await loadTickets(0, false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Section Tabs */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#FAF9F6] p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('form')}
          className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition ${
            activeTab === 'form'
              ? 'bg-[#1E3A5F] text-white shadow-xs'
              : 'text-[#6B7280] hover:text-[#1E3A5F]'
          }`}
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" />
          <span>إرسال طلب</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('faq')}
          className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition ${
            activeTab === 'faq'
              ? 'bg-[#1E3A5F] text-white shadow-xs'
              : 'text-[#6B7280] hover:text-[#1E3A5F]'
          }`}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span>الأسئلة الشائعة</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('tickets');
            if (authUser && tickets.length === 0) {
              void loadTickets(0, false);
            }
          }}
          className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition ${
            activeTab === 'tickets'
              ? 'bg-[#1E3A5F] text-white shadow-xs'
              : 'text-[#6B7280] hover:text-[#1E3A5F]'
          }`}
        >
          <Ticket className="h-4 w-4 shrink-0" />
          <span>طلباتي ({tickets.length})</span>
        </button>
      </div>

      {/* Tab 1: Ticket Submission Form */}
      {activeTab === 'form' && (
        <form onSubmit={handleSubmitTicket} className="space-y-4">
          {createdTicket && (
            <div
              role="status"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950"
            >
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>تم استلام طلب الدعم وحفظه بنجاح</span>
              </div>
              <p className="mt-1.5 leading-relaxed">
                رقم التذكرة:{' '}
                <strong dir="ltr" className="font-mono text-[#1E3A5F]">
                  {createdTicket.ticketCode}
                </strong>{' '}
                • الحالة الحالية: <strong>قيد المراجعة</strong>.
              </p>
              {authUser && (
                <button
                  type="button"
                  onClick={() => setActiveTab('tickets')}
                  className="mt-2 inline-flex min-h-[38px] items-center rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#1E3A5F] shadow-2xs"
                >
                  متابعة حالة الطلب
                </button>
              )}
            </div>
          )}

          <div>
            <span className="mb-2 block text-xs font-bold text-[#1F2937]">نوع الطلب</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCategory(opt.id)}
                  className={`min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    category === opt.id
                      ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                      : 'border-stone-200/70 bg-[#FAF9F6] text-[#1F2937] hover:bg-stone-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {authUser && (userBookings.length > 0 || bookingId) && (
            <div>
              <label
                htmlFor="support-booking-select"
                className="mb-1.5 block text-xs font-bold text-[#1F2937]"
              >
                ربط الطلب بحجز محدد (اختياري)
              </label>
              <select
                id="support-booking-select"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
              >
                <option value="">— غير مرتبط بحجز معين —</option>
                {userBookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id.slice(0, 8).toUpperCase()} — {b.chaletTitle} (
                    {formatArabicDate(b.checkIn)})
                  </option>
                ))}
                {bookingId && !userBookings.some((b) => b.id === bookingId) && (
                  <option value={bookingId}>الحجز المرتبط (#{bookingId.slice(0, 8).toUpperCase()})</option>
                )}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#1F2937]">الاسم الكامل</label>
              <input
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="الاسم الثنائي..."
                className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#1F2937]">
                رقم الموبايل (للتواصل السريع)
              </label>
              <input
                type="tel"
                dir="ltr"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="01012345678"
                className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-right text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#1F2937]">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              dir="ltr"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-left text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#1F2937]">عنوان الطلب</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: استفسار عن موعد الوصول أو طلب تعديل الحجز"
              className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#1F2937]">تفاصيل الرسالة</label>
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اشرح طلبك أو المشكلة بوضوح لنتمكن من مساعدتك بأسرع وقت..."
              className="w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-3 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
            />
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-bold text-white shadow-xs hover:bg-[#172E4D] disabled:opacity-60"
          >
            {submitting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>{submitting ? 'جاري الإرسال...' : 'إرسال طلب الدعم'}</span>
          </button>
        </form>
      )}

      {/* Tab 2: Frequently Asked Questions */}
      {activeTab === 'faq' && (
        <div className="space-y-2.5">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-2xl border border-stone-200/70 bg-[#FAF9F6]"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-right text-xs font-bold text-[#1E3A5F] sm:text-sm"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#C5A880] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-stone-200/60 bg-white px-4 py-3 text-xs leading-relaxed text-[#4B5563]">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: User Support Tickets */}
      {activeTab === 'tickets' && (
        <div className="space-y-3">
          {!authUser ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-[#FAF9F6] p-6 text-center">
              <p className="text-xs font-semibold text-[#4B5563]">
                يرجى تسجيل الدخول بحسابك لمتابعة حالة تذاكر الدعم وردود الإدارة.
              </p>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onNavigate('bookings');
                  }}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-[#1E3A5F] px-5 py-2 text-xs font-bold text-white hover:bg-[#172E4D]"
                >
                  تسجيل الدخول ومتابعة الحجوزات
                </button>
              )}
            </div>
          ) : loadingTickets && tickets.length === 0 ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-24 animate-pulse rounded-2xl bg-stone-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-stone-100" />
            </div>
          ) : ticketsError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
              {ticketsError}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-[#FAF9F6] p-6 text-center text-xs text-[#6B7280]">
              لا توجد تذاكر دعم مرسلة من حسابك حتى الآن.
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => {
                const statusMeta = TICKET_STATUS_META[t.status] ?? TICKET_STATUS_META.open;
                const catLabel =
                  CATEGORY_OPTIONS.find((c) => c.id === t.category)?.label ?? 'استفسار';
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#1E3A5F]">
                          {catLabel}
                        </span>
                        {t.ticketCode && (
                          <span dir="ltr" className="font-mono text-[11px] font-bold text-[#6B7280]">
                            {t.ticketCode}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#6B7280]">
                        {formatArabicDate(t.createdAt.slice(0, 10))}
                      </span>
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-[#1F2937]">{t.subject}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#4B5563]">{t.message}</p>

                    {t.bookingId && (
                      <div className="mt-2 inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1E3A5F]">
                        حجز مرتبط: #{t.bookingId.slice(0, 8).toUpperCase()}
                      </div>
                    )}

                    {t.adminReply && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                        <div className="font-bold text-emerald-800">رد خدمة العملاء:</div>
                        <p className="mt-1 leading-relaxed">{t.adminReply}</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {hasMoreTickets && (
                <div className="text-center">
                  <button
                    type="button"
                    disabled={loadingTickets}
                    onClick={() => void loadTickets(ticketsPage + 1, true)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white px-4 py-2 text-xs font-bold text-[#1E3A5F] hover:bg-stone-50"
                  >
                    {loadingTickets && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>عرض تذاكر أقدم</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Direct Channels Footer */}
      <div className="space-y-3 border-t border-stone-100 pt-4">
        <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
          <div className="text-xs font-semibold text-[#6B7280]">البريد الإلكتروني للإدارة والدعم</div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold text-[#1E3A5F]" dir="ltr">
              {SUPPORT_EMAIL}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyEmail()}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-stone-200/70 bg-white px-3 py-1.5 text-xs font-bold text-[#1F2937] hover:bg-stone-50"
              >
                {emailCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  'استفسار عبر منصة إجازة ستاي (AgzStay)'
                )}`}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#172E4D]"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>إرسال بريد</span>
              </a>
            </div>
          </div>
        </div>

        {SUPPORT_WHATSAPP && (
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
              'مرحباً فريق إجازة ستاي (AgzStay)، أود الاستفسار أو طلب مساعدة بخصوص الحجز.'
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-xs hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            <span>تواصل مباشرة عبر واتساب الدعم</span>
          </a>
        )}

        {onOpenAddProperty && (
          <button
            type="button"
            onClick={() => {
              onClose?.();
              onOpenAddProperty();
            }}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#C5A880] bg-[#FAF6F0] px-4 py-3 text-sm font-bold text-[#1E3A5F] hover:bg-[#F3EBDE]"
          >
            <PlusCircle className="h-4 w-4 text-[#C5A880]" />
            <span>لديك شقة أو شاليه؟ أضف وحدتك الآن</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function SupportContactModal({
  initialBookingId,
  onClose,
  onOpenAddProperty,
  onNavigate,
}: SupportContactModalProps) {
  const modalRef = useModal<HTMLDivElement>({ onClose });

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="المساعدة وخدمة العملاء"
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-start justify-between border-b border-stone-100 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/70 bg-[#FAF9F6] px-3 py-1 text-xs font-bold text-[#1E3A5F]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#C5A880]" />
              دعم منصة AgzStay (إجازة ستاي)
            </span>
            <h2 className="mt-2.5 flex items-center gap-2 text-lg font-bold text-[#1F2937]">
              <Headphones className="h-5 w-5 text-[#C5A880]" />
              <span>المساعدة وخدمة العملاء</span>
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              الأسئلة الشائعة، متابعة تذاكر الدعم، أو إرسال شكوى وطلب تعديل حجز مباشرة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FAF9F6] text-[#6B7280] hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <SupportCenterContent
          initialBookingId={initialBookingId}
          onClose={onClose}
          onOpenAddProperty={onOpenAddProperty}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
