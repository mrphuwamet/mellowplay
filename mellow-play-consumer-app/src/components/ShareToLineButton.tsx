import React, { useEffect, useState } from 'react';
import { isInLineApp, isLineShareAvailable, shareToLine } from '../utils/lineShare';
import { Toast } from './Toast';
import { useTranslation } from '../LanguageContext';

interface ShareToLineButtonProps {
  text: string;
  label: React.ReactNode;
  className?: string;
}

// Must work both inside LINE's in-app browser and in a normal browser.
// Inside LINE: show immediately, no eager liff.init() — the first init()
// call in a LINE webview session does a real redirect through LINE's
// domain to bootstrap it, which drops whatever path the user was on if
// done on every page load (see lineShare.ts's isInLineApp comment).
// Outside LINE: liff.init() doesn't do that redirect, so it's safe (and
// necessary) to eagerly feature-detect shareTargetPicker to decide whether
// to show the button at all.
const ShareToLineButton: React.FC<ShareToLineButtonProps> = ({ text, label, className }) => {
  const { lang } = useTranslation();
  const inLine = isInLineApp();
  const [available, setAvailable] = useState(inLine);
  const [checked, setChecked] = useState(inLine);
  const [sharing, setSharing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (inLine) return;
    let cancelled = false;
    isLineShareAvailable().then((ok) => {
      if (!cancelled) {
        setAvailable(ok);
        setChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked || !available) return null;

  const handleClick = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareToLine(text);
      // 'sent' — LINE's own picker UI already gave feedback; 'cancelled' —
      // the user closed the picker on purpose, also not an error. Only
      // 'unavailable' (the LIFF app's "Share target picker" permission
      // likely isn't enabled in the LINE Developers Console) and 'error'
      // deserve a message — otherwise tapping share and seeing nothing
      // happen looks broken with no way to tell what went wrong.
      if (result.status === 'unavailable' || result.status === 'error') {
        console.error('LINE share unavailable:', result);
        setErrorMsg(lang === 'en' ? 'Unable to share right now.' : 'ไม่สามารถแชร์ได้ในขณะนี้');
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <button type="button" onClick={handleClick} disabled={sharing} className={className} style={sharing ? { opacity: 0.6 } : undefined}>
        {label}
      </button>
      <Toast message={errorMsg} type="error" onClose={() => setErrorMsg('')} />
    </>
  );
};

export default ShareToLineButton;
