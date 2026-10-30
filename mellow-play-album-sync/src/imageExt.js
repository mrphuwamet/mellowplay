/** Shared by processFile.js (what to try uploading) and lumabooth-relay.js
 *  (what to relay in the first place) — one list, so a format one of them
 *  treats as a photo is never one the other silently ignores. */
export const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif',
]);
