import { listAlbums } from './api.js';
import { log } from './log.js';

/**
 * Folder name → album id, by exact name match (trimmed, case-insensitive).
 *
 * Matching by name rather than by a numeric id typed into a config file is
 * the whole point: the person running this tool works from the CRM, where
 * albums have names, not ids visible anywhere in the UI. Create the folder
 * with the same name as the album and nothing else needs telling apart.
 *
 * Cached, and refreshed no more than once every REFRESH_COOLDOWN — a folder
 * for an album that does not exist yet would otherwise refetch the whole
 * list on every single file event until someone creates it.
 */
const REFRESH_COOLDOWN = 20_000;
let cache = new Map();   // lowercased trimmed name -> [{id, name}, ...]
let lastFetch = 0;

async function refresh() {
  const albums = await listAlbums();
  const next = new Map();
  for (const a of albums) {
    const key = String(a.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!next.has(key)) next.set(key, []);
    next.get(key).push(a);
  }
  cache = next;
  lastFetch = Date.now();
}

/**
 * Resolves a folder name to an album id, or `null` with a logged reason.
 *
 * `null` rather than throwing: an unmatched folder is not this file's
 * problem to fail on — it sits untouched until the folder is renamed or the
 * album is created, and the watcher keeps running for every album that
 * *does* resolve.
 */
export async function resolveAlbumId(folderName, { forceRefresh = false } = {}) {
  const key = folderName.trim().toLowerCase();
  if (forceRefresh || Date.now() - lastFetch > REFRESH_COOLDOWN || cache.size === 0) {
    await refresh();
  }
  const matches = cache.get(key);
  if (!matches || matches.length === 0) {
    log.warn(`ไม่พบอัลบั้มชื่อ "${folderName}" ใน CRM — สร้างอัลบั้มนี้ก่อน (ชื่อต้องตรงกับชื่อโฟลเดอร์เป๊ะ) แล้วรอรอบถัดไป`);
    return null;
  }
  if (matches.length > 1) {
    log.warn(`มีอัลบั้มชื่อ "${folderName}" ซ้ำกัน ${matches.length} อัลบั้มใน CRM (id: ${matches.map(m => m.id).join(', ')}) — เปลี่ยนชื่อให้ไม่ซ้ำกันก่อน ไม่งั้นจะไม่อัปโหลดให้เพื่อความปลอดภัย`);
    return null;
  }
  return matches[0].id;
}
