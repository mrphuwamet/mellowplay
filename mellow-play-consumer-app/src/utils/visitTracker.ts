import apiClient from './apiClient';

// crypto.randomUUID() isn't implemented in every WebView engine (some
// embedded/in-app browser contexts — e.g. certain LINE OpenChat webviews —
// throw on it). Since this ran unconditionally on every page load with no
// error boundary anywhere in the app, that throw crashed the entire React
// render into a blank white screen, with nothing LIFF-related about it at
// all. This is just a best-effort per-device id for an "active now" widget,
// not anything security-sensitive, so a non-crypto fallback is fine.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to the manual generator below
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Lightweight presence ping for the CRM Dashboard's "active now" widget —
// not a full analytics/session system. One random ID persisted per browser
// so repeat visits from the same device count once toward "active now".
export function getSessionId(): string {
  let id = localStorage.getItem('mellow_session_id');
  if (!id) {
    id = generateId();
    localStorage.setItem('mellow_session_id', id);
  }
  return id;
}

// React 18 StrictMode intentionally double-invokes effects in development
// (mount → cleanup → mount again), which fired this twice per navigation
// there — harmless in production builds (StrictMode's double-invoke is a
// dev-only check), but let's dedupe defensively so the CRM's visit count
// can't double-count from any accidental repeat call, dev or not.
let lastPing: { path: string; at: number } | null = null;

export function pingVisit(path: string) {
  const now = Date.now();
  if (lastPing && lastPing.path === path && now - lastPing.at < 2000) return;
  lastPing = { path, at: now };
  apiClient.post('/visits/ping', { sessionId: getSessionId(), path }).catch(() => {});
}
