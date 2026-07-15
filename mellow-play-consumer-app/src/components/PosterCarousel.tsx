import React, { useEffect, useRef, useState } from 'react';
import PosterLightbox from './PosterLightbox';

export interface PosterImage {
  imageUrl: string;
  focalX: number;
  focalY: number;
  zoom?: number;
}

interface PosterCarouselProps {
  images: PosterImage[];
  alt?: string;
  className?: string;
  rounded?: string;
  autoPlayMs?: number; // set to 0 to disable
}

const SWIPE_THRESHOLD = 50;
const TAP_THRESHOLD = 8;

// Swipeable 4:5 poster strip driven by pointer events (works for mouse drag
// as well as touch — a plain overflow-x-auto scroll container only responds
// to touch/trackpad gestures, not mouse drag) with dot indicators and an
// auto-advance timer; tapping a slide opens a full-screen swipeable lightbox.
const PosterCarousel: React.FC<PosterCarouselProps> = ({ images, alt, className = '', rounded = '', autoPlayMs = 5000 }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const startXRef = useRef(0);

  useEffect(() => {
    if (images.length <= 1 || dragging || lightboxOpen || !autoPlayMs) return;
    const id = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % images.length);
    }, autoPlayMs);
    return () => clearInterval(id);
  }, [images.length, dragging, lightboxOpen, autoPlayMs, currentIndex]);

  if (images.length === 0) return null;

  const goTo = (index: number) => setCurrentIndex(((index % images.length) + images.length) % images.length);

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
      goTo(currentIndex + (dx < 0 ? 1 : -1));
    } else if (Math.abs(dx) < TAP_THRESHOLD) {
      setLightboxOpen(true);
    }
    setDragging(false);
    setDragOffsetPx(0);
  };

  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`}>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          display: 'flex',
          touchAction: 'pan-y',
          cursor: images.length > 1 ? 'grab' : 'default',
          transform: `translateX(calc(${-currentIndex * 100}% + ${dragOffsetPx}px))`,
          transition: dragging ? 'none' : 'transform 0.35s ease',
        }}
      >
        {images.map((img, i) => (
          <div key={i} className="w-full flex-shrink-0 aspect-[4/5] bg-slate-100">
            <img
              src={img.imageUrl}
              alt={alt}
              draggable={false}
              style={{
                objectPosition: `${img.focalX}% ${img.focalY}%`,
                transform: `scale(${img.zoom ?? 1})`,
                transformOrigin: `${img.focalX}% ${img.focalY}%`,
              }}
              className="w-full h-full object-cover select-none"
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === currentIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}
      {lightboxOpen && (
        <PosterLightbox images={images} startIndex={currentIndex} alt={alt} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
};

export default PosterCarousel;
