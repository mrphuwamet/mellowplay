import apiClient from './apiClient';

// LIFF must work the same whether the page is opened inside the LINE app or
// in a normal browser — every step here is best-effort and swallows its own
// errors, so a missing/invalid LIFF ID, no network to LINE's platform, or an
// old LINE app version just means "share isn't available" rather than a
// broken button or a crash in the surrounding page (booking/course detail).

let liffIdPromise: Promise<string | null> | null = null;
let liffInitPromise: Promise<typeof import('@line/liff').default | null> | null = null;

const fetchLiffId = async (): Promise<string | null> => {
  if (!liffIdPromise) {
    liffIdPromise = apiClient
      .get('/public/liff-config')
      .then((res) => (res.data?.success ? (res.data.liffId as string | null) : null))
      .catch(() => null);
  }
  return liffIdPromise;
};

const getLiff = async () => {
  if (!liffInitPromise) {
    liffInitPromise = (async () => {
      try {
        const liffId = await fetchLiffId();
        if (!liffId) return null;
        const { default: liff } = await import('@line/liff');
        await liff.init({ liffId });
        return liff;
      } catch (err) {
        console.error('LIFF init failed:', err);
        return null;
      }
    })();
  }
  return liffInitPromise;
};

// Cheap, init-free check for whether we're inside LINE's in-app browser (it
// sets a distinctive "Line/x.x.x" token in the user agent). This is used to
// decide *when it's safe to eagerly call liff.init()* — not whether to show
// the button. The first liff.init() call inside LINE's own in-app browser
// does a real page redirect through LINE's domain to bootstrap the session,
// which drops whatever path the user was on (bounced every course/booking
// page view back to Home). liff.init() from a normal external browser does
// NOT do that redirect, so it's safe to call eagerly there.
export const isInLineApp = (): boolean => /\bLine\//.test(navigator.userAgent);

// Feature-detects rather than assuming "not in LINE = never available" —
// LIFF's shareTargetPicker can work from an external browser too (LINE
// hands off to its own app/QR flow), which is why this must still exist
// alongside isInLineApp: outside LINE, this eager check is safe and is the
// only way to know whether to show the button at all.
export const isLineShareAvailable = async (): Promise<boolean> => {
  try {
    const liff = await getLiff();
    if (!liff) return false;
    return liff.isApiAvailable('shareTargetPicker');
  } catch {
    return false;
  }
};

export type ShareResult = { status: 'sent' | 'cancelled' | 'unavailable' | 'error'; message?: string };

// The very first liff.init() call in a fresh LINE in-app-browser session can
// still trigger the redirect-bootstrap described above even when it's
// deferred to click-time (share also requires re-consenting to a chat
// message-sending scope the first time) — the tab visibly flickers/reloads
// and tears down the click's JS context before shareTargetPicker ever
// opens, so the share silently goes nowhere. Stash the pending text before
// calling in, so whoever restores state after the redirect (App.tsx) can
// retry it automatically once LIFF is actually initialized.
const PENDING_SHARE_KEY = 'mellow_pending_line_share';

// Plain text messages only — deliberately not Flex Messages, whose JSON
// schema is easy to get subtly wrong. `liff.shareTargetPicker` resolves to
// `undefined` when the user closes the picker without sending; that's a
// normal cancel, not a failure.
export const shareToLine = async (text: string): Promise<ShareResult> => {
  try {
    sessionStorage.setItem(PENDING_SHARE_KEY, text);
    const liff = await getLiff();
    if (!liff || !liff.isApiAvailable('shareTargetPicker')) {
      sessionStorage.removeItem(PENDING_SHARE_KEY);
      return { status: 'unavailable' };
    }
    const result = await liff.shareTargetPicker([{ type: 'text', text }]);
    sessionStorage.removeItem(PENDING_SHARE_KEY);
    if (!result) return { status: 'cancelled' };
    return { status: 'sent' };
  } catch (err: any) {
    sessionStorage.removeItem(PENDING_SHARE_KEY);
    console.error('LINE share failed:', err);
    return { status: 'error', message: err?.message };
  }
};

// Called once from App.tsx on every fresh mount — if a share attempt never
// got the chance to clear its pending flag (because the redirect above tore
// the page down mid-flight), it's still there when the page comes back, so
// retry it. LIFF's session context is now actually established, so this
// second attempt goes through as a normal share instead of triggering
// another redirect.
export const retryPendingLineShare = (): void => {
  const pending = sessionStorage.getItem(PENDING_SHARE_KEY);
  if (!pending) return;
  sessionStorage.removeItem(PENDING_SHARE_KEY);
  shareToLine(pending).catch(() => {});
};
