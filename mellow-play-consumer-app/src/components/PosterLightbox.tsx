import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PosterImage } from './PosterCarousel';

interface PosterLightboxProps {
  images: PosterImage[];
  startIndex: number;
  alt?: string;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 50;

// Full-screen viewer for browsing every poster image at full size, driven by
// pointer events (mouse drag + touch swipe) rather than native scroll-snap —
// opened from PosterCarousel when a slide is tapped.
const PosterLightbox: React.FC<PosterLightboxProps> = ({ images, startIndex, alt, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const [dragging, setDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const startXRef = useRef(0);

  const goTo = (next: number) => setIndex(((next % images.length) + images.length) % images.length);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startXRef.current = e.clientX;
    setDragging(true);
    setDragOffsetPx(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragOffsetPx(e.clientX - startXRef.current);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      goTo(index + (dx < 0 ? 1 : -1));
    }
    setDragging(false);
    setDragOffsetPx(0);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <span className="text-white text-[13px] font-bold">{index + 1} / {images.length}</span>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-90 transition-transform">
          <X size={20} />
        </button>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex-1 flex overflow-hidden"
        style={{ touchAction: 'pan-y', cursor: images.length > 1 ? 'grab' : 'default' }}
      >
        <div
          style={{
            display: 'flex',
            width: '100%',
            transform: `translateX(calc(${-index * 100}% + ${dragOffsetPx}px))`,
            transition: dragging ? 'none' : 'transform 0.3s ease',
          }}
        >
          {images.map((img, i) => (
            <div key={i} className="w-full flex-shrink-0 flex items-center justify-center p-4">
              <img src={img.imageUrl} alt={alt} draggable={false} className="max-w-full max-h-full object-contain rounded-2xl select-none" />
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-4 shrink-0">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PosterLightbox;
