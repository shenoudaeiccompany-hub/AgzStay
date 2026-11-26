import { useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Share2, Smartphone } from 'lucide-react';
import type { Chalet } from '@/types/chalet';
import {
  buildChaletShareData,
  canUseWebShare,
  copyChaletLink,
  triggerWebShareOrWhatsApp,
} from '@/utils/shareChalet';

interface ShareChaletButtonProps {
  chalet: Chalet;
  variant?: 'card' | 'detail';
  label?: string;
}

export function ShareChaletButton({
  chalet,
  variant = 'card',
  label = 'مشاركة',
}: ShareChaletButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const shareData = buildChaletShareData(chalet);
  const webShareSupported = canUseWebShare();

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!sharedFeedback) return;
    const t = window.setTimeout(() => setSharedFeedback(''), 2200);
    return () => window.clearTimeout(t);
  }, [sharedFeedback]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyChaletLink(shareData.url);
    setCopied(true);
    setSharedFeedback('تم نسخ الرابط');
    window.setTimeout(() => setMenuOpen(false), 750);
  };

  const handleWebShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await triggerWebShareOrWhatsApp(chalet);
    if (result === 'shared') {
      setSharedFeedback('تمت المشاركة');
    }
    setMenuOpen(false);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleButtonClick}
        aria-label={`مشاركة ${chalet.title}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={
          variant === 'detail'
            ? 'inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700'
            : 'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200/80 bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#1E3A5F] shadow-2xs transition hover:border-[#C5A880] hover:bg-white'
        }
      >
        {sharedFeedback ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>{sharedFeedback}</span>
          </>
        ) : (
          <>
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            <span>{label}</span>
          </>
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="خيارات مشاركة الوحدة"
          className={`absolute left-0 z-40 w-56 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl ${
            variant === 'card' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'
          }`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => void handleWebShare(e)}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-xs font-bold text-[#1E3A5F] transition hover:bg-[#FAF9F6]"
          >
            <Smartphone className="h-4 w-4 shrink-0 text-[#C5A880]" />
            <span>
              {webShareSupported ? 'مشاركة مباشرة (Web Share)' : 'مشاركة سريعة عبر التطبيق'}
            </span>
          </button>

          <a
            role="menuitem"
            href={shareData.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>مشاركة عبر واتساب</span>
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={(e) => void handleCopy(e)}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-xs font-bold text-[#1F2937] transition hover:bg-stone-50"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-emerald-700">تم نسخ الرابط</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 shrink-0 text-[#1E3A5F]" />
                <span>نسخ رابط الوحدة</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
