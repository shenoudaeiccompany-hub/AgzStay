import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chalet } from '@/types/chalet';
import {
  buildChaletShareData,
  canUseWebShare,
  getChaletShareUrl,
  triggerWebShareOrWhatsApp,
} from '@/utils/shareChalet';
import propertyCardSource from '@/components/PropertyCard.tsx?raw';
import propertyDetailSource from '@/components/PropertyDetailPage.tsx?raw';
import chaletShareActionsSource from '@/components/ChaletShareActions.tsx?raw';

const SAMPLE_CHALET: Chalet = {
  id: 'chalet-share-1',
  title: 'شاليه هادئ بمارينا ٤',
  description: 'وصف تجريبي',
  governorate: 'مطروح',
  city: 'الساحل الشمالي - مارينا',
  areaOrVillage: 'مارينا ٤',
  propertyType: 'شاليه',
  advertiserRole: 'مالك مباشر',
  ownerName: 'أحمد علي',
  isFeatured: false,
  depositType: 'fixed',
  depositValue: 500,
  pricePerNight: 3500,
  bedrooms: 3,
  bathrooms: 2,
  areaSqm: 140,
  maxGuests: 6,
  coordinates: { lat: 30.824, lng: 28.993 },
  images: [],
  amenities: ['wifi', 'pool'],
  blockedDates: [],
  rules: [],
  availabilityStatus: 'active',
};

describe('shareChalet utilities & UI integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds canonical share URL and WhatsApp/Facebook share payloads', () => {
    const url = getChaletShareUrl(SAMPLE_CHALET.id);
    expect(url).toContain('/chalet/chalet-share-1');

    const payload = buildChaletShareData(SAMPLE_CHALET);
    expect(payload.title).toContain(SAMPLE_CHALET.title);
    expect(payload.whatsappHref).toContain('https://wa.me/?text=');
    expect(payload.whatsappHref).toContain(encodeURIComponent('/chalet/chalet-share-1'));
    expect(payload.facebookHref).toContain('facebook.com/sharer');
  });

  it('invokes Web Share API when available and respects AbortError cancellation', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: shareMock },
      configurable: true,
    });

    expect(canUseWebShare()).toBe(true);
    const result = await triggerWebShareOrWhatsApp(SAMPLE_CHALET);
    expect(result).toBe('shared');
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining(SAMPLE_CHALET.title),
        url: expect.stringContaining('/chalet/chalet-share-1'),
      })
    );

    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    shareMock.mockRejectedValueOnce(abortError);
    const cancelledResult = await triggerWebShareOrWhatsApp(SAMPLE_CHALET);
    expect(cancelledResult).toBe('cancelled');
  });

  it('wires ShareChaletButton into PropertyCard, PropertyDetailPage, and ChaletShareActions', () => {
    expect(propertyCardSource).toContain('ShareChaletButton');
    expect(propertyDetailSource).toContain('ShareChaletButton');
    expect(chaletShareActionsSource).toContain('triggerWebShareOrWhatsApp');
  });
});
