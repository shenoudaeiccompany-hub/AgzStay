import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import { agzstayStorageKeys, loadLocalJson, saveLocalJson } from '@/services/agzstayRepository';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() =>
    loadLocalJson<boolean>(agzstayStorageKeys.pwaDismissed, false)
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const guideModalRef = useModal<HTMLDivElement>({
    isOpen: isGuideOpen,
    onClose: () => setIsGuideOpen(false),
  });

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standalone));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    saveLocalJson(agzstayStorageKeys.pwaDismissed, true);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        handleDismiss();
      }
      setDeferredPrompt(null);
    } else {
      setIsGuideOpen(true);
    }
  };

  if (dismissed || isStandalone) {
    return null;
  }

  return (
    <>
      <div className="border-b border-stone-200/70 bg-white px-4 py-2 text-[#1E3A5F]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1E3A5F] text-[#C5A880]">
              <Smartphone className="h-3.5 w-3.5" />
            </span>
            <span>ثبّت تطبيق AgzStay على شاشتك الرئيسية لسهولة الوصول</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FAF9F6] px-3 py-1.5 text-xs font-bold text-[#1E3A5F] transition hover:bg-stone-100"
            >
              <Download className="h-3.5 w-3.5 text-[#C5A880]" />
              <span>{deferredPrompt ? 'تثبيت الآن' : 'طريقة التثبيت'}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="إغلاق إشعار التثبيت"
              className="rounded-lg p-1.5 text-[#6B7280] transition hover:bg-[#FAF9F6] hover:text-[#1F2937]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isGuideOpen && (
        <div
          ref={guideModalRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="دليل تثبيت تطبيق AgzStay"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E3A5F] text-[#C5A880]">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#1E3A5F]">تثبيت AgzStay - إجازة ستاي</h3>
                  <p className="text-xs text-[#6B7280]">خطوتان فقط للوصول السريع</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                aria-label="إغلاق"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAF9F6] text-[#6B7280] hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs sm:text-sm">
              <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
                <div className="flex items-center gap-2 font-bold text-[#1E3A5F]">
                  <Share className="h-4 w-4 text-[#C5A880]" />
                  <span>على أجهزة iPhone و iPad (Safari)</span>
                </div>
                <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[#6B7280]">
                  <li>
                    اضغط على زر <strong className="text-[#1F2937]">المشاركة (Share)</strong> أسفل متصفح سفاري.
                  </li>
                  <li>
                    اختر <strong className="text-[#1F2937]">إضافة إلى الشاشة الرئيسية</strong> ثم اضغط إضافة.
                  </li>
                </ol>
              </div>

              <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
                <div className="flex items-center gap-2 font-bold text-[#1E3A5F]">
                  <Download className="h-4 w-4 text-[#C5A880]" />
                  <span>على أجهزة Android (Chrome)</span>
                </div>
                <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[#6B7280]">
                  <li>
                    افتح قائمة المتصفح (<strong className="text-[#1F2937]">⋮</strong>) أعلى الشاشة.
                  </li>
                  <li>
                    اختر <strong className="text-[#1F2937]">تثبيت التطبيق</strong> أو <strong className="text-[#1F2937]">إضافة للشاشة الرئيسية</strong>.
                  </li>
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsGuideOpen(false)}
              className="mt-5 min-h-[44px] w-full rounded-xl bg-[#1E3A5F] py-2.5 text-sm font-bold text-white hover:bg-[#172E4D]"
            >
              فهمت، شكراً
            </button>
          </div>
        </div>
      )}
    </>
  );
}
