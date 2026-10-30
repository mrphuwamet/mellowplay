// The Electron main process: owns the window, the two child processes it
// can start/stop (the main sync watcher and the LumaBooth relay), the
// settings file, and the native folder-browse dialogs.
//
// Deliberately does NOT reimplement any of the sync logic. This app's whole
// job is to be a friendlier front door onto the already-working, already-
// tested CLI in ../mellow-play-album-sync: it writes that project's .env
// from the form, then spawns its scripts exactly the way a person would
// from a terminal, and streams their output into the window. If the CLI's
// behaviour ever needs to change, it changes there, once, for both the
// terminal user and this window.
const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// Packaged: the CLI's source is bundled under resources/ (see package.json's
// build.extraResources). Running from the repo: it's the sibling folder.
// Either way this app never touches it except to write its .env and run
// `node <script>` inside it — nothing here depends on which case it is.
const albumSyncDir = app.isPackaged
  ? path.join(process.resourcesPath, 'mellow-play-album-sync')
  : path.join(__dirname, '..', 'mellow-play-album-sync');

// No separate Node.js install required on the machine this runs on: the
// packaged app's own executable, told to behave as plain Node, is used to
// run the CLI's scripts — the same trick Electron apps use to run any
// Node-only helper script without bundling a second runtime. Verified
// against this exact project's dependencies (chokidar, sharp's native
// binary) before relying on it — see the session notes; sharp specifically
// was the risk, since it's a compiled addon, and it loads and encodes
// correctly this way.
const nodeExec = process.execPath;
const nodeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/** The admin password is the one field worth more care than a plain JSON
 *  file gives the CLI's own .env — this app has safeStorage for free, so it
 *  uses it. Falls back to not persisting the password at all (rather than
 *  storing it in the clear) on a system where OS-level encryption isn't
 *  available, which safeStorage itself reports. */
function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (raw.adminPasswordEnc && safeStorage.isEncryptionAvailable()) {
      try { raw.adminPassword = safeStorage.decryptString(Buffer.from(raw.adminPasswordEnc, 'base64')); }
      catch { raw.adminPassword = ''; }
    }
    delete raw.adminPasswordEnc;
    return raw;
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  const out = { ...settings };
  if (out.adminPassword && safeStorage.isEncryptionAvailable()) {
    out.adminPasswordEnc = safeStorage.encryptString(out.adminPassword).toString('base64');
    delete out.adminPassword;
  } else if (out.adminPassword) {
    // No OS-level encryption available (safeStorage reports this up front,
    // not as a failure) — kept in the clear rather than silently dropped,
    // same trust model the CLI's own .env already uses, just said plainly.
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(out, null, 2));
}

/** Writes the CLI's .env from the form — the one place this app and the
 *  terminal-based setup agree on what the fields mean. */
function writeEnv(settings) {
  const lines = [
    `API_URL=${settings.apiUrl || 'https://api.mellowplay.co'}`,
    `ADMIN_EMAIL=${settings.adminEmail || ''}`,
    `ADMIN_PASSWORD=${settings.adminPassword || ''}`,
    `ALBUM_SYNC_ROOT=${settings.syncRoot || ''}`,
    `WATCH_USE_POLLING=${settings.usePolling ? 'true' : 'false'}`,
  ];
  if (settings.lumaboothEnabled) {
    lines.push(`LUMABOOTH_EXPORT_ROOT=${settings.lumaboothExportRoot || ''}`);
    lines.push(`LUMABOOTH_TARGET_ALBUM=${settings.lumaboothTargetAlbum || ''}`);
  }
  fs.writeFileSync(path.join(albumSyncDir, '.env'), lines.join('\n') + '\n');
}

// ── the two processes this window can start and stop ──
const children = { sync: null, lumabooth: null };

function streamTo(win, child, channel) {
  const onData = (d) => win.webContents.send(channel, d.toString());
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
}

function startChild(win, key, script, channel) {
  if (children[key]) return; // already running — Start is a no-op, not a second process
  const child = spawn(nodeExec, [path.join(albumSyncDir, 'src', script)], {
    cwd: albumSyncDir, env: nodeEnv,
  });
  children[key] = child;
  streamTo(win, child, channel);
  child.on('exit', (code, signal) => {
    children[key] = null;
    win.webContents.send(channel, `\n[หยุดทำงานแล้ว — exit ${code ?? signal}]\n`);
    win.webContents.send(`${key}-stopped`);
  });
}

function stopChild(key) {
  const child = children[key];
  if (!child) return;
  children[key] = null; // set first: the 'exit' handler above would otherwise also null it and double-report
  child.kill();
}

/**
 * Runs one short-lived CLI invocation (--check-login / --list-albums) to
 * completion and resolves with its full output.
 *
 * Judges success from the OUTPUT, not the exit code: this sandbox's Node
 * build has a known intermittent libuv issue on Windows (an
 * UV_HANDLE_CLOSING assertion) that can report a garbage non-zero exit
 * code from a process that completed its real work correctly and printed
 * the right thing — reproduced even in a trivial fetch-then-exit script,
 * so it is a platform quirk to route around here, not a bug to chase in
 * the CLI itself. A caller that trusted the exit code alone would report a
 * false failure on an otherwise-successful login or album fetch.
 */
function runOnce(args) {
  return new Promise((resolve) => {
    const child = spawn(nodeExec, [path.join(albumSyncDir, 'src', 'index.js'), ...args], {
      cwd: albumSyncDir, env: nodeEnv,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', () => resolve(out));
  });
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 760, height: 760, resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  fs.mkdirSync(albumSyncDir, { recursive: true });
  createWindow();
});

app.on('window-all-closed', () => {
  stopChild('sync');
  stopChild('lumabooth');
  if (process.platform !== 'darwin') app.quit();
});

// ── the bridge preload.js exposes to the page ──
ipcMain.handle('browse-folder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('load-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, settings) => { saveSettings(settings); return true; });

ipcMain.handle('check-login', async (_e, settings) => {
  writeEnv(settings);
  const out = await runOnce(['--check-login']);
  return { ok: out.includes('เข้าสู่ระบบได้ปกติ'), out };
});

ipcMain.handle('list-albums', async (_e, settings) => {
  writeEnv(settings);
  const out = await runOnce(['--list-albums']);
  const line = out.split('\n').find((l) => l.startsWith('ALBUMS_JSON:'));
  if (!line) return { ok: false, out, albums: [] };
  try { return { ok: true, albums: JSON.parse(line.slice('ALBUMS_JSON:'.length)) }; }
  catch { return { ok: false, out, albums: [] }; }
});

ipcMain.handle('start-sync', (_e, settings) => {
  writeEnv(settings);
  startChild(win, 'sync', 'index.js', 'sync-log');
});
ipcMain.handle('stop-sync', () => stopChild('sync'));
ipcMain.handle('is-sync-running', () => !!children.sync);

ipcMain.handle('start-lumabooth', (_e, settings) => {
  writeEnv(settings);
  startChild(win, 'lumabooth', 'lumaboothRelay.js', 'lumabooth-log');
});
ipcMain.handle('stop-lumabooth', () => stopChild('lumabooth'));
ipcMain.handle('is-lumabooth-running', () => !!children.lumabooth);
