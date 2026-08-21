import React, { useEffect, useState } from 'react';
import { emptyIdentity, fullNameOf } from '../utils/respondentName';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle2, FileQuestion } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import SurveyFillForm from '../components/SurveyFillForm';

const SurveyDetail = () => {
  const navigate = useNavigate();
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  // Staff share the same form twice with a different ?attempt= on each link
  // ("ก่อนเรียน" / "หลังเรียน") so the CRM can name the rounds. Which round it
  // actually is gets counted server-side — this is only the label.
  const [searchParams] = useSearchParams();
  const attemptLabel = searchParams.get('attempt') || undefined;
  // ?test=1 — the link the CRM's "ทดลองทำ" button opens. The answer is stored
  // like any other but flagged, so staff can walk the whole form (shuffling,
  // scoring, the result screen) without their run counting as a response.
  const isTest = searchParams.get('test') === '1';
  const { lang } = useTranslation();

  const isLoggedIn = !!localStorage.getItem('mellow_token');
  const account = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('mellow_user') || 'null');
      if (!user) return { name: '', phone: '' };
      const name = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ');
      return { name, phone: user.phone || '' };
    } catch { return { name: '', phone: '' }; }
  })();

  const [form, setForm] = useState<any | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [identity, setIdentity] = useState(emptyIdentity(isLoggedIn));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ totalScore: number | null; maxScore: number | null; band: { resultText: string; resultTextHtml?: string; imageUrl?: string } | null } | null>(null);

  useEffect(() => {
    if (!idOrSlug) return;
    apiClient.get(`/surveys/${idOrSlug}`)
      .then(res => setForm(res.data.success ? res.data.form : null))
      .catch(() => setForm(null));
  }, [idOrSlug]);

  const handleSubmit = async () => {
    if (submitting || !idOrSlug) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.post(`/surveys/${idOrSlug}/submit`, {
        answers,
        respondentName: identity.mode === 'manual' ? fullNameOf(identity) || undefined : undefined,
        respondentPhone: identity.mode === 'manual' ? identity.phone.trim() || undefined : undefined,
        attemptLabel,
        isTest,
      });
      if (res.data.success) {
        setResult({ totalScore: res.data.totalScore, maxScore: res.data.maxScore, band: res.data.result });
      } else {
        setError(res.data.message || (lang === 'en' ? 'Failed to submit.' : 'ส่งคำตอบไม่สำเร็จ'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to submit.' : 'ส่งคำตอบไม่สำเร็จ'));
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
        <h1 className="text-[17px] font-black tracking-tight leading-none truncate max-w-[60%]">
          {form?.name || (lang === 'en' ? 'Survey' : 'แบบสอบถาม')}
        </h1>
        <div className="w-10" />
      </header>

      <main className="p-5">
        {/* Said plainly and on every screen of the form, because a trial run
            that is mistaken for the real thing is the one way this feature
            can cost someone their answers. */}
        {isTest && (
          <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm font-black text-amber-900">
              {lang === 'en' ? 'Trial run' : 'โหมดทดลองทำ'}
            </p>
            <p className="text-xs font-bold text-amber-700 leading-relaxed mt-0.5">
              {lang === 'en'
                ? 'This answer is saved separately for staff to review and is not counted in the real results.'
                : 'คำตอบนี้จะถูกเก็บแยกไว้ให้เจ้าหน้าที่ตรวจสอบ และไม่ถูกนับรวมในผลจริง'}
            </p>
          </div>
        )}
        {form === undefined && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-mellow-purple" /></div>
        )}

        {form === null && (
          <div className="mellow-card bg-white text-center py-10">
            <FileQuestion size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="font-black text-slate-800 mb-1">{lang === 'en' ? 'Form not found' : 'ไม่พบแบบฟอร์มนี้'}</p>
            <p className="text-xs text-slate-400 font-bold">
              {lang === 'en' ? 'This link may be inactive or no longer available.' : 'ลิงก์นี้อาจถูกปิดใช้งานหรือไม่มีอยู่แล้ว'}
            </p>
          </div>
        )}

        {form && (
          <div className="mellow-card bg-white">
            {result ? (
              <div className="text-center py-6">
                <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
                <p className="font-black text-slate-800 mb-1">
                  {lang === 'en' ? 'Thank you!' : 'ขอบคุณสำหรับคำตอบ!'}
                </p>
                {result.totalScore != null && (
                  <p className="text-sm font-bold text-slate-500 mt-2">
                    {lang === 'en' ? 'Your score' : 'คะแนนของคุณ'}: <span className="text-mellow-purple font-black">{result.totalScore} / {result.maxScore}</span>
                  </p>
                )}
                {result.band && (
                  <div className="mt-4 text-left bg-slate-50 rounded-2xl p-4 space-y-2">
                    {result.band.imageUrl && <img src={result.band.imageUrl} alt="" className="w-full rounded-xl object-cover" />}
                    {/* Staff-authored, same trust model as a course description.
                        whitespace-pre-wrap only for the plain version, where the
                        line breaks are real characters rather than markup. */}
                    {result.band.resultTextHtml
                      ? <div className="prose-news text-sm font-bold text-slate-700" dangerouslySetInnerHTML={{ __html: result.band.resultTextHtml }} />
                      : <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap">{result.band.resultText}</p>}
                  </div>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-[17px] font-black text-slate-800 mb-1">{form.name}</h2>
                {form.description && <p className="text-xs text-slate-400 font-bold mb-4">{form.description}</p>}
                <SurveyFillForm
                  form={form}
                  answers={answers}
                  onChange={(key, value) => setAnswers(prev => ({ ...prev, [key]: value }))}
                  identity={identity}
                  onIdentityChange={setIdentity}
                  accountName={account.name}
                  accountPhone={account.phone}
                  isLoggedIn={isLoggedIn}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                  lang={lang}
                />
                {error && <p className="text-xs font-bold text-red-500 mt-3">{error}</p>}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default SurveyDetail;
