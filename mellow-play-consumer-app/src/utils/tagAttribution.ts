// Sponsor/marketing link attribution. Sponsors append their own ?tag=xxx to
// whatever link they share (home page, a class, an event — any URL in the
// app), so this has to work app-wide, not just on one landing page.
//
// Captured tags are persisted to localStorage (survives refresh and internal
// navigation that drops the query param) with a timestamp. On booking, the
// most recently captured tag is attributed — but only if it's still within
// the attribution window below. Once it expires, it's treated the same as
// never having a tag at all (organic), on the assumption that after that
// long a gap the visitor is more likely browsing back in through some other,
// untagged link rather than still following the original share.
import apiClient from './apiClient';
import { getSessionId } from './visitTracker';

const TAG_STORAGE_KEY = 'mellow_sponsor_tag';
const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredTag {
  tag: string;
  capturedAt: number;
}

// Call on every route change (including client-side navigations), not just
// app boot — a sponsor's link can point at any page.
export function captureTagFromUrl(search: string): void {
  const tag = new URLSearchParams(search).get('tag');
  if (!tag) return;
  const stored: StoredTag = { tag, capturedAt: Date.now() };
  localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(stored));

  // The arrival itself is the click-through: the tag rides in the URL of the
  // shared link, so a page load carrying one is somebody opening it. Recorded
  // separately from the booking attribution above, which only ever sees the
  // small share of visitors who go on to register.
  recordClick(tag);
}

// A refresh, or React re-running the effect, must not read as a second person
// arriving. Anything closer together than this is treated as the same click.
const CLICK_DEDUPE_MS = 5000;
let lastClick: { tag: string; at: number } | null = null;

function recordClick(tag: string): void {
  const now = Date.now();
  if (lastClick && lastClick.tag === tag && now - lastClick.at < CLICK_DEDUPE_MS) return;
  lastClick = { tag, at: now };
  // Never surfaced to the visitor: a lost click is a missing row in a report,
  // not a broken page.
  apiClient.post('/visits/tag-click', {
    tag,
    path: window.location.pathname,
    sessionId: getSessionId(),
  }).catch(() => {});
}

// Returns the tag to attribute a booking to, or null if there isn't one
// (never captured, or captured but expired — both read as "no tag").
export function getAttributedTag(): string | null {
  const raw = localStorage.getItem(TAG_STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: StoredTag = JSON.parse(raw);
    if (!stored?.tag || !stored.capturedAt) {
      localStorage.removeItem(TAG_STORAGE_KEY);
      return null;
    }
    if (Date.now() - stored.capturedAt > ATTRIBUTION_WINDOW_MS) {
      localStorage.removeItem(TAG_STORAGE_KEY);
      return null;
    }
    return stored.tag;
  } catch {
    localStorage.removeItem(TAG_STORAGE_KEY);
    return null;
  }
}
