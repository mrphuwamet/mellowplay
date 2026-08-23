import React, { useState } from 'react';
import { XCircle } from 'lucide-react';
import ResponsiveModal from './ResponsiveModal';
import LineContactLink, { LINE_OA_URL, LINE_OA_HANDLE } from './LineContactLink';
import { useTranslation } from '../LanguageContext';

/**
 * "ยกเลิกการจอง" — a button that leads to a person, not to a cancellation.
 *
 * There is no self-service cancel and there is not meant to be: a round has a
 * seat count and a team roster behind it, and letting a booking vanish without
 * anyone knowing costs the desk more than the click saves. But offering nothing
 * at all is worse — people hunted for a button that was not there, then rang
 * anyway, having first decided the app was broken.
 *
 * So the button exists and says plainly where cancelling actually happens.
 */
const CancelBookingNotice: React.FC<{ className?: string; compact?: boolean }> = ({ className, compact }) => {
  const [open, setOpen] = useState(false);
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  return (
    <>
      <button
        type="button"
        // These sit inside cards that are themselves tappable, so the click
        // must not also open whatever is behind the button.
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className={className ?? `flex items-center justify-center gap-1.5 ${compact ? 'text-[12px] py-1.5' : 'text-[13px] py-2.5 w-full'} font-bold text-slate-400 active:text-mellow-red transition-colors`}
      >
        <XCircle size={compact ? 13 : 15} className="shrink-0" />
        {t('ยกเลิกการจอง', 'Cancel booking')}
      </button>

      <ResponsiveModal isOpen={open} onClose={() => setOpen(false)}>
        <div className="p-5 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <XCircle size={26} className="text-amber-500" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-[18px] font-black text-slate-800">
              {t('ยกเลิกการจอง', 'Cancelling a booking')}
            </h3>
            {/* Written out rather than run through t(), which takes strings —
                the handle in the middle is a link, not text. */}
            <p className="text-sm font-medium text-slate-500 leading-relaxed">
              {lang === 'en'
                ? <>Please message us on LINE <LineContactLink /> to cancel or reschedule.</>
                : <>กรุณาติดต่อ LINE <LineContactLink /> เพื่อยกเลิกหรือเลื่อนรอบนะคะ</>}
            </p>
          </div>

          {/* The whole reason for the modal is to get someone to LINE, so that
              is the filled button, not a link buried in the sentence above. */}
          <a
            href={LINE_OA_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block w-full py-3.5 bg-[#06C755] text-white rounded-2xl font-black text-[15px] active:scale-[0.98] transition-transform"
          >
            {t(`เปิด LINE ${LINE_OA_HANDLE}`, `Open LINE ${LINE_OA_HANDLE}`)}
          </a>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full py-3 text-slate-500 rounded-2xl font-bold text-sm active:bg-slate-50 transition-colors"
          >
            {t('ปิด', 'Close')}
          </button>
        </div>
      </ResponsiveModal>
    </>
  );
};

export default CancelBookingNotice;
