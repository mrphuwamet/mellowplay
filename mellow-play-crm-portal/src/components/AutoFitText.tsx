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
 * differs again. So the text is MEASURED — but with a canvas, not by watching
 * an element overflow.
 *
 * That choice is the whole design here. Reading scrollWidth against clientWidth
 * depends on overflow, on flex, on whether an ancestor is hidden, and on
 * whether layout has happened yet; get any of those wrong and every name
 * collapses to the smallest size allowed, which is exactly what happened. A
 * canvas measurement needs none of it: given a font and a string it returns a
 * width, and the size that fits is then arithmetic.
 *
 * Shrinking only. A short name stays at the size it was designed at; the point
 * is that one long name does not force every certificate to be set smaller.
 */

/** Below this the line is unreadable on paper, so it stops and overflows. */
const FLOOR_RATIO = 0.4;

/** One canvas for the whole app — creating one per measurement is wasteful. */
let sharedCanvas: HTMLCanvasElement | null = null;
const textWidth = (text: string, font: string): number => {
  if (typeof document === 'undefined') return 0;
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
  const ctx = sharedCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
};

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
    // display:none, the box reports no size. Sizing then would find that
    // nothing fits and shrink to the floor; the observer below re-runs this the
    // moment the box has a real width.
    if (availW <= 0) return;
    measuredAt.current = `${availW}x${availH}`;

    const floor = Math.max(1, fontSizePx * FLOOR_RATIO);
    const cs = window.getComputedStyle(inner);
    // The family and weight the box is actually set in, so the measurement is
    // of this text in this typeface and not an approximation of it.
    const fontAt = (px: number) => `${cs.fontStyle} ${cs.fontWeight} ${px}px ${cs.fontFamily}`;

    // One line: the size that fits is the design size scaled by how much too
    // wide the text is. No search, no dependence on layout.
    const wideAt = textWidth(text, fontAt(fontSizePx));
    let next = wideAt > 0 && wideAt > availW
      ? Math.max(floor, fontSizePx * (availW / wideAt))
      : fontSizePx;

    // With a height to wrap into, the wrapped text can still be too tall. That
    // one cannot be worked out from a single measurement, so it is stepped down
    // against the real laid-out height — which is meaningful here precisely
    // because the box HAS a height.
    if (multiline && availH > 0) {
      for (let i = 0; i < 8; i++) {
        inner.style.fontSize = `${next}px`;
        if (inner.scrollHeight <= availH + 1) break;
        next = Math.max(floor, next * 0.9);
        if (next <= floor) break;
      }
      inner.style.fontSize = '';
    }

    setSize(next);
  }, [text, fontSizePx, multiline]);

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
