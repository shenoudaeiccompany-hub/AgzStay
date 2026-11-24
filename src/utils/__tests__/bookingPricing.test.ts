import { describe, expect, it } from 'vitest';
import {
  ALL_GOVERNORATE_NAMES,
  getAreasForCity,
  getCitiesForGovernorate,
} from '@/data/egyptLocations';
import { resolveOwnerQuota } from '@/data/subscriptions';
import type { Chalet, SubscriptionRecord } from '@/types/chalet';
import {
  buildWhatsAppPhoneUrl,
  calculateInformationalQuote,
  calculateNightsBetween,
  findConflictingDates,
  isChaletAvailableForRange,
} from '@/utils/bookingPricing';

function makeMockChalet(overrides: Partial<Chalet> = {}): Chalet {
  return {
    id: 'chalet-test-1',
    title: 'شاليه اختبار بالساحل',
    description: 'وحدة للاختبار',
    governorate: 'مطروح',
    city: 'الساحل الشمالي - العلمين وسيدي عبد الرحمن',
    areaOrVillage: 'مراسي',
    propertyType: 'شاليه',
    advertiserRole: 'مالك مباشر',
    ownerName: 'أحمد علي',
    ownerPhone: '01012345678',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 2000,
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 5,
    coordinates: { lat: 30.97, lng: 28.78 },
    images: ['https://example.com/1.jpg'],
    amenities: ['wifi', 'ac'],
    blockedDates: [],
    rules: ['الالتزام بالهدوء'],
    availabilityStatus: 'active',
    ...overrides,
  };
}

describe('V2 AgzStay bookingPricing, locations, and quota utilities', () => {
  it('calculates exact nights between ISO dates', () => {
    expect(calculateNightsBetween('2026-06-10', '2026-06-14')).toBe(4);
    expect(calculateNightsBetween('2026-06-30', '2026-07-02')).toBe(2);
    expect(calculateNightsBetween('2026-06-10', '2026-06-10')).toBe(0);
    expect(calculateNightsBetween('', '2026-06-14')).toBe(0);
  });

  it('computes informational quote for nightly chalets and monthly unfurnished apartments', () => {
    const percentChalet = makeMockChalet({
      propertyType: 'شاليه',
      pricePerNight: 2500,
      depositType: 'percent',
      depositValue: 20,
    });
    const nightlyQuote = calculateInformationalQuote(percentChalet, 4);
    expect(nightlyQuote.isMonthlyOnly).toBe(false);
    expect(nightlyQuote.subtotal).toBe(10000);
    expect(nightlyQuote.hasInformationalDeposit).toBe(true);
    expect(nightlyQuote.depositAmount).toBe(2000);

    const unfurnishedMonthly = makeMockChalet({
      propertyType: 'شقة فاضية',
      pricePerNight: 15000,
      monthlyPrice: 15000,
      depositType: 'fixed',
      depositValue: 15000,
    });
    const monthlyQuote = calculateInformationalQuote(unfurnishedMonthly, 3);
    expect(monthlyQuote.isMonthlyOnly).toBe(true);
    expect(monthlyQuote.subtotal).toBe(15000);
    expect(monthlyQuote.depositAmount).toBe(15000);
  });

  it('detects blockedDates conflicts accurately', () => {
    const chalet = makeMockChalet({
      blockedDates: ['2026-06-25', '2026-06-26'],
    });
    expect(isChaletAvailableForRange(chalet, '2026-06-20', '2026-06-24')).toBe(true);
    expect(isChaletAvailableForRange(chalet, '2026-06-24', '2026-06-27')).toBe(false);

    const conflicts = findConflictingDates('2026-06-24', 3, new Set(chalet.blockedDates));
    expect(conflicts).toEqual(['2026-06-25', '2026-06-26']);
  });

  it('builds valid wa.me WhatsApp links for Egyptian phone numbers', () => {
    const url = buildWhatsAppPhoneUrl('01012345678', 'مرحباً');
    expect(url.startsWith('https://wa.me/201012345678?text=')).toBe(true);
  });

  it('covers all 27 Egyptian governorates and resolves 3-level cascading locations', () => {
    expect(ALL_GOVERNORATE_NAMES).toHaveLength(27);
    const matrouhCities = getCitiesForGovernorate('مطروح');
    expect(matrouhCities.length).toBeGreaterThan(0);
    const northCoastAreas = getAreasForCity('مطروح', matrouhCities[0].name);
    expect(northCoastAreas).toContain('مراسي');
  });

  it('resolves owner unit quota from free default or active paid subscription', () => {
    const subs: SubscriptionRecord[] = [
      {
        id: 'sub-1',
        ownerName: 'أحمد',
        ownerPhone: '01012345678',
        planId: 'starter',
        planName: 'باقة البداية (Starter)',
        price: 500,
        maxUnits: 5,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    const activeQuota = resolveOwnerQuota('+201012345678', subs);
    expect(activeQuota.maxUnits).toBe(5);
    expect(activeQuota.activePlan.isFeaturedEligible).toBe(true);

    const freeQuota = resolveOwnerQuota('01199999999', subs);
    expect(freeQuota.maxUnits).toBe(1);
    expect(freeQuota.activePlan.id).toBe('free');
  });
});
