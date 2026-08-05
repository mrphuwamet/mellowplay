import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface PromotionCountdownProps {
  validUntil: string;
  lang: 'th' | 'en';
}

// Adaptive-precision countdown: days+hours while >= 1 day remains, then
// hours+minutes while >= 1 hour remains, then a ticking MM:SS once under an
// hour — never shows a finer unit than makes sense for how much is left.
const PromotionCountdown: React.FC<PromotionCountdownProps> = ({ validUntil, lang }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!validUntil) return null;
  const remainingMs = new Date(validUntil).getTime() - now;
  if (remainingMs <= 0) return null;

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label: string;
  if (days > 0) {
    label = lang === 'en' ? `${days}d ${hours}h left` : `เหลือ ${days} วัน ${hours} ชม.`;
  } else if (hours > 0) {
    label = lang === 'en' ? `${hours}h ${minutes}m left` : `เหลือ ${hours} ชม. ${minutes} นาที`;
  } else {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    label = lang === 'en' ? `${mm}:${ss} left` : `เหลือ ${mm}:${ss} นาที`;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-mellow-red">
      <Clock size={11} />
      {label}
    </span>
  );
};

export default PromotionCountdown;
