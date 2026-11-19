import type { BookingRequest, Chalet, RentalDuration } from '@/types/chalet';

export interface NightPriceItem {
  isoDate: string;
  rate: number;
  source: 'custom' | 'peak' | 'weekend' | 'standard';
  note?: string;
}

export interface StayPricingBreakdown {
  standardNights: number;
  weekendNights: number;
  peakNights: number;
  customNights: number;
  standardRate: number;
  weekendRate: number;
  peakRate: number;
  nightDetails: NightPriceItem[];
  periodNotes: string[];
  subtotal: number;
  averagePerNight: number;
  downPaymentAmount: number;
  remainingBalance: number;
  depositLabel: string;
  securityDeposit: number;
  durationDiscountApplied: boolean;
}

export interface MonthlyRevenuePoint {
  monthIndex: number; // 0..11
  monthLabel: string;
  revenue: number;
  bookingsCount: number;
  nightsCount: number;
}

export interface FinancialDashboardMetrics {
  monthlyIncome: number;
  monthlyForfeitedIncome: number;
  monthlyConfirmedCount: number;
  annualIncome: number;
  annualForfeitedIncome: number;
  annualConfirmedCount: number;
  occupancyRate: number;
  totalBookedNightsInMonth: number;
  totalAvailableUnitNightsInMonth: number;
  collectedDepositsInMonth: number;
  remainingAtCheckInInMonth: number;
  monthlyBreakdown: MonthlyRevenuePoint[];
  ledgerBookings: BookingRequest[];
}

export const ARABIC_MONTHS_SHORT = [
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

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = parseIsoDate(isoDate);
  d.setDate(d.getDate() + days);
  return formatIsoDate(d);
}

export function calculateNightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / 86400000);
}

export function daysUntilDate(targetIso: string, referenceIso = formatIsoDate(new Date())): number {
  return calculateNightsBetween(referenceIso, targetIso);
}

export function formatArabicDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function expandStayDates(checkIn: string, nights: number): string[] {
  if (!checkIn || nights <= 0) return [];
  const start = parseIsoDate(checkIn);
  const dates: string[] = [];
  for (let i = 0; i < nights; i += 1) {
    const next = new Date(start);
    next.setDate(start.getDate() + i);
    dates.push(formatIsoDate(next));
  }
  return dates;
}

export function expandInclusiveRange(startIso: string, endIso: string): string[] {
  if (!startIso || !endIso) return [];
  const totalDays = calculateNightsBetween(startIso, endIso);
  if (totalDays < 0) return [];
  return expandStayDates(startIso, totalDays + 1);
}

export interface BookingRangeLike {
  chaletId: string;
  checkIn: string;
  checkOut?: string;
  nights?: number;
  status: BookingRequest['status'];
}

export function getConfirmedBookedDatesForChalet(
  chaletId: string,
  bookings: BookingRangeLike[]
): Set<string> {
  const booked = new Set<string>();
  bookings
    .filter(
      (b) =>
        b.chaletId === chaletId &&
        (b.status === 'confirmed' ||
          b.status === 'completed' ||
          b.status === 'payment_submitted' ||
          b.status === 'approved' ||
          b.status === 'pending_verification' ||
          b.status === 'pending')
    )
    .forEach((b) => {
      const nights =
        b.nights && b.nights > 0
          ? b.nights
          : b.checkOut
          ? Math.max(1, calculateNightsBetween(b.checkIn, b.checkOut))
          : 1;
      expandStayDates(b.checkIn, nights).forEach((d) => booked.add(d));
    });
  return booked;
}

export function getBlockedDatesForChalet(chalet: Chalet): Set<string> {
  const blocked = new Set<string>(chalet.blockedDates ?? []);
  if (chalet.dateRules) {
    Object.entries(chalet.dateRules).forEach(([iso, rule]) => {
      if (rule.status === 'blocked') {
        blocked.add(iso);
      } else if (rule.status === 'available') {
        blocked.delete(iso);
      }
    });
  }
  return blocked;
}

export function getOccupiedDatesForChalet(
  chalet: Chalet,
  bookings: BookingRangeLike[]
): Set<string> {
  const occupied = getBlockedDatesForChalet(chalet);
  getConfirmedBookedDatesForChalet(chalet.id, bookings).forEach((d) => occupied.add(d));
  return occupied;
}

export function findConflictingDates(
  checkIn: string,
  nights: number,
  occupiedDates: Set<string>
): string[] {
  return expandStayDates(checkIn, nights).filter((date) => occupiedDates.has(date));
}

export function isChaletAvailableForRange(
  chalet: Chalet,
  bookings: BookingRangeLike[],
  checkIn: string,
  checkOut: string
): boolean {
  if (!checkIn || !checkOut) return true;
  const nights = calculateNightsBetween(checkIn, checkOut);
  if (nights <= 0) return false;
  const occupied = getOccupiedDatesForChalet(chalet, bookings);
  return findConflictingDates(checkIn, nights, occupied).length === 0;
}

export function getNightlyRateInfo(
  chalet: Chalet,
  isoDate: string
): NightPriceItem {
  const standardRate = chalet.pricePerNight;
  const weekendRate =
    chalet.weekendPricePerNight ?? Math.round((standardRate * 1.15) / 50) * 50;
  const peakRate =
    chalet.peakPricePerNight ?? Math.round((standardRate * 1.25) / 50) * 50;

  const customRule = chalet.dateRules?.[isoDate];
  if (customRule && customRule.nightlyPrice !== undefined && customRule.nightlyPrice > 0) {
    return {
      isoDate,
      rate: customRule.nightlyPrice,
      source: 'custom',
      note: customRule.note,
    };
  }

  const d = parseIsoDate(isoDate);
  const month = d.getMonth() + 1;
  const dayOfWeek = d.getDay();

  if (month === 7 || month === 8) {
    return {
      isoDate,
      rate: peakRate,
      source: 'peak',
      note: customRule?.note,
    };
  }
  if (dayOfWeek === 4 || dayOfWeek === 5) {
    return {
      isoDate,
      rate: weekendRate,
      source: 'weekend',
      note: customRule?.note,
    };
  }
  return {
    isoDate,
    rate: standardRate,
    source: 'standard',
    note: customRule?.note,
  };
}

export function calculateStayPricing(
  chalet: Chalet,
  checkIn: string,
  nights: number,
  duration: RentalDuration = 'daily'
): StayPricingBreakdown {
  const standardRate = chalet.pricePerNight;
  const weekendRate =
    chalet.weekendPricePerNight ?? Math.round((standardRate * 1.15) / 50) * 50;
  const peakRate =
    chalet.peakPricePerNight ?? Math.round((standardRate * 1.25) / 50) * 50;

  let standardNights = 0;
  let weekendNights = 0;
  let peakNights = 0;
  let customNights = 0;
  let subtotal = 0;
  let durationDiscountApplied = false;

  const stayDates = expandStayDates(checkIn, nights);
  const nightDetails = stayDates.map((iso) => getNightlyRateInfo(chalet, iso));
  const notesSet = new Set<string>();
  nightDetails.forEach((item) => {
    if (item.note && item.note.trim()) {
      notesSet.add(item.note.trim());
    }
  });

  const hasCustomPricesInStay = nightDetails.some((item) => item.source === 'custom');

  if (duration === 'monthly' && nights >= 28 && !hasCustomPricesInStay) {
    const months = Math.max(1, Math.round(nights / 30));
    const monthlyRate = chalet.monthlyPrice ?? Math.round(standardRate * 22);
    subtotal = monthlyRate * months;
    standardNights = nights;
    durationDiscountApplied = true;
  } else if (duration === 'weekly' && nights >= 7 && nights % 7 === 0 && !hasCustomPricesInStay) {
    const weeks = Math.max(1, Math.round(nights / 7));
    const weeklyRate = chalet.weeklyPrice ?? Math.round(standardRate * 6.2);
    subtotal = weeklyRate * weeks;
    standardNights = nights;
    durationDiscountApplied = true;
  } else {
    nightDetails.forEach((item) => {
      subtotal += item.rate;
      if (item.source === 'custom') customNights += 1;
      else if (item.source === 'peak') peakNights += 1;
      else if (item.source === 'weekend') weekendNights += 1;
      else standardNights += 1;
    });
  }

  // Check if any date in stay has a period-specific deposit rule; otherwise use unit default
  let resolvedDepositType = chalet.depositType ?? 'percent';
  let resolvedDepositPercent = chalet.downPaymentPercent ?? 25;
  let resolvedFixedDeposit = chalet.fixedDepositAmount ?? 0;

  for (const iso of stayDates) {
    const rule = chalet.dateRules?.[iso];
    if (rule?.depositValue !== undefined && rule.depositValue > 0 && rule.depositType) {
      resolvedDepositType = rule.depositType;
      if (rule.depositType === 'fixed') {
        resolvedFixedDeposit = rule.depositValue;
      } else {
        resolvedDepositPercent = rule.depositValue;
      }
      break;
    }
  }

  let downPaymentAmount = 0;
  let depositLabel = '';
  if (resolvedDepositType === 'fixed' && resolvedFixedDeposit > 0) {
    downPaymentAmount = Math.min(subtotal, resolvedFixedDeposit);
    depositLabel = 'مبلغ ثابت';
  } else {
    downPaymentAmount = Math.round((subtotal * resolvedDepositPercent) / 100);
    depositLabel = `${resolvedDepositPercent}٪`;
  }

  const remainingBalance = Math.max(0, subtotal - downPaymentAmount);
  const securityDeposit = chalet.securityDeposit ?? 1500;

  return {
    standardNights,
    weekendNights,
    peakNights,
    customNights,
    standardRate,
    weekendRate,
    peakRate,
    nightDetails,
    periodNotes: Array.from(notesSet),
    subtotal,
    averagePerNight: nights > 0 ? Math.round(subtotal / nights) : standardRate,
    downPaymentAmount,
    remainingBalance,
    depositLabel,
    securityDeposit,
    durationDiscountApplied,
  };
}

export function calculateFinancialMetrics(
  chalets: Chalet[],
  bookings: BookingRequest[],
  year: number,
  monthIndex: number, // 0..11
  selectedChaletId: string | 'all' = 'all'
): FinancialDashboardMetrics {
  const targetChalets =
    selectedChaletId === 'all'
      ? chalets
      : chalets.filter((c) => c.id === selectedChaletId);

  const filteredBookings = bookings.filter((b) =>
    selectedChaletId === 'all' ? true : b.chaletId === selectedChaletId
  );

  const daysInSelectedMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalAvailableUnitNightsInMonth = Math.max(1, targetChalets.length) * daysInSelectedMonth;

  const monthlyBreakdown: MonthlyRevenuePoint[] = ARABIC_MONTHS_SHORT.map(
    (monthLabel, idx) => ({
      monthIndex: idx,
      monthLabel,
      revenue: 0,
      bookingsCount: 0,
      nightsCount: 0,
    })
  );

  let monthlyIncome = 0;
  let monthlyForfeitedIncome = 0;
  let monthlyConfirmedCount = 0;
  let annualIncome = 0;
  let annualForfeitedIncome = 0;
  let annualConfirmedCount = 0;
  let collectedDepositsInMonth = 0;
  let remainingAtCheckInInMonth = 0;

  // Count booked nights strictly inside the selected month
  const occupiedUnitNightsInMonth = new Set<string>();

  filteredBookings.forEach((b) => {
    if (!b.checkIn) return;
    const [bYear, bMonth] = b.checkIn.split('-').map(Number);
    const bMonthIndex = (bMonth || 1) - 1;

    if (b.status === 'confirmed' || b.status === 'completed') {
      if (bYear === year) {
        annualIncome += b.totalPrice;
        annualConfirmedCount += 1;
        const point = monthlyBreakdown[bMonthIndex];
        if (point) {
          point.revenue += b.totalPrice;
          point.bookingsCount += 1;
          point.nightsCount += b.nights;
        }
      }

      if (bYear === year && bMonthIndex === monthIndex) {
        monthlyIncome += b.totalPrice;
        monthlyConfirmedCount += 1;
        const dep = b.depositAmount ?? Math.round(b.totalPrice * 0.25);
        collectedDepositsInMonth += dep;
        remainingAtCheckInInMonth += Math.max(0, b.totalPrice - dep);
      }

      // Occupancy tracking across exact stay dates falling within the selected month
      expandStayDates(b.checkIn, b.nights).forEach((iso) => {
        const [ny, nm] = iso.split('-').map(Number);
        if (ny === year && nm - 1 === monthIndex) {
          occupiedUnitNightsInMonth.add(`${b.chaletId}::${iso}`);
        }
      });
    } else if (b.status === 'cancelled' && b.depositForfeited && (b.forfeitedAmount ?? 0) > 0) {
      const forfeited = b.forfeitedAmount ?? 0;
      if (bYear === year) {
        annualForfeitedIncome += forfeited;
      }
      if (bYear === year && bMonthIndex === monthIndex) {
        monthlyForfeitedIncome += forfeited;
      }
    }
  });

  // Also include manual blocked/booked days in occupancy or keep strict confirmed bookings?
  // Prompt: "نسبة الإشغال (Occupancy Rate %) and total booked nights." -> confirmed booked nights!
  const totalBookedNightsInMonth = occupiedUnitNightsInMonth.size;
  const occupancyRate =
    targetChalets.length > 0
      ? Math.min(100, Math.round((totalBookedNightsInMonth / totalAvailableUnitNightsInMonth) * 1000) / 10)
      : 0;

  const ledgerBookings = [...filteredBookings]
    .filter((b) => {
      if (!b.checkIn) return false;
      const [bYear] = b.checkIn.split('-').map(Number);
      return bYear === year;
    })
    .sort((a, b) => (b.checkIn > a.checkIn ? 1 : b.checkIn < a.checkIn ? -1 : 0));

  return {
    monthlyIncome,
    monthlyForfeitedIncome,
    monthlyConfirmedCount,
    annualIncome,
    annualForfeitedIncome,
    annualConfirmedCount,
    occupancyRate,
    totalBookedNightsInMonth,
    totalAvailableUnitNightsInMonth,
    collectedDepositsInMonth,
    remainingAtCheckInInMonth,
    monthlyBreakdown,
    ledgerBookings,
  };
}
