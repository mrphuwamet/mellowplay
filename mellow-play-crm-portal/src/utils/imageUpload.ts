import axios from 'axios';
import { API_URL } from '../config';

// Shared upload path for every editor image. Both editors previously inlined
// their own copy of this POST; the difference now is the downscale/re-encode
// step in front of it.
//
// Why compress client-side: photos come straight off a phone camera at
// 3000-4000px and 4-8 MB, get stored in R2 at that size, and are then sent to
// every reader of the article — who views them in a ~400px-wide app. Resizing
// to a sane display width before upload cuts storage, egress and the reader's
// data bill by an order of magnitude, and it has to happen here because the
// upload endpoint stores whatever bytes it is given.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export interface UploadResult {
  url: string;
}

// Anything that isn't a bitmap photo is passed through untouched: re-encoding
// an SVG through a canvas would rasterise it, and a GIF would lose its
// animation (canvas only ever captures the first frame).
const PASSTHROUGH_TYPES = ['image/svg+xml', 'image/gif'];

export async function compressImage(file: File): Promise<File> {
  if (PASSTHROUGH_TYPES.includes(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Corrupt or unsupported file — let the server reject it rather than
    // failing here with a less obvious error.
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  // Already small enough and already a JPEG/WebP: nothing to gain from a
  // re-encode, which would only add generational quality loss.
  if (scale === 1 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // PNG is kept as PNG so screenshots and logos with flat colour or
  // transparency don't pick up JPEG ringing; everything else becomes JPEG.
  const keepPng = file.type === 'image/png';
  const outType = keepPng ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, outType, keepPng ? undefined : JPEG_QUALITY),
  );
  if (!blob) return file;

  // A re-encode that came out bigger than the original is not an improvement.
  if (blob.size >= file.size && scale === 1) return file;

  const ext = keepPng ? 'png' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.${ext}`, { type: outType });
}

export async function uploadEditorImage(file: File, folder: string): Promise<UploadResult | null> {
  const prepared = await compressImage(file);
  const fd = new FormData();
  fd.append('file', prepared);
  fd.append('folder', folder);
  const res = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
  return res.data?.success ? { url: res.data.url as string } : null;
}

// Crop output arrives as a canvas-produced Blob with no filename of its own.
export function blobToFile(blob: Blob, name = 'crop.jpg'): File {
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
