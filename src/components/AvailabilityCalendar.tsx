import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquareText } from 'lucide-react';
import type { Chalet } from '@/types/chalet';
import {
  ARABIC_MONTHS_SHORT,
  expandInclusiveRange,
  expandStayDates,
  formatIsoDate,
  getNightlyRateInfo,
  parseIsoDate,
} from '@/utils/bookingPricing';

interface AvailabilityCalendarProps {
  chalet?: Chalet;
  selectedCheckIn: string;
  nights: number;
  occupiedDates: Set<string>;
  confirmedBookedDates?: Set<string>;
  onSelectDate: (isoDate: string) => void;
  toggleMode?: boolean;
  onToggleBlockedDate?: (isoDate: string) => void;
  rangeStart?: string;
  rangeEnd?: string;
  onSelectRangeDate?: (isoDate: string) => void;
  multiMonth?: boolean;
  showPrices?: boolean;
}

const WEEKDAY_LABELS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function formatCompactPrice(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}ك`;
  }
  return amount.toLocaleString('ar-EG');
}

export function AvailabilityCalendar({
  chalet,
  selectedCheckIn,
  nights,
  occupiedDates,
  confirmedBookedDates,
  onSelectDate,
  toggleMode = false,
  onToggleBlockedDate,
  rangeStart = '',
  rangeEnd = '',
  onSelectRangeDate,
  multiMonth = false,
  showPrices = true,
}: AvailabilityCalendarProps) {
  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const initialDate = useMemo(() => {
    if (rangeStart) return parseIsoDate(rangeStart);
    if (selectedCheckIn) return parseIsoDate(selectedCheckIn);
    return new Date();
  }, [rangeStart, selectedCheckIn]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [twoMonthsView, setTwoMonthsView] = useState(multiMonth);

  const selectedStaySet = useMemo(() => {
    if (onSelectRangeDate && rangeStart) {
      return new Set(
        rangeEnd ? expandInclusiveRange(rangeStart, rangeEnd) : [rangeStart]
      );
    }
    if (toggleMode) return new Set<string>();
    return new Set(expandStayDates(selectedCheckIn, nights));
  }, [nights, onSelectRangeDate, rangeEnd, rangeStart, selectedCheckIn, toggleMode]);

  const monthsToRender = useMemo(() => {
    const first = { year: viewYear, month: viewMonth };
    if (!twoMonthsView) return [first];
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    return [first, { year: nextYear, month: nextMonth }];
  }, [twoMonthsView, viewMonth, viewYear]);

  const buildDaysGrid = (year: number, month: number): (Date | null)[] => {
    const firstDay = new Date(year, month, 1);
    const leadingEmpty = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < leadingEmpty; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, month, day));
    }
    return cells;
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="الشهر السابق"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="text-sm font-bold text-slate-900">
            {ARABIC_MONTHS_SHORT[viewMonth]} {viewYear}
            {twoMonthsView &&
              ` — ${ARABIC_MONTHS_SHORT[monthsToRender[1].month]} ${monthsToRender[1].year}`}
          </span>

          <button
            type="button"
            onClick={goNextMonth}
            aria-label="الشهر التالي"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setTwoMonthsView((prev) => !prev)}
          className="rounded-lg border border-slate-200 bg-sand-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-sand-100"
        >
          {twoMonthsView ? 'عرض شهر واحد' : 'عرض شهرين معاً'}
        </button>
      </div>

      <div
        className={`grid gap-4 ${
          twoMonthsView ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {monthsToRender.map(({ year, month }) => {
          const cells = buildDaysGrid(year, month);
          return (
            <div key={`${year}-${month}`}>
              {twoMonthsView && (
                <div className="mb-1.5 text-center text-xs font-extrabold text-primary-700">
                  {ARABIC_MONTHS_SHORT[month]} {year}
                </div>
              )}

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-1">
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((date, idx) => {
                  if (!date) {
                    return <div key={`empty-${year}-${month}-${idx}`} className="h-11" />;
                  }

                  const iso = formatIsoDate(date);
                  const isPast = iso < todayIso;
                  const isBookedConfirmed = confirmedBookedDates?.has(iso) ?? false;
                  const isOccupied = occupiedDates.has(iso);
                  const isSelectedEdge =
                    onSelectRangeDate
                      ? iso === rangeStart || iso === rangeEnd
                      : !toggleMode && iso === selectedCheckIn;
                  const isInStayRange = selectedStaySet.has(iso);
                  const isHostInteractive = toggleMode || Boolean(onSelectRangeDate);
                  const isDisabled = isPast || (!isHostInteractive && isOccupied);

                  const rateInfo = chalet && showPrices ? getNightlyRateInfo(chalet, iso) : null;
                  const customRule = chalet?.dateRules?.[iso];
                  const hasNote = Boolean(customRule?.note && customRule.note.trim());
                  const hasCustomPrice = rateInfo?.source === 'custom';

                  let cellStyle =
                    'bg-slate-50 text-slate-700 hover:bg-primary-50 hover:text-primary-700';

                  if (isPast) {
                    cellStyle = 'bg-transparent text-slate-300 cursor-not-allowed';
                  } else if (isSelectedEdge) {
                    cellStyle = 'bg-primary-600 text-white font-bold shadow-sm ring-2 ring-primary-300';
                  } else if (isInStayRange && !isOccupied) {
                    cellStyle = 'bg-primary-100 text-primary-800 font-bold';
                  } else if (isInStayRange && isHostInteractive) {
                    cellStyle =
                      'bg-primary-100 text-primary-900 font-bold ring-1 ring-primary-400';
                  } else if (isBookedConfirmed) {
                    cellStyle = isHostInteractive
                      ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                      : 'bg-error-50 text-error-500 line-through cursor-not-allowed';
                  } else if (isOccupied) {
                    cellStyle = isHostInteractive
                      ? 'bg-error-50 text-error-700 border border-error-500/30 font-bold hover:bg-error-100'
                      : 'bg-error-50 text-error-500 line-through cursor-not-allowed';
                  } else if (hasCustomPrice) {
                    cellStyle =
                      'bg-amber-50/80 text-amber-900 border border-amber-300/70 hover:bg-amber-100';
                  }

                  const tooltipParts = [iso];
                  if (rateInfo) tooltipParts.push(`${rateInfo.rate} ج.م/ليلة`);
                  if (customRule?.note) tooltipParts.push(`ملاحظة: ${customRule.note}`);

                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={isDisabled}
                      title={tooltipParts.join(' • ')}
                      onClick={() => {
                        if (isPast) return;
                        if (onSelectRangeDate) {
                          onSelectRangeDate(iso);
                        } else if (toggleMode && onToggleBlockedDate) {
                          onToggleBlockedDate(iso);
                        } else if (!isDisabled) {
                          onSelectDate(iso);
                        }
                      }}
                      aria-label={iso}
                      className={`relative flex h-11 flex-col items-center justify-center rounded-lg px-0.5 text-xs font-semibold transition ${cellStyle}`}
                    >
                      {hasNote && !isPast && (
                        <span
                          className={`absolute left-1 top-1 h-1.5 w-1.5 rounded-full ${
                            isSelectedEdge ? 'bg-amber-300' : 'bg-secondary-500'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      <span className="leading-none">{date.getDate()}</span>
                      {rateInfo && !isPast && (!isOccupied || isHostInteractive) && (
                        <span
                          className={`mt-0.5 text-[9px] font-bold leading-none ${
                            isSelectedEdge
                              ? 'text-primary-100'
                              : hasCustomPrice
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {formatCompactPrice(rateInfo.rate)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-100 ring-1 ring-slate-300" />
            متاح
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-error-50 ring-1 ring-error-500/40" />
            {toggleMode || onSelectRangeDate ? 'مغلق / محجوز' : 'محجوز / قيد المراجعة'}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-400" />
            سعر مخصص
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquareText className="h-3 w-3 text-secondary-500" />
            ملاحظة فترة
          </span>
        </div>
        <span>الخميس والجمعة بسعر العطلة ما لم يُخصص</span>
      </div>
    </div>
  );
}
