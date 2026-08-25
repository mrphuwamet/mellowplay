import React, { useCallback, useEffect, useRef } from 'react';
import { splitHashtags } from '../utils/hashtags';

/**
 * Rich article HTML, with its hashtags made tappable.
 *
 * A news post is authored in the CRM's editor, so the body has to keep its
 * formatting — which rules out rebuilding it from text segments the way
 * HashtagText does for plain strings.
 *
 * So the HTML is rendered first and the tags are found afterwards, by walking
 * the TEXT NODES of what was rendered. Nothing is injected into the HTML
 * string: rewriting it before rendering would also match inside attributes,
 * where `#fff` in a style and `#section` in an href are not hashtags and
 * replacing them breaks the page.
 *
 * Clicks are handled by one listener on the container rather than a handler per
 * tag, so re-running on new content leaves nothing behind.
 */

const SKIP_TAGS = new Set(['A', 'SCRIPT', 'STYLE', 'CODE', 'PRE', 'BUTTON']);

const HashtagHtml: React.FC<{
  html: string;
  onTagClick: (tag: string) => void;
  className?: string;
}> = ({ html, onTagClick, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  // Held in a ref so the effect below does not re-walk the article every time
  // the parent re-renders with a fresh closure.
  const handler = useRef(onTagClick);
  handler.current = onTagClick;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Collected first, then replaced: mutating while the walker is live would
    // have it step into the nodes just created.
    const targets: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = (node as Text).parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return (node.nodeValue || '').includes('#') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n as Text);

    for (const node of targets) {
      const segments = splitHashtags(node.nodeValue);
      if (!segments.some(s => s.tag)) continue;

      const fragment = document.createDocumentFragment();
      for (const seg of segments) {
        if (!seg.tag) {
          fragment.appendChild(document.createTextNode(seg.text));
          continue;
        }
        const el = document.createElement('span');
        el.textContent = seg.text;
        el.dataset.hashtag = seg.tag;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.className = 'font-black text-mellow-purple cursor-pointer active:opacity-60';
        fragment.appendChild(el);
      }
      node.parentNode?.replaceChild(fragment, node);
    }
  }, [html]);

  const onActivate = useCallback((e: React.SyntheticEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hashtag]');
    if (!el?.dataset.hashtag) return;
    e.preventDefault();
    e.stopPropagation();
    handler.current(el.dataset.hashtag);
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onClick={onActivate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onActivate(e); }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default HashtagHtml;
