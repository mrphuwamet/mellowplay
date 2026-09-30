import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import apiClient from '../utils/apiClient';

/**
 * One PDPA consent tick, tied to a managed document.
 *
 * Not a checkbox with legal wording typed into its label. Three things make it
 * different, and each one exists because the checkbox version fails without it:
 *
 *   the wording is fetched, so six forms asking the same thing cannot drift
 *   into six wordings;
 *
 *   the full text is one tap away, because consent given to a summary nobody
 *   could expand is not informed;
 *
 *   and the version is recorded with the answer, so when the wording is edited
 *   next year it is still possible to say what this family actually read.
 *
 * The answer itself stays a plain readable string — "ยินยอม" — so every screen,
 * export and check-in card that already renders form answers keeps working
 * untouched. The evidence rides alongside in a companion key, the same shape
 * the child picker already uses for __realname.
 */

export interface ConsentDoc {
  id: number;
  doc_key: string;
  title: string;
  summary: string;
  body_html: string;
  version: number;
}

/** What gets stored beside the answer, under `${field_key}__consent`. */
export interface ConsentRecord {
  docKey: string;
  documentId: number;
  version: number;
  acceptedAt: string;
}

export const CONSENT_ACCEPTED_TEXT = 'ยินยอม';
export const CONSENT_ACCEPTED_TEXT_EN = 'Accepted';

interface Props {
  docKey: string;
  lang: string;
  /** The plain answer — accepted when it is non-empty. */
  value: any;
  required: boolean;
  onChange: (value: string, record: ConsentRecord | null) => void;
}

const ConsentField: React.FC<Props> = ({ docKey, lang, value, required, onChange }) => {
  const [doc, setDoc] = useState<ConsentDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const accepted = !!value && String(value).trim() !== '';

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    apiClient.get(`/consent-documents/key/${encodeURIComponent(docKey)}`)
      .then(res => { if (!cancelled && res.data?.success) setDoc(res.data.document); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [docKey]);

  const toggle = () => {
    if (!doc) return;
    if (accepted) {
      onChange('', null);
      return;
    }
    onChange(lang === 'en' ? CONSENT_ACCEPTED_TEXT_EN : CONSENT_ACCEPTED_TEXT, {
      docKey: doc.doc_key,
      documentId: doc.id,
      version: doc.version,
      acceptedAt: new Date().toISOString(),
    });
  };

  // A tick box with nothing to agree to is worse than an absent field: it
  // collects a consent to wording that was never shown. Says so instead.
  if (failed) {
    return (
      <p className="text-[12px] font-bold text-mellow-red">
        {lang === 'en'
          ? 'Could not load the consent text. Please try again.'
          : 'โหลดข้อความยินยอมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
      </p>
    );
  }
  if (!doc) {
    return <div className="h-12 rounded-2xl bg-slate-100 animate-pulse" />;
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={toggle}
            className="mt-0.5 w-5 h-5 shrink-0 accent-mellow-purple"
          />
          <span className="text-[13px] font-bold text-slate-700 leading-relaxed">
            {doc.summary}
            {required && <span className="text-mellow-red ml-0.5">*</span>}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 ml-8 text-[12px] font-bold text-mellow-purple underline underline-offset-2"
        >
          {lang === 'en' ? 'Read the full text' : 'อ่านข้อความฉบับเต็ม'}
        </button>
        {/* Stated plainly, because a consent that cannot be refused is not
            consent — and someone deciding should be able to see which kind
            this is without reading the asterisk. */}
        {!required && (
          <p className="mt-1 ml-8 text-[11px] font-bold text-slate-400">
            {lang === 'en' ? 'Optional — you can join without agreeing' : 'ไม่บังคับ — ไม่ยินยอมก็เข้าร่วมกิจกรรมได้ตามปกติ'}
          </p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={() => setOpen(false)}>
          <div
            className="bg-white w-full sm:max-w-lg max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
              <div>
                <h3 className="text-[16px] font-black text-slate-800 leading-tight">{doc.title}</h3>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                  {lang === 'en' ? `Version ${doc.version}` : `ฉบับที่ ${doc.version}`}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <X size={18} />
              </button>
            </div>
            {/* Admin-authored rich text from the CRM's own editor, the same
                trust boundary as a course description. */}
            <div
              className="prose-news overflow-y-auto p-5 text-[14px] text-slate-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: doc.body_html }}
            />
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold">
                {lang === 'en' ? 'Close' : 'ปิด'}
              </button>
              {!accepted && (
                <button
                  type="button"
                  onClick={() => { toggle(); setOpen(false); }}
                  className="flex-1 py-3 rounded-2xl bg-mellow-purple text-white text-sm font-bold"
                >
                  {lang === 'en' ? 'I agree' : 'ยินยอม'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConsentField;
