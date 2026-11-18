import { useMemo, useState } from 'react';
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Percent,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatEGP } from '@/data/chalets';
import type { BookingRequest, Chalet } from '@/types/chalet';
import {
  ARABIC_MONTHS_SHORT,
  addDaysIso,
  calculateFinancialMetrics,
  formatArabicDate,
} from '@/utils/bookingPricing';

interface HostFinancialDashboardProps {
  chalets: Chalet[];
  bookings: BookingRequest[];
}

export function HostFinancialDashboard({
  chalets,
  bookings,
}: HostFinancialDashboardProps) {
  const currentDate = useMemo(() => new Date(), []);
  const currentYear = currentDate.getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
  const [selectedChaletId, setSelectedChaletId] = useState<string>('all');

  const metrics = useMemo(
    () =>
      calculateFinancialMetrics(
        chalets,
        bookings,
        selectedYear,
        selectedMonth,
        selectedChaletId
      ),
    [chalets, bookings, selectedYear, selectedMonth, selectedChaletId]
  );

  const maxMonthlyRevenue = useMemo(
    () => Math.max(1, ...metrics.monthlyBreakdown.map((m) => m.revenue)),
    [metrics.monthlyBreakdown]
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear, currentYear + 1]);
    bookings.forEach((b) => {
      const y = Number(b.checkIn?.split('-')[0]);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [bookings, currentYear]);

  return (
    <div className="mt-5 space-y-6">
      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-sand-50/70 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-primary-800">
            <BarChart3 className="h-4 w-4 text-secondary-500" />
            التقارير المالية والدخل الإيجاري (شهري وسنوي)
          </h3>
          <p className="text-[11px] text-slate-500">
            يُحتسب الدخل المؤكد فور تأكيد استلام جدية الحجز، مع تتبع نسبة الإشغال والجدية المصادرة عند الإلغاء المتأخر.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="تصفية حسب الوحدة"
            value={selectedChaletId}
            onChange={(e) => setSelectedChaletId(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
          >
            <option value="all">كل الوحدات ({chalets.length})</option>
            {chalets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.resort} — {c.title.slice(0, 26)}...
              </option>
            ))}
          </select>

          <select
            aria-label="اختر الشهر"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
          >
            {ARABIC_MONTHS_SHORT.map((label, idx) => (
              <option key={label} value={idx}>
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="اختر السنة"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">
              الدخل الإيجاري الشهري ({ARABIC_MONTHS_SHORT[selectedMonth]})
            </span>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-950">
            {formatEGP(metrics.monthlyIncome)}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-emerald-700">
            {metrics.monthlyConfirmedCount.toLocaleString('ar-EG')} حجوزات مؤكدة
            {metrics.monthlyForfeitedIncome > 0 &&
              ` + ${formatEGP(metrics.monthlyForfeitedIncome)} جدية مصادرة`}
          </div>
        </div>

        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary-800">
              الدخل الإيجاري السنوي ({selectedYear})
            </span>
            <TrendingUp className="h-4 w-4 text-primary-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-primary-900">
            {formatEGP(metrics.annualIncome)}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-primary-700">
            إجمالي {metrics.annualConfirmedCount.toLocaleString('ar-EG')} حجز مؤكد في {selectedYear}
            {metrics.annualForfeitedIncome > 0 &&
              ` + ${formatEGP(metrics.annualForfeitedIncome)} مصادرة`}
          </div>
        </div>

        <div className="rounded-2xl border border-secondary-200 bg-secondary-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary-800">
              نسبة الإشغال ({ARABIC_MONTHS_SHORT[selectedMonth]})
            </span>
            <Percent className="h-4 w-4 text-secondary-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-secondary-900">
            {metrics.occupancyRate.toLocaleString('ar-EG')}٪
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-secondary-700">
            <BedDouble className="h-3.5 w-3.5" />
            <span>
              {metrics.totalBookedNightsInMonth.toLocaleString('ar-EG')} ليلة محجوزة من أصل{' '}
              {metrics.totalAvailableUnitNightsInMonth.toLocaleString('ar-EG')}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-sand-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              تفصيل تحصيل الشهر
            </span>
            <CalendarDays className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">
            جدية محصلة: {formatEGP(metrics.collectedDepositsInMonth)}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-slate-600">
            متبقي عند الاستلام: {formatEGP(metrics.remainingAtCheckInInMonth)}
          </div>
        </div>
      </div>

      {/* Monthly Distribution Bar Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-xs font-extrabold text-slate-900">
            توزيع الإيرادات الشهرية لسنة {selectedYear}
          </h4>
          <span className="text-[11px] font-semibold text-slate-500">
            اضغط على أي شهر لعرض تفاصيله
          </span>
        </div>

        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {metrics.monthlyBreakdown.map((point) => {
            const heightPct =
              point.revenue > 0 ? Math.max(12, Math.round((point.revenue / maxMonthlyRevenue) * 100)) : 4;
            const isActive = point.monthIndex === selectedMonth;
            return (
              <button
                key={point.monthLabel}
                type="button"
                onClick={() => setSelectedMonth(point.monthIndex)}
                className={`group flex flex-col items-center rounded-xl p-1.5 transition ${
                  isActive ? 'bg-primary-50 ring-1 ring-primary-300' : 'hover:bg-sand-50'
                }`}
              >
                <span className="mb-1 text-[10px] font-bold text-slate-600">
                  {point.revenue > 0
                    ? `${Math.round(point.revenue / 1000).toLocaleString('ar-EG')}ك`
                    : '٠'}
                </span>
                <div className="flex h-24 w-full items-end justify-center rounded-lg bg-slate-100 p-1">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-md transition-all ${
                      point.revenue === 0
                        ? 'bg-slate-200'
                        : isActive
                        ? 'bg-primary-600'
                        : 'bg-secondary-500 group-hover:bg-secondary-600'
                    }`}
                  />
                </div>
                <span
                  className={`mt-1.5 text-[10px] font-bold ${
                    isActive ? 'text-primary-700' : 'text-slate-600'
                  }`}
                >
                  {point.monthLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookings & Revenue Ledger Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-sand-50 px-4 py-3">
          <h4 className="text-sm font-extrabold text-slate-900">
            سجل الحجوزات والإيرادات ({selectedYear}) — ({metrics.ledgerBookings.length})
          </h4>
          <span className="text-[11px] font-semibold text-slate-500">
            مرتب حسب تاريخ الوصول
          </span>
        </div>

        {metrics.ledgerBookings.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد حجوزات مسجلة في سنة {selectedYear} للوحدة المحددة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">المستأجر</th>
                  <th className="px-4 py-3">الوحدة</th>
                  <th className="px-4 py-3">التواريخ والليالي</th>
                  <th className="px-4 py-3">الإجمالي</th>
                  <th className="px-4 py-3">جدية الحجز</th>
                  <th className="px-4 py-3">المتبقي عند الاستلام</th>
                  <th className="px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.ledgerBookings.map((booking) => {
                  const checkOut = booking.checkOut ?? addDaysIso(booking.checkIn, booking.nights);
                  const deposit = booking.depositAmount ?? Math.round(booking.totalPrice * 0.25);
                  const remaining =
                    booking.remainingAmount ?? Math.max(0, booking.totalPrice - deposit);

                  return (
                    <tr key={booking.id} className="hover:bg-sand-50/50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{booking.guestName}</div>
                        <div className="text-[11px] text-slate-500">{booking.guestPhone}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {booking.resort}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-bold">
                          {formatArabicDate(booking.checkIn)} ← {formatArabicDate(checkOut)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {booking.nights.toLocaleString('ar-EG')} ليالٍ
                        </div>
                      </td>
                      <td className="px-4 py-3 font-extrabold text-primary-700">
                        {formatEGP(booking.totalPrice)}
                      </td>
                      <td className="px-4 py-3 font-bold text-secondary-700">
                        {formatEGP(deposit)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {booking.status === 'cancelled' ? '—' : formatEGP(remaining)}
                      </td>
                      <td className="px-4 py-3">
                        {booking.status === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700">
                            <CheckCircle2 className="h-3 w-3" />
                            مؤكد (مقيد بالدخل)
                          </span>
                        ) : booking.status === 'cancelled' ? (
                          booking.depositForfeited ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                              <ShieldAlert className="h-3 w-3" />
                              ملغي — جدية مصادرة ({formatEGP(booking.forfeitedAmount ?? deposit)})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              ملغي (تاريخ مفتوح)
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold text-warning-700">
                            <Clock3 className="h-3 w-3" />
                            بانتظار تأكيد جدية الحجز
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
