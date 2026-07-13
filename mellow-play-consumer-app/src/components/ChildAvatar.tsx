import React from 'react';

interface ChildAvatarProps {
  avatarType?: string;
  className?: string;
}

export const ChildAvatar: React.FC<ChildAvatarProps> = ({ avatarType, className = "w-10 h-10" }) => {
  const isUrl = avatarType && (avatarType.startsWith('http') || avatarType.startsWith('/api/v1/files/'));
  const isBoy = avatarType === 'boy' || avatarType === '👦' || avatarType === 'son';
  const isGirl = avatarType === 'girl' || avatarType === '👧' || avatarType === 'daughter';

  if (isUrl) {
    return (
      <div className={`rounded-full overflow-hidden shadow-inner flex items-center justify-center bg-slate-200 ${className}`}>
        <img src={avatarType} alt="Avatar" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isBoy) {
    return (
      <div className={`rounded-full bg-gradient-to-b from-blue-300 to-indigo-400 p-0.5 flex items-center justify-center overflow-hidden shadow-inner ${className}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
          {/* Hair */}
          <path d="M16 32C16 16 48 16 48 32C48 34 16 34 16 32Z" fill="#3B4F7D" />
          <path d="M18 24C24 10 40 10 46 24" fill="#3B4F7D" />
          {/* Head/Face */}
          <circle cx="32" cy="34" r="14" fill="#FCE0CE" />
          {/* Ears */}
          <circle cx="17" cy="34" r="3" fill="#FCE0CE" />
          <circle cx="47" cy="34" r="3" fill="#FCE0CE" />
          {/* Cap/Hair line */}
          <path d="M19 28C24 23 40 23 45 28" stroke="#3B4F7D" strokeWidth="4" strokeLinecap="round" />
          {/* Eyes */}
          <circle cx="27" cy="34" r="1.5" fill="#3B4F7D" />
          <circle cx="37" cy="34" r="1.5" fill="#3B4F7D" />
          {/* Smile */}
          <path d="M29 39C30.5 40.5 33.5 40.5 35 39" stroke="#3B4F7D" strokeWidth="1.5" strokeLinecap="round" />
          {/* Body/Shirt */}
          <path d="M18 52C18 45 22 43 32 43C42 43 46 45 46 52V56H18V52Z" fill="#5F88FC" />
          {/* Collar */}
          <path d="M28 43L32 46L36 43" stroke="#FCE0CE" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (isGirl) {
    return (
      <div className={`rounded-full bg-gradient-to-b from-pink-300 to-rose-400 p-0.5 flex items-center justify-center overflow-hidden shadow-inner ${className}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
          {/* Hair (back) */}
          <path d="M15 36C12 48 18 52 18 52C18 52 22 40 22 36" fill="#66462C" />
          <path d="M49 36C52 48 46 52 46 52C46 52 42 40 42 36" fill="#66462C" />
          {/* Head/Face */}
          <circle cx="32" cy="34" r="14" fill="#FDE5D6" />
          {/* Hair (top/bangs) */}
          <path d="M18 32C18 18 46 18 46 32" fill="#66462C" />
          <path d="M18 30C22 25 28 25 32 28C36 25 42 25 46 30" fill="#66462C" />
          {/* Hair Bow */}
          <path d="M41 21C42 19 45 19 46 21L48 24L44 24L41 21Z" fill="#EF4F55" />
          <circle cx="44" cy="22" r="2" fill="#FCE0CE" />
          {/* Eyes */}
          <circle cx="27" cy="34" r="1.5" fill="#66462C" />
          <circle cx="37" cy="34" r="1.5" fill="#66462C" />
          {/* Smile */}
          <path d="M29 39C30.5 40.5 33.5 40.5 35 39" stroke="#66462C" strokeWidth="1.5" strokeLinecap="round" />
          {/* Body/Dress */}
          <path d="M18 52C18 45 22 43 32 43C42 43 46 45 46 52V56H18V52Z" fill="#F472B6" />
          {/* Collar */}
          <circle cx="32" cy="44" r="3" fill="#FFF" />
        </svg>
      </div>
    );
  }

  if (avatarType === 'bear') {
    return (
      <div className={`rounded-full bg-gradient-to-b from-amber-300 to-orange-400 p-0.5 flex items-center justify-center overflow-hidden shadow-inner ${className}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
          <circle cx="20" cy="22" r="6" fill="#8B4513" />
          <circle cx="44" cy="22" r="6" fill="#8B4513" />
          <circle cx="32" cy="34" r="16" fill="#A0522D" />
          <circle cx="32" cy="38" r="7" fill="#D2B48C" />
          <circle cx="32" cy="35" r="2" fill="#000" />
          <circle cx="26" cy="30" r="1.5" fill="#000" />
          <circle cx="38" cy="30" r="1.5" fill="#000" />
          <path d="M29 39C30.5 40.5 33.5 40.5 35 39" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (avatarType === 'rabbit') {
    return (
      <div className={`rounded-full bg-gradient-to-b from-slate-100 to-slate-300 p-0.5 flex items-center justify-center overflow-hidden shadow-inner ${className}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
          <path d="M24 30C24 10 16 10 20 8C24 6 30 16 28 30" fill="#FFF" stroke="#E2E8F0" strokeWidth="2" />
          <path d="M40 30C40 10 48 10 44 8C40 6 34 16 36 30" fill="#FFF" stroke="#E2E8F0" strokeWidth="2" />
          <circle cx="32" cy="36" r="14" fill="#FFF" stroke="#E2E8F0" strokeWidth="2" />
          <circle cx="28" cy="34" r="1.5" fill="#000" />
          <circle cx="36" cy="34" r="1.5" fill="#000" />
          <circle cx="32" cy="38" r="1.5" fill="#F472B6" />
        </svg>
      </div>
    );
  }

  if (avatarType === 'cat') {
    return (
      <div className={`rounded-full bg-gradient-to-b from-yellow-100 to-yellow-300 p-0.5 flex items-center justify-center overflow-hidden shadow-inner ${className}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
          <path d="M18 18L24 28L18 34Z" fill="#F59E0B" />
          <path d="M46 18L40 28L46 34Z" fill="#F59E0B" />
          <circle cx="32" cy="36" r="14" fill="#FBBF24" />
          <circle cx="27" cy="34" r="1.5" fill="#000" />
          <circle cx="37" cy="34" r="1.5" fill="#000" />
          <circle cx="32" cy="38" r="1.5" fill="#EF4444" />
          <path d="M20 38L14 36" stroke="#000" strokeWidth="1" />
          <path d="M20 40L14 42" stroke="#000" strokeWidth="1" />
          <path d="M44 38L50 36" stroke="#000" strokeWidth="1" />
          <path d="M44 40L50 42" stroke="#000" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  if (avatarType === 'dog') {
    return (
      <div className={`rounded-full bg-gradient-to-b from-stone-200 to-stone-400 p-0.5 flex items-center justify-center overflow-hidden shadow-inner ${className}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
          <path d="M16 24C12 30 16 40 20 36C24 32 20 20 16 24Z" fill="#78716C" />
          <path d="M48 24C52 30 48 40 44 36C40 32 44 20 48 24Z" fill="#78716C" />
          <circle cx="32" cy="34" r="14" fill="#E7E5E4" />
          <circle cx="32" cy="38" r="5" fill="#FFF" />
          <circle cx="32" cy="36" r="2" fill="#000" />
          <circle cx="27" cy="32" r="1.5" fill="#000" />
          <circle cx="37" cy="32" r="1.5" fill="#000" />
        </svg>
      </div>
    );
  }

  // Default fallback (Baby outline / generic user outline)
  return (
    <div className={`rounded-full bg-slate-200 p-0.5 flex items-center justify-center overflow-hidden ${className}`}>
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2/3 h-2/3 text-slate-400">
        <circle cx="32" cy="24" r="12" fill="currentColor" />
        <path d="M12 52C12 42 20 38 32 38C44 38 52 42 52 52V56H12V52Z" fill="currentColor" />
      </svg>
    </div>
  );
};

export default ChildAvatar;
