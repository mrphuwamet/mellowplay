/**
 * Saving album photos to the user's device — one place for the tricks every
 * caller needs, and ONE decision about which trick runs where, so that
 * decision cannot quietly drift out of sync with reality at a call site
 * nobody remembers to update.
 *
 * 1. Media lives on the backend API's origin, never the app's, and the spec
 *    silently ignores `<a download>` for cross-origin URLs (it navigates
 *    instead of saving) — which is exactly why "download" looked broken.
 *    Fetching the bytes and saving a blob: URL works regardless of origin.
 *
 * 2. iOS (and iPadOS) has no real download UX at all — a blob: URL given to
 *    `<a download>` just opens there instead of saving. `navigator.share`
 *    with File objects is the one API that reaches the OS's own "Save
 *    Image" action, and it takes several files at once, so a multi-select
 *    save is one share sheet rather than thirty prompts.
 *
 *    This used to be tried on EVERY platform, on the assumption that only
 *    iOS/Android would ever implement navigator.share with files and
 *    everything else would fall through to the direct download. That
 *    assumption quietly stopped being true: modern desktop Chrome/Edge (and
 *    some Android builds) now implement it too, routing a plain "save this
 *    photo" tap into the OS's generic share panel — which has no "save to
 *    disk" entry, because sharing to another app and saving a file are
 *    different actions. On a desktop machine with no share target
 *    registered that panel can even be empty, which is indistinguishable
 *    from nothing having happened at all. Restricting the share route to
 *    the one platform that genuinely needs it — checked directly, not
 *    inferred from which APIs happen to exist — is what this file now
 *    does, restoring the behaviour its own original comment already
 *    described as the intent.
 */

/** iPadOS reports navigator.platform as "MacIntel", the same as a real Mac,
 *  since iOS 13 — maxTouchPoints is what actually tells them apart (a real
 *  Mac reports 0). */
function isIOSLike(): boolean {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

const extOf = (blob: Blob): string => blob.type.split('/')[1]?.split(';')[0] || 'jpg';

/**
 * Fetches the bytes and saves them as a real file via a blob: URL.
 *
 * Returns whether it actually ran to completion — a network failure or a
 * genuinely unsupported browser returns false rather than silently opening
 * the raw image in a new tab, which looked like "nothing happened" and gave
 * the caller no way to tell the difference from a real save.
 */
export async function downloadBlobUrl(url: string, filename?: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || `mellow-play-${Date.now()}.${extOf(blob)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Freed on the next tick rather than immediately — some browsers read
    // the blob: URL asynchronously once the click triggers navigation, and
    // revoking it inline has been reported to race that read.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    return true;
  } catch {
    return false;
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
 * One photo, to the device. Returns whether it is actually saved (or, on
 * iOS, handed to the OS to save) — false means the caller should tell the
 * person it didn't work, not assume it did.
 */
export async function savePhoto(url: string, filename?: string): Promise<boolean> {
  if (isIOSLike() && (await saveViaShare([url]))) return true;
  return downloadBlobUrl(url, filename);
}

/**
 * Save several photos: the share sheet where the platform genuinely has no
 * other way (iOS/iPadOS → one "Save Images" prompt), staggered direct blob
 * downloads everywhere else — which is every other platform, including
 * Android and desktop regardless of whether they happen to expose
 * navigator.share too. The stagger is what keeps desktop browsers from
 * coalescing thirty programmatic clicks into one.
 *
 * Returns the number that were saved (or handed off) successfully, so a
 * caller can say "12 บันทึกแล้ว" and, if that is short of the total, that
 * some failed rather than staying silent about it.
 */
export async function saveMany(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (isIOSLike() && (await saveViaShare(urls, onProgress))) return urls.length;

  const results = await Promise.all(
    urls.map((url, idx) => new Promise<boolean>((resolve) => {
      setTimeout(() => { void downloadBlobUrl(url).then(resolve); }, idx * 300);
    })),
  );
  return results.filter(Boolean).length;
}
