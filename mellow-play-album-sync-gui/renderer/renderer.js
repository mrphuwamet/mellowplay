// Plain DOM wiring — no framework, nothing to build. window.albumSync comes
// from preload.js (real Electron) or, for development/testing without
// Electron, a stub installed before this file loads (see the test scripts
// under mellow-play-album-sync-gui's own test/ folder).
const $ = (id) => document.getElementById(id);

const fields = {
  apiUrl: $('apiUrl'), adminEmail: $('adminEmail'), adminPassword: $('adminPassword'),
  syncRoot: $('syncRoot'),
  lumaboothEnabled: $('lumaboothEnabled'), lumaboothExportRoot: $('lumaboothExportRoot'),
  lumaboothTargetAlbum: $('lumaboothTargetAlbum'),
};

function currentSettings() {
  return {
    apiUrl: fields.apiUrl.value.trim() || 'https://api.mellowplay.co',
    adminEmail: fields.adminEmail.value.trim(),
    adminPassword: fields.adminPassword.value,
    syncRoot: fields.syncRoot.value,
    lumaboothEnabled: fields.lumaboothEnabled.checked,
    lumaboothExportRoot: fields.lumaboothExportRoot.value,
    lumaboothTargetAlbum: fields.lumaboothTargetAlbum.value,
  };
}

function applySettings(s) {
  if (!s) return;
  fields.apiUrl.value = s.apiUrl || 'https://api.mellowplay.co';
  fields.adminEmail.value = s.adminEmail || '';
  fields.adminPassword.value = s.adminPassword || '';
  fields.syncRoot.value = s.syncRoot || '';
  fields.lumaboothEnabled.checked = !!s.lumaboothEnabled;
  fields.lumaboothExportRoot.value = s.lumaboothExportRoot || '';
  if (s.lumaboothTargetAlbum) {
    // The option may not exist yet (album list not loaded this session) —
    // add it as a placeholder so a saved choice is never silently lost.
    if (![...fields.lumaboothTargetAlbum.options].some((o) => o.value === s.lumaboothTargetAlbum)) {
      const opt = document.createElement('option');
      opt.value = s.lumaboothTargetAlbum; opt.textContent = s.lumaboothTargetAlbum;
      fields.lumaboothTargetAlbum.appendChild(opt);
    }
    fields.lumaboothTargetAlbum.value = s.lumaboothTargetAlbum;
  }
  $('lumaboothFields').classList.toggle('hidden', !fields.lumaboothEnabled.checked);
}

// ── load saved settings on startup ──
window.albumSync.loadSettings().then(applySettings);

// ── browse buttons ──
$('btnBrowseRoot').onclick = async () => {
  const folder = await window.albumSync.browseFolder();
  if (folder) fields.syncRoot.value = folder;
};
$('btnBrowseLuma').onclick = async () => {
  const folder = await window.albumSync.browseFolder();
  if (folder) fields.lumaboothExportRoot.value = folder;
};

$('lumaboothEnabled').onchange = () => {
  $('lumaboothFields').classList.toggle('hidden', !fields.lumaboothEnabled.checked);
};

// ── save ──
$('btnSave').onclick = async () => {
  await window.albumSync.saveSettings(currentSettings());
  const m = $('saveMsg'); m.textContent = 'บันทึกแล้ว'; m.className = 'msg ok';
  setTimeout(() => { m.textContent = ''; }, 2500);
};

// ── check login ──
$('btnCheckLogin').onclick = async () => {
  const btn = $('btnCheckLogin'); btn.disabled = true;
  const m = $('loginMsg'); m.textContent = 'กำลังตรวจสอบ...'; m.className = 'msg';
  try {
    const { ok, out } = await window.albumSync.checkLogin(currentSettings());
    m.textContent = ok ? 'เข้าสู่ระบบได้ปกติ' : `เข้าสู่ระบบไม่สำเร็จ: ${out.trim().split('\n').pop() || ''}`;
    m.className = ok ? 'msg ok' : 'msg err';
  } finally {
    btn.disabled = false;
  }
};

// ── load album list for the LumaBooth dropdown ──
$('btnLoadAlbums').onclick = async () => {
  const btn = $('btnLoadAlbums'); btn.disabled = true;
  const prevValue = fields.lumaboothTargetAlbum.value;
  try {
    const { ok, albums, out } = await window.albumSync.listAlbums(currentSettings());
    if (!ok) {
      alert('โหลดรายชื่ออัลบั้มไม่สำเร็จ — ลองทดสอบล็อกอินก่อน\n' + (out || ''));
      return;
    }
    const sel = fields.lumaboothTargetAlbum;
    sel.innerHTML = '';
    if (albums.length === 0) {
      sel.appendChild(new Option('— ยังไม่มีอัลบั้มใน CRM —', ''));
    }
    for (const a of albums) sel.appendChild(new Option(a.name, a.name));
    if ([...sel.options].some((o) => o.value === prevValue)) sel.value = prevValue;
  } finally {
    btn.disabled = false;
  }
};

// ── sync watcher start/stop ──
function setRunningUI(dotId, textId, startBtnId, stopBtnId, running) {
  $(dotId).className = `dot ${running ? 'on' : 'off'}`;
  $(textId).textContent = running ? 'กำลังทำงาน' : 'ยังไม่ได้เริ่ม';
  $(startBtnId).classList.toggle('hidden', running);
  $(stopBtnId).classList.toggle('hidden', !running);
}
function appendLog(preId, text) {
  const el = $(preId);
  el.textContent += text;
  el.scrollTop = el.scrollHeight;
}

$('btnStartSync').onclick = async () => {
  if (!fields.syncRoot.value) { alert('เลือกโฟลเดอร์หลักก่อน'); return; }
  $('syncLog').textContent = '';
  await window.albumSync.startSync(currentSettings());
  setRunningUI('syncDot', 'syncStatusText', 'btnStartSync', 'btnStopSync', true);
};
$('btnStopSync').onclick = async () => {
  await window.albumSync.stopSync();
};
window.albumSync.onSyncLog((line) => appendLog('syncLog', line));
window.albumSync.onSyncStopped(() => setRunningUI('syncDot', 'syncStatusText', 'btnStartSync', 'btnStopSync', false));

// ── LumaBooth relay start/stop ──
$('btnStartLuma').onclick = async () => {
  if (!fields.lumaboothExportRoot.value) { alert('เลือกโฟลเดอร์ export ของ LumaBooth ก่อน'); return; }
  if (!fields.lumaboothTargetAlbum.value) { alert('เลือกอัลบั้มปลายทางก่อน (กด "โหลดรายชื่ออัลบั้ม" ถ้ายังไม่เห็น)'); return; }
  $('lumaLog').textContent = '';
  await window.albumSync.startLumabooth(currentSettings());
  setRunningUI('lumaDot', 'lumaStatusText', 'btnStartLuma', 'btnStopLuma', true);
};
$('btnStopLuma').onclick = async () => {
  await window.albumSync.stopLumabooth();
};
window.albumSync.onLumaboothLog((line) => appendLog('lumaLog', line));
window.albumSync.onLumaboothStopped(() => setRunningUI('lumaDot', 'lumaStatusText', 'btnStartLuma', 'btnStopLuma', false));

// ── reflect actual state on load, in case the window was reopened while
//    something was already running ──
window.albumSync.isSyncRunning().then((r) => setRunningUI('syncDot', 'syncStatusText', 'btnStartSync', 'btnStopSync', r));
window.albumSync.isLumaboothRunning().then((r) => setRunningUI('lumaDot', 'lumaStatusText', 'btnStartLuma', 'btnStopLuma', r));
