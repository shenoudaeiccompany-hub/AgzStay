import type { Chalet } from '@/types/chalet';

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

export function getBlockedDatesSet(chalet: Pick<Chalet, 'blockedDates'>): Set<string> {
  return new Set<string>(chalet.blockedDates ?? []);
}

export function findConflictingDates(
  checkIn: string,
  nights: number,
  blockedDates: Set<string>
): string[] {
  return expandStayDates(checkIn, nights).filter((date) => blockedDates.has(date));
}

export function isChaletAvailableForRange(
  chalet: Pick<Chalet, 'blockedDates'>,
  checkIn: string,
  checkOut: string
): boolean {
  if (!checkIn || !checkOut) return true;
  const nights = calculateNightsBetween(checkIn, checkOut);
  if (nights <= 0) return false;
  const blocked = getBlockedDatesSet(chalet);
  return findConflictingDates(checkIn, nights, blocked).length === 0;
}

export interface InformationalPriceSummary {
  isMonthlyOnly: boolean;
  nights: number;
  unitPrice: number;
  averageNightlyPrice: number;
  subtotal: number;
  hasDynamicPricing: boolean;
  regularNightsCount: number;
  weekendNightsCount: number;
  seasonalNightsCount: number;
  hasInformationalDeposit: boolean;
  depositAmount: number;
  depositDisplayText: string;
}

export function calculateInformationalQuote(
  chalet: Pick<
    Chalet,
    | 'propertyType'
    | 'pricePerNight'
    | 'monthlyPrice'
    | 'weekendPrice'
    | 'seasonalPrice'
    | 'seasonalStart'
    | 'seasonalEnd'
    | 'depositType'
    | 'depositValue'
  >,
  nights: number,
  checkInIso?: string
): InformationalPriceSummary {
  const isMonthlyOnly = chalet.propertyType === 'شقة فاضية';
  const unitPrice = isMonthlyOnly
    ? chalet.monthlyPrice || chalet.pricePerNight
    : chalet.pricePerNight;

  const safeNights = Math.max(1, nights);
  let subtotal = isMonthlyOnly ? unitPrice : unitPrice * safeNights;
  let regularNightsCount = isMonthlyOnly ? 0 : safeNights;
  let weekendNightsCount = 0;
  let seasonalNightsCount = 0;

  const weekendPrice =
    chalet.weekendPrice && chalet.weekendPrice > 0 ? Number(chalet.weekendPrice) : 0;
  const seasonalPrice =
    chalet.seasonalPrice && chalet.seasonalPrice > 0 ? Number(chalet.seasonalPrice) : 0;
  const seasonalStart = chalet.seasonalStart || '';
  const seasonalEnd = chalet.seasonalEnd || '';

  if (!isMonthlyOnly && checkInIso && (weekendPrice > 0 || seasonalPrice > 0)) {
    const stayDates = expandStayDates(checkInIso, safeNights);
    subtotal = 0;
    regularNightsCount = 0;
    for (const iso of stayDates) {
      if (
        seasonalPrice > 0 &&
        seasonalStart &&
        seasonalEnd &&
        iso >= seasonalStart &&
        iso <= seasonalEnd
      ) {
        subtotal += seasonalPrice;
        seasonalNightsCount += 1;
      } else {
        const day = parseIsoDate(iso).getDay();
        // Egypt weekend: Thursday (4) & Friday (5)
        if (weekendPrice > 0 && (day === 4 || day === 5)) {
          subtotal += weekendPrice;
          weekendNightsCount += 1;
        } else {
          subtotal += unitPrice;
          regularNightsCount += 1;
        }
      }
    }
  }

  const hasDynamicPricing = weekendNightsCount > 0 || seasonalNightsCount > 0;
  const averageNightlyPrice = isMonthlyOnly ? unitPrice : Math.round(subtotal / safeNights);

  const rawDeposit = Number(chalet.depositValue || 0);
  const hasInformationalDeposit = Number.isFinite(rawDeposit) && rawDeposit > 0;

  let depositAmount = 0;
  let depositDisplayText = '';

  if (hasInformationalDeposit) {
    if (chalet.depositType === 'fixed') {
      depositAmount = Math.round(rawDeposit);
      depositDisplayText = `مبلغ ثابت: ${depositAmount.toLocaleString('ar-EG')} ج.م`;
    } else {
      depositAmount = Math.round((subtotal * rawDeposit) / 100);
      depositDisplayText = `${rawDeposit.toLocaleString('ar-EG')}٪ (${depositAmount.toLocaleString('ar-EG')} ج.م)`;
    }
  }

  return {
    isMonthlyOnly,
    nights: safeNights,
    unitPrice,
    averageNightlyPrice,
    subtotal,
    hasDynamicPricing,
    regularNightsCount,
    weekendNightsCount,
    seasonalNightsCount,
    hasInformationalDeposit,
    depositAmount,
    depositDisplayText,
  };
}

export function buildWhatsAppPhoneUrl(rawPhone: string, message: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  let international = digits;
  if (digits.startsWith('01') && digits.length === 11) {
    international = `2${digits}`;
  } else if (digits.startsWith('1') && digits.length === 10) {
    international = `20${digits}`;
  } else if (!digits.startsWith('20') && digits.startsWith('0')) {
    international = `2${digits}`;
  }
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export function buildOwnerMarketingCopy(chalet: Chalet, shareUrl: string): string {
  const location = [chalet.governorate, chalet.city, chalet.areaOrVillage]
    .filter(Boolean)
    .join(' - ');
  const isMonthly = chalet.propertyType === 'شقة فاضية';
  const lines = [
    `✨ ${chalet.title}`,
    `📍 الموقع: ${location}`,
    `🏠 النوع: ${chalet.propertyType} (${chalet.bedrooms} غرف • ${chalet.bathrooms} حمام • حتى ${chalet.maxGuests} أفراد)`,
    `💰 السعر: ${Math.round(chalet.pricePerNight).toLocaleString('ar-EG')} ج.م / ${isMonthly ? 'شهرياً' : 'لليلة'}`,
  ];

  if (!isMonthly && chalet.weekendPrice && chalet.weekendPrice > 0) {
    lines.push(
      `📅 سعر الويك إند (الخميس والجمعة): ${Math.round(chalet.weekendPrice).toLocaleString('ar-EG')} ج.م / ليلة`
    );
  }
  if (!isMonthly && chalet.seasonalPrice && chalet.seasonalPrice > 0) {
    lines.push(
      `☀️ سعر ${chalet.seasonalLabel || 'الموسم'}: ${Math.round(chalet.seasonalPrice).toLocaleString('ar-EG')} ج.م / ليلة`
    );
  }
  if (chalet.ownerVerified) {
    lines.push('✅ معلن موثق عبر AgzStay');
  }
  lines.push(`🔗 تفاصيل الوحدة والصور والتواصل المباشر:\n${shareUrl}`);
  return lines.join('\n');
}
