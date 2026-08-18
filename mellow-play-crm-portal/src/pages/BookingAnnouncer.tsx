import { API_URL } from '../config';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Paper, Select,
  Slider, Stack, Switch, FormControlLabel, Typography, TextField, ListSubheader,
} from '@mui/material';
import {
  VolumeUp as SoundIcon, PlayArrow as StartIcon, Stop as StopIcon,
  Celebration as CelebrateIcon, Fullscreen as FullscreenIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useStickyState } from '../utils/stickyState';

const API_BASE = `${API_URL}/api/v1/admin`;

interface RecentBooking {
  id: number;
  created_at: string;
  course_name: string;
  child_name: string | null;
  branch_name: string | null;
}

const POLL_MS = 15000;

// What gets read out. Written as a template so the wording is the operator's,
// not ours — a shop floor and a competition desk want different sentences.
const DEFAULT_SCRIPT = 'มีการจองใหม่ {{course_name}}';

const SCRIPT_VARIABLES: { key: string; label: string }[] = [
  { key: 'course_name', label: 'ชื่อกิจกรรม' },
  { key: 'child_name', label: 'ชื่อเด็ก' },
  { key: 'branch_name', label: 'สาขา' },
  { key: 'booking_id', label: 'เลขที่การจอง' },
];

const renderScript = (script: string, booking: RecentBooking): string =>
  script.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    switch (key) {
      case 'course_name': return booking.course_name || '';
      case 'child_name': return booking.child_name || '';
      case 'branch_name': return booking.branch_name || '';
      case 'booking_id': return booking.id ? String(booking.id) : '';
      // An unknown name is left visible rather than silently dropped: the
      // person editing the script is standing right there and can fix it.
      default: return match;
    }
  }).replace(/\s{2,}/g, ' ').trim();

/**
 * How to get a Thai voice, per platform.
 *
 * speechSynthesis has no voices of its own — it reads whatever the operating
 * system has installed, and a stock Windows install has no Thai. Without this
 * the feature simply appears broken on the one machine it is meant to run on.
 */
interface Chime {
  key: string;
  label: string;
  // [frequency in Hz, start offset, length] per note.
  notes: [number, number, number][];
  type: OscillatorType;
}

const CHIMES: Chime[] = [
  { key: 'ding', label: 'ติ๊ง-ติ๊ง (สองโน้ต)', type: 'sine', notes: [[880, 0, 0.35], [1320, 0.18, 0.4]] },
  { key: 'bell', label: 'กระดิ่ง', type: 'sine', notes: [[1568, 0, 0.9]] },
  { key: 'chime3', label: 'ระฆังสามจังหวะ', type: 'sine', notes: [[784, 0, 0.4], [988, 0.16, 0.4], [1319, 0.32, 0.7]] },
  { key: 'arcade', label: 'เกมกด (สดใส)', type: 'square', notes: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]] },
  { key: 'soft', label: 'นุ่ม (ไม่รบกวน)', type: 'triangle', notes: [[440, 0, 0.5], [554, 0.22, 0.6]] },
  { key: 'alert', label: 'เตือนดัง (ห้องเสียงดัง)', type: 'sawtooth', notes: [[988, 0, 0.18], [988, 0.24, 0.18], [988, 0.48, 0.3]] },
  { key: 'none', label: 'ไม่มีเสียงเตือน (อ่านอย่างเดียว)', type: 'sine', notes: [] },
];

const VOICE_HELP: { os: string; steps: string }[] = [
  { os: 'Windows 10/11', steps: 'Settings → Time & language → Speech → Manage voices → Add voices → เลือก "ไทย (Thai)" แล้วรีสตาร์ทเบราว์เซอร์' },
  { os: 'macOS', steps: 'System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → เลือกภาษาไทย' },
  { os: 'iPhone / iPad', steps: 'ตั้งค่า → การช่วยการเข้าถึง → เนื้อหาที่พูด → เสียง → ไทย' },
  { os: 'Android', steps: 'ตั้งค่า → ระบบ → ภาษาและการป้อนข้อมูล → เอาต์พุตแปลงข้อความเป็นคำพูด → ติดตั้งข้อมูลเสียงภาษาไทย' },
];

/**
 * A screen to leave open in the office: it chimes and reads out each new
 * booking as it lands.
 *
 * Its own page rather than a corner of the booking dashboard, because the two
 * are used differently — a dashboard is read on purpose for a minute, this is
 * glanced at from across the room all day and wants the whole screen and none
 * of the controls.
 */
const BookingAnnouncer: React.FC = () => {
  const [armed, setArmed] = useState(false);
  const [speak, setSpeak] = useStickyState('announcer.speak', true);
  const [volume, setVolume] = useStickyState('announcer.volume', 0.7);
  const [voiceName, setVoiceName] = useStickyState('announcer.voice', '');
  const [script, setScript] = useStickyState('announcer.script', DEFAULT_SCRIPT);
  const [rate, setRate] = useStickyState('announcer.rate', 1);
  const [pitch, setPitch] = useStickyState('announcer.pitch', 1);
  const [showHelp, setShowHelp] = useState(false);
  const [chimeKey, setChimeKey] = useStickyState('announcer.chime', 'ding');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [feed, setFeed] = useState<RecentBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const sinceIdRef = useRef<number>(0);
  const audioRef = useRef<AudioContext | null>(null);

  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!supportsSpeech) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    // Chrome fills the list asynchronously; the first call is usually empty.
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [supportsSpeech]);

  // A rising two-note chime, synthesised rather than shipped as a file: it is
  // two oscillators, and an audio asset would be one more thing to host, cache
  // and have blocked.
  const playChime = useCallback((key: string) => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const preset = CHIMES.find(c => c.key === key) ?? CHIMES[0];
    const now = ctx.currentTime;
    preset.notes.forEach(([freq, at, length]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = preset.type;
      osc.frequency.value = freq;
      // Ramped rather than switched on: a square wave started at full gain
      // clicks, and a click is the part people find annoying.
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(volume * 0.5, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + length + 0.05);
    });
  }, [volume]);

  const chime = useCallback(() => playChime(chimeKey), [playChime, chimeKey]);

  const announce = useCallback((booking: RecentBooking) => {
    chime();
    if (!speak || !supportsSpeech) return;
    const text = renderScript(script, booking);
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'th-TH';
    utter.volume = volume;
    utter.rate = rate;
    utter.pitch = pitch;
    const chosen = voices.find(v => v.name === voiceName);
    if (chosen) utter.voice = chosen;
    // Queued behind the chime rather than layered over it — two sounds at once
    // is noise, and this has to be understood from across the room.
    window.setTimeout(() => window.speechSynthesis.speak(utter), 700);
  }, [chime, speak, supportsSpeech, voices, voiceName, volume, script, rate, pitch]);

  const poll = useCallback(async (announceNew: boolean) => {
    try {
      const { data } = await axios.get(`${API_BASE}/analytics/recent-bookings`, {
        params: { sinceId: sinceIdRef.current },
      });
      if (!data.success) return;
      setError(null);
      setLastCheck(new Date());

      const fresh: RecentBooking[] = data.bookings || [];
      if (announceNew && sinceIdRef.current > 0 && fresh.length > 0) {
        setFeed(prev => [...fresh].reverse().concat(prev).slice(0, 30));
        // Spaced out, so three bookings landing together are three
        // announcements rather than one wall of sound.
        fresh.forEach((b, i) => window.setTimeout(() => announce(b), i * 4000));
      }
      sinceIdRef.current = data.latestId ?? sinceIdRef.current;
    } catch (e: any) {
      setError(e.response?.data?.message || 'ดึงข้อมูลไม่สำเร็จ');
    }
  }, [announce]);

  // The first pass only learns where the list is up to. Opening the board must
  // not read out everything that happened before it was opened.
  useEffect(() => { poll(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!armed) return;
    const timer = window.setInterval(() => poll(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [armed, poll]);

  const start = async () => {
    // Browsers refuse to play anything until a gesture, so the AudioContext is
    // created inside the click that starts the board — not on mount, where it
    // would be born suspended and silent.
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      audioRef.current = ctx;
    } catch { /* no audio: the visual feed still works */ }
    setArmed(true);
    poll(true);
  };

  const stop = () => {
    setArmed(false);
    window.speechSynthesis?.cancel();
  };

  const test = () => announce({
    id: 0, created_at: '', course_name: 'ทดสอบเสียงประกาศ', child_name: null, branch_name: null,
  });

  const thaiVoices = voices.filter(v => /^th/i.test(v.lang || '') || /thai|ไทย/i.test(v.name || ''));
  const otherVoices = voices.filter(v => !thaiVoices.includes(v));

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <SoundIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>ประกาศการจองใหม่</Typography>
          <Typography variant="body2" color="text.secondary">
            เปิดหน้านี้ทิ้งไว้ มีการจองใหม่เมื่อไหร่จะมีเสียงเตือนและอ่านชื่อกิจกรรมให้
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          {armed ? (
            <Button variant="outlined" color="error" startIcon={<StopIcon />} onClick={stop}>หยุดประกาศ</Button>
          ) : (
            <Button variant="contained" startIcon={<StartIcon />} onClick={start}>เริ่มประกาศ</Button>
          )}
          <Button variant="text" startIcon={<CelebrateIcon />} onClick={test} disabled={!armed}>ทดสอบเสียง</Button>
          <Button
            variant="text" startIcon={<FullscreenIcon />}
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          >
            เต็มจอ
          </Button>

          <FormControlLabel
            control={<Switch checked={speak} onChange={e => setSpeak(e.target.checked)} />}
            label="อ่านชื่อกิจกรรม"
          />

          <Box sx={{ minWidth: 160, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SoundIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Slider
              size="small" min={0} max={1} step={0.1}
              value={volume} onChange={(_, v) => setVolume(v as number)}
            />
          </Box>

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>เสียงเตือน</InputLabel>
            <Select
              label="เสียงเตือน" value={chimeKey}
              onChange={e => { const k = String(e.target.value); setChimeKey(k); playChime(k); }}
            >
              {CHIMES.map(c => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            color={armed ? 'success' : 'default'}
            label={armed ? `กำลังเฝ้าดู · เช็คทุก ${POLL_MS / 1000} วินาที` : 'ยังไม่เริ่ม'}
            sx={{ fontWeight: 700 }}
          />
          {lastCheck && (
            <Typography variant="caption" color="text.secondary">
              เช็คล่าสุด {lastCheck.toLocaleTimeString('th-TH')}
            </Typography>
          )}
        </Stack>

        {speak && (
          <Box sx={{ mt: 2.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
              ข้อความที่จะอ่าน
            </Typography>
            <TextField
              fullWidth size="small" value={script} onChange={e => setScript(e.target.value)}
              placeholder={DEFAULT_SCRIPT}
              helperText="เว้นว่างตัวแปรไหนที่ไม่มีข้อมูล ระบบจะข้ามให้เอง"
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              {SCRIPT_VARIABLES.map(v => (
                <Chip
                  key={v.key} size="small" label={v.label} sx={{ fontWeight: 700 }}
                  onClick={() => setScript(prev => `${prev} {{${v.key}}}`.trim())}
                />
              ))}
              <Chip size="small" variant="outlined" label="คืนค่าเริ่มต้น" onClick={() => setScript(DEFAULT_SCRIPT)} />
            </Stack>

            <Stack direction="row" spacing={3} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel>เสียงอ่าน</InputLabel>
                <Select label="เสียงอ่าน" value={voiceName} onChange={e => setVoiceName(String(e.target.value))}>
                  <MenuItem value="">ค่าเริ่มต้นของเครื่อง</MenuItem>
                  {thaiVoices.length > 0 && <ListSubheader>ภาษาไทย</ListSubheader>}
                  {thaiVoices.map(v => <MenuItem key={v.name} value={v.name}>{v.name}</MenuItem>)}
                  {otherVoices.length > 0 && <ListSubheader>ภาษาอื่น (อาจอ่านไทยไม่ชัด)</ListSubheader>}
                  {otherVoices.map(v => <MenuItem key={v.name} value={v.name}>{v.name} · {v.lang}</MenuItem>)}
                </Select>
              </FormControl>

              <Box sx={{ minWidth: 180 }}>
                <Typography variant="caption" color="text.secondary">ความเร็ว {rate.toFixed(1)}x</Typography>
                <Slider size="small" min={0.5} max={1.6} step={0.1} value={rate} onChange={(_, v) => setRate(v as number)} />
              </Box>
              <Box sx={{ minWidth: 180 }}>
                <Typography variant="caption" color="text.secondary">ระดับเสียงสูง-ต่ำ {pitch.toFixed(1)}</Typography>
                <Slider size="small" min={0.5} max={1.6} step={0.1} value={pitch} onChange={(_, v) => setPitch(v as number)} />
              </Box>
            </Stack>
          </Box>
        )}

        {!supportsSpeech && (
          <Alert severity="info" sx={{ mt: 2 }}>
            เบราว์เซอร์นี้อ่านออกเสียงไม่ได้ — จะมีเฉพาะเสียงเตือนและรายการบนจอ
          </Alert>
        )}
        {supportsSpeech && speak && thaiVoices.length === 0 && (
          <Alert
            severity="warning" sx={{ mt: 2 }}
            action={<Button size="small" onClick={() => setShowHelp(v => !v)}>{showHelp ? 'ปิด' : 'วิธีติดตั้ง'}</Button>}
          >
            เครื่องนี้ยังไม่มีเสียงภาษาไทย — เบราว์เซอร์ใช้เสียงที่ติดตั้งอยู่ในระบบปฏิบัติการ ไม่ได้มีเสียงของตัวเอง
          </Alert>
        )}
        {showHelp && (
          <Paper variant="outlined" sx={{ mt: 1.5, p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>วิธีติดตั้งเสียงภาษาไทย</Typography>
            <Stack spacing={1}>
              {VOICE_HELP.map(h => (
                <Box key={h.os}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{h.os}</Typography>
                  <Typography variant="body2" color="text.secondary">{h.steps}</Typography>
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              ติดตั้งแล้วต้องปิดเปิดเบราว์เซอร์ใหม่ เสียงจึงจะขึ้นในรายการ · Chrome บนเดสก์ท็อปมีเสียงออนไลน์ของ Google
              ให้เลือกด้วยเมื่อเครื่องต่ออินเทอร์เน็ต
            </Typography>
          </Paper>
        )}
        {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>

      {/* The board itself: big enough to read standing up, newest at the top. */}
      {feed.length === 0 ? (
        <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }}>
          <CelebrateIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ fontWeight: 800, color: 'text.secondary' }}>
            {armed ? 'กำลังรอการจองใหม่...' : 'กด "เริ่มประกาศ" เพื่อเริ่มเฝ้าดู'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            การจองที่เกิดขึ้นก่อนเปิดหน้านี้จะไม่ถูกประกาศ
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {feed.map((b, i) => (
            <Paper
              key={b.id}
              sx={{
                p: 2.5, borderRadius: 3, borderLeft: '6px solid',
                borderColor: i === 0 ? 'success.main' : 'divider',
                bgcolor: i === 0 ? 'success.light' : 'background.paper',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 900 }}>{b.course_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[b.child_name, b.branch_name, `#${b.id}`].filter(Boolean).join(' · ')}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default BookingAnnouncer;
