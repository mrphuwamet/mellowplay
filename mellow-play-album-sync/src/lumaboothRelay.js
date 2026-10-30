import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import { config } from './config.js';
import { IMAGE_EXT } from './imageExt.js';
import { log } from './log.js';

/**
 * Relays whatever LumaBooth writes into its own export folder straight into
 * one album's New/ — the same New/ the main tool (index.js) already
 * watches, so from there it's the identical pipeline a manually-dropped
 * photo goes through: resized, uploaded, registered, moved to Uploaded/.
 *
 * Why a relay instead of hooking LumaBooth's own "Post-Processing"
 * application field directly: that hook's exact argument contract isn't
 * published anywhere findable, and it waits on the external process before
 * LumaBooth continues — a wrong guess there risks stalling the booth
 * mid-event, in front of guests, which is the one failure mode this cannot
 * afford. LumaBooth's **Real-time export** (Settings → General) is a named,
 * documented feature for exactly this — "export a second copy, as it
 * happens, to another location" — and copying out of that second location
 * touches nothing about how the booth itself runs. Point it at the folder
 * named below (see README) and this relay does the rest.
 *
 * LumaBooth's real-time export has nested its output under an event-name
 * (and sometimes an Originals/) subfolder in every version documented, and
 * that nesting has changed shape across versions — so this watches
 * recursively rather than assuming any particular depth, and reacts to a
 * photo appearing ANYWHERE under the configured export root.
 *
 * One LumaBooth event -> one album: LumaBooth has no idea what a "Mellow
 * Play album" is, so this relay is told, once, which album every photo it
 * sees is for (LUMABOOTH_TARGET_ALBUM) — matching how a real event actually
 * runs, one booth session at a time.
 */

if (!config.lumaboothExportRoot || !config.lumaboothTargetAlbum) {
  console.error('');
  console.error('  ตั้งค่าไม่ครบ — ต้องมีทั้งสองตัวนี้ใน .env:');
  console.error('    LUMABOOTH_EXPORT_ROOT  — โฟลเดอร์ที่ตั้งให้ LumaBooth real-time export ไปลง');
  console.error('    LUMABOOTH_TARGET_ALBUM — ชื่ออัลบั้มใน CRM ที่จะรับรูปจากบูธนี้');
  console.error('  ดูวิธีตั้งค่าใน README.md หัวข้อ "เชื่อมกับ LumaBooth"');
  console.error('');
  process.exit(1);
}

const newDir = path.join(config.root, config.lumaboothTargetAlbum, 'New');
fs.mkdirSync(newDir, { recursive: true });
fs.mkdirSync(config.lumaboothExportRoot, { recursive: true });

console.log('');
console.log('  Mellow Play — รับรูปจาก LumaBooth');
console.log(`  เฝ้าดู: ${config.lumaboothExportRoot}`);
console.log(`  ส่งต่อไปที่: ${newDir}`);
console.log('  (ไฟล์ที่นี่จะถูกอัปโหลดจริงโดย npm start ของเครื่องมือหลัก — ต้องรันคู่กันทั้งสองตัว)');
console.log('');

/** `base.jpg` → `New/base.jpg`, or `New/base-<ts>.jpg` on a name collision —
 *  LumaBooth's own filenames repeat across events (IMG_0001.jpg, session
 *  counters that reset), and a second booth session must not silently
 *  overwrite a first one's photo that hasn't been picked up yet. */
async function relayOne(filePath) {
  const base = path.basename(filePath);
  let target = path.join(newDir, base);
  if (fs.existsSync(target)) {
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    target = path.join(newDir, `${stem}-${Date.now()}${ext}`);
  }
  try {
    await fsp.copyFile(filePath, target);
    log.info(`รับรูปจาก LumaBooth: "${base}" → อัลบั้ม "${config.lumaboothTargetAlbum}"`);
  } catch (err) {
    log.error(`คัดลอก "${base}" จาก LumaBooth ไม่สำเร็จ: ${err.message}`);
  }
}

const watcher = chokidar.watch(config.lumaboothExportRoot, {
  ignored: (p) => path.basename(p).startsWith('.'),
  persistent: true,
  ignoreInitial: true, // only NEW shots from here on — not every photo the booth has ever taken
  usePolling: config.usePolling,
  awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
});

watcher
  .on('add', (filePath) => {
    if (!IMAGE_EXT.has(path.extname(filePath).toLowerCase())) return;
    relayOne(filePath);
  })
  .on('error', (err) => log.error(`ตัวเฝ้าดูโฟลเดอร์ LumaBooth มีปัญหา: ${err.message}`))
  .on('ready', () => log.info('เฝ้าดูโฟลเดอร์ export ของ LumaBooth พร้อมแล้ว'));

const shutdown = (signal) => {
  log.info(`ได้รับสัญญาณ ${signal} — กำลังปิดตัว`);
  watcher.close().finally(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
