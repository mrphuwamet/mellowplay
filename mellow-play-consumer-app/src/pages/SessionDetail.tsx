import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle2, FileQuestion } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import SurveyFillForm from '../components/SurveyFillForm';

interface Step {
  formId: number;
  hasAnswerKey: boolean;
  fields: any[];
}

/**
 * A session is several forms answered as one questionnaire.
 *
 * The respondent must never notice the seam, so: identity is asked once up
 * front (the forms' own identity fields are dropped), the page counter runs
 * across the whole chain, and the button only says "ส่งคำตอบ" on the very last
 * page of the very last form.
 *
 * Each form is still submitted the moment it is finished rather than all at
 * the end — if someone abandons the chain halfway, what they did answer is
 * already saved instead of being lost.
 */
const SessionDetail = () => {
  const navigate = useNavigate();
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  const isLoggedIn = !!localStorage.getItem('mellow_token');
  const account = (() => {
    try {
      const raw = localStorage.getItem('mellow_user');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  const [session, setSession] = useState<any | null | undefined>(undefined);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [identity, setIdentity] = useState({ mode: (isLoggedIn ? 'prefill' : 'manual') as 'prefill' | 'manual', name: '', phone: '' });
  const [started, setStarted] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // One id per sitting. It groups this run's several form submissions in the
  // CRM, and lets the server's duplicate-name rule tell "this person is still
  // going" apart from "this name already answered".
  const runId = useMemo(
    () => ((crypto as any).randomUUID ? crypto.randomUUID() : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    []
  );

  useEffect(() => {
    if (!idOrSlug) return;
    apiClient.get(`/survey-sessions/${idOrSlug}`)
      .then(res => setSession(res.data.success ? res.data.session : null))
      .catch(() => setSession(null));
  }, [idOrSlug]);

  // The forms' own identity fields are stripped: the session asks once, and
  // leaving them in would ask the same person their name three times.
  const steps: Step[] = useMemo(
    () => (session?.steps || []).map((s: Step) => ({ ...s, fields: (s.fields || []).filter((f: any) => f.type !== 'identity') })),
    [session]
  );

  const pagesPerStep = useMemo(
    () => steps.map(s => new Set((s.fields || []).map((f: any) => f.page_index ?? 0)).size || 1),
    [steps]
  );
  const totalPages = pagesPerStep.reduce((a, b) => a + b, 0);
  const pagesBefore = pagesPerStep.slice(0, stepIndex).reduce((a, b) => a + b, 0);

  const resolvedName = identity.mode === 'prefill'
    ? (account.display_name || `${account.first_name || ''} ${account.last_name || ''}`.trim())
    : identity.name.trim();
  const resolvedPhone = identity.mode === 'prefill' ? (account.phone || '') : identity.phone.trim();

  const handleStart = async () => {
    if (!resolvedName) { setError(t('กรุณากรอกชื่อ', 'Please enter your name')); return; }
    setError('');
    if (!session?.requireUniqueName) { setStarted(true); return; }

    setCheckingName(true);
    try {
      const res = await apiClient.post(`/survey-sessions/${idOrSlug}/check-name`, { name: resolvedName, runId });
      if (res.data.success && res.data.available) setStarted(true);
      else setError(res.data.message || t('ชื่อนี้ทำแบบฟอร์มชุดนี้ไปแล้ว', 'That name has already answered this set'));
    } catch (err: any) {
      setError(err.response?.data?.message || t('ตรวจสอบชื่อไม่สำเร็จ', 'Could not check the name'));
    } finally {
      setCheckingName(false);
    }
  };

  const handleStepSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const step = steps[stepIndex];
    // Only this form's answers travel with it; the rest belong to other forms.
    const own: Record<string, any> = {};
    for (const f of step.fields) {
      if (answers[f.field_key] !== undefined) own[f.field_key] = answers[f.field_key];
    }
    try {
      const res = await apiClient.post(`/surveys/${step.formId}/submit`, {
        answers: own,
        respondentName: resolvedName || undefined,
        respondentPhone: resolvedPhone || undefined,
        sessionId: session.id,
        sessionRunId: runId,
      });
      if (!res.data.success) {
        setError(res.data.message || t('ส่งคำตอบไม่สำเร็จ', 'Failed to submit.'));
        return;
      }
      if (stepIndex + 1 < steps.length) {
        setStepIndex(stepIndex + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setDone(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('ส่งคำตอบไม่สำเร็จ', 'Failed to submit.'));
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="pb-24 min-h-screen bg-[#fbfaf7]">
      <header className="p-4 bg-white/90 backdrop-blur-md sticky top-0 z-20 border-b border-slate-100 flex items-center">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:bg-slate-100">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center font-black text-lg truncate px-2">{session?.name || t('แบบฟอร์ม', 'Form')}</h1>
        <div className="w-8" />
      </header>
      <main className="p-5">{children}</main>
    </div>
  );

  if (session === undefined) {
    return shell(
      <div className="flex justify-center py-16"><Loader2 className="animate-spin text-mellow-purple" /></div>
    );
  }

  if (session === null) {
    return shell(
      <div className="text-center py-16">
        <FileQuestion size={48} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-400">{t('ไม่พบแบบฟอร์มนี้', 'Form not found')}</p>
      </div>
    );
  }

  if (done) {
    return shell(
      <div className="text-center py-16">
        <CheckCircle2 size={56} className="mx-auto text-mellow-green mb-3" />
        <p className="text-base font-black text-slate-700">{t('ส่งคำตอบเรียบร้อย', 'Thanks — your answers are in')}</p>
        <p className="text-xs font-bold text-slate-400 mt-1">{t('ขอบคุณที่สละเวลา', 'We appreciate your time')}</p>
      </div>
    );
  }

  if (!started) {
    return shell(
      <div className="mellow-card bg-white">
        {session.description && <p className="text-xs text-slate-400 font-bold mb-4">{session.description}</p>}
        <label className="text-xs font-bold text-slate-600 block mb-1.5">
          {t('ชื่อ-นามสกุล', 'Full name')}<span className="text-mellow-red ml-0.5">*</span>
        </label>
        {isLoggedIn && (
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setIdentity({ ...identity, mode: 'prefill' })}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${identity.mode === 'prefill' ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-500'}`}>
              {t('ใช้ข้อมูลของฉัน', 'Use my info')}
            </button>
            <button type="button" onClick={() => setIdentity({ ...identity, mode: 'manual' })}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${identity.mode === 'manual' ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-500'}`}>
              {t('ระบุเอง', 'Someone else')}
            </button>
          </div>
        )}
        {isLoggedIn && identity.mode === 'prefill' ? (
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800">
            {resolvedName || '-'}{resolvedPhone ? ` · ${resolvedPhone}` : ''}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={identity.name} onChange={e => setIdentity({ ...identity, name: e.target.value })}
              placeholder={t('ชื่อ', 'Name')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all" />
            <input type="tel" value={identity.phone} onChange={e => setIdentity({ ...identity, phone: e.target.value })}
              placeholder={t('เบอร์โทร (ไม่บังคับ)', 'Phone (optional)')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all" />
          </div>
        )}
        {session.requireUniqueName && (
          <p className="text-[11px] font-bold text-slate-400 mt-2">
            {t('แบบฟอร์มชุดนี้ทำได้คนละครั้งเดียว', 'This set can be answered once per person')}
          </p>
        )}
        {error && <p className="text-xs font-bold text-red-500 mt-3">{error}</p>}
        <button type="button" onClick={handleStart} disabled={checkingName}
          className="w-full mt-4 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all disabled:opacity-50">
          {checkingName ? t('กำลังตรวจสอบ...', 'Checking...') : t('เริ่มทำแบบฟอร์ม', 'Start')}
        </button>
      </div>
    );
  }

  const step = steps[stepIndex];
  return shell(
    <div className="mellow-card bg-white">
      <SurveyFillForm
        // Remounting per step resets the inner page index, which otherwise
        // carries over from the previous form and skips its first page.
        key={step.formId}
        form={{ id: step.formId, name: session.name, fields: step.fields }}
        answers={answers}
        onChange={(key, value) => setAnswers(prev => ({ ...prev, [key]: value }))}
        identity={identity}
        onIdentityChange={setIdentity}
        accountName={resolvedName}
        accountPhone={resolvedPhone}
        isLoggedIn={isLoggedIn}
        onSubmit={handleStepSubmit}
        submitting={submitting}
        lang={lang}
        progressOffset={pagesBefore}
        progressTotal={totalPages}
        isFinalStep={stepIndex === steps.length - 1}
      />
      {error && <p className="text-xs font-bold text-red-500 mt-3">{error}</p>}
    </div>
  );
};

export default SessionDetail;
