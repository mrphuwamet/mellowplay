import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Text that shrinks until it fits the box it is in.
 *
 * Mirrored in mellow-play-consumer-app/src/components/AutoFitText.tsx — a
 * certificate is drawn in three places (the designer, the sheet that prints,
 * and the page a family opens) and a name that fits in one and overflows in
 * another is the failure this exists to prevent. Change both together.
 *
 * Widths cannot be worked out from the character count: "มานะ" and "ณัฐฐาพัชร์"
 * are four characters each and nowhere near the same width, and a Latin name
 * differs again. So it is measured, by binary search over the point size —
 * six layout passes, once, rather than a guess that is wrong for somebody.
 *
 * Shrinking only. A short name stays at the size it was designed at; the point
 * is that one long name does not force every certificate to be set smaller.
 */

/** Below this the line is unreadable on paper, so it stops and overflows. */
const FLOOR_RATIO = 0.4;

const AutoFitText = ({ text, fontSizePx, style, className }: {
  text: string;
  /** The size the box was designed at, already converted to pixels. */
  fontSizePx: number;
  style?: React.CSSProperties;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(fontSizePx);
  /** The width the current size was worked out for. */
  const measuredAt = useRef(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!text) { setSize(fontSizePx); return; }

    const available = el.clientWidth;
    // Nothing to measure against yet — before layout, or while an ancestor is
    // display:none, the box reports no width at all. Measuring then finds that
    // NOTHING fits and shrinks the text to the floor, which is how a 44pt name
    // ends up tiny in a box built for it. The observer below re-runs this the
    // moment the box has a real width.
    if (available <= 0) return;
    measuredAt.current = available;

    const floor = Math.max(1, fontSizePx * FLOOR_RATIO);
    const fits = (px: number) => {
      el.style.fontSize = `${px}px`;
      // A pixel of slack: sub-pixel rounding otherwise reports a line that
      // fits exactly as overflowing, and the text shrinks for no reason.
      return el.scrollWidth <= el.clientWidth + 1;
    };

    if (fits(fontSizePx)) { el.style.fontSize = ''; setSize(fontSizePx); return; }

    let lo = floor;
    let hi = fontSizePx;
    let best = floor;
    // Six passes puts it within about 1.5% of the largest size that fits,
    // which is far finer than anyone can see.
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) { best = mid; lo = mid; } else { hi = mid; }
    }
    el.style.fontSize = '';
    setSize(best);
  }, [text, fontSizePx]);

  useLayoutEffect(() => { measuredAt.current = 0; measure(); }, [measure]);

  useEffect(() => {
    // A web font arriving after the first measurement changes every width, so
    // the whole thing has to be measured again once it lands.
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) fonts.ready.then(() => { measuredAt.current = 0; measure(); }).catch(() => {});

    if (typeof ResizeObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;

    // Only when the WIDTH changes. This element's own height moves every time
    // the size is set, so reacting to any resize would have the component
    // measuring its own output — a loop, and one that can settle on the wrong
    // answer.
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0 && w !== measuredAt.current) measure();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        fontSize: `${size}px`,
        // One line is the whole point: wrapping would make it fit without
        // shrinking, and a name broken across two lines is not what anyone
        // laid the page out for.
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {text}
    </div>
  );
};

export default AutoFitText;
