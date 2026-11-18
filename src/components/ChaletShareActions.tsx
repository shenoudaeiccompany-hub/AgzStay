import { useEffect, useState } from 'react';
import { Check, Copy, Facebook, MessageCircle, Share2 } from 'lucide-react';
import { formatEGP } from '@/data/chalets';
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

  const getDirectLink = (): string => {
    const url = new URL(window.location.href);
    url.searchParams.set('chalet', chalet.id);
    return url.toString();
  };

  const shareUrl = getDirectLink();
  const priceLabel = `${formatEGP(chalet.pricePerNight)} / يوم`;

  const shareSummary = `${chalet.title} — ${chalet.resort} (${priceLabel}) عبر منصة AgzStay - إجازة ستاي`;

  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(
    `${shareSummary}\n${shareUrl}`
  )}`;

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
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-sand-50/80 px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
        <Share2 className="h-4 w-4 text-primary-600" />
        <span>مشاركة الوحدة:</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopyLink}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
            copied
              ? 'border-success-500/30 bg-success-50 text-success-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success-500" />
              <span>تم نسخ الرابط</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-primary-600" />
              <span>نسخ الرابط</span>
            </>
          )}
        </button>

        <a
          href={whatsappShareHref}
          target="_blank"
          rel="noreferrer"
          aria-label="مشاركة عبر واتساب"
          className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-success-700"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span>واتساب</span>
        </a>

        <a
          href={facebookShareHref}
          target="_blank"
          rel="noreferrer"
          aria-label="مشاركة عبر فيسبوك"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-primary-700"
        >
          <Facebook className="h-3.5 w-3.5" />
          <span>فيسبوك</span>
        </a>
      </div>
    </div>
  );
}
