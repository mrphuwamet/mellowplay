import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Check, Loader2, Upload, Receipt, AlertTriangle } from 'lucide-react';
import apiClient, { API_HOST } from '../utils/apiClient';

export interface SurveyPaymentInfo {
  amount: number;
  lines: { label: string; amount: number }[];
  token: string;
  account: {
    bankName?: string;
    accountName?: string;
    accountNo?: string;
    promptPay?: string;
    /** A PromptPay QR saved out of a banking app and uploaded by staff. */
    qrImageUrl?: string;
    note?: string;
  } | null;
}

/** A stored file path points at the API's own origin, not this app's. */
const fileUrl = (path: string): string =>
  path.startsWith('/api/v1/files/') ? `${API_HOST}${path}` : path;

interface Props {
  submissionId: number;
  payment: SurveyPaymentInfo;
  lang: 'th' | 'en';
  /** The slip is in. The page that owns the flow can stop holding the token. */
  onAttached?: () => void;
  /**
   * The token no longer opens this submission — already verified, or the row
   * is gone. Nothing more can be attached to it, so the saved one is useless.
   */
  onTokenDead?: () => void;
  /** This page was reopened to finish a registration made earlier. */
  resumed?: boolean;
}

const baht = (n: number) => n.toLocaleString('th-TH');

/**
 * What someone sees after a form that charges has taken their answers.
 *
 * The submission is already filed at this point — this screen is about the
 * money, and it must not read as "you are not registered yet", because they
 * are. It asks for the transfer, takes the slip, and then says plainly what
 * happens next.
 */
const CopyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // A browser that refuses the clipboard still shows the number on screen,
      // which is the thing that actually has to work.
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs font-bold text-slate-400 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-black text-slate-800 truncate">{value}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`คัดลอก${label}`}
          className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-500" />}
        </button>
      </div>
    </div>
  );
};

const SurveyPaymentStep: React.FC<Props> = ({ submissionId, payment, lang, onAttached, onTokenDead, resumed }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ emailed: boolean } | null>(null);

  // Leaving here without a slip is the one way to end up registered and
  // unpaid with nobody knowing why. The browser's own wording is generic,
  // but the prompt is the point: it makes closing the tab deliberate.
  useEffect(() => {
    if (done) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [done]);

  const pick = (f: File | null) => {
    setError('');
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
  };

  const upload = async () => {
    if (uploading) return;
    // Said out loud rather than left as a dead button. A control that does
    // nothing when pressed reads as a broken page, not as a rule.
    if (!file) {
      setError(lang === 'en' ? 'Attach your transfer slip first.' : 'กรุณาแนบสลิปโอนเงินก่อนกดส่ง');
      fileRef.current?.click();
      return;
    }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('token', payment.token);
      body.append('slip', file);
      // apiClient defaults every request to application/json, which would
      // reach the server describing a multipart body as JSON and fail to
      // parse. Same override every other upload in this app uses.
      const res = await apiClient.post(`/survey-submissions/${submissionId}/slip`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        setDone({ emailed: !!res.data.emailed });
        onAttached?.();
      } else setError(res.data?.message || (lang === 'en' ? 'Upload failed.' : 'แนบสลิปไม่สำเร็จ'));
    } catch (err: any) {
      // 403 wrong/expired token, 404 no such submission, 409 already
      // verified — in all three nothing further can be attached here, so a
      // retry button would only fail again.
      const status = err.response?.status;
      if (status === 403 || status === 404 || status === 409) onTokenDead?.();
      setError(err.response?.data?.message || (lang === 'en' ? 'Upload failed.' : 'แนบสลิปไม่สำเร็จ'));
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
        <p className="font-black text-slate-800 mb-1">
          {lang === 'en' ? 'We have your slip' : 'ได้รับสลิปของคุณแล้ว'}
        </p>
        <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-[280px] mx-auto">
          {done.emailed
            ? (lang === 'en'
              ? 'A confirmation has been emailed to you. Keep it as your record.'
              : 'ส่งอีเมลยืนยันไปให้แล้ว เก็บไว้เป็นหลักฐานได้เลย')
            : (lang === 'en'
              ? 'Your registration is complete. Take a screenshot of this page as your record.'
              : 'การสมัครเสร็จสมบูรณ์ แนะนำให้บันทึกหน้าจอนี้ไว้เป็นหลักฐาน')}
        </p>
        <p className="text-[11px] font-bold text-slate-400 mt-3">
          {lang === 'en' ? 'Reference' : 'เลขที่รายการ'} #{submissionId}
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="text-center mb-4">
        <Receipt size={34} className="text-mellow-purple mx-auto mb-2" />
        <p className="font-black text-slate-800">
          {resumed
            ? (lang === 'en' ? 'You still owe a slip' : 'ยังค้างการแนบสลิป')
            : (lang === 'en' ? 'Answers received — one step left' : 'รับคำตอบแล้ว เหลืออีกขั้นเดียว')}
        </p>
        <p className="text-xs font-bold text-slate-400 mt-0.5">
          {lang === 'en' ? 'Transfer and attach the slip' : 'โอนเงินแล้วแนบสลิป'}
        </p>
      </div>

      {/* Said before the bill, not after it. Somebody who reads only the
          amount and leaves to make the transfer should already know that
          coming back is part of the task. */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4 flex gap-2.5">
        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-amber-900 leading-relaxed">
          {lang === 'en'
            ? 'The registration is not complete until the slip is attached. Your answers are saved — transfer, come back to this page and attach it.'
            : 'การลงทะเบียนจะยังไม่สมบูรณ์จนกว่าจะแนบสลิป คำตอบถูกบันทึกไว้แล้ว โอนเงินแล้วกลับมาแนบที่หน้านี้ได้เลย'}
        </p>
      </div>

      {/* The bill, itemised. A single figure is not something anyone can check. */}
      <div className="rounded-2xl bg-slate-50 p-4 mb-4">
        {payment.lines.map((line, i) => (
          <div key={i} className="flex justify-between gap-3 text-sm font-bold text-slate-600 py-1">
            <span className="min-w-0 break-words">{line.label}</span>
            <span className="shrink-0">{baht(line.amount)} ฿</span>
          </div>
        ))}
        <div className="h-px bg-slate-200 my-2" />
        <div className="flex justify-between items-center">
          <span className="font-black text-slate-700">{lang === 'en' ? 'Total' : 'ยอดที่ต้องโอน'}</span>
          <span className="text-2xl font-black text-mellow-purple">{baht(payment.amount)} ฿</span>
        </div>
      </div>

      {/* The QR leads, because scanning it is the whole of the task: no
          number to copy across, no amount to retype. The typed details stay
          underneath for anyone whose banking app will not scan from the same
          screen it is displayed on. */}
      {payment.account?.qrImageUrl && (
        <div className="rounded-2xl border border-slate-100 p-4 mb-4 text-center">
          <p className="text-xs font-black text-slate-400 mb-3">
            {lang === 'en' ? 'Scan to pay' : 'สแกนเพื่อจ่าย'}
          </p>
          <img
            src={fileUrl(payment.account.qrImageUrl)}
            alt={lang === 'en' ? 'PromptPay QR code' : 'QR พร้อมเพย์สำหรับชำระเงิน'}
            className="w-full max-w-[260px] mx-auto rounded-xl bg-white"
          />
          <p className="text-[11px] font-bold text-slate-400 mt-3 leading-relaxed">
            {lang === 'en'
              ? `Enter ${baht(payment.amount)} ฿ yourself — the code does not carry the amount.`
              : `กรุณากรอกยอด ${baht(payment.amount)} บาทเอง เพราะ QR นี้ไม่ได้ระบุจำนวนเงินไว้`}
          </p>
        </div>
      )}

      {/* Only when there is something typed to show: a form that uses a QR
          alone would otherwise render an empty bordered box. */}
      {payment.account && [payment.account.bankName, payment.account.accountName, payment.account.accountNo, payment.account.promptPay, payment.account.note].some(v => String(v || '').trim()) && (
        <div className="rounded-2xl border border-slate-100 p-4 mb-4">
          {payment.account.bankName && <CopyRow label={lang === 'en' ? 'Bank' : 'ธนาคาร'} value={payment.account.bankName} />}
          {payment.account.accountName && <CopyRow label={lang === 'en' ? 'Account name' : 'ชื่อบัญชี'} value={payment.account.accountName} />}
          {payment.account.accountNo && <CopyRow label={lang === 'en' ? 'Account no.' : 'เลขบัญชี'} value={payment.account.accountNo} />}
          {payment.account.promptPay && <CopyRow label="PromptPay" value={payment.account.promptPay} />}
          {payment.account.note && (
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed pt-2 border-t border-slate-100 mt-2">
              {payment.account.note}
            </p>
          )}
        </div>
      )}

      {/* accept + capture so a phone offers the camera roll and the camera,
          which is where a slip actually lives. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-2xl border border-slate-200 overflow-hidden mb-3 active:scale-[0.99] transition-transform"
        >
          <img src={preview} alt={lang === 'en' ? 'Your slip' : 'สลิปที่เลือก'} className="w-full max-h-[260px] object-contain bg-slate-50" />
          <span className="block text-[11px] font-bold text-slate-400 py-2">
            {lang === 'en' ? 'Tap to choose a different image' : 'แตะเพื่อเปลี่ยนรูป'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full h-[96px] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 mb-3 active:scale-[0.99] transition-transform"
        >
          <Upload size={20} className="text-slate-400" />
          <span className="text-sm font-black text-slate-500">
            {lang === 'en' ? 'Attach your transfer slip' : 'แนบสลิปโอนเงิน'}
          </span>
        </button>
      )}

      {error && <p className="text-xs font-bold text-red-500 mb-3 text-center">{error}</p>}

      <button
        type="button"
        disabled={uploading}
        onClick={upload}
        className={`w-full h-[52px] rounded-2xl font-black text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
          file ? 'bg-mellow-purple text-white' : 'bg-slate-200 text-slate-500'
        } disabled:opacity-40`}
      >
        {uploading
          ? <><Loader2 size={18} className="animate-spin" />{lang === 'en' ? 'Sending…' : 'กำลังส่ง…'}</>
          : (lang === 'en' ? 'Send slip' : 'ส่งสลิป')}
      </button>

      <p className="text-[11px] font-bold text-slate-400 text-center leading-relaxed mt-3">
        {lang === 'en'
          ? `Reference #${submissionId}. This page reopens where you left it until the slip is in.`
          : `เลขที่รายการ #${submissionId} · หน้านี้จะเปิดค้างไว้ให้จนกว่าจะแนบสลิปเสร็จ`}
      </p>
    </div>
  );
};

export default SurveyPaymentStep;
