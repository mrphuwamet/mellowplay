import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ShieldQuestion } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { formatCertDate } from '../utils/certificateLayout';

/**
 * What the QR on a certificate opens.
 *
 * Without this a certificate is a picture anyone can retype a name into. The
 * page answers one question — is this real — and shows only what is already
 * printed on the certificate itself, so a shared link reveals nothing a
 * photograph of the page would not.
 */
const CertificateVerify: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<'loading' | 'valid' | 'revoked' | 'unknown'>('loading');
  const [cert, setCert] = useState<any>(null);

  useEffect(() => {
    if (!code) { setState('unknown'); return; }
    let cancelled = false;
    apiClient.get(`/certificates/${encodeURIComponent(code)}`)
      .then(res => {
        if (cancelled) return;
        if (!res.data.success) { setState('unknown'); return; }
        setCert(res.data.certificate);
        setState(res.data.certificate.revoked ? 'revoked' : 'valid');
      })
      .catch(() => { if (!cancelled) setState('unknown'); });
    return () => { cancelled = true; };
  }, [code]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5 font-body-scope">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm p-6 space-y-4">{children}</div>
    </div>
  );

  if (state === 'loading') return shell(<p className="text-sm font-bold text-slate-400 text-center">กำลังตรวจสอบ...</p>);

  if (state === 'unknown') {
    return shell(<>
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
        <ShieldQuestion size={26} className="text-slate-400" />
      </div>
      <h1 className="text-[19px] font-black text-slate-800 text-center">ไม่พบเกียรติบัตรนี้</h1>
      <p className="text-sm font-medium text-slate-500 text-center leading-relaxed">
        รหัสอาจพิมพ์ผิด ลองตรวจสอบตัวอักษรบนใบอีกครั้ง
      </p>
    </>);
  }

  const valid = state === 'valid';
  return shell(<>
    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${valid ? 'bg-emerald-50' : 'bg-red-50'}`}>
      {valid ? <CheckCircle2 size={28} className="text-emerald-600" /> : <XCircle size={28} className="text-mellow-red" />}
    </div>
    <h1 className="text-[19px] font-black text-slate-800 text-center">
      {valid ? 'เกียรติบัตรนี้ออกโดย Mellow Play จริง' : 'เกียรติบัตรนี้ถูกยกเลิกแล้ว'}
    </h1>

    {/* Name, activity, date, number — exactly what is on the paper, and
        nothing else. No phone number, no email, no account. */}
    <dl className="divide-y divide-slate-100 border-y border-slate-100">
      {[
        ['ผู้รับ', cert.recipient_name],
        ['กิจกรรม', cert.course_name],
        ['วันที่จัดกิจกรรม', formatCertDate(cert.event_date)],
        ['เลขที่', cert.serial],
      ].filter(([, v]) => !!v).map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 py-2.5">
          <dt className="text-[13px] font-bold text-slate-400 shrink-0">{label}</dt>
          <dd className="text-[14px] font-bold text-slate-800 text-right">{value}</dd>
        </div>
      ))}
    </dl>

    {!valid && (
      <p className="text-[13px] font-medium text-slate-500 text-center leading-relaxed">
        ใบนี้ถูกยกเลิก เช่น ออกซ้ำหรือมีข้อมูลผิด กรุณาติดต่อเจ้าหน้าที่เพื่อขอใบที่ถูกต้อง
      </p>
    )}

    {valid && (
      <Link
        to={`/certificate/${cert.public_code}`}
        className="block w-full py-3 bg-mellow-purple text-white rounded-2xl text-sm font-black text-center active:scale-95 transition-transform"
      >
        ดูใบเกียรติบัตร
      </Link>
    )}
  </>);
};

export default CertificateVerify;
