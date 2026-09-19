// Server-rendered news articles, for the crawlers that decide whether
// /news/:id ever shows up in a Google result.
//
// This app is a client-rendered SPA: the HTML Cloudflare serves is an empty
// #root, and every word of an article arrives later over fetch. Google will
// run that JavaScript eventually, but rendering sits in a second queue behind
// crawling, it is skipped when the render budget runs out, and nothing about
// it is promised. An article that only exists after JS runs is an article
// Google may never read. So the crawler gets the real thing: the headline,
// the date, the picture and the body text, in the first response.
//
// This is not the head-only stub that functions/_shared/ogMeta.ts builds for
// link previews. A preview crawler wants og: tags and nothing else; a search
// engine wants text, a canonical URL, and no meta refresh — a refresh is read
// as a redirect and hands the ranking to whatever it points at. The two needs
// are different enough to be two renderers.
//
// The text here is the same text the reader sees, from the same endpoint the
// app calls. That is what separates server-side rendering from cloaking, and
// it is the reason this file must never "improve" the copy for the crawler.
import {
  API_BASE,
  SITE_URL,
  DEFAULT_IMAGE,
  escapeHtml,
  stripHtml,
  absoluteImageUrl,
  isoDate,
} from './ogMeta';

export interface NewsItem {
  id: number;
  type: string;
  title: string;
  title_en?: string | null;
  content?: string | null;
  content_en?: string | null;
  image_url?: string | null;
  image_urls?: string | string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** The published article, or null for a draft, a bad id, or a backend that is down. */
export async function fetchNewsItem(id: string): Promise<NewsItem | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${API_BASE}/news-feed/${id}`);
    if (!res.ok) return null;
    const data: any = await res.json();
    // getOne already 404s an unpublished row, so reaching here means published.
    return data?.success && data.item ? (data.item as NewsItem) : null;
  } catch {
    return null;
  }
}

/** Every published article, newest first — the sitemap's source. */
export async function fetchPublishedNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${API_BASE}/news-feed`);
    if (!res.ok) return [];
    const data: any = await res.json();
    return data?.success && Array.isArray(data.items) ? (data.items as NewsItem[]) : [];
  } catch {
    return [];
  }
}

/** image_urls is stored as a JSON string; older rows carry only image_url. */
function imagesOf(item: NewsItem): string[] {
  let list: string[] = [];
  const raw = item.image_urls;
  if (Array.isArray(raw)) list = raw.map(String);
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.map(String);
    } catch {
      /* a malformed row still has image_url to fall back on */
    }
  }
  if (list.length === 0 && item.image_url) list = [item.image_url];
  return list.map(u => absoluteImageUrl(u)).filter((u): u is string => !!u);
}

/**
 * The article body, with anything executable taken out.
 *
 * The content is admin-authored rich text from the CRM, so it is trusted in
 * the app. It is not trusted here: this document is assembled by string
 * concatenation on the edge, and a <script> that rode in on a paste would run
 * on our own origin. Only the tags a crawler reads as prose are needed anyway.
 */
function safeBodyHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * JSON-LD, embedded so a "</script>" inside the copy cannot close the block
 * early. Every "<" is written as its unicode escape instead, which costs
 * nothing: a JSON parser reads the escape and the bare character as the same
 * string, while an HTML parser can no longer find a closing tag to act on.
 */
function jsonLdScript(payload: unknown): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

export interface RenderNewsOptions {
  /** A link-preview crawler gets the meta refresh; a search engine must not. */
  metaRefresh: boolean;
}

/**
 * The crawler-facing document for one article.
 *
 * `pageUrl` is both the canonical URL and what og:url points at, so a Google
 * result and a Facebook share always name the same address rather than
 * competing for the same article.
 */
export function renderNewsHtml(item: NewsItem, pageUrl: string, opts: RenderNewsOptions): string {
  const isNews = item.type !== 'media';
  const title = (item.title || 'Mellow Play').trim();
  // Sanitised before the description is taken from it, not after.
  // stripHtml removes the tags but keeps whatever sat between them, so
  // reading the raw content would put the source of any <script> or
  // <style> that rode in on a paste straight into the meta description
  // Google shows under the result.
  const bodyHtml = safeBodyHtml((item.content || '').trim());
  const plain = stripHtml(bodyHtml);

  // Google shows roughly 160 characters of a description and drops the rest;
  // the article's own opening sentence describes it better than anything
  // generic, so the fallback only runs for a post that is pure image.
  const description =
    plain.slice(0, 200) ||
    (isNews
      ? 'ข่าวสารและกิจกรรมจาก Mellow Play'
      : 'เรื่องน่ารู้เกี่ยวกับพัฒนาการเด็ก จาก Mellow Play');

  const images = imagesOf(item);
  const primaryImage = images[0] || DEFAULT_IMAGE;
  const published = isoDate(item.created_at);
  const modified = isoDate(item.updated_at) || published;

  const esc = {
    title: escapeHtml(title),
    description: escapeHtml(description),
    image: escapeHtml(primaryImage),
    url: escapeHtml(pageUrl),
  };

  const sectionLabel = isNews ? 'ข่าวสาร' : 'เรื่องน่ารู้';

  const jsonLd = jsonLdScript({
    '@context': 'https://schema.org',
    // NewsArticle for a dated announcement, Article for the evergreen
    // "เรื่องน่ารู้" explainers — Google treats the two differently and a
    // parenting tip is not news.
    '@type': isNews ? 'NewsArticle' : 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    // Google truncates a headline past 110 characters in rich results.
    headline: title.slice(0, 110),
    description,
    image: images.length ? images : [DEFAULT_IMAGE],
    articleSection: sectionLabel,
    inLanguage: 'th',
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    author: { '@type': 'Organization', name: 'Mellow Play', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Mellow Play',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: DEFAULT_IMAGE, width: 512, height: 512 },
    },
  });

  const breadcrumb = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mellow Play', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: sectionLabel,
        item: `${SITE_URL}/news-feed/${isNews ? 'news' : 'media'}`,
      },
      { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
    ],
  });

  const dateLine = published
    ? `<time datetime="${escapeHtml(published)}">${escapeHtml(published.slice(0, 10))}</time>`
    : '';

  const figure = images.length
    ? `<img src="${escapeHtml(images[0])}" alt="${esc.title}" width="1200" />`
    : '';

  // Only for a link-preview crawler. A search engine that followed this would
  // read the article as a redirect to itself and index neither end of it.
  const refresh = opts.metaRefresh
    ? `<meta http-equiv="refresh" content="0; url=${esc.url}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc.title} | Mellow Play</title>
<meta name="description" content="${esc.description}" />
<link rel="canonical" href="${esc.url}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Mellow Play" />
<meta property="og:locale" content="th_TH" />
<meta property="og:title" content="${esc.title}" />
<meta property="og:description" content="${esc.description}" />
<meta property="og:image" content="${esc.image}" />
<meta property="og:url" content="${esc.url}" />
${published ? `<meta property="article:published_time" content="${escapeHtml(published)}" />` : ''}
${modified ? `<meta property="article:modified_time" content="${escapeHtml(modified)}" />` : ''}
<meta property="article:section" content="${escapeHtml(sectionLabel)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc.title}" />
<meta name="twitter:description" content="${esc.description}" />
<meta name="twitter:image" content="${esc.image}" />
${jsonLd}
${breadcrumb}
${refresh}
</head>
<body>
<article>
<h1>${esc.title}</h1>
<p>${escapeHtml(sectionLabel)}${dateLine ? ' · ' : ''}${dateLine}</p>
${figure}
${bodyHtml}
<p><a href="${esc.url}">${esc.title} — Mellow Play</a></p>
</article>
</body>
</html>`;
}
