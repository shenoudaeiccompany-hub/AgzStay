import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { onServiceWorkerUpdateAvailable } from '@/utils/swRegistration';

export function SwUpdateBanner() {
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    return onServiceWorkerUpdateAvailable((apply) => {
      setApplyUpdate(() => apply);
    });
  }, []);

  if (!applyUpdate) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[80] flex items-center gap-3 rounded-2xl border border-secondary-300 bg-primary-700 px-4 py-3 text-xs font-bold text-white shadow-2xl"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
      <span>تحديث متاح للنظام</span>
      <button
        type="button"
        onClick={() => applyUpdate()}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-secondary-500 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-secondary-600"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span>إعادة التحميل</span>
      </button>
    </div>
  );
}
