import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';

/**
 * The unsubscribe link every marketing email carries.
 *
 * No login: the token in the URL is the credential. Asking someone to sign in
 * before they can stop receiving mail is the friction that gets a sender
 * reported as spam instead, which costs the whole system's deliverability.
 *
 * It acts on load rather than behind a confirm button — the click in the email
 * already was the intent, and a second step here is one more place to lose
 * someone who has decided.
 */
const Unsubscribe = () => {
  const { token } = useParams<{ token: string }>();
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setState('error'); return; }
    apiClient.post(`/unsubscribe/${token}`)
      .then(res => {
        if (res.data.success) { setState('done'); setMessage(res.data.message || ''); }
        else { setState('error'); setMessage(res.data.message || ''); }
      })
      .catch(err => {
        setState('error');
        setMessage(err.response?.data?.message || '');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#fbfaf7] flex items-center justify-center p-6">
      <div className="mellow-card bg-white max-w-sm w-full text-center py-10">
        {state === 'working' && (
          <>
            <Loader2 size={40} className="mx-auto text-mellow-purple animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-500">{t('กำลังดำเนินการ...', 'Working on it...')}</p>
          </>
        )}
        {state === 'done' && (
          <>
            <CheckCircle2 size={48} className="mx-auto text-mellow-green mb-3" />
            <p className="text-base font-black text-slate-700">
              {message || t('ยกเลิกรับข่าวสารเรียบร้อยแล้ว', 'You have been unsubscribed')}
            </p>
            <p className="text-xs font-bold text-slate-400 mt-2">
              {t('คุณจะไม่ได้รับอีเมลประชาสัมพันธ์จากเราอีก แต่ยังได้รับอีเมลยืนยันการจองตามปกติ',
                 'You will stop receiving marketing email. Booking confirmations still arrive as usual.')}
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle size={48} className="mx-auto text-mellow-red mb-3" />
            <p className="text-base font-black text-slate-700">
              {message || t('ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว', 'That link is not valid')}
            </p>
            <p className="text-xs font-bold text-slate-400 mt-2">
              {t('ลองกดลิงก์จากอีเมลฉบับล่าสุดอีกครั้ง', 'Try the link in the most recent email')}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
