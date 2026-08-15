import React, { useState } from 'react';
import { shareToLine } from '../utils/lineShare';
import { Toast } from './Toast';
import { useTranslation } from '../LanguageContext';

interface ShareToLineButtonProps {
  text: string;
  label: React.ReactNode;
  className?: string;
}

// Always rendered — shareToLine() picks the right mechanism per context
// (LIFF shareTargetPicker inside LINE's in-app browser, LINE's own share
// deep link everywhere else), so there's nothing to feature-detect upfront
// here; a failure surfaces through the same error toast as any other case.
const ShareToLineButton: React.FC<ShareToLineButtonProps> = ({ text, label, className }) => {
  const { lang } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
