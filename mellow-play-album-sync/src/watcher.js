import chokidar from 'chokidar';
import path from 'node:path';
import { config } from './config.js';
import { processFile } from './processFile.js';
import { log } from './log.js';

/**
 * No more than MAX_CONCURRENT photos resizing/uploading at once.
 *
 * Dropping a whole camera-roll export (a few hundred files) into New/ fires
 * a few hundred filesystem events in the same instant; running all of them
 * at once would hand sharp a few hundred decodes simultaneously and hand
 * the Worker a few hundred requests in the same second. A small queue keeps
 * the machine responsive and the API calls arriving at a rate it can log
 * one at a time, which is also the rate a human watching the console can
 * actually read.
 */
const MAX_CONCURRENT = 3;
let active = 0;
const queue = [];

function runNext() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  const task = queue.shift();
  active++;
  task().finally(() => { active--; runNext(); });
}

function enqueue(task) {
  queue.push(task);
  runNext();
}

/**
 * Only files that are direct children of `<root>/<anything>/New/` count.
 * Anything already under Uploaded/ or Failed/, anything nested deeper than
 * that, and the tool's own sidecar files (sync.log, the state file, a
 * .error.txt note) are not photos waiting to go anywhere.
 */
function albumFolderFor(filePath) {
  const rel = path.relative(config.root, filePath);
  const parts = rel.split(path.sep);
  if (parts.length !== 3 || parts[1] !== 'New') return null;
  return parts[0];
}

export function startWatching() {
  // Watching the plain root directory and filtering in the 'add' handler
  // (albumFolderFor, below) rather than a glob pattern: chokidar's globs are
  // matched as forward-slash paths, and config.root is a Windows path with
  // backslashes on the one platform this tool's actual users run on — mixing
  // the two is exactly the kind of thing that works in a quick test and
  // fails on a real machine. depth: 2 reaches `<root>/<album>/New/<file>`
  // (album = 0, New/Uploaded/Failed = 1, the files inside them = 2); the
  // handler ignores everything depth made reachable that isn't in a New/.
  const watcher = chokidar.watch(config.root, {
    ignored: (p) => path.basename(p).startsWith('.'),
    persistent: true,
    ignoreInitial: false, // pick up anything already sitting in New/ at startup
    usePolling: config.usePolling,
    depth: 2,
    awaitWriteFinish: {
      // A file whose size hasn't changed for this long is done being
      // written — this is what keeps a half-copied phone export from being
      // read mid-write and rejected as a corrupt image.
      stabilityThreshold: 1500,
      pollInterval: 300,
    },
  });

  watcher
    .on('add', (filePath) => {
      const albumFolder = albumFolderFor(filePath);
      if (!albumFolder) return;
      const albumDir = path.join(config.root, albumFolder);
      enqueue(() => processFile(filePath, {
        albumFolder,
        uploadedDir: path.join(albumDir, 'Uploaded'),
        failedDir: path.join(albumDir, 'Failed'),
      }));
    })
    .on('error', (err) => log.error(`ตัวเฝ้าดูโฟลเดอร์มีปัญหา: ${err.message}`))
    .on('ready', () => log.info(`เฝ้าดูโฟลเดอร์ ${config.root}/<ชื่ออัลบั้ม>/New/ พร้อมแล้ว`));

  return watcher;
}
