import React from 'react';
import { createPortal } from 'react-dom';

interface FloatingPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  width?: number;
  children: React.ReactNode;
}

// Generic floating panel anchored under a trigger element, portaled to
// document.body — needed because the trigger often sits inside an
// ancestor with backdrop-filter/overflow-hidden, which would otherwise clip
// or reposition a plain `fixed` child into that ancestor's own small box).
// Flips to open upward when there isn't enough room below the anchor.
const FloatingPopover: React.FC<FloatingPopoverProps> = ({ isOpen, onClose, anchorRef, width = 360, children }) => {
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  React.useEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const effectiveWidth = Math.min(width, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - effectiveWidth - 16));
    const PANEL_HEIGHT_ESTIMATE = 320;
    if (window.innerHeight - rect.bottom < PANEL_HEIGHT_ESTIMATE && rect.top > PANEL_HEIGHT_ESTIMATE) {
      setPos({ bottom: window.innerHeight - rect.top + 8, left, width: effectiveWidth });
    } else {
      setPos({ top: rect.bottom + 8, left, width: effectiveWidth });
    }
  }, [isOpen, anchorRef, width]);

  if (!isOpen || !pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm transition-all" onClick={onClose} />
      <div
        style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
        className="fixed z-[101] animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {children}
      </div>
    </>,
    document.body
  );
};

export default FloatingPopover;
