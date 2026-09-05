import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, MenuItem, Select, FormControl, InputLabel,
  TextField, Chip, LinearProgress, Alert, List, ListItemButton, ListItemText,
  CircularProgress, ToggleButton, ToggleButtonGroup, InputAdornment, IconButton, Tooltip,
} from '@mui/material';
import {
  EventBusy as AbsentIcon, CheckCircle as ArrivedIcon, Refresh as RefreshIcon,
  QrCode2 as QrIcon, ContentCopy as CopyIcon, Print as PrintIcon,
  Search as SearchIcon, Close as CloseIcon,
  ChevronLeft as PrevIcon, ChevronRight as NextIcon,
} from '@mui/icons-material';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { AxiosInstance } from 'axios';
import { API_URL, CONSUMER_APP_URL } from '../config';
import { copyText } from '../utils/clipboard';

const API_BASE = `${API_URL}/api/v1/admin`;

interface TeamRow { label: string; booked: number; arrived: number; no_show: number; missing: number }
interface TeamField { field_key: string; label: string; teams: TeamRow[] }

/**
 * How each team in the round is doing, at a glance.
 *
 * Counted in people, the unit a door works in — a family of three arriving is
 * three through it. That is deliberately NOT the unit the capacity board uses
 * (one checkout is one entry in a team), which is why no ceiling is shown here:
 * "5/6" where the 5 counts people and the 6 counts checkouts would be a number
 * nobody can act on.
 */
function TeamSummary({ fields }: { fields: TeamField[] }) {
  if (fields.length === 0) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      {fields.map(f => (
        <Box key={f.field_key} sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
            {f.label}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              // Fills whatever width the panel has, so this reads on a laptop
              // at a desk and on a phone held at the door.
              gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
              gap: 1,
              mt: 0.5,
            }}
          >
            {f.teams.map(t => {
              const done = t.booked > 0 && t.missing === 0;
              return (
                <Paper
                  key={t.label}
                  variant="outlined"
                  sx={{
                    p: 1, borderRadius: 2,
                    // A finished team goes quiet and an unfinished one stays
                    // loud: the whole job of this box is to say where to look.
                    // Literal tints: the semantic palettes carry light/main/dark
                    // and no numeric shades, so success.50 resolves to nothing
                    // and the card would silently lose its background.
                    borderColor: done ? '#a5d6a7' : t.missing > 0 ? '#ffcc80' : 'divider',
                    bgcolor: done ? '#f1f8f2' : t.missing > 0 ? '#fff8ef' : 'transparent',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', lineHeight: 1.3 }} noWrap title={t.label}>
                    {t.label}
                  </Typography>
                  <Stack direction="row" alignItems="baseline" spacing={0.5}>
                    <Typography sx={{ fontWeight: 900, fontSize: 20, lineHeight: 1.2 }}>{t.arrived}</Typography>
                    <Typography variant="caption" color="text.secondary">/ {t.booked} คน</Typography>
                  </Stack>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 800, color: done ? 'success.main' : t.missing > 0 ? 'warning.dark' : 'text.disabled' }}
                  >
                    {t.booked === 0 ? 'ไม่มีคนจอง' : done ? 'มาครบแล้ว' : `ขาด ${t.missing} คน`}
                  </Typography>
                  {/* Only when there are any. A permanent "ไม่มา 0" on every
                      card is noise on a screen meant to be read at a glance. */}
                  {t.no_show > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>
                      ทำเครื่องหมายไม่มา {t.no_show}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

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
  full_name: string | null;
  nickname: string | null;
  parent_phone: string | null;
  parent_name: string | null;
  ticks: number;
}

/** Ten fits a phone without scrolling the page away from the scanner. */
const PER_PAGE = 10;

const todayInBangkok = () => {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
};

const CheckinRoundPanel = ({ client, onPick, canClose, refreshKey, hidden, children }: {
  client: AxiosInstance;
  /** Tapping a name loads that booking through the same path a scan uses. */
  onPick: (qrToken: string) => void;
  /** Closing a round off is CRM-only — a shared PIN link does not get it. */
  canClose: boolean;
  /** Bumped by the parent after a tick, so the roster reflects it. */
  refreshKey: number;
  /**
   * The scanner sits in the left column of this panel rather than beside it.
   *
   * It has to stay mounted whatever else the screen does — html5-qrcode's
   * pause/resume act on one exact DOM element — so it is passed in as children
   * and rendered unconditionally, while everything around it hides.
   */
  hidden?: boolean;
  children?: React.ReactNode;
}) => {
  const [date, setDate] = useState(todayInBangkok());
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [picked, setPicked] = useState<RoundOption | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [teamFields, setTeamFields] = useState<TeamField[]>([]);
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
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    client.get(`${API_BASE}/checkin/rounds`, { params: { date } })
      .then(({ data }) => setRounds(data.rounds || []))
      .catch(() => setRounds([]));
    setPicked(null);
    setRoster(null);
  }, [client, date]);

  const loadRoster = useCallback(async (r: RoundOption | null) => {
    if (!r) { setRoster(null); setTeamFields([]); return; }
    setLoading(true);
    const params = { course_id: r.course_id, slot_date: r.slot_date, slot_start_time: r.slot_start_time };
    try {
      // Both in one go, and refreshed together on every scan — a summary that
      // lags the roster by one tick is worse than none, because it is the
      // number someone reads out loud.
      const [attendance, teams] = await Promise.all([
        client.get(`${API_BASE}/checkin/round-attendance`, { params }),
        // A course with no team question simply returns nothing, and the
        // summary renders nothing — never an empty box.
        client.get(`${API_BASE}/checkin/round-teams`, { params }).catch(() => ({ data: { fields: [] } })),
      ]);
      setRoster(attendance.data.success ? attendance.data.bookings : []);
      setTeamFields(teams.data?.fields || []);
    } catch {
      setRoster([]);
      setTeamFields([]);
    } finally { setLoading(false); }
  }, [client]);

  useEffect(() => { void loadRoster(picked); }, [picked, loadRoster, refreshKey]);
  useEffect(() => { setPage(1); }, [query, show, picked]);

  const rows = roster || [];
  const arrived = rows.filter(r => r.ticks > 0);
  const missing = rows.filter(r => r.ticks === 0 && r.status !== 'no_show');
  const marked = rows.filter(r => r.status === 'no_show');

  // Searched over everything a person at a door might be asked for: either
  // name, the parent's, the phone, or the booking number they were read out.
  const q = query.trim().toLowerCase();
  const matches = (r: RosterRow) => !q || [
    r.who, r.full_name, r.nickname, r.parent_name, r.parent_phone, String(r.id),
  ].some(v => String(v ?? '').toLowerCase().includes(q));

  const listed = (show === 'missing' ? [...missing, ...marked] : rows).filter(matches);
  const pageCount = Math.max(1, Math.ceil(listed.length / PER_PAGE));
  const pageRows = listed.slice((Math.min(page, pageCount) - 1) * PER_PAGE, Math.min(page, pageCount) * PER_PAGE);

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
    <Box>
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: hidden ? 'none' : 'block' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
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
    </Paper>

    {/* Scanner on the left, who is still missing on the right — the two things
        someone at a door looks at alternately, so stacking them meant scrolling
        between every family. */}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
      <Box sx={{ width: { xs: '100%', md: 480 }, flexShrink: 0 }}>{children}</Box>

      <Paper
        variant="outlined"
        sx={{ p: 2, borderRadius: 3, flex: 1, minWidth: 0, width: '100%', display: hidden || !picked ? 'none' : 'block' }}
      >
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
              <Tooltip title="รีเฟรชรายชื่อ">
                <IconButton size="small" onClick={() => void loadRoster(picked)}><RefreshIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={rows.length === 0 ? 0 : (arrived.length / rows.length) * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          <TeamSummary fields={teamFields} />

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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
            <ToggleButtonGroup
              exclusive size="small" value={show}
              onChange={(_, v) => v && setShow(v)}
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton value="missing" sx={{ px: 1.5 }}>ยังไม่มา ({missing.length + marked.length})</ToggleButton>
              <ToggleButton value="all" sx={{ px: 1.5 }}>ทั้งหมด ({rows.length})</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              size="small" fullWidth value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ · เบอร์โทร · เลขที่จอง"
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>,
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQuery('')}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
                  </InputAdornment>
                ) : undefined,
              }}
            />
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
          ) : listed.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
              {q ? 'ไม่พบชื่อที่ค้นหา' : show === 'missing' ? 'มาครบทุกคนแล้ว' : 'ไม่มีรายชื่อในรอบนี้'}
            </Typography>
          ) : (
            <>
              <List dense disablePadding>
                {pageRows.map(r => {
                  // Nickname first because it is what a family answers to, with
                  // the full name beside it: two children called เป้ยเป้ย in one
                  // round is the ordinary case, not the unlucky one.
                  const full = (r.full_name || '').trim();
                  const nick = (r.nickname || '').trim();
                  return (
                    <ListItemButton
                      key={r.id}
                      onClick={() => onPick(r.qr_token)}
                      sx={{ borderRadius: 2, mb: 0.5, alignItems: 'flex-start', bgcolor: r.ticks > 0 ? 'rgba(46,125,50,0.06)' : undefined }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
                            <Typography component="span" sx={{ fontWeight: 800 }}>{nick || full || `#${r.id}`}</Typography>
                            {nick && full && full !== nick && (
                              <Typography component="span" variant="caption" color="text.secondary">{full}</Typography>
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            #{r.id}
                            {r.parent_phone ? ` · ${r.parent_phone}` : ''}
                            {r.parent_name ? ` · ${r.parent_name}` : ''}
                          </Typography>
                        }
                        secondaryTypographyProps={{ component: 'div' }}
                      />
                      {r.status === 'no_show' ? (
                        <Chip size="small" label="ไม่มาตามนัด" sx={{ mt: 0.5, fontWeight: 700, bgcolor: 'rgba(97,97,97,0.12)', color: '#616161' }} />
                      ) : r.ticks > 0 ? (
                        <ArrivedIcon fontSize="small" sx={{ mt: 0.75, color: '#2e7d32' }} />
                      ) : null}
                    </ListItemButton>
                  );
                })}
              </List>
              {pageCount > 1 && (
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1 }}>
                  <IconButton size="small" disabled={page <= 1} onClick={() => setPage(p2 => p2 - 1)}>
                    <PrevIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {Math.min(page, pageCount)} / {pageCount}
                  </Typography>
                  <IconButton size="small" disabled={page >= pageCount} onClick={() => setPage(p2 => p2 + 1)}>
                    <NextIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )}
            </>
          )}

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            กดที่ชื่อเพื่อเปิดเหมือนสแกน QR — ใช้ตอนมือถือลูกค้าเปิด QR ไม่ได้
          </Typography>
        </>
        )}
      </Paper>
    </Stack>

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
    </Box>
  );
};

export default CheckinRoundPanel;
