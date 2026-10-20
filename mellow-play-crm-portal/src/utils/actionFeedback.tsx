import { useCallback, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

/**
 * What to put on screen when a write fails.
 *
 * The backend answers a refused write with `{ success: false, message }` and
 * that message is already written for the person reading it — a capacity
 * clash, a duplicate name, a booking that cannot be cancelled this late. It is
 * better than anything this layer could invent, so it is preferred whenever it
 * is there.
 *
 * A 401 never reaches here: the response interceptor in axiosSetup clears the
 * session and navigates to /login before any page sees it.
 */
export const describeApiError = (err: any, fallback = 'ทำรายการไม่สำเร็จ'): string => {
  const fromServer = err?.response?.data?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer.trim();

  const status = err?.response?.status;
  if (status === 403) return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
  if (status === 404) return 'ไม่พบรายการนี้แล้ว — อาจถูกลบไปก่อนหน้า';
  if (status === 409) return 'ข้อมูลชนกับรายการอื่น กรุณาตรวจสอบอีกครั้ง';
  if (status === 429) return 'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (typeof status === 'number' && status >= 500) return 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่อีกครั้ง';

  // No response at all: offline, DNS, CORS, or a request that timed out.
  if (err?.code === 'ECONNABORTED') return 'หมดเวลารอเซิร์ฟเวอร์ กรุณาลองใหม่';
  if (err?.request) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';

  return fallback;
};

/**
 * One success message and one failure message per screen.
 *
 * Every CRM page already announces that a save worked. Almost none of them
 * said anything when it did not: the catch logged to a console nobody has
 * open, and the dialog closed as if the record had been written. "กดแล้วไม่
 * เกิดอะไร" was reported for exactly this, and the data was gone.
 *
 * Success auto-hides after four seconds because it confirms something the
 * person just watched happen. **A failure stays until it is dismissed** — it
 * reports something they did not see, often while their attention is on a
 * dialog, and a message that disappears before it is read is the silence this
 * replaces.
 *
 * Both render bottom-center, above a dialog rather than behind one, so a
 * failed save inside a form is visible without closing the form first.
 */
export function useActionFeedback() {
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const showSuccess = useCallback((msg: string) => {
    setErrorMsg('');
    setSuccessMsg(msg);
  }, []);

  /** Takes the caught error itself, so no call site has to unwrap axios. */
  const showError = useCallback((err: any, fallback?: string) => {
    setSuccessMsg('');
    setErrorMsg(describeApiError(err, fallback));
  }, []);

  const feedback = useMemo(() => (
    <>
      <Snackbar
        open={!!successMsg}
        autoHideDuration={4000}
        onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSuccessMsg('')} sx={{ borderRadius: 2, fontWeight: 600 }}>
          {successMsg}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!errorMsg}
        onClose={() => setErrorMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      >
        <Alert severity="error" variant="filled" onClose={() => setErrorMsg('')} sx={{ borderRadius: 2, fontWeight: 600 }}>
          {errorMsg}
        </Alert>
      </Snackbar>
    </>
  ), [successMsg, errorMsg]);

  return { showSuccess, showError, feedback, successMsg, errorMsg };
}
