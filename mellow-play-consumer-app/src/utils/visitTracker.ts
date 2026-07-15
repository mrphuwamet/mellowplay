import apiClient from './apiClient';

// Lightweight presence ping for the CRM Dashboard's "active now" widget —
// not a full analytics/session system. One random ID persisted per browser
// so repeat visits from the same device count once toward "active now".
function getSessionId(): string {
  let id = localStorage.getItem('mellow_session_id');
  if (!id) {
    id = crypto.randomUUID();
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
