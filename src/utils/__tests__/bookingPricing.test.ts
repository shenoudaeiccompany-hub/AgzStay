import { describe, expect, it } from 'vitest';
import type { BookingRequest, Chalet } from '@/types/chalet';
import {
  addDaysIso,
  calculateFinancialMetrics,
  calculateNightsBetween,
  calculateStayPricing,
  daysUntilDate,
  findConflictingDates,
  getNightlyRateInfo,
  isChaletAvailableForRange,
  type BookingRangeLike,
} from '@/utils/bookingPricing';

function makeMockChalet(overrides: Partial<Chalet> = {}): Chalet {
  return {
    id: 'chalet-test-1',
    title: 'شاليه اختبار بالساحل',
    listingMode: 'rent',
    supportedDurations: ['daily', 'weekly', 'monthly'],
    destination: 'north-coast',
    destinationLabel: 'الساحل الشمالي',
    resort: 'مراسي',
    unitType: 'chalet',
    viewType: 'sea-front',
    includesPasses: true,
    pricePerNight: 2000,
    weekendPricePerNight: 2400,
    peakPricePerNight: 3000,
    weeklyPrice: 12000,
    monthlyPrice: 44000,
    securityDeposit: 3000,
    depositType: 'percent',
    downPaymentPercent: 25,
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 5,
    beachDistanceMeters: 150,
    coordinates: { lat: 30.97, lng: 28.78 },
    rating: 4.9,
    reviewsCount: 10,
    images: ['https://example.com/1.jpg'],
    amenities: ['wifi', 'ac'],
    description: 'وحدة للاختبار',
    rules: ['الالتزام بالهدوء'],
    owner: {
      name: 'أحمد علي',
      verified: true,
      roleType: 'owner',
      responseTime: 'خلال دقائق',
      memberSince: '٢٠٢٥',
    },
    ...overrides,
  };
}

describe('bookingPricing utilities', () => {
  it('calculates exact nights between ISO dates', () => {
    expect(calculateNightsBetween('2026-06-10', '2026-06-14')).toBe(4);
    expect(calculateNightsBetween('2026-06-30', '2026-07-02')).toBe(2);
    expect(calculateNightsBetween('2026-06-10', '2026-06-10')).toBe(0);
    expect(calculateNightsBetween('', '2026-06-14')).toBe(0);
  });

  it('evaluates 10-day cancellation boundary accurately', () => {
    expect(daysUntilDate('2026-06-20', '2026-06-10')).toBe(10); // >= 10 refundable
    expect(daysUntilDate('2026-06-19', '2026-06-10')).toBe(9); // < 10 non-refundable
    expect(daysUntilDate('2026-06-10', '2026-06-12')).toBe(-2);
  });

  it('applies standard, Thursday/Friday weekend, July/August peak, and custom dateRules rates', () => {
    const chalet = makeMockChalet({
      dateRules: {
        '2026-06-16': {
          status: 'available',
          nightlyPrice: 3500,
          note: 'عرض خاص بالعيد',
        },
      },
    });

    // 2026-06-15 is Monday (standard)
    expect(getNightlyRateInfo(chalet, '2026-06-15')).toMatchObject({
      rate: 2000,
      source: 'standard',
    });

    // 2026-06-18 is Thursday (weekend)
    expect(getNightlyRateInfo(chalet, '2026-06-18')).toMatchObject({
      rate: 2400,
      source: 'weekend',
    });

    // 2026-06-19 is Friday (weekend)
    expect(getNightlyRateInfo(chalet, '2026-06-19')).toMatchObject({
      rate: 2400,
      source: 'weekend',
    });

    // 2026-07-13 is July (peak)
    expect(getNightlyRateInfo(chalet, '2026-07-13')).toMatchObject({
      rate: 3000,
      source: 'peak',
    });

    // 2026-06-16 custom price overrides standard
    expect(getNightlyRateInfo(chalet, '2026-06-16')).toMatchObject({
      rate: 3500,
      source: 'custom',
      note: 'عرض خاص بالعيد',
    });
  });

  it('computes stay breakdown with percentage deposit, weekly/monthly discounts, and fixed period deposits', () => {
    const chalet = makeMockChalet();

    // 3 daily nights: Mon 2026-06-15 (2000), Tue 2026-06-16 (2000), Wed 2026-06-17 (2000)
    const dailyBreakdown = calculateStayPricing(chalet, '2026-06-15', 3, 'daily');
    expect(dailyBreakdown.subtotal).toBe(6000);
    expect(dailyBreakdown.downPaymentAmount).toBe(1500); // 25%
    expect(dailyBreakdown.remainingBalance).toBe(4500);
    expect(dailyBreakdown.durationDiscountApplied).toBe(false);

    // Weekly discount applies cleanly for 7 nights without custom rules
    const weeklyBreakdown = calculateStayPricing(chalet, '2026-06-15', 7, 'weekly');
    expect(weeklyBreakdown.subtotal).toBe(12000);
    expect(weeklyBreakdown.downPaymentAmount).toBe(3000);
    expect(weeklyBreakdown.durationDiscountApplied).toBe(true);

    // Monthly discount applies cleanly for 30 nights without custom rules
    const monthlyBreakdown = calculateStayPricing(chalet, '2026-06-01', 30, 'monthly');
    expect(monthlyBreakdown.subtotal).toBe(44000);
    expect(monthlyBreakdown.downPaymentAmount).toBe(11000);
    expect(monthlyBreakdown.durationDiscountApplied).toBe(true);

    // Fixed deposit from dateRules overrides percentage deposit and caps at subtotal
    const fixedRuleChalet = makeMockChalet({
      dateRules: {
        '2026-06-15': {
          status: 'available',
          depositType: 'fixed',
          depositValue: 2500,
          note: 'عربون ثابت للعيد',
        },
      },
    });
    const fixedBreakdown = calculateStayPricing(fixedRuleChalet, '2026-06-15', 2, 'daily');
    expect(fixedBreakdown.downPaymentAmount).toBe(2500);
    expect(fixedBreakdown.depositLabel).toBe('مبلغ ثابت');
    expect(fixedBreakdown.periodNotes).toContain('عربون ثابت للعيد');
  });

  it('prevents double-booking for blocked dates and active statuses while allowing cancelled/rejected dates', () => {
    const chalet = makeMockChalet({
      blockedDates: ['2026-06-25'],
    });

    const ranges: BookingRangeLike[] = [
      {
        chaletId: chalet.id,
        checkIn: '2026-06-10',
        checkOut: '2026-06-13',
        status: 'confirmed',
      },
      {
        chaletId: chalet.id,
        checkIn: '2026-06-15',
        checkOut: '2026-06-17',
        status: 'pending',
      },
      {
        chaletId: chalet.id,
        checkIn: '2026-06-18',
        checkOut: '2026-06-20',
        status: 'cancelled',
      },
      {
        chaletId: chalet.id,
        checkIn: '2026-06-21',
        checkOut: '2026-06-23',
        status: 'rejected',
      },
    ];

    expect(isChaletAvailableForRange(chalet, ranges, '2026-06-11', '2026-06-14')).toBe(false);
    expect(isChaletAvailableForRange(chalet, ranges, '2026-06-16', '2026-06-18')).toBe(false);
    expect(isChaletAvailableForRange(chalet, ranges, '2026-06-24', '2026-06-26')).toBe(false);
    expect(isChaletAvailableForRange(chalet, ranges, '2026-06-18', '2026-06-23')).toBe(true);

    const conflicts = findConflictingDates('2026-06-09', 3, new Set(['2026-06-10', '2026-06-11']));
    expect(conflicts).toEqual(['2026-06-10', '2026-06-11']);
  });

  it('aggregates host financial revenue, forfeited deposits, and occupancy rate accurately', () => {
    const chalet = makeMockChalet();
    const bookings: BookingRequest[] = [
      {
        id: 'b-1',
        chaletId: chalet.id,
        chaletTitle: chalet.title,
        resort: chalet.resort,
        destinationLabel: chalet.destinationLabel,
        ownerName: chalet.owner.name,
        guestName: 'عميل ١',
        guestPhone: '01000000001',
        checkIn: '2026-06-01',
        checkOut: addDaysIso('2026-06-01', 3),
        nights: 3,
        inquiryChannel: 'form',
        guests: 2,
        totalPrice: 6000,
        depositAmount: 1500,
        remainingAmount: 4500,
        status: 'confirmed',
        notes: '',
        createdAt: '2026-05-20T10:00:00Z',
      },
      {
        id: 'b-2',
        chaletId: chalet.id,
        chaletTitle: chalet.title,
        resort: chalet.resort,
        destinationLabel: chalet.destinationLabel,
        ownerName: chalet.owner.name,
        guestName: 'عميل ٢',
        guestPhone: '01000000002',
        checkIn: '2026-06-10',
        checkOut: addDaysIso('2026-06-10', 2),
        nights: 2,
        inquiryChannel: 'form',
        guests: 2,
        totalPrice: 4000,
        depositAmount: 1000,
        status: 'cancelled',
        notes: '',
        depositForfeited: true,
        forfeitedAmount: 1000,
        createdAt: '2026-06-08T10:00:00Z',
      },
    ];

    const metrics = calculateFinancialMetrics([chalet], bookings, 2026, 5, chalet.id); // June (index 5)
    expect(metrics.monthlyIncome).toBe(6000);
    expect(metrics.monthlyForfeitedIncome).toBe(1000);
    expect(metrics.collectedDepositsInMonth).toBe(1500);
    expect(metrics.remainingAtCheckInInMonth).toBe(4500);
    expect(metrics.totalBookedNightsInMonth).toBe(3);
    expect(metrics.occupancyRate).toBe(10); // 3 of 30 days = 10%
  });
});
