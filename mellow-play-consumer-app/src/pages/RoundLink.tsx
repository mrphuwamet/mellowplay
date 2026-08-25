import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, FileQuestion } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';

/**
 * What the QR on the table at the venue actually points at.
 *
 * A short address so the printed code stays coarse enough to scan across a
 * table — and so the round can be re-pointed at a different set of forms later
 * without reprinting anything, since the token identifies the round rather than
 * the questionnaire.
 *
 * It resolves and forwards; the round page itself is SessionDetail, which
 * already knows how to run several forms as one sitting.
 */
const RoundLink = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient.get(`/round-links/${token}`)
      .then(res => {
        if (!res.data.success) { setFailed(true); return; }
        // replace, not push: Back should leave the questionnaire, not bounce
        // through this redirect and immediately forward again.
        navigate(`/session/${res.data.session.slug}?round=${encodeURIComponent(token)}`, { replace: true });
      })
      .catch(() => setFailed(true));
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-[#fbfaf7] grid place-items-center p-8">
      {failed ? (
        <div className="text-center">
          <FileQuestion size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-black text-slate-500">
            {t('ลิงก์นี้ใช้ไม่ได้แล้ว', 'This link is no longer active')}
          </p>
          <p className="text-xs font-bold text-slate-400 mt-1">
            {t('สอบถามเจ้าหน้าที่หน้างานได้เลยค่ะ', 'Please ask a staff member at the venue')}
          </p>
        </div>
      ) : (
        <Loader2 className="animate-spin text-mellow-purple" size={32} />
      )}
    </div>
  );
};

export default RoundLink;
