import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, MenuItem, Select, FormControl, InputLabel,
  TextField, Chip, LinearProgress, Alert, List, ListItemButton, ListItemText,
  CircularProgress, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  EventBusy as AbsentIcon, CheckCircle as ArrivedIcon, Refresh as RefreshIcon,
  QrCode2 as QrIcon, ContentCopy as CopyIcon, Print as PrintIcon,
} from '@mui/icons-material';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { AxiosInstance } from 'axios';
import { API_URL, CONSUMER_APP_URL } from '../config';
import { copyText } from '../utils/clipboard';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * The round being run, and who is still missing from it.
 *
 * Scanning answers "who is this?"; it can never answer "who has not arrived
 * yet?", which is the question anyone running a door asks every ten minutes.
 * It is also the fallback when a QR simply does not work — a flat battery, a
 * deleted screenshot, the other parent's phone — where the only alternative
 * today is knowing the account's phone number by heart.
 *
 * Scoped to one round on purpose. A door runs one session at a time; filtering
 * across rounds is the booking list's job, on a real screen.
 */

interface RoundOption {
  course_id: number;
  course_name: string;
  slot_date: string;
  slot_start_time: string;
  booked: number;
  arrived: number;
}

interface RosterRow {
  id: number;
  qr_token: string;
  status: string;
  who: string | null;
  ticks: number;
}

const todayInBangkok = () => {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
};

const CheckinRoundPanel = ({ client, onPick, canClose, refreshKey }: {
  client: AxiosInstance;
  /** Tapping a name loads that booking through the same path a scan uses. */
  onPick: (qrToken: string) => void;
  /** Closing a round off is CRM-only — a shared PIN link does not get it. */
  canClose: boolean;
  /** Bumped by the parent after a tick, so the roster reflects it. */
  refreshKey: number;
}) => {
  const [date, setDate] = useState(todayInBangkok());
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [picked, setPicked] = useState<RoundOption | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [show, setShow] = useState<'missing' | 'all'>('missing');
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState('');
  // The questionnaire this round's QR points at, and the code itself.
  const [sessions, setSessions] = useState<{ id: number; name: string }[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | ''>('');
  const [token, setToken] = useState('');
  const [making, setMaking] = useState(false);

  useEffect(() => {
    client.get(`${API_BASE}/checkin/rounds`, { params: { date } })
      .then(({ data }) => setRounds(data.rounds || []))
      .catch(() => setRounds([]));
    setPicked(null);
    setRoster(null);
  }, [client, date]);

  const loadRoster = useCallback(async (r: RoundOption | null) => {
    if (!r) { setRoster(null); return; }
    setLoading(true);
    try {
      const { data } = await client.get(`${API_BASE}/checkin/round-attendance`, {
        params: { course_id: r.course_id, slot_date: r.slot_date, slot_start_time: r.slot_start_time },
      });
      setRoster(data.success ? data.bookings : []);
    } catch {
      setRoster([]);
    } finally { setLoading(false); }
  }, [client]);

  useEffect(() => { void loadRoster(picked); }, [picked, loadRoster, refreshKey]);

  const rows = roster || [];
  const arrived = rows.filter(r => r.ticks > 0);
  const missing = rows.filter(r => r.ticks === 0 && r.status !== 'no_show');
  const marked = rows.filter(r => r.status === 'no_show');
  const listed = show === 'missing' ? [...missing, ...marked] : rows;

  const openQr = async () => {
    setQrOpen(true);
    setToken('');
    if (sessions.length === 0) {
      try {
        const { data } = await client.get(`${API_BASE}/survey-sessions`);
        setSessions((data.sessions || []).filter((x: any) => x.is_active));
      } catch { /* the dialog says so */ }
    }
  };

  /**
   * One code per round, and pressing it twice gives back the same one.
   *
   * A second sheet for a round that already has one would split its answers
   * across two codes, and nobody at the table could tell which sheet was
   * current.
   */
  const makeLink = async () => {
    if (!picked || !sessionId) return;
    setMaking(true);
    try {
      const { data } = await client.post(`${API_BASE}/round-links`, {
        session_id: sessionId,
        course_id: picked.course_id,
        slot_date: picked.slot_date,
        slot_start_time: picked.slot_start_time,
        label: `${picked.course_name} ${picked.slot_start_time}`,
      });
      if (data.success) setToken(data.token);
      else setNotice(data.message || 'สร้างลิงก์ไม่สำเร็จ');
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'สร้างลิงก์ไม่สำเร็จ');
    } finally { setMaking(false); }
  };

  const roundUrl = token ? `${CONSUMER_APP_URL}/round/${token}` : '';

  const closeRound = async () => {
    if (!picked || missing.length === 0) return;
    setClosing(true);
    try {
      const { data } = await client.post(`${API_BASE}/checkin/no-show`, {
        booking_ids: missing.map(r => r.id),
      });
      setNotice(data.success ? `บันทึกว่าไม่มา ${data.changed} คน` : (data.message || 'บันทึกไม่สำเร็จ'));
      await loadRoster(picked);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setClosing(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: picked ? 2 : 0 }}>
        <TextField
          type="date" size="small" label="วันที่" value={date}
          onChange={e => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <FormControl size="small" fullWidth>
          <InputLabel>รอบที่กำลังคุม</InputLabel>
          <Select
            label="รอบที่กำลังคุม"
            value={picked ? `${picked.course_id}|${picked.slot_start_time}` : ''}
            onChange={e => {
              const [cid, time] = String(e.target.value).split('|');
              setPicked(rounds.find(r => String(r.course_id) === cid && r.slot_start_time === time) || null);
              setNotice('');
            }}
          >
            <MenuItem value="">ไม่เลือก (สแกนอย่างเดียว)</MenuItem>
            {rounds.map(r => (
              <MenuItem key={`${r.course_id}|${r.slot_start_time}`} value={`${r.course_id}|${r.slot_start_time}`}>
                {r.slot_start_time} · {r.course_name} ({r.arrived}/{r.booked})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {rounds.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          วันนี้ยังไม่มีรอบที่มีคนจอง
        </Typography>
      )}

      {picked && (
        <>
          <Box sx={{ mb: 1.5 }}>
            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
              <Typography sx={{ fontWeight: 900, fontSize: 26, lineHeight: 1 }}>
                {arrived.length}/{rows.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">เข้าแล้ว</Typography>
              <Box sx={{ flex: 1 }} />
              <Button size="small" startIcon={<QrIcon />} onClick={() => void openQr()}>
                QR แบบสอบถาม
              </Button>
              <Button size="small" startIcon={<RefreshIcon />} onClick={() => void loadRoster(picked)}>
                รีเฟรช
              </Button>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={rows.length === 0 ? 0 : (arrived.length / rows.length) * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          {notice && <Alert severity="info" sx={{ mb: 1.5, borderRadius: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

          {/* Only offered once somebody has actually been ticked in. Zero
              check-ins means the round was never run through this screen, NOT
              that nobody came — closing it off then would take away a whole
              round's certificates. */}
          {canClose && arrived.length > 0 && missing.length > 0 && (
            <Alert
              severity="warning"
              sx={{ mb: 1.5, borderRadius: 2 }}
              action={
                <Button
                  size="small" color="inherit" disabled={closing}
                  onClick={() => void closeRound()}
                  startIcon={closing ? <CircularProgress size={14} color="inherit" /> : <AbsentIcon />}
                >
                  ทำเครื่องหมายว่าไม่มา
                </Button>
              }
            >
              ยังไม่ได้เช็คอิน {missing.length} คน
            </Alert>
          )}

          <ToggleButtonGroup
            exclusive size="small" fullWidth value={show}
            onChange={(_, v) => v && setShow(v)}
            sx={{ mb: 1 }}
          >
            <ToggleButton value="missing">ยังไม่มา ({missing.length + marked.length})</ToggleButton>
            <ToggleButton value="all">ทั้งหมด ({rows.length})</ToggleButton>
          </ToggleButtonGroup>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
          ) : listed.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
              {show === 'missing' ? 'มาครบทุกคนแล้ว' : 'ไม่มีรายชื่อในรอบนี้'}
            </Typography>
          ) : (
            <List dense disablePadding sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {listed.map(r => (
                <ListItemButton
                  key={r.id}
                  onClick={() => onPick(r.qr_token)}
                  sx={{ borderRadius: 2, mb: 0.5, bgcolor: r.ticks > 0 ? 'rgba(46,125,50,0.06)' : undefined }}
                >
                  <ListItemText
                    primary={r.who || `#${r.id}`}
                    secondary={`#${r.id}`}
                    primaryTypographyProps={{ fontWeight: 700 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  {r.status === 'no_show' ? (
                    <Chip size="small" label="ไม่มาตามนัด" sx={{ fontWeight: 700, bgcolor: 'rgba(97,97,97,0.12)', color: '#616161' }} />
                  ) : r.ticks > 0 ? (
                    <ArrivedIcon fontSize="small" sx={{ color: '#2e7d32' }} />
                  ) : null}
                </ListItemButton>
              ))}
            </List>
          )}

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            กดที่ชื่อเพื่อเปิดเหมือนสแกน QR — ใช้ตอนมือถือลูกค้าเปิด QR ไม่ได้
          </Typography>
        </>
      )}

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>QR แบบสอบถามของรอบนี้</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            พิมพ์แผ่นเดียววางไว้หน้างาน ทุกคนสแกนอันเดียวกันได้ — คำตอบจะผูกกับรอบนี้ให้เอง
            และถ้าผู้ปกครองล็อกอินอยู่ ระบบจะรู้ด้วยว่าเป็นการจองไหน ไม่ต้องเดาจากชื่อ
          </Typography>

          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>ชุดแบบฟอร์มที่ให้ทำ</InputLabel>
            <Select
              label="ชุดแบบฟอร์มที่ให้ทำ" value={sessionId}
              onChange={e => { setSessionId(Number(e.target.value)); setToken(''); }}
            >
              {sessions.length === 0 && <MenuItem value="" disabled>ยังไม่มีชุดแบบฟอร์มที่เปิดใช้งาน</MenuItem>}
              {sessions.map(s2 => <MenuItem key={s2.id} value={s2.id}>{s2.name}</MenuItem>)}
            </Select>
          </FormControl>

          {!token ? (
            <Button
              fullWidth variant="contained" disabled={!sessionId || making}
              onClick={() => void makeLink()}
              startIcon={making ? <CircularProgress size={14} color="inherit" /> : <QrIcon />}
            >
              สร้าง QR ของรอบนี้
            </Button>
          ) : (
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{ p: 2, bgcolor: '#fff', display: 'inline-block', borderRadius: 2, border: '1px solid #eef0f3' }}>
                <QRCodeSVG value={roundUrl} size={200} level="M" />
              </Box>
              <TextField
                fullWidth size="small" value={roundUrl} sx={{ mt: 2 }}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
                onFocus={e => e.target.select()}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  size="small" fullWidth startIcon={<CopyIcon />}
                  onClick={() => void copyText(roundUrl).then(done => setNotice(done ? 'คัดลอกลิงก์แล้ว' : roundUrl))}
                >
                  คัดลอกลิงก์
                </Button>
                <Button size="small" fullWidth startIcon={<PrintIcon />} onClick={() => window.print()}>
                  พิมพ์
                </Button>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrOpen(false)}>ปิด</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default CheckinRoundPanel;
