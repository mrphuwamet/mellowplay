import React from 'react';

type ModalVariant = 'sheet' | 'dialog';
type ModalSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<ModalSize, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-[400px]',
  lg: 'max-w-[480px]',
};

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 'sheet': bottom-sheet on mobile, centered dialog from sm: up (matches
   *  BookingDetailModal/Rewards' history modal). 'dialog': always centered —
   *  for small alert/confirm modals that were never a bottom sheet. */
  variant?: ModalVariant;
  size?: ModalSize;
  className?: string;
}

// Generalizes the one responsive modal pattern already shipped in this app
// (BookingDetailModal.tsx, Rewards.tsx's redemption-history modal) so new
// modals get it for free instead of re-deriving the same handful of classes
// per call site.
const ResponsiveModal: React.FC<ResponsiveModalProps> = ({ isOpen, onClose, children, variant = 'sheet', size = 'sm', className = '' }) => {
  if (!isOpen) return null;

  const isSheet = variant === 'sheet';

  return (
    <div
      className={`fixed inset-0 z-[100] flex justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 ${isSheet ? 'items-end sm:items-center' : 'items-center'}`}
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${SIZE_CLASSES[size]} p-6 shadow-2xl relative animate-in duration-300 max-h-[85vh] overflow-y-auto ${
          isSheet ? 'rounded-t-[32px] sm:rounded-[32px] slide-in-from-bottom-8' : 'rounded-[32px] zoom-in-95'
        } ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export default ResponsiveModal;
