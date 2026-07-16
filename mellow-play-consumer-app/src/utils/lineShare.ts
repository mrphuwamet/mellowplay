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

// Feature-detects rather than assuming "inside LINE = available, outside =
// not" — shareTargetPicker can work from an external browser too (LINE
// handles the hand-off), so this is the one source of truth for whether to
// show the share button at all.
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

// Plain text messages only — deliberately not Flex Messages, whose JSON
// schema is easy to get subtly wrong. `liff.shareTargetPicker` resolves to
// `undefined` when the user closes the picker without sending; that's a
// normal cancel, not a failure.
export const shareToLine = async (text: string): Promise<ShareResult> => {
  try {
    const liff = await getLiff();
    if (!liff || !liff.isApiAvailable('shareTargetPicker')) {
      return { status: 'unavailable' };
    }
    const result = await liff.shareTargetPicker([{ type: 'text', text }]);
    if (!result) return { status: 'cancelled' };
    return { status: 'sent' };
  } catch (err: any) {
    console.error('LINE share failed:', err);
    return { status: 'error', message: err?.message };
  }
};
