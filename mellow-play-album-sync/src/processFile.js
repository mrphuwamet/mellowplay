import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveAlbumId } from './albums.js';
import { uploadFile, addPhoto } from './api.js';
import { makeRenditions } from './imagePipeline.js';
import { alreadyUploaded, recordUpload } from './state.js';
import { log } from './log.js';
import { config } from './config.js';
import { IMAGE_EXT } from './imageExt.js';

/** A file already being handled is skipped on a second event for the same
 *  path — chokidar can fire more than once for one write under some
 *  filesystems, and starting the same upload twice is worse than starting
 *  it zero extra times. */
const inFlight = new Set();


function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** `New/photo.jpg` → `Uploaded/photo.jpg`, or `Uploaded/photo-<ts>.jpg` if
 *  that name is already taken there — a second drop of a same-named but
 *  different file (a reused filename from a different camera) must not
 *  silently overwrite the first one's record of having been moved. */
async function moveInto(filePath, destDir) {
  await fsp.mkdir(destDir, { recursive: true });
  const base = path.basename(filePath);
  let target = path.join(destDir, base);
  if (fs.existsSync(target)) {
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    target = path.join(destDir, `${stem}-${Date.now()}${ext}`);
  }
  await fsp.rename(filePath, target);
  return target;
}

async function writeFailureNote(filePath, destDir, reason) {
  const moved = await moveInto(filePath, destDir).catch(() => null);
  if (!moved) return; // the file itself vanished — nothing left to annotate
  const note = `${moved}.error.txt`;
  await fsp.writeFile(note, `${new Date().toISOString()}\n${reason}\n`).catch(() => {});
}

/**
 * One photo, start to finish: hash → dedupe check → resize → upload both
 * renditions → register with the album → move to Uploaded/. Retries the
 * whole thing with backoff on failure (a dropped wifi connection on a
 * laptop is the expected case, not the exception), and only after every
 * retry is spent does the photo move to Failed/ with a note beside it.
 */
export async function processFile(filePath, { albumFolder, uploadedDir, failedDir }) {
  if (inFlight.has(filePath)) return;
  if (!IMAGE_EXT.has(path.extname(filePath).toLowerCase())) return;
  inFlight.add(filePath);

  try {
    if (!fs.existsSync(filePath)) return; // moved/deleted before we got to it

    const albumId = await resolveAlbumId(albumFolder);
    if (albumId === null) return; // left in New/ — see albums.js for why

    const fileName = path.basename(filePath);
    let lastError = null;

    for (let attempt = 0; attempt <= config.retryDelaysMs.length; attempt++) {
      if (attempt > 0) await sleep(config.retryDelaysMs[attempt - 1]);
      try {
        const buffer = await fsp.readFile(filePath);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');

        if (alreadyUploaded(hash, albumId)) {
          log.info(`ข้าม "${fileName}" — อัลบั้ม "${albumFolder}" มีรูปนี้อยู่แล้ว (เนื้อหาเหมือนกันทุกไบต์)`);
          await moveInto(filePath, uploadedDir);
          return;
        }

        const { display, thumb, width, height } = await makeRenditions(buffer);
        const folder = `event-albums/${albumId}`;
        const base = fileName.replace(/\.[^.]+$/, '') || 'photo';

        // Both renditions are always re-encoded JPEG regardless of the
        // original format (see imagePipeline.js) — same as the browser
        // importer, so there is no original-mime to thread through here.
        const [displayUrl, thumbUrl] = await Promise.all([
          uploadFile(display, `${base}.jpg`, 'image/jpeg', folder),
          uploadFile(thumb, `${base}-thumb.jpg`, 'image/jpeg', folder),
        ]);

        await addPhoto(albumId, {
          imageUrl: displayUrl, thumbUrl, width, height, sizeBytes: display.length,
          driveFileId: null, driveFileName: null, faces: [],
        });

        recordUpload(hash, albumId, { albumFolder, fileName });
        await moveInto(filePath, uploadedDir);
        log.info(`อัปโหลด "${fileName}" เข้าอัลบั้ม "${albumFolder}" สำเร็จ`);
        return;
      } catch (err) {
        lastError = err;
        const willRetry = attempt < config.retryDelaysMs.length;
        log.warn(`"${fileName}" ล้มเหลว (ครั้งที่ ${attempt + 1}): ${err.message}${willRetry ? ' — จะลองใหม่' : ''}`);
      }
    }

    const reason = lastError?.message?.includes('unsupported image format')
      ? `${lastError.message}\n(ไฟล์ชนิดนี้อาจยังไม่รองรับ เช่น HEIC บางรุ่น — ลองแปลงเป็น JPEG ก่อนวางใน New/)`
      : (lastError?.message || 'ไม่ทราบสาเหตุ');
    log.error(`"${fileName}" อัปโหลดไม่สำเร็จหลังลองครบ ${config.retryDelaysMs.length + 1} ครั้ง ย้ายไปที่ Failed/ แล้ว`);
    await writeFailureNote(filePath, failedDir, reason);
  } finally {
    inFlight.delete(filePath);
  }
}
