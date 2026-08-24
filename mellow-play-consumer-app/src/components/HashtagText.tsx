import React from 'react';
import { splitHashtags } from '../utils/hashtags';

/**
 * Text with its hashtags turned into taps.
 *
 * Rendered from segments rather than by injecting markup, because this text is
 * authored in the CRM and putting it through dangerouslySetInnerHTML to get
 * clickable tags would mean any HTML in a news post executes.
 */
const HashtagText: React.FC<{
  text?: string | null;
  onTagClick?: (tag: string) => void;
  className?: string;
}> = ({ text, onTagClick, className }) => (
  <span className={className}>
    {splitHashtags(text).map((seg, i) => seg.tag && onTagClick ? (
      <button
        key={i}
        type="button"
        // These sit inside cards that navigate on click, so the tap must filter
        // rather than also opening the article behind it.
        onClick={e => { e.stopPropagation(); e.preventDefault(); onTagClick(seg.tag!); }}
        className="font-black text-mellow-purple active:opacity-60"
      >
        {seg.text}
      </button>
    ) : (
      <React.Fragment key={i}>{seg.text}</React.Fragment>
    ))}
  </span>
);

export default HashtagText;
