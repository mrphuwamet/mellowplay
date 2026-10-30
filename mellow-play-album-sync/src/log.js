import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Console plus an append-only file, so "what did this tool do to my photos
 * last night" has an answer that survives a closed terminal window. One
 * line per event, timestamped, flat text rather than structured — this is
 * read by a person, not parsed by anything.
 */
const LOG_PATH = path.join(config.root, 'sync.log');

function write(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  (level === 'ERROR' ? console.error : console.log)(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch { /* root folder missing yet — console still got it */ }
}

export const log = {
  info: (m) => write('INFO', m),
  warn: (m) => write('WARN', m),
  error: (m) => write('ERROR', m),
};
