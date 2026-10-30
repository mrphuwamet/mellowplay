import 'dotenv/config';
import path from 'node:path';

/**
 * Everything the tool needs, read once at startup and validated loudly.
 *
 * A daemon meant to run unattended for days must fail at the door rather
 * than halfway through the first scan — a missing ADMIN_PASSWORD should stop
 * the process with a clear message, not surface as a 401 on the first photo
 * an hour later with nobody watching the terminal.
 */
function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    console.error(`[config] ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return String(value).trim();
}

// Overridable only for testing a flaky-connection scenario without a real
// multi-minute wait — not documented in .env.example because the defaults
// (2s, 8s, 30s) are what every real deployment should use.
const defaultRetryDelays = [2_000, 8_000, 30_000];
const retryDelaysMs = process.env.RETRY_DELAYS_MS
  ? process.env.RETRY_DELAYS_MS.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 0)
  : defaultRetryDelays;

export const config = {
  apiUrl: required('API_URL').replace(/\/+$/, ''),
  adminEmail: required('ADMIN_EMAIL'),
  adminPassword: required('ADMIN_PASSWORD'),
  root: path.resolve(process.cwd(), process.env.ALBUM_SYNC_ROOT || './photos'),
  usePolling: String(process.env.WATCH_USE_POLLING || '').toLowerCase() === 'true',
  retryDelaysMs,

  // Optional — only the LumaBooth relay (src/lumabooth-relay.js) needs
  // these, and it checks them itself at startup. Left optional here so
  // someone who never touches a photo booth isn't told to configure one.
  lumaboothExportRoot: process.env.LUMABOOTH_EXPORT_ROOT
    ? path.resolve(process.cwd(), process.env.LUMABOOTH_EXPORT_ROOT) : null,
  lumaboothTargetAlbum: process.env.LUMABOOTH_TARGET_ALBUM
    ? String(process.env.LUMABOOTH_TARGET_ALBUM).trim() : null,
};
