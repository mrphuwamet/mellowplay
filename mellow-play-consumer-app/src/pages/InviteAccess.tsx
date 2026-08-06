import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import logo from '../assets/ui/logo.svg';

const API_BASE = `${API_BASE_URL}/admin`;

// A bare instance, not the app-wide apiClient — that one carries whatever
// consumer JWT is already in localStorage (or none), neither of which is
// relevant here; the PIN itself is the only credential this call needs.
const bareAxios = axios.create();

const inviteSessionKey = (courseId: number) => `mellow_invite_session_${courseId}`;

// Public page opened from a PIN-protected link a CRM admin generated for one
// specific course+round (see CourseManagement's "ลิงก์เชิญพิเศษ" dialog).
// On success, stores a session scoped to that course (read by Booking.tsx to
// unlock the round's hidden invite_capacity) and drops straight into booking
// it — the round otherwise shows as ordinarily full to everyone else.
const InviteAccess = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await bareAxios.post(`${API_BASE}/invite-access/${encodeURIComponent(token)}/verify-pin`, { pin });
      if (res.data.success) {
        localStorage.setItem(inviteSessionKey(res.data.courseId), JSON.stringify({
          sessionToken: res.data.sessionToken,
          expiresAt: Date.now() + res.data.expiresIn * 1000,
        }));
        navigate(`/booking?courseId=${res.data.courseId}`, { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Something went wrong, please try again.' : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-5">
      <div className="w-full max-w-[380px] bg-white rounded-[28px] shadow-xl p-6 flex flex-col items-center">
        <img src={logo} alt="Mellow Play" className="h-12 mb-4" />
        <h1 className="text-lg font-black text-slate-800 mb-1">
          {lang === 'en' ? 'Enter Invite PIN' : 'ใส่ PIN เพื่อลงทะเบียน'}
        </h1>
        <p className="text-sm text-slate-400 font-bold text-center mb-6">
          {lang === 'en' ? "You've been invited to a reserved round" : 'คุณได้รับเชิญให้ลงทะเบียนในรอบพิเศษ'}
        </p>

        {error && (
          <div className="w-full mb-4 px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-bold text-center">
            {error}
          </div>
        )}

        <form onSubmit={verifyPin} className="w-full">
          <div className="relative mb-4">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="tel"
              inputMode="numeric"
              placeholder="PIN"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={verifying || !pin.trim()}
            className="w-full py-3.5 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {verifying ? <Loader2 size={18} className="animate-spin" /> : (
              <>{lang === 'en' ? 'Continue' : 'เข้าใช้งาน'}<ArrowRight size={16} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default InviteAccess;
