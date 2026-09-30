import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { useSeo, seoText, seoClamp } from '../utils/seo';

/**
 * The standing privacy notice — every consent document marked for the policy
 * page, in full.
 *
 * Deliberately readable without an account. A notice you have to sign in to
 * read is not a notice, and this is the address a form's "read the full text"
 * link, an email footer and a QR code on a consent slip can all point at.
 *
 * The text is not written here. It is the same managed document the consent
 * tick boxes use, so the page and the form can never disagree about what was
 * agreed to — which is the failure mode of a policy page kept as its own copy.
 */

interface PolicyDoc {
  id: number;
  doc_key: string;
  title: string;
  summary: string;
  body_html: string;
  version: number;
  updated_at?: string;
}

const PdpaPolicy: React.FC = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [docs, setDocs] = useState<PolicyDoc[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/consent-documents')
      .then(res => { if (!cancelled) setDocs(res.data?.documents || []); })
      .catch(() => { if (!cancelled) { setFailed(true); setDocs([]); } });
    return () => { cancelled = true; };
  }, []);

  const title = lang === 'en' ? 'Privacy and consent' : 'นโยบายความเป็นส่วนตัวและความยินยอม';

  useSeo({
    title,
    description: lang === 'en'
      ? 'How Mellow Play collects, uses and protects personal data, and what each consent covers.'
      : 'Mellow Play เก็บและใช้ข้อมูลส่วนบุคคลอย่างไร และความยินยอมแต่ละข้อครอบคลุมเรื่องใดบ้าง',
    type: 'website',
    jsonLd: docs && docs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          inLanguage: lang === 'en' ? 'en' : 'th',
          description: seoClamp(seoText(docs[0].body_html)),
        }
      : null,
  }, [lang, docs]);

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen pb-16">
      <header className="h-[64px] px-5 bg-white/90 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[17px] font-black tracking-tight leading-none">{title}</h1>
      </header>

      <main className="p-5 max-w-2xl mx-auto">
        <div className="flex items-start gap-3 bg-mellow-purple/5 border border-mellow-purple/15 rounded-3xl p-4 mb-5">
          <ShieldCheck size={20} className="text-mellow-purple shrink-0 mt-0.5" />
          <p className="text-[13px] font-bold text-slate-600 leading-relaxed">
            {lang === 'en'
              ? 'Each section below is consented to separately when you register. You may withdraw any consent at any time by contacting our staff.'
              : 'แต่ละหัวข้อด้านล่างจะให้ยินยอมแยกกันตอนลงทะเบียน และถอนความยินยอมเมื่อใดก็ได้โดยติดต่อเจ้าหน้าที่'}
          </p>
        </div>

        {docs === null ? (
          <div className="space-y-4 animate-pulse">
            {[0, 1].map(i => (
              <div key={i} className="bg-white rounded-3xl border border-slate-100 p-5 space-y-3">
                <div className="h-5 w-2/3 bg-slate-200 rounded-full" />
                <div className="h-3 w-full bg-slate-100 rounded-full" />
                <div className="h-3 w-5/6 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : failed ? (
          <p className="text-center py-12 text-[13px] font-bold text-mellow-red">
            {lang === 'en' ? 'Could not load the policy. Please try again.' : 'โหลดนโยบายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
          </p>
        ) : docs.length === 0 ? (
          <p className="text-center py-12 text-[13px] font-bold text-slate-400">
            {lang === 'en' ? 'No policy has been published yet.' : 'ยังไม่มีการเผยแพร่นโยบาย'}
          </p>
        ) : (
          <div className="space-y-4">
            {docs.map(doc => (
              <section key={doc.id} id={doc.doc_key} className="bg-white rounded-3xl border border-slate-100 p-5">
                <h2 className="text-[16px] font-black text-slate-800 leading-tight">{doc.title}</h2>
                {/* The version is on the page on purpose: a family asking
                    "which wording did I agree to" can compare it against what
                    their booking recorded. */}
                <p className="text-[11px] font-bold text-slate-400 mt-1 mb-3">
                  {lang === 'en' ? `Version ${doc.version}` : `ฉบับที่ ${doc.version}`}
                  {doc.updated_at ? ` · ${String(doc.updated_at).slice(0, 10)}` : ''}
                </p>
                {!!doc.summary && (
                  <p className="text-[13px] font-bold text-slate-600 leading-relaxed mb-3">{doc.summary}</p>
                )}
                {/* Admin-authored rich text from the CRM editor, the same trust
                    boundary as a course description. */}
                <div className="prose-news text-[14px] text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: doc.body_html }} />
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PdpaPolicy;
