import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const STATE_PATH = path.join(config.root, '.mellow-sync-state.json');

/**
 * A record of every photo this tool has ever successfully registered,
 * keyed by its content hash rather than its filename.
 *
 * Filenames are not a safe key: "IMG_0001.jpg" repeats across every phone
 * that ever took a picture, and a camera roll export can hand the same shot
 * two different names. The hash is the file. Its only job is answering one
 * question honestly — has THIS exact photo already reached THIS exact
 * album — so a photo dropped into New/ a second time (a sync tool that
 * re-exports, a backup restored over the folder) does not become a second
 * copy in the album and a second charge against R2 storage.
 */
function load() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

let state = load();

function save() {
  // Written whole on every change. A few thousand entries of ~120 bytes
  // each is still a small file, and this tool's write rate — one photo
  // registered at a time — never makes atomicity here a bottleneck worth
  // the complexity of an append log.
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/** `key` is `${sha256}:${albumId}` — the same photo uploaded to two
 *  different albums on purpose is not a duplicate of anything. */
export function alreadyUploaded(hash, albumId) {
  return !!state[`${hash}:${albumId}`];
}

export function recordUpload(hash, albumId, info) {
  state[`${hash}:${albumId}`] = { ...info, at: new Date().toISOString() };
  save();
}
