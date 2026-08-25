import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Award, ExternalLink, Copy, Check } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { formatCertDate } from '../utils/certificateLayout';

/**
 * Every certificate this account has been given.
 *
 * A list, not a wall of rendered pages: each certificate is a full sheet and
 * five of them stacked is a page nobody scrolls. The row says who it was for
 * and what it was for — which is what someone scanning for one actually reads —
 * and opening it is one tap.
 */
const MyCertificates: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    apiClient.get(`/my-certificates?userId=${user.id}`)
      .then(res => { if (res.data.success) setItems(res.data.certificates || []); })
      .catch(() => { /* an empty list reads the same as a failure here, and the
                        page below says so plainly either way */ })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const share = async (code: string) => {
    const url = `${window.location.origin}/certificate/${code}`;
    // The native sheet where there is one — on a phone that is how a
    // certificate actually reaches a grandparent. Clipboard is the fallback.
    if (navigator.share) {
      try { await navigator.share({ url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* nothing to do — the link is one tap away on the page itself */ }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-body-scope">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:bg-slate-100">
          <ChevronLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="text-[17px] font-black text-slate-800">เกียรติบัตรของฉัน</h1>
      </header>

      <main className="p-4 space-y-3">
        {loading && <p className="text-sm font-bold text-slate-400 text-center py-10">กำลังโหลด...</p>}

        {!loading && items.length === 0 && (
          <div className="bg-white rounded-3xl p-8 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
              <Award size={26} className="text-slate-300" />
            </div>
            <p className="text-[15px] font-black text-slate-700">ยังไม่มีเกียรติบัตร</p>
            <p className="text-[13px] font-medium text-slate-400 leading-relaxed">
              เกียรติบัตรจะขึ้นที่นี่หลังเข้าร่วมกิจกรรมที่มีการมอบให้
            </p>
          </div>
        )}

        {items.map(cert => (
          <div key={cert.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => navigate(`/certificate/${cert.public_code}`)}
              className="w-full text-left p-4 flex items-start gap-3 active:scale-[0.99] transition-transform"
            >
              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Award size={20} className="text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-black text-slate-800 leading-snug">{cert.recipient_name}</p>
                <p className="text-[13px] font-bold text-slate-500 leading-snug break-words">{cert.course_name}</p>
                <p className="text-[12px] font-medium text-slate-400 mt-0.5">
                  {formatCertDate(cert.event_date)}{cert.serial ? ` · ${cert.serial}` : ''}
                </p>
              </div>
              <ExternalLink size={15} className="text-slate-300 shrink-0 mt-1" />
            </button>
            <button
              type="button"
              onClick={() => share(cert.public_code)}
              className="w-full py-2.5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[13px] font-bold text-slate-500 active:bg-slate-50"
            >
              {copied === cert.public_code
                ? <><Check size={14} className="text-emerald-600" /> คัดลอกลิงก์แล้ว</>
                : <><Copy size={14} /> แชร์ให้คนอื่นดู</>}
            </button>
          </div>
        ))}
      </main>
    </div>
  );
};

export default MyCertificates;
