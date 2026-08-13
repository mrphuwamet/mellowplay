/**
 * The media box every card in the story feed uses.
 *
 * 4:5 so the column reads as one consistent shape — a feed where each post is
 * a different height jumps around as you scroll, and the images were
 * previously rendered at whatever ratio the file happened to be, capped by a
 * max-height.
 *
 * The max-width matters as much as the ratio: on a desktop the feed column is
 * ~800px, and 4:5 of that is a 1000px-tall image that fills the whole screen
 * with one post. Capping the media (not the card) keeps a portrait image the
 * size a portrait image should be, and leaves the card itself full-width.
 */
export const FEED_MEDIA_BOX =
  'mt-3 rounded-2xl overflow-hidden bg-slate-50 aspect-[4/5] w-full max-w-[380px] mx-auto';
