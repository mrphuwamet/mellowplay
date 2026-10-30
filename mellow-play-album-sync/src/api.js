import { config } from './config.js';

/**
 * The one admin session this whole tool runs on.
 *
 * Login is not optional scaffolding — it is the point. Every call below sends
 * the Bearer token the server handed back from /auth/admin/login, and the
 * server's own admin-route middleware (requireCrmAuth) refuses anything
 * without a valid admin JWT. A wrong password here means the tool never gets
 * a token in the first place and never calls the upload API at all — there
 * is no path through this file that reaches R2 or the album table without
 * one.
 */
class AdminSession {
  constructor() {
    this.token = null;
    this.loggedInAt = 0;
    // The queue processes several photos at once (see watcher.js), so a
    // revoked token is discovered by several in-flight requests in the same
    // instant. Without sharing one attempt, each would fire its own login
    // request concurrently — not wrong (the last one to land still leaves
    // every caller with a working token), just a pointless stampede of
    // logins for one revocation. Every caller already mid-flight when this
    // is set awaits the same promise instead.
    this.loginPromise = null;
  }

  /** Re-authenticates even if a token is already held — used on startup and
   *  on the periodic refresh, never silently skipped. Safe to call from
   *  several places at once; only one request to the server happens. */
  async login() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      const res = await fetch(`${config.apiUrl}/api/v1/auth/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.token) {
        const reason = body?.message || `HTTP ${res.status}`;
        throw new Error(`admin login failed: ${reason}`);
      }
      this.token = body.token;
      this.loggedInAt = Date.now();
    })();
    try {
      await this.loginPromise;
    } finally {
      this.loginPromise = null;
    }
  }

  /** The 30-day token would still be good for a long-running process, but
   *  refreshing well inside that window means a password rotated by someone
   *  else is caught on the next cycle rather than a month later. */
  async refreshIfStale() {
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    if (Date.now() - this.loggedInAt > TWELVE_HOURS) await this.login();
  }

  /**
   * One admin-authenticated request, with exactly one retry: a 401 triggers
   * a single re-login and replay, which covers a token revoked out from
   * under the process (password changed, account disabled) without masking
   * a password that was simply wrong from the start — login() itself throws
   * for that, before this is ever reached.
   */
  async call(path, init = {}, { retried = false } = {}) {
    if (!this.token) await this.login();
    const headers = { ...(init.headers || {}), Authorization: `Bearer ${this.token}` };
    const res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
    if (res.status === 401 && !retried) {
      await this.login();
      return this.call(path, init, { retried: true });
    }
    return res;
  }
}

export const session = new AdminSession();

/** Every album the CRM knows about, id + name. Re-fetched by the caller
 *  whenever an unrecognised folder name shows up, in case the album was
 *  just created. */
export async function listAlbums() {
  const res = await session.call('/api/v1/admin/event-albums');
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) throw new Error(body?.message || `HTTP ${res.status}`);
  return (body.albums || []).map(a => ({ id: a.id, name: a.name }));
}

/** Same multipart shape the CRM's browser importer sends — one file,
 *  one destination folder, back comes the R2 URL. */
export async function uploadFile(buffer, filename, mimeType, folder) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('folder', folder);
  const res = await session.call('/api/v1/admin/upload', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) throw new Error(body?.message || `upload failed: HTTP ${res.status}`);
  return body.url;
}

/** Registers one photo already sitting in R2 against an album. Mirrors the
 *  CRM's POST body exactly — this endpoint has no idea an upload came from
 *  a local folder instead of a browser tab, and that is the design: the
 *  server only ever receives finished artifacts. */
export async function addPhoto(albumId, photo) {
  const res = await session.call(`/api/v1/admin/event-albums/${albumId}/photos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ photos: [photo] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) throw new Error(body?.message || `register failed: HTTP ${res.status}`);
  return body;
}
