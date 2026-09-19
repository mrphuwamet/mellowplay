import { useEffect } from 'react';

/**
 * Per-page title, description, canonical URL and structured data.
 *
 * index.html carries one set of tags for the whole app, which is all a
 * single-page app can do statically: every route reads "Mellow Play" in the
 * tab and describes itself to a crawler as the home page.
 *
 * The crawler side is also answered server-side, in functions/news/[id].ts —
 * but only for a request whose user-agent says it is a crawler. This hook
 * covers the two cases that stub never sees: a real reader, whose browser tab
 * and bookmark should name the article they are on, and a search engine that
 * arrives with an ordinary browser user-agent and renders the JavaScript
 * itself. Google reads the DOM after rendering, so whatever this sets wins.
 *
 * Every tag is restored on unmount. Without that, navigating from an article
 * back to the home screen would leave the article's title and canonical URL
 * behind, pointing the next page at the wrong address.
 */

export interface SeoTags {
  /** Shown in the tab. " | Mellow Play" is appended unless the title already says it. */
  title?: string;
  description?: string;
  /** Absolute URL this page should be indexed as. Defaults to the current address. */
  canonical?: string;
  /** Absolute URL of the share image. */
  image?: string;
  /** og:type — "article" for a news post, "website" for a listing. */
  type?: 'website' | 'article';
  /** schema.org object, serialised into a <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
}

const SITE_NAME = 'Mellow Play';
const MARKER = 'data-seo-managed';

type Restore = () => void;

/** Finds (or creates) a tag and sets one attribute, handing back an undo. */
function setTag(selector: string, create: () => HTMLElement, attr: string, value: string): Restore {
  const existing = document.head.querySelector<HTMLElement>(selector);
  if (existing) {
    const before = existing.getAttribute(attr);
    existing.setAttribute(attr, value);
    return () => {
      if (before === null) existing.removeAttribute(attr);
      else existing.setAttribute(attr, before);
    };
  }
  const el = create();
  el.setAttribute(attr, value);
  // Marked so the cleanup below removes only what this hook added, never a
  // tag that index.html shipped.
  el.setAttribute(MARKER, '');
  document.head.appendChild(el);
  return () => { el.remove(); };
}

const meta = (name: string, value: string): Restore =>
  setTag(`meta[name="${name}"]`, () => {
    const el = document.createElement('meta');
    el.setAttribute('name', name);
    return el;
  }, 'content', value);

const property = (prop: string, value: string): Restore =>
  setTag(`meta[property="${prop}"]`, () => {
    const el = document.createElement('meta');
    el.setAttribute('property', prop);
    return el;
  }, 'content', value);

const link = (rel: string, value: string): Restore =>
  setTag(`link[rel="${rel}"]`, () => {
    const el = document.createElement('link');
    el.setAttribute('rel', rel);
    return el;
  }, 'href', value);

export function useSeo(tags: SeoTags, deps: unknown[] = []): void {
  useEffect(() => {
    // An article still loading has no title yet. Leaving the previous page's
    // title up for that moment is better than flashing a placeholder, and a
    // crawler that rendered mid-fetch would otherwise capture the placeholder.
    if (!tags.title && !tags.description && !tags.jsonLd) return;

    const undos: Restore[] = [];
    const previousTitle = document.title;

    if (tags.title) {
      const full = tags.title.includes(SITE_NAME) ? tags.title : `${tags.title} | ${SITE_NAME}`;
      document.title = full;
      undos.push(() => { document.title = previousTitle; });
      undos.push(property('og:title', tags.title));
      undos.push(meta('twitter:title', tags.title));
    }

    if (tags.description) {
      undos.push(meta('description', tags.description));
      undos.push(property('og:description', tags.description));
      undos.push(meta('twitter:description', tags.description));
    }

    const url = tags.canonical || window.location.href.split('#')[0];
    undos.push(link('canonical', url));
    undos.push(property('og:url', url));

    if (tags.image) {
      undos.push(property('og:image', tags.image));
      undos.push(meta('twitter:image', tags.image));
    }

    if (tags.type) undos.push(property('og:type', tags.type));

    if (tags.jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute(MARKER, '');
      script.textContent = JSON.stringify(tags.jsonLd);
      document.head.appendChild(script);
      undos.push(() => { script.remove(); });
    }

    return () => { for (let i = undos.length - 1; i >= 0; i--) undos[i](); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Plain text from CRM rich text, for a description that reads as a sentence.
 *
 * Script and style blocks go first, contents and all. Dropping only the tags
 * would keep what sat between them, and a stylesheet that rode in on a paste
 * would become the opening line of the description Google shows.
 */
export const seoText = (html?: string | null): string =>
  (html || '')
    .replace(/<\s*(script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Google cuts a description near 160 characters; stop on a word boundary. */
export const seoClamp = (text: string, max = 160): string => {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};
