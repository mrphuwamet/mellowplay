import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';

// Setting a new PIN from a staff-issued link.
//
// Separate from ForgotPassword, which is the customer's own route in and goes
// through an SMS OTP. This one is for when staff at the counter hand the link
// over — on LINE, or read out — for a customer who cannot get in and whose
// phone may not even receive the OTP. The token in the link is the credential,
// so the page never says whose account it belongs to.

// Mirrors mellow-play-backend-api/src/utils/pin.ts. The server checks it too;
// this is only so the customer is told before submitting.
const PIN_LENGTH = 6;
const isValidPin = (pin: string) => new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);

const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Checked before the form is drawn: filling in a PIN twice and only then
  // being told the link expired is the worst version of this page.
  useEffect(() => {
    if (!token) { setLinkError('ลิงก์ไม่ถูกต้อง'); setChecking(false); return; }
    let cancelled = false;
    apiClient.get(`/auth/reset-password/check?token=${encodeURIComponent(token)}`)
      .then(res => { if (!cancelled && !res.data.success) setLinkError(res.data.message || 'ลิงก์ใช้ไม่ได้'); })
      .catch(err => { if (!cancelled) setLinkError(err?.response?.data?.message || 'ลิงก์ใช้ไม่ได้'); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    if (!isValidPin(pin)) { setError('PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'); return; }
    if (pin !== confirmPin) { setError('PIN ทั้งสองช่องไม่ตรงกัน'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/reset-password', { token, password: pin });
      if (res.data.success) setDone(true);
      else setError(res.data.message || 'ตั้งรหัสใหม่ไม่สำเร็จ');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'ตั้งรหัสใหม่ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const boxClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-center text-2xl font-black tracking-[0.4em] text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-body-scope">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm p-6 space-y-4">
        <h1 className="text-[22px] font-black text-slate-800">ตั้งรหัส PIN ใหม่</h1>

        {checking ? (
          <p className="text-sm font-bold text-slate-400">กำลังตรวจสอบลิงก์...</p>
        ) : linkError ? (
          <>
            <div className="px-4 py-3 rounded-2xl bg-red-50 text-mellow-red text-sm font-bold">{linkError}</div>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่ รหัสเดิมของท่านยังใช้งานได้ตามปกติ
            </p>
          </>
        ) : done ? (
          <>
            <div className="px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-700 text-sm font-bold">
              ตั้งรหัส PIN ใหม่เรียบร้อยแล้ว
            </div>
            <button type="button" onClick={() => navigate('/login')}
              className="w-full py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider active:scale-95 transition-all">
              เข้าสู่ระบบ
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-500 leading-relaxed">
              ตั้งรหัส PIN 6 หลักสำหรับเข้าสู่ระบบด้วยเบอร์โทรศัพท์ของท่าน
            </p>
            {/* inputMode numeric so a phone shows the number pad, and the value
                is filtered rather than relying on type=number, which lets in
                "e", "+" and a spinner nobody wants on a PIN. */}
            <input
              type="password" inputMode="numeric" autoComplete="new-password"
              maxLength={PIN_LENGTH} placeholder="••••••" className={boxClass}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH))}
            />
            <input
              type="password" inputMode="numeric" autoComplete="new-password"
              maxLength={PIN_LENGTH} placeholder="ยืนยัน PIN" className={boxClass}
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH))}
            />
            {error && <p className="text-xs font-bold text-mellow-red">{error}</p>}
            <button
              type="button" onClick={submit} disabled={saving}
              className="w-full py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึกรหัสใหม่'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
