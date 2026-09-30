import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Eye } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import DynamicRegistrationForm from '../components/DynamicRegistrationForm';

/**
 * A registration form, exactly as a parent will see it.
 *
 * The real renderer, not a copy. The CRM opens this in a new tab rather than
 * drawing its own version of the form, for the reason the survey's "ทดลองทำ"
 * button already gives: a preview built a second time is a second
 * implementation, and the bugs worth catching before a form goes out — a field
 * that will not validate, a page that ends in the wrong place, wording that
 * runs off a phone screen — are exactly the ones a reimplementation would not
 * reproduce.
 *
 * Nothing here submits. Answers live in local state and are thrown away with
 * the tab; the form never reaches a booking, so a staff member can fill it in
 * as roughly as they like to see what happens.
 */

/**
 * Stand-in family members, so a family-member picker has faces to show.
 *
 * Marked as examples in their own names. Borrowing a real family's roster
 * would mean showing one customer's children to whoever opened a preview,
 * which is not a trade a preview is worth.
 */
const SAMPLE_ROSTER = [
  { id: -1, name: 'ตัวอย่าง น้องเอ', nickname: 'น้องเอ (ตัวอย่าง)', relation: 'ลูก' },
  { id: -2, name: 'ตัวอย่าง น้องบี', nickname: 'น้องบี (ตัวอย่าง)', relation: 'ลูก' },
];

const RegistrationFormPreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useTranslation();

  const [form, setForm] = useState<any>(undefined);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/registration-forms/${id}/preview`)
      .then(res => { if (!cancelled) setForm(res.data?.success ? res.data.form : null); })
      .catch(() => { if (!cancelled) setForm(null); });
    return () => { cancelled = true; };
  }, [id]);

  const banner = useMemo(() => (
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4">
      <Eye size={18} className="text-amber-600 shrink-0 mt-0.5" />
      <p className="text-[12px] font-bold text-amber-800 leading-relaxed">
        {lang === 'en'
          ? 'Preview only — nothing here is saved, and no booking is created.'
          : 'โหมดดูตัวอย่างเท่านั้น — ข้อมูลที่กรอกจะไม่ถูกบันทึก และไม่มีการสร้างรายการจอง'}
      </p>
    </div>
  ), [lang]);

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen pb-16">
      <header className="h-[64px] px-5 bg-white/90 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[16px] font-black tracking-tight leading-tight truncate">
            {form?.name || (lang === 'en' ? 'Form preview' : 'ดูตัวอย่างแบบฟอร์ม')}
          </h1>
          <p className="text-[11px] font-bold text-slate-400 leading-none mt-0.5">
            {lang === 'en' ? 'Preview' : 'ตัวอย่าง'}
          </p>
        </div>
      </header>

      <main className="p-5 max-w-lg mx-auto">
        {banner}

        {form === undefined ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map(i => <div key={i} className="h-14 bg-white rounded-2xl border border-slate-100" />)}
          </div>
        ) : form === null ? (
          <p className="text-center py-12 text-[13px] font-bold text-slate-400">
            {lang === 'en' ? 'This form was not found.' : 'ไม่พบแบบฟอร์มนี้'}
          </p>
        ) : finished ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
            <p className="text-[15px] font-black text-slate-800 mb-1">
              {lang === 'en' ? 'End of the form' : 'จบแบบฟอร์มแล้ว'}
            </p>
            <p className="text-[12px] font-bold text-slate-500 leading-relaxed mb-4">
              {lang === 'en'
                ? 'In a real booking this is where the next step would continue. Nothing was saved.'
                : 'ในการจองจริง ขั้นตอนถัดไปจะทำงานต่อจากตรงนี้ — ตัวอย่างนี้ไม่ได้บันทึกอะไรไว้'}
            </p>
            <button
              onClick={() => { setAnswers({}); setSelectedChildIds([]); setFinished(false); }}
              className="px-5 py-2.5 rounded-2xl bg-mellow-purple text-white text-sm font-bold"
            >
              {lang === 'en' ? 'Start over' : 'เริ่มดูใหม่'}
            </button>
          </div>
        ) : (
          <DynamicRegistrationForm
            form={form}
            answers={answers}
            onChange={(key, value) => setAnswers(prev => ({ ...prev, [key]: value }))}
            roster={SAMPLE_ROSTER}
            lang={lang === 'en' ? 'en' : 'th'}
            selectedChildIds={selectedChildIds}
            onChildSelectionChange={setSelectedChildIds}
            mainAccount={{ name: 'ตัวอย่าง ผู้ปกครอง' }}
            // Back on the first page would leave the wizard in a real booking;
            // here it leaves the preview, which is the same intent.
            onBack={() => navigate(-1)}
            onNext={() => setFinished(true)}
          />
        )}
      </main>
    </div>
  );
};

export default RegistrationFormPreview;
