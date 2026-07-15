import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Loader2, ChevronLeft } from 'lucide-react';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import logo from '../assets/ui/logo.svg';
import PinInput from '../components/PinInput';
import PinPad from '../components/PinPad';

type Step = 'phone' | 'otp' | 'pin';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [otpRef, setOtpRef] = useState('');

  const handleRequestOtp = async () => {
    if (!phone.trim()) {
      setError(t.register?.otpFailed || 'Phone number required');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const res = await apiClient.post('/auth/forgot-password/request-otp', { phone });
      
      if (res.data.success) {
        setSuccessMessage(t.login.otpSent || 'OTP sent successfully');
        setOtpRef(res.data.ref || '');
        if (res.data.debug_otp) {
          // Dev mode
          setOtp(res.data.debug_otp);
        }
        setStep('otp');
      } else {
        setError(res.data.message || t.login.loginFailed);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t.login.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) {
      setError(t.register?.invalidOtp || 'Invalid OTP');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await apiClient.post('/auth/forgot-password/verify-otp', { phone, otp });
      if (res.data.success) {
        setPinStep('create');
        setNewPin('');
        setConfirmPin('');
        setStep('pin');
      } else {
        setError(res.data.message || t.register?.invalidOtp || 'Invalid OTP');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register?.invalidOtp || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (finalPin: string) => {
    setIsLoading(true);
    setError('');

    try {
      const res = await apiClient.post('/auth/forgot-password/reset', {
        phone,
        otp,
        newPassword: finalPin
      });

      if (res.data.success) {
        setSuccessMessage('Password reset successfully');
        setTimeout(() => {
          navigate('/login');
        }, 1500);
      } else {
        setError(res.data.message || t.login.loginFailed);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t.login.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'pin') {
      setPinStep('create');
      setNewPin('');
      setConfirmPin('');
      setStep('otp');
    } else if (step === 'otp') {
      setStep('phone');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="mellow-page flex flex-col justify-center px-8 bg-white">
      <div className="absolute top-6 left-6 z-10">
        <button 
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all"
        >
          <ChevronLeft size={24} />
        </button>
      </div>
      <div className="absolute top-6 right-6 z-10">
        <LanguageToggle />
      </div>
      <div className="text-center mb-10 mt-12">
        <img src={logo} alt="Mellow Play" className="h-12 mx-auto mb-6" />
        <h1 className="text-2xl font-black text-mellow-ink">{t.login.resetPin || 'Reset PIN'}</h1>
        {step === 'phone' && <p className="text-slate-400 font-bold mt-2">{t.login.resetPinDesc || 'Enter phone number'}</p>}
        {step === 'otp' && <p className="text-slate-400 font-bold mt-2">{t.register?.stepOtpDesc} {phone}</p>}
        {step === 'pin' && (
          <p className="text-slate-400 font-bold mt-2">
            {pinStep === 'create' ? (t.login.newPin || 'New PIN') : (t.login.confirmNewPin || 'Confirm New PIN')}
          </p>
        )}
      </div>

      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm flex flex-col gap-2 items-center pointer-events-none [&>*]:pointer-events-auto">
        <Toast message={successMessage || ''} type="success" onClose={() => setSuccessMessage('')} />
        <Toast message={error || ''} type="error" onClose={() => setError('')} />
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">

        {step === 'phone' && (
          <>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Phone size={20} />
              </div>
              <input
                type="text"
                placeholder={t.login.phonePlaceholder}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                required
              />
            </div>
            <button
              type="button"
              onClick={handleRequestOtp}
              disabled={isLoading}
              className="w-full mellow-btn-primary mt-4 disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin mx-auto" /> : <>{t.register?.nextStep || 'Next'} <ArrowRight size={20} /></>}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <div className="relative">
              <label className="text-[13px] font-bold text-slate-500 mb-3 block text-center">
                {t.login.pinLabel || 'Enter OTP'}
              </label>
              <PinInput
                length={6}
                value={otp}
                onChange={(val) => setOtp(val)}
              />
            </div>
            {otpRef && (
              <div className="text-center text-sm font-black text-slate-600 bg-slate-50 border border-slate-100 py-3 rounded-2xl my-4">
                {lang === 'th' ? `รหัสอ้างอิง (Ref): ${otpRef}` : `Reference Code: ${otpRef}`}
              </div>
            )}
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={isLoading}
              className="w-full mellow-btn-primary mt-4 disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin mx-auto" /> : <>{t.register?.nextStep || 'Next'} <ArrowRight size={20} /></>}
            </button>
          </>
        )}

        {step === 'pin' && (
          <>
            <PinPad
              length={6}
              value={pinStep === 'create' ? newPin : confirmPin}
              onChange={(val) => {
                if (pinStep === 'create') {
                  setNewPin(val);
                  if (val.length === 6) {
                    setTimeout(() => setPinStep('confirm'), 300);
                  }
                } else {
                  setConfirmPin(val);
                  if (val.length === 6) {
                    if (val === newPin) {
                      setTimeout(() => handleResetPassword(val), 300);
                    } else {
                      setError(t.login.pinMismatch || 'PINs do not match');
                      setConfirmPin('');
                      setPinStep('create');
                      setNewPin('');
                    }
                  }
                }
              }}
            />
            {isLoading && (
              <div className="flex justify-center mt-4">
                <Loader2 className="animate-spin text-mellow-purple" />
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
};

export default ForgotPassword;
