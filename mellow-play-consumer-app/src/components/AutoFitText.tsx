import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Text that shrinks until it fits the box it is in — across and down.
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
 *
 * The text is measured in an inner element and compared against the outer box.
 * Measuring the box against itself does not work once it centres its contents:
 * overflow then spills equally above and below, and the scroll height never
 * reports it.
 */

/** Below this the line is unreadable on paper, so it stops and overflows. */
const FLOOR_RATIO = 0.4;

const AutoFitText = ({ text, fontSizePx, style, className, multiline }: {
  text: string;
  /** The size the box was designed at, already converted to pixels. */
  fontSizePx: number;
  /**
   * The box itself — position, width, and a height with its flex alignment
   * when the field has one. Passed whole so the caller keeps one description of
   * where the box is, and this component only decides how big the type gets.
   */
  style?: React.CSSProperties;
  className?: string;
  /**
   * Let the text wrap. Worth it only when the box has a height to wrap into —
   * without one, wrapping makes any text "fit" and nothing ever shrinks.
   */
  multiline?: boolean;
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(fontSizePx);
  /** The box size the current type size was worked out for. */
  const measuredAt = useRef('');

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    if (!text) { setSize(fontSizePx); return; }

    const availW = outer.clientWidth;
    const availH = outer.clientHeight;
    // Nothing to measure against yet — before layout, or while an ancestor is
    // display:none, the box reports no size at all. Measuring then finds that
    // NOTHING fits and shrinks the text to the floor, which is how a 44pt name
    // ends up tiny in a box built for it.
    if (availW <= 0) return;
    measuredAt.current = `${availW}x${availH}`;

    const floor = Math.max(1, fontSizePx * FLOOR_RATIO);
    const fits = (px: number) => {
      inner.style.fontSize = `${px}px`;
      // A pixel of slack on each: sub-pixel rounding otherwise reports a line
      // that fits exactly as overflowing, and the text shrinks for no reason.
      const wideEnough = inner.scrollWidth <= outer.clientWidth + 1;
      // A box with no height of its own grows with its text, so this is only
      // ever a real constraint when the field was given one.
      const tallEnough = inner.scrollHeight <= outer.clientHeight + 1;
      return wideEnough && tallEnough;
    };

    if (fits(fontSizePx)) { inner.style.fontSize = ''; setSize(fontSizePx); return; }

    let lo = floor;
    let hi = fontSizePx;
    let best = floor;
    // Six passes puts it within about 1.5% of the largest size that fits,
    // which is far finer than anyone can see.
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) { best = mid; lo = mid; } else { hi = mid; }
    }
    inner.style.fontSize = '';
    setSize(best);
  }, [text, fontSizePx]);

  useLayoutEffect(() => { measuredAt.current = ''; measure(); }, [measure]);

  useEffect(() => {
    // A web font arriving after the first measurement changes every width, so
    // the whole thing has to be measured again once it lands.
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) fonts.ready.then(() => { measuredAt.current = ''; measure(); }).catch(() => {});

    if (typeof ResizeObserver === 'undefined') return;
    const outer = outerRef.current;
    if (!outer) return;

    // Watching the OUTER box, and only when its size actually changed. The
    // inner element's height moves every time the size is set, so watching
    // that would have the component reacting to its own output.
    const observer = new ResizeObserver(() => {
      const key = `${outer.clientWidth}x${outer.clientHeight}`;
      if (outer.clientWidth > 0 && key !== measuredAt.current) measure();
    });
    observer.observe(outer);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={outerRef} className={className} style={{ ...style, overflow: 'hidden' }}>
      <div
        ref={innerRef}
        style={{
          width: '100%',
          fontSize: `${size}px`,
          ...(multiline
            ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
            // One line: wrapping would make the text fit without shrinking,
            // and a name broken across two lines is not what anyone laid the
            // page out for.
            : { whiteSpace: 'nowrap' }),
        }}
      >
        {text}
      </div>
    </div>
  );
};

export default AutoFitText;
