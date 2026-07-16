import React, { useState } from 'react';
import { isInLineApp, shareToLine } from '../utils/lineShare';

interface ShareToLineButtonProps {
  text: string;
  label: React.ReactNode;
  className?: string;
}

// Shown only inside LINE's in-app browser (checked via user agent, not by
// calling liff.init() — see isInLineApp's comment for why that matters).
// The actual LIFF init + shareTargetPicker feature-detection is deferred
// until the user taps this, not done eagerly on page load.
const ShareToLineButton: React.FC<ShareToLineButtonProps> = ({ text, label, className }) => {
  const [sharing, setSharing] = useState(false);

  if (!isInLineApp()) return null;

  const handleClick = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareToLine(text);
    } finally {
      setSharing(false);
    }
  };

  return (
    <button type="button" onClick={handleClick} disabled={sharing} className={className} style={sharing ? { opacity: 0.6 } : undefined}>
      {label}
    </button>
  );
};

export default ShareToLineButton;
