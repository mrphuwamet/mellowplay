/**
 * The media box every card in the story feed uses.
 *
 * Kept as one shared class so news, suggested-class and community cards stay
 * the same shape as each other — a feed where every post is a different height
 * jumps around as you scroll. Before this existed, images rendered at whatever
 * ratio the file happened to be, capped only by a max-height.
 *
 * 16:9 matches the frame the CRM crops feed thumbnails in (see
 * NewsFeedManagement) — the two have to agree, or staff choose the visible
 * part of a picture in one shape and the app shows a different one.
 */
export const FEED_MEDIA_BOX =
  'mt-3 rounded-2xl overflow-hidden bg-slate-50 aspect-[16/9] w-full';
