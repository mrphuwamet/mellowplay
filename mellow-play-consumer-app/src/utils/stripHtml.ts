// Strips HTML tags for plain-text previews (card blurbs, search matching,
// fallbacks) — content authored via the CRM's rich-text writer tool
// (news/media articles, course descriptions) is HTML, not plain text.
export const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
