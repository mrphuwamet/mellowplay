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
import LoadingLogo from '../components/LoadingLogo';
import { CountrySelector } from '../components/CountrySelector';
import ResponsiveModal from '../components/ResponsiveModal';
import { getCourseView } from '../utils/courseImage';
import { stripHtml } from '../utils/stripHtml';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirect = searchParams.get('redirect');
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t, lang } = useTranslation();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

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

  // Desktop-only promo panel (see the split view in the JSX below) — a
  // swipeable carousel over every recommended class, purely decorative/
  // marketing, so a fetch failure here should never affect the login form
  // itself. Same pointer-drag + auto-advance technique as PosterCarousel.tsx,
  // but reimplemented locally since each slide here needs its own title/
  // description/CTA text overlay, not just an image + tap-to-lightbox.
  const [promoCourses, setPromoCourses] = useState<any[]>([]);
  const [promoIndex, setPromoIndex] = useState(0);
  const [promoDragging, setPromoDragging] = useState(false);
  const [promoDragOffsetPx, setPromoDragOffsetPx] = useState(0);
  const promoStartXRef = useRef(0);

  useEffect(() => {
    apiClient.get('/admin/courses')
      .then(res => {
        if (!res.data.success) return;
        const recommended = res.data.courses.filter((c: any) => c.is_recommended);
        setPromoCourses(recommended.sort(() => Math.random() - 0.5));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (promoCourses.length <= 1 || promoDragging) return;
    const id = setInterval(() => {
      setPromoIndex(prev => (prev + 1) % promoCourses.length);
    }, 3000);
    return () => clearInterval(id);
  }, [promoCourses.length, promoDragging]);

  const goToPromo = (index: number) => {
    if (promoCourses.length === 0) return;
    setPromoIndex(((index % promoCourses.length) + promoCourses.length) % promoCourses.length);
  };
  const handlePromoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    promoStartXRef.current = e.clientX;
    setPromoDragging(true);
    setPromoDragOffsetPx(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePromoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!promoDragging) return;
    setPromoDragOffsetPx(e.clientX - promoStartXRef.current);
  };
  const handlePromoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const dx = e.clientX - promoStartXRef.current;
    if (Math.abs(dx) > 50) goToPromo(promoIndex + (dx < 0 ? 1 : -1));
    setPromoDragging(false);
    setPromoDragOffsetPx(0);
  };

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
      setError(lang === 'en' ? 'Please enter your phone number' : 'กรุณากรอกเบอร์โทรศัพท์');
      phoneInputRef.current?.focus();
      return;
    }
    setError('');
    setStep('pin');
  };

  // min-h-0 overrides mellow-flow-page-split's min-h-screen — this page is
  // nested in AppShell's fixed-height no-scroll frame (h-screen /
  // md:h-[calc(100vh-80px)]) and insisting on its own min-h-screen on top of
  // that pushed content (like the bottom-anchored language toggle) past the
  // frame's visible/clipped boundary.
  return (
    <div className="mellow-flow-page-split min-h-0 h-full lg:flex lg:items-stretch">
      {/* Promo panel — desktop only (no room for it below lg:). Purely
          decorative/marketing; the form column works identically with or
          without a featured course loaded. */}
      <div className="hidden lg:flex lg:w-[60%] lg:shrink-0 relative overflow-hidden bg-slate-900">
        {promoCourses.length === 0 ? (
          <div className="relative z-10 flex flex-col justify-center p-10 text-white w-full h-full">
            <h2 className="text-[26px] font-black mb-2 leading-tight">Mellow Play</h2>
          </div>
        ) : (
          <>
            <div
              onPointerDown={handlePromoPointerDown}
              onPointerMove={handlePromoPointerMove}
              onPointerUp={handlePromoPointerUp}
              onPointerCancel={handlePromoPointerUp}
              style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                touchAction: 'pan-y',
                cursor: promoCourses.length > 1 ? 'grab' : 'default',
                transform: `translateX(calc(${-promoIndex * 100}% + ${promoDragOffsetPx}px))`,
                transition: promoDragging ? 'none' : 'transform 0.4s ease',
              }}
            >
              {promoCourses.map((course, i) => (
                <div key={course.id ?? i} className="relative w-full h-full shrink-0">
                  {getCourseView(course, 'banner').url && (
                    <img
                      src={getCourseView(course, 'banner').url}
                      alt=""
                      draggable={false}
                      style={getCourseView(course, 'banner').style}
                      className="absolute inset-0 w-full h-full object-cover opacity-90 select-none"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
                  <div className="relative z-10 flex flex-col justify-center p-10 text-white w-full h-full">
                    <span className="text-[13px] font-black uppercase tracking-widest text-mellow-yellow mb-3">
                      {lang === 'en' ? 'Recommended for you' : 'แนะนำสำหรับคุณ'}
                    </span>
                    <h2 className="text-[26px] font-black mb-2 leading-tight">
                      {lang === 'en' && course.name_en ? course.name_en : course.name}
                    </h2>
                    {(course.short_description || course.description) && (
                      <p className="text-sm text-white/80 mb-6 leading-relaxed line-clamp-3">
                        {course.short_description || stripHtml(course.description || '')}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/register')}
                      className="self-start px-6 py-3.5 bg-white text-mellow-ink font-black rounded-2xl text-sm active:scale-95 transition-transform shadow-lg"
                    >
                      {lang === 'en' ? 'Create Free Account' : 'สมัครสมาชิกฟรี'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {promoCourses.length > 1 && (
              <div className="absolute bottom-6 left-10 z-10 flex items-center gap-1.5">
                {promoCourses.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToPromo(i)}
                    className={`h-1.5 rounded-full transition-all ${i === promoIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="relative flex-1 flex flex-col justify-center px-8 bg-white lg:px-14 lg:py-10">
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
      <div className="absolute bottom-6 right-6 lg:bottom-8 lg:right-8 z-10">
        <LanguageToggle />
      </div>
      <div className="text-center mb-10">
        <img src={logo} alt="Mellow Play" className="h-12 mx-auto mb-6" />
        <h1 className="text-2xl font-black text-mellow-ink">{t.login.title}</h1>
        <p className="text-slate-400 font-bold mt-2">{t.login.subtitle}</p>
      </div>

      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm md:max-w-md flex flex-col gap-2 items-center pointer-events-none [&>*]:pointer-events-auto">
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
                  ref={phoneInputRef}
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
              <label className="text-[14px] font-bold text-slate-500 mb-3 block text-center">
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
              {/* Overlays the pad itself instead of a small spinner below it
                  — verification is quick, but blocking the buttons visually
                  (not just via the isLoading no-op elsewhere) avoids a
                  double-submit if someone keeps tapping while it checks. */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/85 backdrop-blur-sm rounded-2xl">
                  <LoadingLogo size="sm" />
                </div>
              )}
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
          </>
        )}
      </form>

      <p className="text-center mt-8 text-slate-400 text-sm font-bold">
        {t.login.noAccount} <span onClick={() => navigate('/register' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''))} className="text-mellow-purple cursor-pointer underline">{t.login.registerLink}</span>
      </p>
      </div>

      <ResponsiveModal isOpen={showErrorModal} onClose={() => { if (!lockedUntil) setShowErrorModal(false); }} variant="dialog" size="xs" className="text-center">
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
      </ResponsiveModal>
    </div>
  );
};

export default Login;
