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
// The site-wide fallback image's real, verified dimensions (public/web-app-manifest-512x512.png).
const DEFAULT_IMAGE_META = { width: 512, height: 512, type: 'image/png' };

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

type ImageMeta = { width: number; height: number; type: string } | null;

// PNG: 8-byte signature, then the IHDR chunk always comes first —
// 4-byte length + "IHDR" + 4-byte width + 4-byte height, big-endian.
function parsePng(buf: Uint8Array): ImageMeta {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), type: 'image/png' };
}

// JPEG: scan markers after the SOI (0xFFD8) until a Start-Of-Frame marker
// (0xC0–0xCF, excluding the non-frame 0xC4/0xC8/0xCC codes), whose payload
// starts with precision(1)/height(2)/width(2), big-endian.
function parseJpeg(buf: Uint8Array): ImageMeta {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > buf.length) return null; // truncated — caller may fetch more
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7), type: 'image/jpeg' };
    }
    const segmentLength = view.getUint16(offset + 2);
    offset += 2 + segmentLength;
  }
  return null; // not found in what we have yet
}

// Reads the image in bounded chunks (never the whole file for a large
// photo) and stops as soon as either parser succeeds, so a wrong/guessed
// og:image:width|height is never sent — only a real parsed value, or none
// at all (Facebook/LINE/Twitter all handle a missing width/height fine;
// they just can't optimize the crop ahead of time).
async function probeImageMeta(url: string): Promise<ImageMeta> {
  const MAX_BYTES = 65536;
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    let buf = new Uint8Array(0);
    try {
      while (buf.length < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (value && value.length) {
          const merged = new Uint8Array(buf.length + value.length);
          merged.set(buf);
          merged.set(value, buf.length);
          buf = merged;
        }
        const meta = parsePng(buf) || parseJpeg(buf);
        if (meta) return meta;
        if (done) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return parsePng(buf) || parseJpeg(buf);
  } catch {
    return null;
  }
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
    const imageUrl = course.thumbnail_url || DEFAULT_IMAGE;
    const image = escapeHtml(imageUrl);
    const imageMeta = course.thumbnail_url ? await probeImageMeta(imageUrl) : DEFAULT_IMAGE_META;
    const pageUrl = escapeHtml(`${SITE_URL}/course/${id}`);

    const imageMetaTags = imageMeta
      ? `<meta property="og:image:width" content="${imageMeta.width}" />
<meta property="og:image:height" content="${imageMeta.height}" />
<meta property="og:image:type" content="${imageMeta.type}" />`
      : '';

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
${imageMetaTags}
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
