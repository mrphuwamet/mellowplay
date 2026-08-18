import { API_URL } from '../config';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Paper, Select,
  Slider, Stack, Switch, FormControlLabel, Typography,
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
  const chime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(volume * 0.6, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.4);
    });
  }, [volume]);

  const announce = useCallback((booking: RecentBooking) => {
    chime();
    if (!speak || !supportsSpeech) return;
    const utter = new SpeechSynthesisUtterance(`มีการจองใหม่ ${booking.course_name}`);
    utter.lang = 'th-TH';
    utter.volume = volume;
    const chosen = voices.find(v => v.name === voiceName);
    if (chosen) utter.voice = chosen;
    // Queued behind the chime rather than layered over it — two sounds at once
    // is noise, and this has to be understood from across the room.
    window.setTimeout(() => window.speechSynthesis.speak(utter), 700);
  }, [chime, speak, supportsSpeech, voices, voiceName, volume]);

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

  const thaiVoices = voices.filter(v => v.lang?.toLowerCase().startsWith('th'));

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

          {thaiVoices.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>เสียงอ่าน</InputLabel>
              <Select label="เสียงอ่าน" value={voiceName} onChange={e => setVoiceName(String(e.target.value))}>
                <MenuItem value="">ค่าเริ่มต้นของเครื่อง</MenuItem>
                {thaiVoices.map(v => <MenuItem key={v.name} value={v.name}>{v.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
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

        {!supportsSpeech && (
          <Alert severity="info" sx={{ mt: 2 }}>
            เบราว์เซอร์นี้อ่านออกเสียงไม่ได้ — จะมีเฉพาะเสียงเตือนและรายการบนจอ
          </Alert>
        )}
        {supportsSpeech && speak && thaiVoices.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            เครื่องนี้ยังไม่มีเสียงภาษาไทยติดตั้งไว้ ระบบจะใช้เสียงเริ่มต้นของเครื่องแทน ซึ่งอาจอ่านภาษาไทยไม่ชัด
          </Alert>
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
