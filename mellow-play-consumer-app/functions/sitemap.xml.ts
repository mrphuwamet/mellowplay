// Cloudflare Pages Function — /sitemap.xml, built from the live news feed.
//
// Google finds a page either by following a link to it or by being handed the
// address. In a client-rendered SPA there are no links to follow: the crawler
// sees an empty #root and every route behind it is invisible until JavaScript
// runs. A sitemap is the way in, and it also tells Google when each article
// last changed, so an edit is re-crawled instead of waiting its turn.
//
// Generated per request rather than written at build time, because articles
// are published from the CRM and the site is not rebuilt when they are. A
// build-time file would list whatever existed at the last deploy.
//
// Untyped context param on purpose — see functions/news/[id].ts.
import { SITE_URL, isoDate, escapeHtml } from './_shared/ogMeta';
import { fetchPublishedNews } from './_shared/newsMeta';

// Routes worth indexing that are not articles. Everything gated behind a
// login or a token is deliberately absent, and is refused outright in
// public/robots.txt.
const STATIC_PATHS: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/explore', changefreq: 'daily', priority: '0.9' },
  { path: '/news-feed/news', changefreq: 'daily', priority: '0.9' },
  { path: '/news-feed/media', changefreq: 'weekly', priority: '0.8' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
];

const urlEntry = (loc: string, lastmod: string | null, changefreq: string, priority: string) =>
  [
    '  <url>',
    `    <loc>${escapeHtml(loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeHtml(lastmod)}</lastmod>` : '',
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');

export const onRequestGet = async () => {
  const items = await fetchPublishedNews();

  const entries = [
    ...STATIC_PATHS.map(s => urlEntry(`${SITE_URL}${s.path}`, null, s.changefreq, s.priority)),
    ...items.map(item =>
      urlEntry(
        `${SITE_URL}/news/${item.id}`,
        isoDate(item.updated_at) || isoDate(item.created_at),
        'monthly',
        '0.7',
      ),
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Long enough that a crawl burst doesn't hammer the API, short enough
      // that a newly published article is offered within the hour.
      'cache-control': 'public, max-age=600, s-maxage=3600',
    },
  });
};
