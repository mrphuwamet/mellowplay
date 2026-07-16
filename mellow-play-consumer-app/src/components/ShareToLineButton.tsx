import React, { useEffect, useState } from 'react';
import { isLineShareAvailable, shareToLine } from '../utils/lineShare';

interface ShareToLineButtonProps {
  text: string;
  label: React.ReactNode;
  className?: string;
}

// Renders nothing until availability is confirmed, and stays hidden entirely
// if LIFF share isn't available (plain browser without the LINE hand-off,
// LIFF ID not configured yet, old LINE app version, etc.) — a locked-looking
// or dead button is worse than no button at all.
const ShareToLineButton: React.FC<ShareToLineButtonProps> = ({ text, label, className }) => {
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
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
  }, []);

  if (!checked || !available) return null;

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
