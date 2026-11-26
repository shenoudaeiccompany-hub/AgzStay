import { formatEGP, getShortPriceUnitLabel } from '@/data/chalets';
import type { Chalet } from '@/types/chalet';

const FALLBACK_PUBLIC_ORIGIN =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim().replace(/\/$/, '') ||
  'https://agzstay.com';

export function getChaletShareUrl(chaletId: string): string {
  const encodedId = encodeURIComponent(chaletId);
  try {
    const origin = window.location.origin;
    if (origin.startsWith('http') && !origin.includes('appassets.androidplatform.net')) {
      return `${origin}/chalet/${encodedId}`;
    }
  } catch {
    // ignore window access failure in SSR/tests
  }
  return `${FALLBACK_PUBLIC_ORIGIN}/chalet/${encodedId}`;
}

export function buildChaletShareData(chalet: Chalet) {
  const url = getChaletShareUrl(chalet.id);
  const locationText = [chalet.governorate, chalet.city, chalet.areaOrVillage]
    .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
    .join(' • ');
  const priceLabel = `${formatEGP(chalet.pricePerNight)} ${getShortPriceUnitLabel(chalet)}`;
  const summaryText = `${chalet.title} — ${locationText} (${priceLabel}) عبر منصة AgzStay - إجازة ستاي`;
  const fullWhatsAppMessage = `${summaryText}\nالرابط المباشر: ${url}`;

  return {
    title: `${chalet.title} | AgzStay`,
    text: summaryText,
    url,
    displayLink: `agzstay.com/chalet/${chalet.id}`,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(fullWhatsAppMessage)}`,
    facebookHref: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      url
    )}&quote=${encodeURIComponent(fullWhatsAppMessage)}`,
  };
}

export function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function copyChaletLink(url: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    return ok;
  } catch {
    return false;
  }
}

export async function triggerWebShareOrWhatsApp(
  chalet: Chalet
): Promise<'shared' | 'whatsapp' | 'cancelled'> {
  const data = buildChaletShareData(chalet);
  if (canUseWebShare()) {
    try {
      await navigator.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to WhatsApp if native share failed
    }
  }

  try {
    window.open(data.whatsappHref, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
  return 'whatsapp';
}
