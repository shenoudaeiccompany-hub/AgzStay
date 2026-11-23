export const MAX_PROPERTY_IMAGES = 10;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_IMAGE_DIMENSION = 1600;
export const WEBP_QUALITY = 0.8;

export interface ImageCompressionResult {
  files: File[];
  skippedMessages: string[];
}

function replaceExtension(filename: string, ext: string): string {
  const base = filename.replace(/\.[^.]+$/, '') || 'chalet-photo';
  return `${base}.${ext}`;
}

async function loadImageFromFile(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة ملف الصورة.'));
    };
    img.src = url;
  });
}

export async function compressPropertyImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`الملف "${file.name}" ليس صورة صالحة.`);
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`حجم الصورة "${file.name}" يتجاوز ٥ ميجابايت قبل الضغط.`);
  }

  const source = await loadImageFromFile(file);
  try {
    const largestSide = Math.max(source.width, source.height);
    const scale = largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;
    const targetWidth = Math.max(1, Math.round(source.width * scale));
    const targetHeight = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    source.draw(ctx, targetWidth, targetHeight);

    const webpBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    );

    if (webpBlob && webpBlob.size > 0 && webpBlob.type === 'image/webp') {
      return new File([webpBlob], replaceExtension(file.name, 'webp'), {
        type: 'image/webp',
        lastModified: Date.now(),
      });
    }

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', WEBP_QUALITY)
    );
    if (jpegBlob && jpegBlob.size > 0) {
      return new File([jpegBlob], replaceExtension(file.name, 'jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }

    return file;
  } finally {
    source.cleanup();
  }
}

export async function compressImagesWithProgress(
  inputFiles: File[],
  existingCount: number,
  onProgress?: (completed: number, total: number) => void
): Promise<ImageCompressionResult> {
  const remainingSlots = Math.max(0, MAX_PROPERTY_IMAGES - existingCount);
  const skippedMessages: string[] = [];

  if (remainingSlots === 0) {
    return {
      files: [],
      skippedMessages: [`الحد الأقصى للصور هو ${MAX_PROPERTY_IMAGES} صور لكل وحدة.`],
    };
  }

  const candidates = inputFiles.slice(0, remainingSlots);
  if (inputFiles.length > remainingSlots) {
    skippedMessages.push(
      `تم اختيار أول ${remainingSlots} صور فقط للالتزام بالحد الأقصى (${MAX_PROPERTY_IMAGES} صور).`
    );
  }

  const compressed: File[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    try {
      const out = await compressPropertyImage(raw);
      if (out.size > MAX_IMAGE_SIZE_BYTES) {
        skippedMessages.push(`الصورة "${raw.name}" ما زالت أكبر من ٥ ميجابايت بعد الضغط.`);
      } else {
        compressed.push(out);
      }
    } catch (err) {
      skippedMessages.push(
        err instanceof Error ? err.message : `تعذر معالجة الصورة "${raw.name}".`
      );
    }
    onProgress?.(i + 1, candidates.length);
  }

  return { files: compressed, skippedMessages };
}
