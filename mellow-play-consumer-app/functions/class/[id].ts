// Cloudflare Pages Function — serves a real HTML response with per-course
// Open Graph tags to social-media link-preview crawlers on the canonical
// /class/:id URL. See functions/_shared/ogMeta.ts for why this exists and
// how the tags are built; functions/course/[id].ts is the equivalent for
// the legacy /course/:id path that old shared links still use.
//
// Untyped context param on purpose — this file isn't part of the
// Vite/tsconfig build (only Cloudflare's own esbuild-based Pages Functions
// bundler compiles it), so pulling in @cloudflare/workers-types just for
// the PagesFunction type isn't worth a new dependency for a single small
// function.
import { BOT_USER_AGENT, renderCourseOgHtml } from '../_shared/ogMeta';

export const onRequestGet = async (context: any) => {
  const { request, params, next } = context;
  const userAgent = request.headers.get('user-agent') || '';

  if (!BOT_USER_AGENT.test(userAgent)) {
    return next();
  }

  const id = String(params.id ?? '');
  const html = await renderCourseOgHtml(id, `https://mellowplay.co/class/${id}`);

  if (!html) return next();

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};
