import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Waves, X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageLightboxModalProps {
  images: string[];
  title: string;
  initialIndex: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export function ImageLightboxModal({
  images,
  title,
  initialIndex,
  onClose,
  onIndexChange,
}: ImageLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [failedIndices, setFailedIndices] = useState<Record<number, boolean>>({});

  const total = images.length;

  const goTo = (nextIndex: number) => {
    if (total === 0) return;
    const normalized = (nextIndex + total) % total;
    setCurrentIndex(normalized);
    setZoomed(false);
    onIndexChange?.(normalized);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && total > 1) {
        goTo(currentIndex + 1);
      } else if (e.key === 'ArrowRight' && total > 1) {
        goTo(currentIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const currentSrc = images[currentIndex];
  const hasError = Boolean(failedIndices[currentIndex]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`معرض صور ${title}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white sm:text-base">{title}</h3>
          <p className="text-xs text-slate-300">
            صورة {currentIndex + 1} من {total}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? 'تصغير الصورة' : 'تكبير الصورة'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            {zoomed ? (
              <>
                <ZoomOut className="h-4 w-4" />
                <span className="hidden sm:inline">تصغير</span>
              </>
            ) : (
              <>
                <ZoomIn className="h-4 w-4" />
                <span className="hidden sm:inline">تكبير</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق معرض الصور"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {total > 1 && (
          <button
            type="button"
            onClick={() => goTo(currentIndex - 1)}
            aria-label="الصورة السابقة"
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/75 text-white shadow-lg ring-1 ring-white/20 transition hover:bg-slate-800 sm:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        <div
          className={`flex max-h-full max-w-full items-center justify-center transition-transform duration-300 ${
            zoomed ? 'cursor-zoom-out scale-150' : 'cursor-zoom-in scale-100'
          }`}
          onClick={() => setZoomed((z) => !z)}
        >
          {!hasError && currentSrc ? (
            <img
              src={currentSrc}
              alt={`${title} - صورة ${currentIndex + 1}`}
              onError={() =>
                setFailedIndices((prev) => ({ ...prev, [currentIndex]: true }))
              }
              className="max-h-[72vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
            />
          ) : (
            <div className="flex h-72 w-96 max-w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-primary-700 to-secondary-700 p-6 text-white">
              <Waves className="h-14 w-14 text-secondary-100" />
              <span className="mt-3 text-sm font-semibold">تعذر تحميل الصورة</span>
            </div>
          )}
        </div>

        {total > 1 && (
          <button
            type="button"
            onClick={() => goTo(currentIndex + 1)}
            aria-label="الصورة التالية"
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/75 text-white shadow-lg ring-1 ring-white/20 transition hover:bg-slate-800 sm:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="no-scrollbar mx-auto flex max-w-3xl items-center justify-center gap-2.5 overflow-x-auto">
            {images.map((src, idx) => {
              const active = idx === currentIndex;
              return (
                <button
                  key={`${src}-${idx}`}
                  type="button"
                  onClick={() => goTo(idx)}
                  aria-label={`عرض صورة ${idx + 1}`}
                  className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    active
                      ? 'border-accent-400 opacity-100 ring-2 ring-accent-400/40'
                      : 'border-transparent opacity-55 hover:opacity-90'
                  }`}
                >
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
