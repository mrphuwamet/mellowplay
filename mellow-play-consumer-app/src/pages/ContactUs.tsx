import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';

const MAX_LENGTH = 1000;
const CATEGORIES = [
  { key: 'feedback', th: 'ข้อเสนอแนะ', en: 'Feedback' },
  { key: 'complaint', th: 'ร้องเรียน', en: 'Complaint' },
  { key: 'review', th: 'รีวิว', en: 'Review' },
  { key: 'other', th: 'อื่นๆ', en: 'Other' },
];

const ContactUs = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const isGuest = localStorage.getItem('mellow_guest') === 'true';

  const [category, setCategory] = useState('feedback');
  const [message, setMessage] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.post('/contact/messages', {
        category,
        message: trimmed,
        contactName: isGuest ? contactName.trim() || undefined : undefined,
        contactPhone: isGuest ? contactPhone.trim() || undefined : undefined,
      });
      if (res.data.success) {
        setSuccess(true);
        setMessage('');
      } else {
        setError(res.data.message || (lang === 'en' ? 'Failed to send.' : 'ส่งข้อความไม่สำเร็จ'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to send.' : 'ส่งข้อความไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mellow-page-reading bg-[#fbfaf7]">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[16px] font-black tracking-tight leading-none">{lang === 'en' ? 'Contact Us' : 'ติดต่อเรา'}</h1>
        <div className="w-10" />
      </header>

      <main className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <a
            href="https://lin.ee/vC0dDzn"
            target="_blank"
            rel="noopener noreferrer"
            className="mellow-card bg-white flex flex-col items-center text-center gap-2 py-5 active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.05 2 11.05C2 15.55 5.74 19.3 10.82 20.01L11.5 20.11V17.63C8.35 17.33 6 15.4 6 13.05C6 10.46 8.69 8.36 12 8.36C15.31 8.36 18 10.46 18 13.05C18 14.47 17.19 15.78 15.88 16.69L15 17.28V14.05H13V20.1L13.67 19.99C18.4 19.12 22 15.42 22 11.05C22 6.05 17.52 2 12 2Z" fill="#06C755" />
              </svg>
            </div>
            <span className="font-black text-slate-800 text-[14px]">LINE OA</span>
          </a>
          <a
            href="https://www.facebook.com/mellowplayxmilk"
            target="_blank"
            rel="noopener noreferrer"
            className="mellow-card bg-white flex flex-col items-center text-center gap-2 py-5 active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2" />
              </svg>
            </div>
            <span className="font-black text-slate-800 text-[14px]">Facebook</span>
          </a>
        </div>

        <div className="mellow-card bg-white">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-full bg-mellow-purple/10 flex items-center justify-center text-mellow-purple">
              <MessageCircle size={18} />
            </div>
            <h2 className="text-[16px] font-black text-slate-800">
              {lang === 'en' ? 'Send us a message' : 'ส่งข้อความถึงเรา'}
            </h2>
          </div>

          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
              <p className="font-black text-slate-800 mb-1">{lang === 'en' ? 'Message sent!' : 'ส่งข้อความเรียบร้อยแล้ว'}</p>
              <p className="text-xs text-slate-400 font-bold mb-5">
                {lang === 'en' ? "We'll get back to you soon." : 'ทีมงานจะติดต่อกลับโดยเร็วที่สุด'}
              </p>
              <button
                onClick={() => setSuccess(false)}
                className="px-5 py-2.5 rounded-full bg-slate-100 text-slate-600 text-[13px] font-black active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Send another' : 'ส่งข้อความอีกครั้ง'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    className={`px-3.5 py-1.5 rounded-full text-[12px] font-black transition-all ${
                      category === cat.key ? 'bg-mellow-purple text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {lang === 'en' ? cat.en : cat.th}
                  </button>
                ))}
              </div>

              {isGuest && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder={lang === 'en' ? 'Your name' : 'ชื่อของคุณ'}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
                  />
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder={lang === 'en' ? 'Phone (optional)' : 'เบอร์โทร (ไม่บังคับ)'}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
                  />
                </div>
              )}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                placeholder={lang === 'en' ? 'Tell us what\'s on your mind...' : 'พิมพ์ข้อความถึงเราได้เลย...'}
                rows={5}
                className="w-full resize-none bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              />
              <p className={`text-right text-[11px] font-bold mt-1 mb-3 ${message.length >= MAX_LENGTH ? 'text-red-500' : 'text-slate-300'}`}>
                {message.length}/{MAX_LENGTH}
              </p>

              {error && <p className="text-xs font-bold text-red-500 mb-3">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className="w-full mellow-btn-primary"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : (lang === 'en' ? 'Send Message' : 'ส่งข้อความ')}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ContactUs;
