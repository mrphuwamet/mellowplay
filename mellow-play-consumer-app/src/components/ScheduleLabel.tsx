import React from 'react';

/**
 * A schedule label — a round's name, or a note pinned to a whole day.
 *
 * Rendered as text on a tinted pill rather than the old bare
 * "name (10:00-12:00)" string, so a labelled round is picked out at a glance
 * instead of read word by word.
 *
 * The tint comes from the calendar's own colour (set in the CRM's calendar
 * settings), mixed down to a wash for the background with the full-strength
 * colour as the text. One hue per calendar means a family can tell which
 * calendar a round belongs to without reading anything.
 */
const FALLBACK = '#7452d6';

// The colour arrives from the DB as a hex string chosen in the CRM, and is the
// only untrusted part of the style — anything that is not a plain 3/6-digit
// hex falls back rather than being interpolated into CSS.
const safeHex = (color?: string | null): string =>
  color && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color) ? color : FALLBACK;

const ScheduleLabel = ({
  text, color, size = 'md',
}: {
  text: string;
  color?: string | null;
  size?: 'sm' | 'md';
}) => {
  const hex = safeHex(color);
  return (
    <span
      className={`inline-flex items-center rounded-lg font-black ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[12px]' : 'px-2 py-0.5 text-[13px]'
      }`}
      style={{
        // 22 = ~13% alpha. A wash rather than a solid fill, so the label sits
        // behind the text instead of competing with the seat-count chip beside
        // it, and stays readable whichever hue the calendar was given.
        backgroundColor: `${hex}22`,
        color: hex,
      }}
    >
      {text}
    </span>
  );
};

export default ScheduleLabel;
