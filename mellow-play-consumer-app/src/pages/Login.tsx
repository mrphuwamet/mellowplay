import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Phone, ArrowRight, Loader2, ChevronLeft } from 'lucide-react';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useChildStore } from '../store/useChildStore';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import logo from '../assets/ui/logo.svg';
import PinInput from '../components/PinInput';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirect = searchParams.get('redirect');
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t } = useTranslation();
  
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'identifier' | 'pin'>('identifier');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [successMessage, setSuccessMessage] = useState<string>(location.state?.message || '');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'identifier') {
      handleNext();
      return;
    }
    
    if (!login || password.length < 6) {
      setError(t.login?.loginFailed || 'Please enter the complete PIN');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      localStorage.removeItem('mellow_guest');
      const response = await apiClient.post('/auth/login', { login, password });
      
      if (response.data.success) {
        const { token, user } = response.data;
        localStorage.setItem('mellow_token', token);
        localStorage.setItem('mellow_user', JSON.stringify(user));
        
        // Fetch children before navigating
        await fetchChildren(user.id);
        
        const targetUrl = redirect ? decodeURIComponent(redirect) : '/';
        navigate(targetUrl, { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.login.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

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

      <form onSubmit={handleLogin} className="space-y-4">

        {step === 'identifier' ? (
          <>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Phone size={20} />
              </div>
              <input
                type="text"
                placeholder={t.login.phonePlaceholder}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                required
              />
            </div>
            <button
              type="button"
              onClick={handleNext}
              className="w-full mellow-btn-primary mt-4"
            >
              {t.register?.nextStep || 'Next'} <ArrowRight size={20} />
            </button>
          </>
        ) : (
          <>
            <div className="relative">
              <label className="text-[13px] font-bold text-slate-500 mb-3 block text-center">
                {t.login.pinLabel}
              </label>
              <PinInput 
                length={6} 
                value={password} 
                onChange={(val) => setPassword(val)} 
              />
            </div>
            <div className="text-right mt-2">
              <button 
                type="button" 
                onClick={() => navigate('/forgot-password')}
                className="text-sm font-bold text-mellow-purple hover:underline"
              >
                {t.login.forgotPin || 'Forgot PIN?'}
              </button>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mellow-btn-primary mt-4 disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <>{t.login.signIn} <ArrowRight size={20} /></>}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleGuestLogin}
          className="w-full py-4 px-6 rounded-[18px] font-extrabold text-mellow-muted bg-slate-100 border border-slate-200 transition-all active:scale-95 text-center mt-2"
        >
          {t.login.guestBtn}
        </button>
      </form>

      <p className="text-center mt-8 text-slate-400 text-sm font-bold">
        {t.login.noAccount} <span onClick={() => navigate('/register' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''))} className="text-mellow-purple cursor-pointer underline">{t.login.registerLink}</span>
      </p>
    </div>
  );
};

export default Login;
