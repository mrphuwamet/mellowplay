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
 *
 * The text never wraps. A long name gets smaller — that is the entire
 * behaviour asked for, and wrapping would let it "fit" without shrinking.
 */

/** A squeeze past this is unreadable, so it stops and lets the box clip. */
const MIN_SCALE = 0.35;

const AutoFitText = ({ text, fontSizePx, style, className, align, flatten }: {
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
  /** Which edge the text is anchored to, so a squeeze does not slide it. */
  align?: 'left' | 'center' | 'right';
  /**
   * Apply the fit as a font-size rather than a transform.
   *
   * For image capture. html2canvas reproduces a scaled text node only
   * approximately — enough to shift a line inside a box that centres it — so
   * the squeeze is baked into the type size for the moment of the capture. The
   * scale is already known by then, so nothing is re-measured and the two
   * cannot disagree.
   */
  flatten?: boolean;
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

    const wanted = Math.max(MIN_SCALE, Math.min(1, next));
    // Only when it actually moved, and not for a rounding difference. Setting
    // state unconditionally here re-renders, which re-runs this, which sets
    // state again — the page crawls and nothing looks obviously wrong.
    setScale(prev => (Math.abs(prev - wanted) < 0.001 ? prev : wanted));
  }, []);

  // Re-measured when the TEXT or the designed size changes, not on every
  // render. Anything else that moves the box is caught by the observer below.
  useLayoutEffect(() => { measure(); }, [measure, text, fontSizePx, style?.width, style?.height]);

  useEffect(() => {
    // A web font arriving after the first measurement changes every width, so
    // it all has to be measured again once it lands.
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) fonts.ready.then(() => measure()).catch(() => {});

    if (typeof ResizeObserver === 'undefined') return;
    const outer = outerRef.current;
    if (!outer) return;
    // The outer box only. Its layout size is not affected by the scale, so
    // this cannot react to its own output — and watching the inner element too
    // was one more measurement per frame for nothing.
    const observer = new ResizeObserver(() => measure());
    observer.observe(outer);
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
          fontSize: `${flatten ? fontSizePx * scale : fontSizePx}px`,
          transform: !flatten && scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: origin,
          // ALWAYS one line. Wrapping was the wrong answer twice over: it lets
          // any text "fit" without shrinking, and a name broken across two
          // lines is not what anyone laid a certificate out for — the whole
          // request was that a long name gets smaller, and nothing else.
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  );
};

export default AutoFitText;
