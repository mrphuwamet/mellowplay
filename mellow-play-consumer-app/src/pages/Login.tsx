import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Phone, ArrowRight, Loader2, ChevronLeft, AlertCircle } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useChildStore } from '../store/useChildStore';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import logo from '../assets/ui/logo.svg';
import PinPad from '../components/PinPad';
import { CountrySelector } from '../components/CountrySelector';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirect = searchParams.get('redirect');
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t, lang } = useTranslation();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [login, setLogin] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('TH');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'identifier' | 'pin'>('identifier');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string>(location.state?.message || '');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const finishAuth = async (token: string, user: any, overrideUrl?: string) => {
    localStorage.setItem('mellow_token', token);
    localStorage.setItem('mellow_user', JSON.stringify(user));
    await fetchChildren(user.id);
    const targetUrl = overrideUrl || (redirect ? decodeURIComponent(redirect) : '/');
    navigate(targetUrl, { replace: true });
  };

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const secs = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0) setLockedUntil(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const performLogin = async (pin: string) => {
    setIsLoading(true);
    setError('');

    try {
      localStorage.removeItem('mellow_guest');
      const response = await apiClient.post('/auth/login', { login, password: pin });

      if (response.data.success) {
        await finishAuth(response.data.token, response.data.user);
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.locked) {
        setLockedUntil(Date.now() + (data.retryAfter || 60) * 1000);
        setError(t.login.tooManyAttempts);
      } else if (typeof data?.attemptsRemaining === 'number') {
        setError(`${t.login.loginFailed} (${data.attemptsRemaining} ${t.login.attemptsRemaining})`);
      } else {
        setError(data?.message || t.login.loginFailed);
      }
      setShowErrorModal(true);
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setIsLoading(true);
    setError('');

    try {
      localStorage.removeItem('mellow_guest');
      const response = await apiClient.post('/auth/google', { idToken: credential });

      if (response.data.success) {
        const overrideUrl = response.data.needsChildInfo ? '/add-child' : undefined;
        await finishAuth(response.data.token, response.data.user, overrideUrl);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.login.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 'identifier') return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
    if (!clientId) return;

    let cancelled = false;
    const hl = lang === 'th' ? 'th' : 'en';

    // Reload the GSI script with the right `hl` locale so the rendered
    // button's own text (e.g. "Sign in with Google") matches the app language.
    const existingScript = document.getElementById('google-identity-script');
    existingScript?.remove();
    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = `https://accounts.google.com/gsi/client?hl=${hl}`;
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      const google = (window as any).google;
      if (!google?.accounts?.id || !googleButtonRef.current) return;

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => handleGoogleCredential(response.credential)
      });
      googleButtonRef.current.innerHTML = '';
      google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: 320,
        shape: 'pill'
      });
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lang]);

  const handleGuestLogin = () => {
    localStorage.removeItem('mellow_token');
    localStorage.removeItem('mellow_user');
    localStorage.setItem('mellow_guest', 'true');
    
    const targetUrl = redirect ? decodeURIComponent(redirect) : '/';
    navigate(targetUrl, { replace: true });
  };

  const handleNext = () => {
    if (!login.trim()) {
      setError(t.login.loginFailed); // Or a specific message for empty phone
      return;
    }
    setError('');
    setStep('pin');
  };

  return (
    <div className="mellow-page flex flex-col justify-center px-8 bg-white">
      {step === 'pin' && (
        <div className="absolute top-6 left-6 z-10">
          <button 
            onClick={() => setStep('identifier')}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all"
          >
            <ChevronLeft size={24} />
          </button>
        </div>
      )}
      <div className="absolute top-6 right-6 z-10">
        <LanguageToggle />
      </div>
      <div className="text-center mb-10">
        <img src={logo} alt="Mellow Play" className="h-12 mx-auto mb-6" />
        <h1 className="text-2xl font-black text-mellow-ink">{t.login.title}</h1>
        <p className="text-slate-400 font-bold mt-2">{t.login.subtitle}</p>
      </div>

      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm flex flex-col gap-2 items-center pointer-events-none [&>*]:pointer-events-auto">
        <Toast message={successMessage || ''} type="success" onClose={() => setSuccessMessage('')} />
        <Toast message={error || ''} type="error" onClose={() => setError('')} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (step === 'identifier') handleNext(); }} className="space-y-4">

        {step === 'identifier' ? (
          <>
            <div className="flex gap-2">
              <CountrySelector value={countryCode} onChange={setCountryCode} />
              <div className="relative flex-1">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Phone size={20} />
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder={t.login.phonePlaceholder}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                  required
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleNext}
              className="w-full mellow-btn-primary mt-4"
            >
              {t.register?.nextStep || 'Next'} <ArrowRight size={20} />
            </button>
            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full py-4 px-6 rounded-[18px] font-extrabold text-mellow-muted bg-slate-100 border border-slate-200 transition-all active:scale-95 text-center mt-2"
            >
              {t.login.guestBtn}
            </button>

            <div className="flex items-center gap-3 mt-6 mb-2">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs font-bold text-slate-300 uppercase">{t.login.orContinueWith || 'or'}</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <div className="relative flex justify-center min-h-[44px]">
              <div ref={googleButtonRef} className={isLoading ? 'opacity-0 pointer-events-none' : ''} />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin text-mellow-purple" size={20} />
                  <span className="text-xs font-bold text-slate-400">{t.login.verifyingGoogle}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="relative">
              <label className="text-[13px] font-bold text-slate-500 mb-3 block text-center">
                {t.login.pinLabel}
              </label>
              <PinPad
                length={6}
                value={password}
                onChange={(val) => {
                  setPassword(val);
                  if (val.length === 6) {
                    performLogin(val);
                  }
                }}
              />
            </div>
            <div className="text-center mt-2">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-sm font-bold text-mellow-purple hover:underline"
              >
                {t.login.forgotPin || 'Forgot PIN?'}
              </button>
            </div>
            {isLoading && (
              <div className="flex justify-center mt-2">
                <Loader2 className="animate-spin text-mellow-purple" />
              </div>
            )}
          </>
        )}
      </form>

      <p className="text-center mt-8 text-slate-400 text-sm font-bold">
        {t.login.noAccount} <span onClick={() => navigate('/register' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''))} className="text-mellow-purple cursor-pointer underline">{t.login.registerLink}</span>
      </p>

      {showErrorModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => { if (!lockedUntil) setShowErrorModal(false); }}
          />
          <div className="relative w-full max-w-xs bg-white rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">
              {lockedUntil ? t.login.tooManyAttemptsTitle : (lang === 'th' ? 'รหัสไม่ถูกต้อง' : 'Incorrect PIN')}
            </h3>
            <p className="text-sm font-bold text-slate-500 mb-6">
              {lockedUntil
                ? `${t.login.tryAgainIn} ${remainingSeconds} ${t.login.seconds}`
                : (error || (lang === 'th' ? 'กรุณาลองใหม่อีกครั้ง หรือเลือกลืมรหัสผ่าน' : 'Please try again, or click forgot PIN.'))}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowErrorModal(false);
                  setPassword('');
                }}
                disabled={!!lockedUntil}
                className="w-full py-3 rounded-xl font-bold text-white bg-mellow-purple hover:bg-mellow-purple/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {lang === 'th' ? 'ลองอีกครั้ง' : 'Try Again'}
              </button>
              <button
                onClick={() => {
                  setShowErrorModal(false);
                  navigate('/forgot-password');
                }}
                className="w-full py-3 rounded-xl font-bold text-mellow-purple bg-mellow-purple/10 hover:bg-mellow-purple/20"
              >
                {t.login.forgotPin}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
