import { CardRecognitionError, RECOGNITION_ERROR } from './cardRecognition.js';

/**
 * Scale (width, height) so the longest side is at most `maxSize`.
 * Never upscales. Pure function so it can be unit-tested without a canvas.
 * @param {number} width
 * @param {number} height
 * @param {number} maxSize
 * @returns {{ width: number, height: number }}
 */
export function computeScaledSize(width, height, maxSize) {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (!maxSize || longest <= maxSize) return { width: w, height: h };
  const ratio = maxSize / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio))
  };
}

const decodeWithImageElement = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Image decode failed'));
  };
  img.src = url;
});

const decodeImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' honours EXIF orientation so phone photos are upright.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older WebViews: fall back to <img>
    }
  }
  return decodeWithImageElement(file);
};

/**
 * Downscale an image File/Blob and return it as base64 JPEG (no data: prefix).
 * @param {File|Blob} file
 * @param {{ maxSize?: number, quality?: number, mimeType?: string }} [options]
 * @returns {Promise<{ data: string, mimeType: string, width: number, height: number }>}
 * @throws {CardRecognitionError} IMAGE when the file is not a decodable image
 */
export async function fileToCompressedBase64(file, { maxSize = 1280, quality = 0.85, mimeType = 'image/jpeg' } = {}) {
  if (!file || (file.type && !file.type.startsWith('image/'))) {
    throw new CardRecognitionError(RECOGNITION_ERROR.IMAGE);
  }

  let source;
  try {
    source = await decodeImage(file);
  } catch (e) {
    throw new CardRecognitionError(RECOGNITION_ERROR.IMAGE, e);
  }

  try {
    const srcWidth = source.width || source.naturalWidth;
    const srcHeight = source.height || source.naturalHeight;
    const { width, height } = computeScaledSize(srcWidth, srcHeight, maxSize);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(source, 0, 0, width, height);

    const dataUrl = canvas.toDataURL(mimeType, quality);
    const data = dataUrl.split(',')[1];
    if (!data) throw new Error('Canvas encode failed');
    return { data, mimeType, width, height };
  } catch (e) {
    throw new CardRecognitionError(RECOGNITION_ERROR.IMAGE, e);
  } finally {
    if (typeof source?.close === 'function') source.close();
  }
}
