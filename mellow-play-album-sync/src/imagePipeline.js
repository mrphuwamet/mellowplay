import sharp from 'sharp';

// Exactly the CRM browser importer's DISPLAY_MAX/DISPLAY_QUALITY/THUMB_MAX/
// THUMB_QUALITY (see EventAlbumManagement.tsx) — three import paths (Drive
// sync, manual browser upload, this folder sync) feed the same album table,
// and a photo looking softer or sharper depending only on which path it
// arrived through would be a bug nobody could explain by looking at the
// photo itself.
const DISPLAY_MAX = 1920;
const DISPLAY_QUALITY = 82;
const THUMB_MAX = 400;
const THUMB_QUALITY = 75;

/**
 * One decode, two renditions — display and thumb — plus the dimensions of
 * the display copy, which is what the album table records against the
 * photo (the consumer gallery's srcset math divides by these).
 */
export async function makeRenditions(buffer) {
  const img = sharp(buffer, { failOn: 'none' }).rotate(); // bakes in EXIF orientation

  const display = await img
    .clone()
    .resize({ width: DISPLAY_MAX, height: DISPLAY_MAX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: DISPLAY_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const thumb = await img
    .clone()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();

  return {
    display: display.data,
    // The oriented dimensions, not the raw file's — a portrait phone photo
    // stored with a rotate-90 EXIF tag has width/height swapped in the raw
    // bytes, and recording those would turn its gallery cell into the wrong
    // aspect ratio. .rotate() above already applied the tag before resize,
    // so these are what the saved JPEG actually looks like.
    width: display.info.width,
    height: display.info.height,
    thumb,
  };
}
