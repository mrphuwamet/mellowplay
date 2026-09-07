/**
 * Saving album photos to the user's device — one place for the two tricks
 * both album pages need:
 *
 * 1. Media lives on the backend API's origin, never the app's, and the spec
 *    silently ignores `<a download>` for cross-origin URLs (it navigates
 *    instead of saving) — which is exactly why "download" looked broken.
 *    Fetching the bytes and saving a blob: URL works regardless of origin.
 *
 * 2. iOS Safari has no real download UX at all; what an iPhone user expects
 *    is the share sheet's "Save Image" into Photos. `navigator.share` with
 *    File objects is the one API that gets there, and it takes several files
 *    at once — so multi-select save is a single share sheet, not thirty
 *    Files-app prompts.
 */

const extOf = (blob: Blob): string => blob.type.split('/')[1]?.split(';')[0] || 'jpg';

export async function downloadBlobUrl(url: string, filename?: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || `mellow-play-${Date.now()}.${extOf(blob)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Offer the files through the native share sheet.
 *
 * Returns true when the interaction is DONE — shared, saved, or deliberately
 * cancelled by the user (AbortError). Only an unsupported/failed share
 * returns false, telling the caller to fall back to plain downloads; a
 * cancel must not trigger that fallback, or dismissing the sheet would rain
 * download prompts.
 *
 * `onProgress` reports blob fetches (the slow part on a phone connection).
 */
export async function saveViaShare(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
  if (!urls.length || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const files: File[] = [];
    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(urls[i]);
      const blob = await res.blob();
      files.push(new File([blob], `mellow-play-${i + 1}.${extOf(blob)}`, { type: blob.type || 'image/jpeg' }));
      onProgress?.(i + 1, urls.length);
    }
    if (!navigator.canShare({ files })) return false;
    await navigator.share({ files });
    return true;
  } catch (err: any) {
    if (err?.name === 'AbortError') return true;
    return false;
  }
}

/**
 * Save several photos: share sheet where the platform has one (iOS/Android →
 * "Save Images"), staggered blob downloads everywhere else. The stagger is
 * what keeps desktop browsers from coalescing thirty programmatic clicks
 * into one.
 */
export async function saveMany(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (await saveViaShare(urls, onProgress)) return;
  urls.forEach((url, idx) => setTimeout(() => { void downloadBlobUrl(url); }, idx * 300));
}
