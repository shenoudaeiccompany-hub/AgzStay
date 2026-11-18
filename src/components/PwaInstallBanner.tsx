import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { loadLocalJson, masayefStorageKeys, saveLocalJson } from '@/services/masayefRepository';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() =>
    loadLocalJson<boolean>(masayefStorageKeys.pwaDismissed, false)
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

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
    saveLocalJson(masayefStorageKeys.pwaDismissed, true);
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
      <div className="border-b border-secondary-200 bg-secondary-50 px-3 py-2 text-primary-700">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold sm:text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary-500 text-white">
              <Smartphone className="h-4 w-4" />
            </span>
            <span>ثبّت تطبيق AgzStay على شاشتك الرئيسية لسهولة الوصول</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1 rounded-xl bg-secondary-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-secondary-600"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{deferredPrompt ? 'تثبيت الآن' : 'طريقة التثبيت'}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="إغلاق إشعار التثبيت"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="دليل تثبيت تطبيق AgzStay"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    تثبيت AgzStay - إجازة ستاي
                  </h3>
                  <p className="text-xs text-slate-500">خطوتان فقط للوصول السريع بدون متصفح</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                aria-label="إغلاق"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs sm:text-sm">
              <div className="rounded-2xl border border-slate-200 bg-sand-50 p-4">
                <div className="flex items-center gap-2 font-bold text-primary-700">
                  <Share className="h-4 w-4 text-secondary-500" />
                  <span>على أجهزة iPhone و iPad (Safari)</span>
                </div>
                <ol className="mt-2 list-inside list-decimal space-y-1.5 text-slate-700">
                  <li>
                    اضغط على زر <strong>المشاركة (Share)</strong> أسفل متصفح سفاري.
                  </li>
                  <li>
                    اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong> ثم اضغط إضافة.
                  </li>
                </ol>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-secondary-50/50 p-4">
                <div className="flex items-center gap-2 font-bold text-primary-700">
                  <Download className="h-4 w-4 text-secondary-500" />
                  <span>على أجهزة Android (Chrome)</span>
                </div>
                <ol className="mt-2 list-inside list-decimal space-y-1.5 text-slate-700">
                  <li>
                    افتح قائمة المتصفح (<strong>⋮</strong>) أعلى الشاشة.
                  </li>
                  <li>
                    اختر <strong>تثبيت التطبيق (Install App)</strong> أو <strong>إضافة للشاشة الرئيسية</strong>.
                  </li>
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsGuideOpen(false)}
              className="mt-5 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
            >
              فهمت، شكراً
            </button>
          </div>
        </div>
      )}
    </>
  );
}
