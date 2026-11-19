import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarRange,
  Camera,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Lock,
  MessageSquareText,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { formatEGP } from '@/data/chalets';
import type {
  BookingRequest,
  Chalet,
  DateRule,
  DepositType,
  ListingAvailabilityStatus,
} from '@/types/chalet';
import {
  addDaysIso,
  calculateNightsBetween,
  expandInclusiveRange,
  formatArabicDate,
  formatIsoDate,
  getConfirmedBookedDatesForChalet,
  getOccupiedDatesForChalet,
} from '@/utils/bookingPricing';

interface HostCalendarPricingPanelProps {
  chalets: Chalet[];
  customChaletIds: string[];
  managedChalet: Chalet;
  bookings: BookingRequest[];
  onSelectManagedChalet: (chaletId: string) => void;
  onUpdateChaletConfig: (
    chaletId: string,
    updates: Partial<
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
        | 'verifiedLivePhotos'
        | 'livePhotosVerifiedAt'
        | 'welcomeGuide'
        | 'blockedDates'
        | 'dateRules'
        | 'owner'
      >
    >
  ) => void;
  onDeleteCustomChalet?: (chaletId: string) => void;
}

const AVAILABILITY_STATUS_OPTIONS: {
  id: ListingAvailabilityStatus;
  label: string;
}[] = [
  { id: 'active', label: 'نشط ومنشور للجمهور' },
  { id: 'draft', label: 'مسودة (غير منشور)' },
  { id: 'rented', label: 'تم التأجير مؤقتاً' },
  { id: 'hidden', label: 'مخفي مؤقتاً' },
];

export function HostCalendarPricingPanel({
  chalets,
  customChaletIds,
  managedChalet,
  bookings,
  onSelectManagedChalet,
  onUpdateChaletConfig,
  onDeleteCustomChalet,
}: HostCalendarPricingPanelProps) {
  const defaultStart = useMemo(() => addDaysIso(formatIsoDate(new Date()), 3), []);
  const defaultEnd = useMemo(() => addDaysIso(formatIsoDate(new Date()), 7), []);

  const [rangeStart, setRangeStart] = useState<string>(defaultStart);
  const [rangeEnd, setRangeEnd] = useState<string>(defaultEnd);
  const [rangeStatus, setRangeStatus] = useState<'available' | 'blocked'>('available');
  const [rangePrice, setRangePrice] = useState<string>(String(managedChalet.pricePerNight));
  const [rangeNote, setRangeNote] = useState<string>('');
  const [rangeDepositType, setRangeDepositType] = useState<DepositType>(
    managedChalet.depositType ?? 'percent'
  );
  const [rangeDepositValue, setRangeDepositValue] = useState<string>(
    String(
      managedChalet.depositType === 'fixed' && managedChalet.fixedDepositAmount
        ? managedChalet.fixedDepositAmount
        : managedChalet.downPaymentPercent ?? 25
    )
  );
  const [saveFeedback, setSaveFeedback] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const occupiedForManaged = useMemo(
    () => getOccupiedDatesForChalet(managedChalet, bookings),
    [managedChalet, bookings]
  );

  const confirmedBookedForManaged = useMemo(
    () => getConfirmedBookedDatesForChalet(managedChalet.id, bookings),
    [managedChalet.id, bookings]
  );

  const selectedRangeDates = useMemo(() => {
    if (!rangeStart) return [];
    const effectiveEnd = rangeEnd && rangeEnd >= rangeStart ? rangeEnd : rangeStart;
    return expandInclusiveRange(rangeStart, effectiveEnd);
  }, [rangeStart, rangeEnd]);

  const handleChaletSelection = (nextId: string) => {
    onSelectManagedChalet(nextId);
    const nextChalet = chalets.find((c) => c.id === nextId);
    if (nextChalet) {
      setRangePrice(String(nextChalet.pricePerNight));
      setRangeDepositType(nextChalet.depositType ?? 'percent');
      setRangeDepositValue(
        String(
          nextChalet.depositType === 'fixed' && nextChalet.fixedDepositAmount
            ? nextChalet.fixedDepositAmount
            : nextChalet.downPaymentPercent ?? 25
        )
      );
    }
    setSaveFeedback('');
  };

  const handleCalendarRangeClick = (iso: string) => {
    setSaveFeedback('');
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(iso);
      setRangeEnd('');
      const existing = managedChalet.dateRules?.[iso];
      if (existing) {
        setRangeStatus(existing.status ?? 'available');
        setRangePrice(String(existing.nightlyPrice ?? managedChalet.pricePerNight));
        setRangeNote(existing.note ?? '');
      }
      return;
    }

    if (iso < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(iso);
    } else {
      setRangeEnd(iso);
    }
  };

  const handleApplyRangeConfig = () => {
    if (selectedRangeDates.length === 0) return;

    const existingBlocked = new Set(managedChalet.blockedDates ?? []);
    const nextDateRules: Record<string, DateRule> = { ...(managedChalet.dateRules ?? {}) };
    const parsedPrice = Number(rangePrice);
    const parsedDeposit = Number(rangeDepositValue);

    selectedRangeDates.forEach((iso) => {
      if (rangeStatus === 'blocked') {
        existingBlocked.add(iso);
      } else {
        existingBlocked.delete(iso);
      }

      const prevRule = nextDateRules[iso] ?? {};
      const updatedRule: DateRule = {
        ...prevRule,
        status: rangeStatus,
        nightlyPrice:
          Number.isFinite(parsedPrice) && parsedPrice >= 300 ? parsedPrice : undefined,
        note: rangeNote.trim() || undefined,
        depositType: rangeDepositType,
        depositValue:
          Number.isFinite(parsedDeposit) && parsedDeposit > 0 ? parsedDeposit : undefined,
      };
      nextDateRules[iso] = updatedRule;
    });

    onUpdateChaletConfig(managedChalet.id, {
      blockedDates: Array.from(existingBlocked),
      dateRules: nextDateRules,
    });

    setSaveFeedback(
      `تم تحديث ${selectedRangeDates.length.toLocaleString('ar-EG')} يوم/ليلة بنجاح (${formatArabicDate(rangeStart)}${
        rangeEnd && rangeEnd !== rangeStart ? ` ← ${formatArabicDate(rangeEnd)}` : ''
      }).`
    );
  };

  const handleClearSingleDateRule = (iso: string) => {
    const nextRules = { ...(managedChalet.dateRules ?? {}) };
    delete nextRules[iso];
    const nextBlocked = (managedChalet.blockedDates ?? []).filter((d) => d !== iso);
    onUpdateChaletConfig(managedChalet.id, {
      blockedDates: nextBlocked,
      dateRules: nextRules,
    });
  };

  const configuredRulesList = useMemo(() => {
    const entries = Object.entries(managedChalet.dateRules ?? {}).filter(
      ([, rule]) =>
        rule.status === 'blocked' ||
        rule.nightlyPrice !== undefined ||
        Boolean(rule.note?.trim())
    );
    return entries.sort(([a], [b]) => (a > b ? 1 : -1));
  }, [managedChalet.dateRules]);

  const effectiveRangeNights =
    rangeStart && rangeEnd && rangeEnd >= rangeStart
      ? calculateNightsBetween(rangeStart, rangeEnd) + 1
      : rangeStart
      ? 1
      : 0;

  return (
    <div className="mt-5 space-y-6">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-sand-50/70 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="owner-managed-chalet"
            className="mb-1.5 block text-xs font-bold text-slate-700"
          >
            اختر الوحدة لإدارة تقويم التوافر، الأسعار الديناميكية، وملاحظات الفترات
          </label>
          <select
            id="owner-managed-chalet"
            value={managedChalet.id}
            onChange={(e) => handleChaletSelection(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 focus:border-secondary-500 focus:outline-none"
          >
            {chalets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.resort})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {managedChalet.availabilityStatus === 'pending_review' && (
            <span className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-extrabold text-amber-900">
              قيد مراجعة وتوثيق المالك (pending_review)
            </span>
          )}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4">
            {AVAILABILITY_STATUS_OPTIONS.map((opt) => {
              const currentStatus = managedChalet.availabilityStatus ?? 'active';
              const isSelected = currentStatus === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onUpdateChaletConfig(managedChalet.id, { availabilityStatus: opt.id })
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                    isSelected
                      ? opt.id === 'active'
                        ? 'bg-success-500 text-white'
                        : opt.id === 'draft'
                        ? 'bg-slate-700 text-white'
                        : 'bg-amber-500 text-white'
                      : 'text-slate-600 hover:bg-sand-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {customChaletIds.includes(managedChalet.id) &&
            onDeleteCustomChalet &&
            (confirmDeleteId === managedChalet.id ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteCustomChalet(managedChalet.id);
                    setConfirmDeleteId(null);
                  }}
                  className="rounded-lg bg-error-500 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-error-700"
                >
                  تأكيد الحذف
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600"
                >
                  تراجع
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteId(managedChalet.id)}
                className="inline-flex items-center gap-1 rounded-xl border border-error-500/30 bg-error-50 px-3 py-2 text-[11px] font-bold text-error-700 hover:bg-error-500 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>حذف الوحدة</span>
              </button>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left/Right Interactive Multi-Month Calendar */}
        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-primary-800">
                <CalendarRange className="h-4 w-4 text-secondary-500" />
                تقويم التوافر والأسعار اليومية (اضغط لتحديد فترة)
              </h3>
              <p className="text-[11px] text-slate-500">
                انقر على تاريخ البداية ثم تاريخ النهاية لتخصيص الحالة أو السعر أو الملاحظة للفترة.
              </p>
            </div>
            {effectiveRangeNights > 0 && (
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                الفترة المحددة: {effectiveRangeNights.toLocaleString('ar-EG')} أيام
              </span>
            )}
          </div>

          <AvailabilityCalendar
            chalet={managedChalet}
            selectedCheckIn=""
            nights={0}
            occupiedDates={occupiedForManaged}
            confirmedBookedDates={confirmedBookedForManaged}
            onSelectDate={() => {}}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onSelectRangeDate={handleCalendarRangeClick}
            multiMonth
            showPrices
          />

          {configuredRulesList.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="mb-2.5 text-xs font-extrabold text-slate-800">
                التواريخ المخصصة والملاحظات النشطة ({configuredRulesList.length})
              </h4>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pl-1">
                {configuredRulesList.map(([iso, rule]) => (
                  <div
                    key={iso}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-sand-50/70 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{formatArabicDate(iso)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          rule.status === 'blocked'
                            ? 'bg-error-50 text-error-700'
                            : 'bg-success-50 text-success-700'
                        }`}
                      >
                        {rule.status === 'blocked' ? 'مغلق / محجوز' : 'متاح'}
                      </span>
                      {rule.nightlyPrice && (
                        <span className="font-bold text-primary-700">
                          {formatEGP(rule.nightlyPrice)} / ليلة
                        </span>
                      )}
                      {rule.note && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary-50 px-2 py-0.5 text-[10px] font-semibold text-secondary-700">
                          <MessageSquareText className="h-3 w-3" />
                          {rule.note}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClearSingleDateRule(iso)}
                      className="text-[11px] font-bold text-error-600 hover:underline"
                    >
                      إعادة للافتراضي
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Period Configuration + Default Unit Pricing Panel */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border-2 border-secondary-500/30 bg-white p-4 shadow-sm">
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-primary-800">
              <Sparkles className="h-4 w-4 text-secondary-500" />
              تخصيص الفترة المحددة
            </h3>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="host-range-start"
                  className="mb-1 block text-[11px] font-bold text-slate-600"
                >
                  من تاريخ
                </label>
                <input
                  id="host-range-start"
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="host-range-end"
                  className="mb-1 block text-[11px] font-bold text-slate-600"
                >
                  إلى تاريخ (شامل)
                </label>
                <input
                  id="host-range-end"
                  type="date"
                  min={rangeStart}
                  value={rangeEnd || rangeStart}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="mt-3">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-600">
                1. حالة التوافر للفترة
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRangeStatus('available')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition ${
                    rangeStatus === 'available'
                      ? 'border-success-500 bg-success-50 text-success-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>متاح للإيجار</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRangeStatus('blocked')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition ${
                    rangeStatus === 'blocked'
                      ? 'border-error-500 bg-error-50 text-error-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>مغلق / محجوز</span>
                </button>
              </div>
            </div>

            <div className="mt-3">
              <label
                htmlFor="host-range-price"
                className="mb-1 block text-[11px] font-bold text-slate-600"
              >
                2. سعر الليلة لهذه الفترة (ج.م)
              </label>
              <input
                id="host-range-price"
                type="number"
                min={300}
                step={50}
                value={rangePrice}
                onChange={(e) => setRangePrice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm font-bold text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="mt-3">
              <label
                htmlFor="host-range-note"
                className="mb-1 block text-[11px] font-bold text-slate-600"
              >
                3. ملاحظة الفترة (تظهر للمستأجرين)
              </label>
              <input
                id="host-range-note"
                type="text"
                value={rangeNote}
                onChange={(e) => setRangeNote(e.target.value)}
                placeholder="مثال: السعر شامل كارنيهات الشاطئ / حد أدنى ٣ ليالي"
                className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-xs text-slate-900 focus:border-secondary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="mt-3">
              <span className="mb-1 block text-[11px] font-bold text-slate-600">
                4. قيمة جدية الحجز المطلوبة (غير مستردة عند الإلغاء &lt; ١٠ أيام)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="نوع جدية الحجز"
                  value={rangeDepositType}
                  onChange={(e) => {
                    const nextType = e.target.value as DepositType;
                    setRangeDepositType(nextType);
                    setRangeDepositValue(nextType === 'fixed' ? '2000' : '25');
                  }}
                  className="rounded-xl border border-slate-200 bg-sand-50 px-2.5 py-2 text-xs font-bold text-slate-800"
                >
                  <option value="percent">نسبة مئوية (٪)</option>
                  <option value="fixed">مبلغ ثابت (ج.م)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={rangeDepositType === 'percent' ? 100 : undefined}
                  step={rangeDepositType === 'percent' ? 5 : 100}
                  value={rangeDepositValue}
                  onChange={(e) => setRangeDepositValue(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            {saveFeedback && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-xs font-bold text-success-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{saveFeedback}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleApplyRangeConfig}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary-500 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-secondary-600"
            >
              <CalendarCheck className="h-4 w-4" />
              <span>حفظ وتطبيق على الفترة المحددة</span>
            </button>
          </div>

          {/* Default Unit Settings & InstaPay */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-sand-50 p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
              <CreditCard className="h-4 w-4 text-primary-600" />
              الأسعار الافتراضية للوحدة وبيانات إنستاباي
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600">
                  الليلة العادية (ج.م)
                </label>
                <input
                  type="number"
                  min={300}
                  step={50}
                  value={managedChalet.pricePerNight}
                  onChange={(e) =>
                    onUpdateChaletConfig(managedChalet.id, {
                      pricePerNight: Math.max(300, Number(e.target.value) || 300),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600">
                  ليلة الويك إند (ج.م)
                </label>
                <input
                  type="number"
                  min={300}
                  step={50}
                  value={
                    managedChalet.weekendPricePerNight ??
                    Math.round((managedChalet.pricePerNight * 1.15) / 50) * 50
                  }
                  onChange={(e) =>
                    onUpdateChaletConfig(managedChalet.id, {
                      weekendPricePerNight: Math.max(300, Number(e.target.value) || 300),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600">
                  جدية الحجز الافتراضية (٪)
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  step={5}
                  value={managedChalet.downPaymentPercent ?? 25}
                  onChange={(e) =>
                    onUpdateChaletConfig(managedChalet.id, {
                      depositType: 'percent',
                      downPaymentPercent: Math.min(100, Math.max(5, Number(e.target.value) || 25)),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600">
                  التأمين المسترد (ج.م)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={managedChalet.securityDeposit ?? 1500}
                  onChange={(e) =>
                    onUpdateChaletConfig(managedChalet.id, {
                      securityDeposit: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">
                حساب إنستاباي لتحويل جدية الحجز (InstaPay)
              </label>
              <input
                type="text"
                dir="ltr"
                value={managedChalet.owner.instaPayHandle ?? ''}
                placeholder="name@instapay"
                onChange={(e) =>
                  onUpdateChaletConfig(managedChalet.id, {
                    owner: { ...managedChalet.owner, instaPayHandle: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-bold text-slate-900"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={managedChalet.includesPasses}
                onChange={(e) =>
                  onUpdateChaletConfig(managedChalet.id, {
                    includesPasses: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded accent-secondary-500"
              />
              <span>الإيجار شامل تصاريح دخول القرية والخدمات</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-900">
              <input
                type="checkbox"
                checked={Boolean(managedChalet.verifiedLivePhotos)}
                onChange={(e) =>
                  onUpdateChaletConfig(managedChalet.id, {
                    verifiedLivePhotos: e.target.checked,
                    livePhotosVerifiedAt: e.target.checked ? 'نوفمبر ٢٠٢٦' : undefined,
                  })
                }
                className="h-4 w-4 rounded accent-emerald-600"
              />
              <Camera className="h-3.5 w-3.5 text-emerald-600" />
              <span>تفعيل شارة &quot;صور حديثة على الطبيعة&quot;</span>
            </label>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                <KeyRound className="h-3.5 w-3.5 text-emerald-600" />
                إعدادات بطاقة الترحيب التلقائية للمستأجر (بعد تأكيد الجدية)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={managedChalet.welcomeGuide?.wifiName ?? ''}
                  placeholder="اسم شبكة Wi-Fi"
                  onChange={(e) =>
                    onUpdateChaletConfig(managedChalet.id, {
                      welcomeGuide: {
                        wifiName: e.target.value,
                        wifiPassword: managedChalet.welcomeGuide?.wifiPassword ?? '',
                        gateInstructions: managedChalet.welcomeGuide?.gateInstructions ?? '',
                        caretakerName:
                          managedChalet.welcomeGuide?.caretakerName ?? managedChalet.owner.name,
                        caretakerPhone:
                          managedChalet.welcomeGuide?.caretakerPhone ??
                          managedChalet.owner.phone ??
                          '',
                        mapsUrl: managedChalet.welcomeGuide?.mapsUrl,
                      },
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={managedChalet.welcomeGuide?.wifiPassword ?? ''}
                  placeholder="كلمة سر Wi-Fi"
                  onChange={(e) =>
                    onUpdateChaletConfig(managedChalet.id, {
                      welcomeGuide: {
                        wifiName: managedChalet.welcomeGuide?.wifiName ?? '',
                        wifiPassword: e.target.value,
                        gateInstructions: managedChalet.welcomeGuide?.gateInstructions ?? '',
                        caretakerName:
                          managedChalet.welcomeGuide?.caretakerName ?? managedChalet.owner.name,
                        caretakerPhone:
                          managedChalet.welcomeGuide?.caretakerPhone ??
                          managedChalet.owner.phone ??
                          '',
                        mapsUrl: managedChalet.welcomeGuide?.mapsUrl,
                      },
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-900"
                />
              </div>
              <input
                type="text"
                value={managedChalet.welcomeGuide?.gateInstructions ?? ''}
                placeholder="تعليمات البوابة والكمبوند أو رمز الدخول"
                onChange={(e) =>
                  onUpdateChaletConfig(managedChalet.id, {
                    welcomeGuide: {
                      wifiName: managedChalet.welcomeGuide?.wifiName ?? '',
                      wifiPassword: managedChalet.welcomeGuide?.wifiPassword ?? '',
                      gateInstructions: e.target.value,
                      caretakerName:
                        managedChalet.welcomeGuide?.caretakerName ?? managedChalet.owner.name,
                      caretakerPhone:
                        managedChalet.welcomeGuide?.caretakerPhone ??
                        managedChalet.owner.phone ??
                        '',
                      mapsUrl: managedChalet.welcomeGuide?.mapsUrl,
                    },
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
