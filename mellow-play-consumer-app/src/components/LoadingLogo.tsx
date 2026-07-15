import React from 'react';
import logo from '../assets/ui/logo.svg';

interface LoadingLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES: Record<string, string> = { sm: 'h-8', md: 'h-12', lg: 'h-16' };

const LoadingLogo: React.FC<LoadingLogoProps> = ({ size = 'md', className = '' }) => (
  <div className={`flex flex-col items-center gap-4 ${className}`}>
    <style>{`
      @keyframes mellow-dot-wave {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
        30% { transform: translateY(-9px); opacity: 1; }
      }
    `}</style>
    <img src={logo} alt="Mellow Play" className={`${SIZES[size]} opacity-90`} />
    <div className="flex items-center gap-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2.5 h-2.5 rounded-full bg-mellow-purple"
          style={{ animation: `mellow-dot-wave 1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </div>
  </div>
);

export default LoadingLogo;
