import fs from 'node:fs';
import { config } from './config.js';
import { session } from './api.js';
import { startWatching } from './watcher.js';
import { log } from './log.js';

fs.mkdirSync(config.root, { recursive: true });

console.log('');
console.log('  Mellow Play — อัพโหลดรูปอัลบั้มจากโฟลเดอร์อัตโนมัติ');
console.log(`  โฟลเดอร์ที่เฝ้าดู: ${config.root}`);
console.log('');

// No login, no watching, no uploading — in that order. A wrong password in
// .env must stop the process here, loudly, rather than start a watcher that
// can only ever fail every upload it tries.
try {
  await session.login();
  log.info(`เข้าสู่ระบบสำเร็จด้วยบัญชี ${config.adminEmail}`);
} catch (err) {
  console.error('');
  console.error(`  เข้าสู่ระบบไม่สำเร็จ: ${err.message}`);
  console.error('  ตรวจสอบ ADMIN_EMAIL และ ADMIN_PASSWORD ในไฟล์ .env แล้วลองใหม่');
  console.error('');
  process.exit(1);
}

if (process.argv.includes('--check-login')) {
  console.log('  เข้าสู่ระบบได้ปกติ — พร้อมใช้งานจริงด้วย npm start');
  process.exit(0);
}

// Refreshed well inside the 30-day token lifetime (see api.js) so a
// password changed by someone else is caught within hours, not weeks.
setInterval(() => {
  session.refreshIfStale().catch((err) => log.warn(`ต่ออายุเซสชันไม่สำเร็จ: ${err.message}`));
}, 60 * 60 * 1000);

const watcher = startWatching();

const shutdown = (signal) => {
  log.info(`ได้รับสัญญาณ ${signal} — กำลังปิดตัว`);
  watcher.close().finally(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
