import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Text kept at the size it was designed at, and squeezed only when it does not
 * fit the box.
 *
 * Mirrored in mellow-play-consumer-app/src/components/AutoFitText.tsx — a
 * certificate is drawn in three places (the designer, the sheet that prints,
 * and the page a family opens) and a name that fits in one and overflows in
 * another is the failure this exists to prevent. Change both together.
 *
 * ── Why a transform, after two attempts that did not work ──────────────────
 *
 * The first versions changed the font-size and then measured whether the text
 * still overflowed. That is circular: the thing being measured is the thing
 * being changed, so the measurement moves under the measurer. It also depended
 * on scrollWidth against clientWidth, which is thrown off by overflow, by flex,
 * by an ancestor being hidden, and by whether layout has run at all — and every
 * one of those failures reads as "nothing fits", which shrinks the text to the
 * smallest size allowed. That is precisely what kept happening.
 *
 * A CSS transform does not affect layout. So the text is laid out ONCE, always
 * at its designed size, and its natural width never changes no matter what
 * scale is applied. Measuring is therefore stable, and squeezing cannot feed
 * back into the measurement.
 *
 * The failure mode is chosen too: anything unmeasurable leaves the scale at 1,
 * so the text appears at the size it was designed at. Too big is a layout
 * problem someone can see and fix; silently tiny is what wasted a day.
 */

/** A squeeze past this is unreadable, so it stops and lets the box clip. */
const MIN_SCALE = 0.35;

const AutoFitText = ({ text, fontSizePx, style, className, multiline, align }: {
  text: string;
  /** The size the box was designed at, already converted to pixels. */
  fontSizePx: number;
  /**
   * The box itself — position, width, and a height with its flex alignment
   * when the field has one. Passed whole so the caller keeps one description of
   * where the box is, and this component only decides how much to squeeze.
   */
  style?: React.CSSProperties;
  className?: string;
  /** Let the text wrap. Only useful when the box has a height to wrap into. */
  multiline?: boolean;
  /** Which edge the text is anchored to, so a squeeze does not slide it. */
  align?: 'left' | 'center' | 'right';
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const availW = outer.clientWidth;
    const availH = outer.clientHeight;
    // The natural size, unaffected by whatever scale is currently applied —
    // a transform does not change layout, which is the whole reason this
    // measurement is trustworthy.
    const naturalW = inner.offsetWidth;
    const naturalH = inner.offsetHeight;

    // Unmeasurable — before layout, or inside something hidden. Leave the text
    // at its designed size rather than guessing it does not fit.
    if (availW <= 0 || naturalW <= 0) { setScale(1); return; }

    let next = 1;
    if (naturalW > availW) next = availW / naturalW;
    // Only bites when the field was given a height; without one the box grows
    // with its text and this is always true.
    if (availH > 0 && naturalH * next > availH) next = availH / naturalH;

    setScale(Math.max(MIN_SCALE, Math.min(1, next)));
  }, []);

  useLayoutEffect(() => { measure(); });

  useEffect(() => {
    // A web font arriving after the first measurement changes every width, so
    // it all has to be measured again once it lands.
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) fonts.ready.then(() => measure()).catch(() => {});

    if (typeof ResizeObserver === 'undefined') return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // Safe to watch both: neither element's LAYOUT size is affected by the
    // scale, so this cannot react to its own output.
    const observer = new ResizeObserver(() => measure());
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [measure]);

  const origin = align === 'left' ? 'left center' : align === 'right' ? 'right center' : 'center center';

  return (
    <div ref={outerRef} className={className} style={{ ...style, overflow: 'hidden' }}>
      <div
        ref={innerRef}
        style={{
          // Inline-block so the element is exactly as wide as its text, which
          // is what makes the natural width meaningful. A block at width:100%
          // would report the box's width and never look too big.
          display: 'inline-block',
          maxWidth: multiline ? '100%' : undefined,
          fontSize: `${fontSizePx}px`,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: origin,
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
