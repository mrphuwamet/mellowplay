import React from 'react';
import LoadingLogo from './LoadingLogo';

interface LoadingOverlayProps {
  active: boolean;
  message?: string;
}

// Full-screen blocking overlay for in-progress ACTIONS (uploads, submits)
// as opposed to page-level data loads, which use skeleton placeholders
// instead. Blurs the background and swallows all clicks/taps underneath
// until `active` clears.
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ active, message }) => {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white/70 backdrop-blur-sm">
      <LoadingLogo size="md" />
      {message && <p className="text-xs font-bold text-slate-500">{message}</p>}
    </div>
  );
};

export default LoadingOverlay;
