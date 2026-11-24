import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDaysIso, formatArabicDate, formatIsoDate, parseIsoDate } from '@/utils/bookingPricing';

const ARABIC_MONTHS_FULL = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

// Egyptian week starts Saturday -> Friday
const WEEKDAY_HEADERS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

interface CalendarMonthViewProps {
  minDateIso: string;
  selectedStart: string;
  selectedEnd: string;
  blockedDates?: Set<string>;
  onSelectDay: (iso: string) => void;
}

function CalendarGrid({
  minDateIso,
  selectedStart,
  selectedEnd,
  blockedDates,
  onSelectDay,
}: CalendarMonthViewProps) {
  const initialDate = useMemo(() => {
    const seed = selectedStart || minDateIso || formatIsoDate(new Date());
    const parsed = parseIsoDate(seed);
    return { year: parsed.getFullYear(), month: parsed.getMonth() };
  }, [minDateIso, selectedStart]);

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonth, setViewMonth] = useState(initialDate.month);

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const minParsed = useMemo(() => parseIsoDate(minDateIso || todayIso), [minDateIso, todayIso]);

  const canGoPrev =
    viewYear > minParsed.getFullYear() ||
    (viewYear === minParsed.getFullYear() && viewMonth > minParsed.getMonth());

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Saturday = 0, Sunday = 1, ..., Friday = 6
    const startOffset = (firstDay.getDay() + 1) % 7;

    const list: ({ iso: string; day: number } | null)[] = [];
    for (let i = 0; i < startOffset; i += 1) {
      list.push(null);
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = formatIsoDate(new Date(viewYear, viewMonth, d));
      list.push({ iso, day: d });
    }
    return list;
  }, [viewYear, viewMonth]);

  return (
    <div>
      {/* Month Header */}
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={!canGoPrev}
          aria-label="الشهر السابق"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200/70 bg-[#FAF9F6] text-[#1E3A5F] transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <span className="text-sm font-bold text-[#1E3A5F]">
          {ARABIC_MONTHS_FULL[viewMonth]} {viewYear.toLocaleString('ar-EG', { useGrouping: false })}
        </span>

        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="الشهر التالي"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200/70 bg-[#FAF9F6] text-[#1E3A5F] transition hover:bg-stone-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_HEADERS.map((wd) => (
          <div key={wd} className="py-1 text-[11px] font-bold text-[#6B7280]">
            {wd}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="h-9" />;
          }

          const isPast = Boolean(minDateIso && cell.iso < minDateIso);
          const isBlocked = Boolean(blockedDates?.has(cell.iso));
          const isDisabled = isPast || isBlocked;

          const isStart = Boolean(selectedStart && cell.iso === selectedStart);
          const isEnd = Boolean(selectedEnd && cell.iso === selectedEnd);
          const isInRange = Boolean(
            selectedStart &&
              selectedEnd &&
              cell.iso > selectedStart &&
              cell.iso < selectedEnd
          );
          const isToday = cell.iso === todayIso;

          let btnStyle =
            'bg-transparent text-[#1F2937] hover:bg-[#FAF9F6] hover:text-[#1E3A5F]';

          if (isStart || isEnd) {
            btnStyle = 'bg-[#1E3A5F] font-bold text-white shadow-xs';
          } else if (isInRange) {
            btnStyle = 'bg-[#C5A880]/25 font-semibold text-[#1E3A5F]';
          } else if (isBlocked) {
            btnStyle = 'cursor-not-allowed bg-red-50/70 text-red-400 line-through';
          } else if (isPast) {
            btnStyle = 'cursor-not-allowed text-stone-300';
          }

          return (
            <button
              key={cell.iso}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelectDay(cell.iso)}
              aria-label={formatArabicDate(cell.iso)}
              aria-pressed={isStart || isEnd}
              className={`flex h-9 w-full items-center justify-center rounded-xl text-xs transition ${btnStyle} ${
                isToday && !isStart && !isEnd ? 'ring-1 ring-[#C5A880]' : ''
              }`}
            >
              {cell.day.toLocaleString('ar-EG')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ArabicDateRangeFieldProps {
  checkInDate: string;
  checkOutDate: string;
  minDateIso?: string;
  checkInLabel?: string;
  checkOutLabel?: string;
  checkInPlaceholder?: string;
  checkOutPlaceholder?: string;
  blockedDates?: Set<string>;
  allowClear?: boolean;
  allowSameDay?: boolean;
  defaultSpanDays?: number;
  onChange: (checkIn: string, checkOut: string) => void;
}

export function ArabicDateRangeField({
  checkInDate,
  checkOutDate,
  minDateIso,
  checkInLabel = 'تاريخ الوصول',
  checkOutLabel = 'تاريخ المغادرة',
  checkInPlaceholder = 'اختر من التقويم',
  checkOutPlaceholder = 'اختر من التقويم',
  blockedDates,
  allowClear = true,
  allowSameDay = false,
  defaultSpanDays = 3,
  onChange,
}: ArabicDateRangeFieldProps) {
  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const effectiveMin = minDateIso || todayIso;

  const [openStep, setOpenStep] = useState<'checkIn' | 'checkOut' | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openStep) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenStep(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenStep(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openStep]);

  const handleDaySelect = (iso: string) => {
    if (openStep === 'checkIn' || !checkInDate) {
      const nextOut =
        checkOutDate && checkOutDate > iso
          ? checkOutDate
          : addDaysIso(iso, defaultSpanDays);
      onChange(iso, nextOut);
      setOpenStep('checkOut');
      return;
    }

    // Selecting check-out
    if (allowSameDay ? iso < checkInDate : iso <= checkInDate) {
      // Restart range from newly clicked earlier date
      onChange(iso, addDaysIso(iso, defaultSpanDays));
      setOpenStep('checkOut');
      return;
    }

    onChange(checkInDate, iso);
    setOpenStep(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[#6B7280]">
            {checkInLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpenStep((prev) => (prev === 'checkIn' ? null : 'checkIn'))}
            aria-expanded={openStep === 'checkIn'}
            className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-right text-xs font-semibold transition ${
              openStep === 'checkIn'
                ? 'border-[#1E3A5F] bg-white text-[#1E3A5F] ring-2 ring-[#1E3A5F]/15'
                : 'border-stone-200/80 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880] hover:bg-white'
            }`}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Calendar className="h-4 w-4 shrink-0 text-[#C5A880]" />
              <span className={checkInDate ? 'text-[#1F2937]' : 'text-[#6B7280]'}>
                {checkInDate ? formatArabicDate(checkInDate) : checkInPlaceholder}
              </span>
            </span>
          </button>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[#6B7280]">
            {checkOutLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpenStep((prev) => (prev === 'checkOut' ? null : 'checkOut'))}
            aria-expanded={openStep === 'checkOut'}
            className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-right text-xs font-semibold transition ${
              openStep === 'checkOut'
                ? 'border-[#1E3A5F] bg-white text-[#1E3A5F] ring-2 ring-[#1E3A5F]/15'
                : 'border-stone-200/80 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880] hover:bg-white'
            }`}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Calendar className="h-4 w-4 shrink-0 text-[#C5A880]" />
              <span className={checkOutDate ? 'text-[#1F2937]' : 'text-[#6B7280]'}>
                {checkOutDate ? formatArabicDate(checkOutDate) : checkOutPlaceholder}
              </span>
            </span>
          </button>
        </div>
      </div>

      {openStep && (
        <div
          role="dialog"
          aria-label="اختيار التواريخ من التقويم"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 mx-auto w-full min-w-[280px] max-w-[360px] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl sm:right-0 sm:left-auto sm:w-[340px]"
        >
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-[#FAF9F6] px-3 py-2 text-xs">
            <span className="font-bold text-[#1E3A5F]">
              {openStep === 'checkIn'
                ? `١. اختر ${checkInLabel}`
                : `٢. اختر ${checkOutLabel}`}
            </span>
            <button
              type="button"
              onClick={() => setOpenStep(null)}
              aria-label="إغلاق التقويم"
              className="rounded-lg p-1 text-[#6B7280] hover:bg-stone-200/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <CalendarGrid
            minDateIso={effectiveMin}
            selectedStart={checkInDate}
            selectedEnd={checkOutDate}
            blockedDates={blockedDates}
            onSelectDay={handleDaySelect}
          />

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-[11px]">
            {allowClear && (checkInDate || checkOutDate) ? (
              <button
                type="button"
                onClick={() => {
                  onChange('', '');
                  setOpenStep(null);
                }}
                className="font-semibold text-red-600 hover:underline"
              >
                مسح التواريخ
              </button>
            ) : (
              <span className="text-[#6B7280]">اضغط على اليوم للاختيار مباشرة</span>
            )}
            <button
              type="button"
              onClick={() => setOpenStep(null)}
              className="rounded-lg bg-[#1E3A5F] px-3 py-1 font-bold text-white hover:bg-[#172E4D]"
            >
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ArabicSingleDateFieldProps {
  label: string;
  value: string;
  minDateIso?: string;
  blockedDates?: Set<string>;
  onChange: (dateIso: string) => void;
}

export function ArabicSingleDateField({
  label,
  value,
  minDateIso,
  blockedDates,
  onChange,
}: ArabicSingleDateFieldProps) {
  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const effectiveMin = minDateIso || todayIso;

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <span className="mb-1.5 block text-xs font-semibold text-[#6B7280]">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-right text-xs font-semibold transition ${
          isOpen
            ? 'border-[#1E3A5F] bg-white text-[#1E3A5F] ring-2 ring-[#1E3A5F]/15'
            : 'border-stone-200/80 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880] hover:bg-white'
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-[#C5A880]" />
          <span>{value ? formatArabicDate(value) : 'اختر من التقويم'}</span>
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 mx-auto w-full min-w-[280px] max-w-[360px] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl sm:right-0 sm:left-auto sm:w-[330px]"
        >
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-[#FAF9F6] px-3 py-2 text-xs">
            <span className="font-bold text-[#1E3A5F]">{label}</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="إغلاق التقويم"
              className="rounded-lg p-1 text-[#6B7280] hover:bg-stone-200/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <CalendarGrid
            minDateIso={effectiveMin}
            selectedStart={value}
            selectedEnd=""
            blockedDates={blockedDates}
            onSelectDay={(iso) => {
              onChange(iso);
              setIsOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
