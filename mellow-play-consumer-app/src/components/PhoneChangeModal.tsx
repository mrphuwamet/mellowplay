import React, { useEffect, useState } from 'react';
import { X, Phone, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { getOtpErrorMessage } from '../utils/otpError';

interface PhoneChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPhone: string) => void;
}

type Step = 'loading' | 'currentOtp' | 'newPhone' | 'newOtp';

const PhoneChangeModal: React.FC<PhoneChangeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { lang } = useTranslation();
  const [step, setStep] = useState<Step>('loading');
  const [currentPhone, setCurrentPhone] = useState('');
  const [currentRef, setCurrentRef] = useState('');
  const [currentOtp, setCurrentOtp] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newOtp, setNewOtp] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(60);

  const reset = () => {
    setStep('loading');
    setCurrentPhone('');
    setCurrentRef('');
    setCurrentOtp('');
    setNewPhone('');
    setNewRef('');
    setNewOtp('');
    setError('');
    setResendTimer(60);
  };

  const requestCurrentOtp = async () => {
    setIsBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/phone-change/request-current-otp');
      if (res.data.skipIdentityStep) {
        setStep('newPhone');
        return;
      }

      // otpRequired is false when OTP verification is switched off
      // system-wide (CRM > System Settings) — the backend already marks
      // identity as confirmed in that case, so just move on.
      if (res.data.otpRequired === false) {
        setStep('newPhone');
        return;
      }

      setCurrentPhone(res.data.phone || '');
      setCurrentRef(res.data.ref || '');
      setResendTimer(60);
      setStep('currentOtp');
    } catch (err: any) {
      setError(getOtpErrorMessage(err, lang, lang === 'en' ? 'Something went wrong.' : 'เกิดข้อผิดพลาด'));
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (!isOpen) { reset(); return; }
    requestCurrentOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Resend countdown — ticks down on both OTP steps, matching Register.tsx's pattern.
  useEffect(() => {
    if ((step !== 'currentOtp' && step !== 'newOtp') || resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  if (!isOpen) return null;

  const handleVerifyCurrentOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      await apiClient.post('/auth/phone-change/verify-current-otp', { otp: currentOtp });
      setStep('newPhone');
    } catch (err: any) {
      setError(getOtpErrorMessage(err, lang, lang === 'en' ? 'Invalid code.' : 'รหัสไม่ถูกต้อง'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRequestNewOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (step === 'newOtp' && resendTimer > 0) return; // Prevent spam
    setIsBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/phone-change/request-new-otp', { newPhone });

      // Same as above — OTP is off system-wide, so the backend already
      // completed the phone change immediately instead of waiting for a
      // confirm step with a code the customer never received.
      if (res.data.otpRequired === false) {
        onSuccess(res.data.phone || newPhone);
        onClose();
        return;
      }

      setNewRef(res.data.ref || '');
      setNewOtp('');
      setResendTimer(60);
      setStep('newOtp');
    } catch (err: any) {
      setError(getOtpErrorMessage(err, lang, lang === 'en' ? 'Something went wrong.' : 'เกิดข้อผิดพลาด'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/phone-change/confirm', { otp: newOtp });
      onSuccess(res.data.phone || newPhone);
      onClose();
    } catch (err: any) {
      setError(getOtpErrorMessage(err, lang, lang === 'en' ? 'Invalid code.' : 'รหัสไม่ถูกต้อง'));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm bg-white rounded-[28px] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
          <X size={16} />
        </button>

        <div className="w-14 h-14 rounded-full bg-mellow-purple/10 flex items-center justify-center mx-auto mb-4">
          {step === 'newPhone' ? <Phone size={22} className="text-mellow-purple" /> : <ShieldCheck size={22} className="text-mellow-purple" />}
        </div>

        <h3 className="text-lg font-black text-slate-800 mb-1 text-center">
          {lang === 'en' ? 'Change Phone Number' : 'เปลี่ยนเบอร์โทรศัพท์'}
        </h3>

        {step === 'loading' && (
          error ? (
            // The initial request-current-otp call failed (rate limit,
            // network, auth, etc.) — this used to leave the spinner running
            // forever with no way out besides closing the modal outright.
            <div className="py-2 space-y-4">
              <p className="text-xs font-bold text-red-500 text-center leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={() => { setError(''); setStep('loading'); requestCurrentOtp(); }}
                disabled={isBusy}
                className="w-full mellow-btn-primary flex items-center justify-center gap-2"
              >
                {isBusy ? <Loader2 className="animate-spin" size={18} /> : (lang === 'en' ? 'Try Again' : 'ลองอีกครั้ง')}
              </button>
            </div>
          ) : (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-mellow-purple" size={24} />
            </div>
          )
        )}

        {step === 'currentOtp' && (
          <form onSubmit={handleVerifyCurrentOtp} className="space-y-4">
            <p className="text-xs font-bold text-slate-500 text-center leading-relaxed">
              {lang === 'en'
                ? `To confirm it's you, enter the code sent to your current number ${currentPhone}`
                : `เพื่อยืนยันตัวตน กรุณากรอกรหัสที่ส่งไปยังเบอร์เดิมของคุณ ${currentPhone}`}
            </p>
            {currentRef && (
              <div className="text-center text-xs font-black text-slate-600 bg-slate-50 border border-slate-100 py-2.5 rounded-xl">
                {lang === 'en' ? 'Reference' : 'รหัสอ้างอิง'}: {currentRef}
              </div>
            )}
            <input
              type="text" inputMode="numeric" maxLength={6} autoFocus
              value={currentOtp} onChange={e => setCurrentOtp(e.target.value)}
              placeholder="••••••"
              className="w-full text-center tracking-[0.5em] text-xl font-black py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              required
            />
            {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={isBusy || currentOtp.length < 4} className="w-full mellow-btn-primary flex items-center justify-center gap-2">
              {isBusy ? <Loader2 className="animate-spin" size={18} /> : <>{lang === 'en' ? 'Verify' : 'ยืนยัน'} <ArrowRight size={16} /></>}
            </button>
            <p className="text-center text-slate-400 text-xs font-bold">
              {resendTimer > 0 ? (
                <span>{lang === 'en' ? `Resend code in ${resendTimer}s` : `ขอรหัสใหม่ได้ในอีก ${resendTimer} วินาที`}</span>
              ) : (
                <>
                  {lang === 'en' ? "Didn't receive it? " : 'ไม่ได้รับรหัส? '}
                  <button type="button" onClick={requestCurrentOtp} disabled={isBusy} className="text-mellow-purple underline font-black">
                    {lang === 'en' ? 'Resend' : 'ส่งรหัสอีกครั้ง'}
                  </button>
                </>
              )}
            </p>
            <p className="text-center text-slate-300 text-[12px] font-bold">
              {lang === 'en' ? 'Still not receiving it? Contact admin via LINE: @mellowplay' : 'หากไม่ได้รับ OTP กรุณาติดต่อผู้ดูแล LINE: @mellowplay'}
            </p>
          </form>
        )}

        {step === 'newPhone' && (
          <form onSubmit={handleRequestNewOtp} className="space-y-4">
            <p className="text-xs font-bold text-slate-500 text-center leading-relaxed">
              {lang === 'en' ? 'Enter your new phone number' : 'กรอกเบอร์โทรศัพท์ใหม่ของคุณ'}
            </p>
            <input
              type="tel" inputMode="numeric" autoFocus
              value={newPhone} onChange={e => setNewPhone(e.target.value)}
              placeholder="08xxxxxxxx"
              className="w-full text-center text-lg font-black py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              required
            />
            {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={isBusy || newPhone.length < 9} className="w-full mellow-btn-primary flex items-center justify-center gap-2">
              {isBusy ? <Loader2 className="animate-spin" size={18} /> : <>{lang === 'en' ? 'Send Code' : 'ส่งรหัส OTP'} <ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {step === 'newOtp' && (
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-xs font-bold text-slate-500 text-center leading-relaxed">
              {lang === 'en' ? `Enter the code sent to ${newPhone}` : `กรอกรหัสที่ส่งไปยัง ${newPhone}`}
            </p>
            {newRef && (
              <div className="text-center text-xs font-black text-slate-600 bg-slate-50 border border-slate-100 py-2.5 rounded-xl">
                {lang === 'en' ? 'Reference' : 'รหัสอ้างอิง'}: {newRef}
              </div>
            )}
            <input
              type="text" inputMode="numeric" maxLength={6} autoFocus
              value={newOtp} onChange={e => setNewOtp(e.target.value)}
              placeholder="••••••"
              className="w-full text-center tracking-[0.5em] text-xl font-black py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              required
            />
            {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={isBusy || newOtp.length < 4} className="w-full mellow-btn-primary flex items-center justify-center gap-2">
              {isBusy ? <Loader2 className="animate-spin" size={18} /> : <>{lang === 'en' ? 'Confirm Change' : 'ยืนยันการเปลี่ยนเบอร์'}</>}
            </button>
            <p className="text-center text-slate-400 text-xs font-bold">
              {resendTimer > 0 ? (
                <span>{lang === 'en' ? `Resend code in ${resendTimer}s` : `ขอรหัสใหม่ได้ในอีก ${resendTimer} วินาที`}</span>
              ) : (
                <>
                  {lang === 'en' ? "Didn't receive it? " : 'ไม่ได้รับรหัส? '}
                  <button type="button" onClick={() => handleRequestNewOtp()} disabled={isBusy} className="text-mellow-purple underline font-black">
                    {lang === 'en' ? 'Resend' : 'ส่งรหัสอีกครั้ง'}
                  </button>
                </>
              )}
            </p>
            <p className="text-center text-slate-300 text-[12px] font-bold">
              {lang === 'en' ? 'Still not receiving it? Contact admin via LINE: @mellowplay' : 'หากไม่ได้รับ OTP กรุณาติดต่อผู้ดูแล LINE: @mellowplay'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default PhoneChangeModal;
