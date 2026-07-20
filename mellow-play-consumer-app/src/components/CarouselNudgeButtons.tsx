import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Curated horizontal "shelf" carousels (Home's Recommended Classes, Explore's
// Classes/News/Fun Facts rows) all share this exact interaction: cards are a
// fixed width + gap, scroll-snap centers whichever card is nearest, and
// nudging by one card-step lets the snap settle the next card dead-center
// instead of at an arbitrary scroll offset. Desktop mouse users can't
// drag-scroll a horizontal row, so every such row gets nudge buttons too.
export function useHorizontalCarousel(cardWidth: number, gap: number) {
  const ref = React.useRef<HTMLDivElement>(null);
  const step = cardWidth + gap;

  const scrollBy = (dir: 'left' | 'right') => {
    ref.current?.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  };

  // Half a card's width so the first/last card can also reach true center
  // instead of stopping short against the scroll container's edge.
  const containerStyle: React.CSSProperties = { scrollPaddingInline: `calc(50% - ${cardWidth / 2}px)` };

  return { ref, scrollBy, containerStyle };
}

interface CarouselNudgeButtonsProps {
  onScrollLeft: () => void;
  onScrollRight: () => void;
}

export function CarouselNudgeButtons({ onScrollLeft, onScrollRight }: CarouselNudgeButtonsProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={onScrollLeft} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-90 transition-all">
        <ChevronLeft size={16} className="text-slate-500" />
      </button>
      <button onClick={onScrollRight} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-90 transition-all">
        <ChevronRight size={16} className="text-slate-500" />
      </button>
    </div>
  );
}
