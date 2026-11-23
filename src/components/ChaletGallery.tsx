import { ChevronLeft, ChevronRight, Home, Maximize2 } from 'lucide-react';
import { buildResponsiveImageAttributes } from '@/utils/imageOptimization';

interface ChaletGalleryProps {
  images: string[];
  title: string;
  resort: string;
  activeImageIndex: number;
  imageError: boolean;
  onImageError: () => void;
  onSelectImage: (index: number) => void;
  onOpenLightbox: () => void;
}

export function ChaletGallery({
  images,
  title,
  resort,
  activeImageIndex,
  imageError,
  onImageError,
  onSelectImage,
  onOpenLightbox,
}: ChaletGalleryProps) {
  const activeUrl = images[activeImageIndex] ?? '';
  const heroResponsive = buildResponsiveImageAttributes(
    activeUrl,
    '(max-width: 1024px) 100vw, 896px'
  );

  return (
    <div className="bg-slate-100">
      <div className="group relative h-64 w-full overflow-hidden bg-primary-100 sm:h-80">
        <button
          type="button"
          onClick={onOpenLightbox}
          aria-label="عرض الصور بحجم الشاشة الكاملة"
          className="block h-full w-full cursor-zoom-in focus:outline-none"
        >
          {!imageError && activeUrl ? (
            <img
              src={heroResponsive.src}
              srcSet={heroResponsive.srcSet}
              sizes={heroResponsive.sizes}
              alt={title}
              width={896}
              height={320}
              loading="eager"
              decoding="async"
              onError={onImageError}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-primary-600 to-secondary-500 text-white">
              <Home className="h-12 w-12 text-sand-100" />
              <span className="mt-2 text-sm font-semibold">{resort}</span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenLightbox}
          aria-label="تكبير معرض الصور"
          className="absolute bottom-3 left-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900/75 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-slate-900"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span>
            تكبير المعرض ({activeImageIndex + 1}/{images.length})
          </span>
        </button>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectImage(activeImageIndex - 1);
              }}
              aria-label="الصورة السابقة"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectImage(activeImageIndex + 1);
              }}
              aria-label="الصورة التالية"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2.5 sm:px-6">
          {images.map((src, idx) => {
            const isActive = idx === activeImageIndex;
            const thumbResponsive = buildResponsiveImageAttributes(src, '96px');
            return (
              <button
                key={`${src}-${idx}`}
                type="button"
                onClick={() => onSelectImage(idx)}
                onDoubleClick={() => {
                  onSelectImage(idx);
                  onOpenLightbox();
                }}
                aria-label={`اختيار صورة ${idx + 1}`}
                className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                  isActive
                    ? 'border-primary-600 ring-2 ring-primary-600/20'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={thumbResponsive.src}
                  srcSet={thumbResponsive.srcSet}
                  sizes={thumbResponsive.sizes}
                  alt={`${title} - مصغرة ${idx + 1}`}
                  width={96}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
