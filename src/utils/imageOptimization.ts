const SUPABASE_OBJECT_PUBLIC_SEGMENT = '/storage/v1/object/public/';
const SUPABASE_RENDER_PUBLIC_SEGMENT = '/storage/v1/render/image/public/';

export interface ResponsiveImageAttributes {
  src: string;
  srcSet?: string;
  sizes?: string;
}

export function buildResponsiveImageAttributes(
  rawUrl: string,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px'
): ResponsiveImageAttributes {
  if (!rawUrl) {
    return { src: '' };
  }

  try {
    const parsed = new URL(rawUrl);

    // Supabase Storage Image Transformation srcset (for public buckets)
    if (
      parsed.hostname.includes('supabase.') &&
      parsed.pathname.includes(SUPABASE_OBJECT_PUBLIC_SEGMENT)
    ) {
      const renderPath = parsed.pathname.replace(
        SUPABASE_OBJECT_PUBLIC_SEGMENT,
        SUPABASE_RENDER_PUBLIC_SEGMENT
      );
      const widths = [400, 800, 1200];
      const srcSet = widths
        .map((w) => {
          const variant = new URL(parsed.toString());
          variant.pathname = renderPath;
          variant.searchParams.set('width', String(w));
          variant.searchParams.set('quality', '80');
          return `${variant.toString()} ${w}w`;
        })
        .join(', ');
      return { src: rawUrl, srcSet, sizes };
    }

    // Unsplash responsive width parameters
    if (parsed.hostname.includes('images.unsplash.com')) {
      const widths = [480, 800, 1200];
      const srcSet = widths
        .map((w) => {
          const variant = new URL(parsed.toString());
          variant.searchParams.set('auto', 'format');
          variant.searchParams.set('fit', 'crop');
          variant.searchParams.set('w', String(w));
          variant.searchParams.set('q', '80');
          return `${variant.toString()} ${w}w`;
        })
        .join(', ');
      return { src: rawUrl, srcSet, sizes };
    }
  } catch {
    // Non-URL / relative string fallback
  }

  return { src: rawUrl };
}
