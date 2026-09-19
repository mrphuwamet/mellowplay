// Cloudflare Pages Function — serves a real, readable HTML article on
// /news/:id to crawlers, so the news pages can be indexed by Google and
// previewed correctly when shared. See functions/_shared/newsMeta.ts for why
// a search engine needs something different from a link-preview crawler.
//
// A real visitor never sees any of this: their user-agent matches neither
// list, so the request falls through to next() and the normal SPA loads.
//
// Untyped context param on purpose — this file isn't part of the
// Vite/tsconfig build (only Cloudflare's own esbuild-based Pages Functions
// bundler compiles it), so pulling in @cloudflare/workers-types just for the
// PagesFunction type isn't worth a new dependency.
import { BOT_USER_AGENT, SEARCH_BOT_USER_AGENT, SITE_URL } from '../_shared/ogMeta';
import { fetchNewsItem, renderNewsHtml } from '../_shared/newsMeta';

export const onRequestGet = async (context: any) => {
  const { request, params, next } = context;
  const userAgent = request.headers.get('user-agent') || '';

  const isSearchBot = SEARCH_BOT_USER_AGENT.test(userAgent);
  const isSocialBot = BOT_USER_AGENT.test(userAgent);
  if (!isSearchBot && !isSocialBot) return next();

  const id = String(params.id ?? '');
  const item = await fetchNewsItem(id);
  // An unpublished or deleted article falls through rather than rendering an
  // empty shell: letting the SPA answer means the crawler gets the app's own
  // "not found", not a thin page that looks indexable.
  if (!item) return next();

  const html = renderNewsHtml(item, `${SITE_URL}/news/${id}`, {
    // Only the preview crawlers get the refresh. For a search engine it reads
    // as a redirect and the article loses its own listing.
    metaRefresh: !isSearchBot,
  });

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Published articles change rarely; a short edge cache keeps a crawl
      // burst off the API without holding an edit back for long.
      'cache-control': 'public, max-age=300, s-maxage=900',
    },
  });
};
