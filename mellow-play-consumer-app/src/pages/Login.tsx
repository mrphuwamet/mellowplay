import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Phone, Lock, ArrowRight, Loader2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import logo from '../assets/ui/logo.svg';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t } = useTranslation();
  
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const successMessage = location.state?.message;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
        navigate('/');
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
    navigate('/');
  };

  return (
    <div className="mellow-page flex flex-col justify-center px-8 bg-white">
      <div className="text-center mb-10">
        <img src={logo} alt="Mellow Play" className="h-12 mx-auto mb-6" />
        <h1 className="text-2xl font-black text-mellow-ink">{t.login.title}</h1>
        <p className="text-slate-400 font-bold mt-2">{t.login.subtitle}</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {successMessage && (
          <div className="p-4 bg-green-50 text-green-600 rounded-2xl text-xs font-bold border border-green-100 mb-4 text-center">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="p-4 bg-red-50 text-red-500 rounded-2xl text-xs font-bold border border-red-100 mb-4 text-center">
            {error}
          </div>
        )}

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

        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Lock size={20} />
          </div>
          <input
            type="password"
            placeholder={t.login.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mellow-btn-primary mt-4 disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <>{t.login.signIn} <ArrowRight size={20} /></>}
        </button>

        <button
          type="button"
          onClick={handleGuestLogin}
          className="w-full py-4 px-6 rounded-[18px] font-extrabold text-mellow-muted bg-slate-100 border border-slate-200 transition-all active:scale-95 text-center mt-2"
        >
          {t.login.guestBtn}
        </button>
      </form>

      <p className="text-center mt-8 text-slate-400 text-sm font-bold">
        {t.login.noAccount} <span onClick={() => navigate('/register')} className="text-mellow-purple cursor-pointer underline">{t.login.registerLink}</span>
      </p>
    </div>
  );
};

export default Login;
