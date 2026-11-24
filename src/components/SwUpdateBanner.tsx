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
      className="fixed bottom-4 right-4 z-[80] flex items-center gap-3 rounded-2xl border border-[#C5A880] bg-[#1E3A5F] px-4 py-3 text-xs font-bold text-white shadow-xl"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-[#C5A880]" />
      <span>تحديث متاح للتطبيق</span>
      <button
        type="button"
        onClick={() => applyUpdate()}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#C5A880] px-3.5 py-2 text-xs font-bold text-[#1F2937] transition hover:bg-[#b5976d]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span>تحديث الآن</span>
      </button>
    </div>
  );
}
