import { useEffect, useState } from 'react';
import { Check, Copy, Facebook, Link2, MessageCircle, Share2 } from 'lucide-react';
import { formatEGP, getShortPriceUnitLabel } from '@/data/chalets';
import type { Chalet } from '@/types/chalet';

interface ChaletShareActionsProps {
  chalet: Chalet;
}

export function ChaletShareActions({ chalet }: ChaletShareActionsProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const encodedId = encodeURIComponent(chalet.id);
  const displayPersonalLink = `agzstay.com/chalet/${chalet.id}`;

  const getDirectLink = (): string => {
    try {
      return `${window.location.origin}/chalet/${encodedId}`;
    } catch {
      return `https://agzstay.com/chalet/${encodedId}`;
    }
  };

  const shareUrl = getDirectLink();
  const locationText = [chalet.governorate, chalet.city, chalet.areaOrVillage]
    .filter(Boolean)
    .join(' • ');
  const priceLabel = `${formatEGP(chalet.pricePerNight)} ${getShortPriceUnitLabel(chalet)}`;

  const shareSummary = `${chalet.title} — ${locationText} (${priceLabel}) عبر منصة AgzStay - إجازة ستاي\nالرابط المباشر: ${shareUrl}`;

  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(shareSummary)}`;
  const facebookShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl
  )}&quote=${encodeURIComponent(shareSummary)}`;

  const handleCopyLink = async () => {
    const link = getDirectLink();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
    } catch {
      setCopied(true);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-stone-200/70 bg-white px-4 py-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7280]">
          <Share2 className="h-4 w-4 text-[#1E3A5F]" />
          <span>مشاركة الوحدة:</span>
          <span
            dir="ltr"
            className="hidden items-center gap-1 rounded-lg border border-stone-200/70 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1E3A5F] sm:inline-flex"
          >
            <Link2 className="h-3 w-3 text-[#C5A880]" />
            {displayPersonalLink}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="نسخ رابط الوحدة المباشر"
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              copied
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-stone-200/70 bg-white text-[#1F2937] hover:bg-slate-50'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[#1E3A5F]" />
                <span>نسخ الرابط</span>
              </>
            )}
          </button>

          <a
            href={whatsappShareHref}
            target="_blank"
            rel="noreferrer"
            aria-label="مشاركة الوحدة عبر واتساب"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>مشاركة</span>
          </a>

          <a
            href={facebookShareHref}
            target="_blank"
            rel="noreferrer"
            aria-label="مشاركة الوحدة عبر فيسبوك"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#172E4D]"
          >
            <Facebook className="h-3.5 w-3.5" />
            <span>فيسبوك</span>
          </a>
        </div>
      </div>
    </div>
  );
}
