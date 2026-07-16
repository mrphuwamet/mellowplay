// Cloudflare Pages Function — serves a real HTML response with per-course
// Open Graph tags to social-media link-preview crawlers (Facebook, LINE,
// Twitter, etc.), since this app is a client-rendered SPA and those
// crawlers never execute JavaScript — any React-set <title>/meta tag is
// invisible to them, and everyone would only ever see the generic
// site-wide fallback in index.html regardless of which course was shared.
//
// Real visitors (anyone not matching the bot user-agent list) fall through
// to `next()`, which serves the normal built SPA untouched.

const BOT_USER_AGENT = /facebookexternalhit|Facebot|LinkedInBot|Twitterbot|WhatsApp|Slackbot|Discordbot|TelegramBot|Pinterest|line-poker|Line\/|vkShare|W3C_Validator|Googlebot|bingbot|SkypeUriPreview/i;

const API_BASE = 'https://api.mellowplay.co/api/v1';
const SITE_URL = 'https://mellowplay.co';
const DEFAULT_IMAGE = `${SITE_URL}/web-app-manifest-512x512.png`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Untyped on purpose — this file isn't part of the Vite/tsconfig build (only
// Cloudflare's own esbuild-based Pages Functions bundler compiles it, which
// transpiles/strips types without full type-checking), so pulling in
// @cloudflare/workers-types just for the PagesFunction type isn't worth a
// new dependency for a single small function.
export const onRequestGet = async (context: any) => {
  const { request, params, next } = context;
  const userAgent = request.headers.get('user-agent') || '';

  if (!BOT_USER_AGENT.test(userAgent)) {
    return next();
  }

  const id = String(params.id ?? '');

  try {
    const res = await fetch(`${API_BASE}/admin/courses`);
    const data: any = await res.json();
    const course = data.success ? data.courses.find((c: any) => String(c.id) === id) : null;

    if (!course) return next();

    const name = escapeHtml(course.name || 'Mellow Play');
    const rawDescription = course.short_description || course.description || '';
    const description = escapeHtml(stripHtml(rawDescription).slice(0, 200)) || 'Mellow Play — คลาสเรียนและกิจกรรมสำหรับเด็ก';
    const image = escapeHtml(course.thumbnail_url || DEFAULT_IMAGE);
    const pageUrl = escapeHtml(`${SITE_URL}/course/${id}`);

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${name} | Mellow Play</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Mellow Play" />
<meta property="og:title" content="${name}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${pageUrl}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${name}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
<meta http-equiv="refresh" content="0; url=${pageUrl}" />
</head>
<body>
<a href="${pageUrl}">${name}</a>
</body>
</html>`;

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    // Any failure (backend down, bad course id, etc.) — fall through to the
    // normal SPA rather than showing a crawler a broken response.
    return next();
  }
};
