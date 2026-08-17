import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import { useStickyState } from '../utils/stickyState';
import {
  Box, Typography, Paper, Grid, Card, CardContent, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, LinearProgress, Stack, Collapse, IconButton, Alert,
  Select, MenuItem, Checkbox, ListItemText, FormControl, InputLabel, Button, FormControlLabel,
} from '@mui/material';
import {
  EventSeat as SeatIcon,
  HowToReg as BookedIcon,
  EventAvailable as RemainingIcon,
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
  Warning as WarningIcon,
  ErrorOutline as CriticalIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  Groups as TeamIcon,
  Star as StarIcon,
  StarBorder as StarOutlineIcon,
} from '@mui/icons-material';
import DashboardTabs from '../components/DashboardTabs';

const API_BASE = `${API_URL}/api/v1/admin`;

// Fill is one measure of one kind — how full a thing is — so it gets ONE hue,
// light to dark, never a rainbow of thresholds. The status colours below are a
// separate, reserved set and always ship with a word beside them, because two
// of them sit under 3:1 on a light surface and must never carry meaning alone.
const FILL_HUE = '#3987e5';
const FILL_TRACK = '#e8eef7';
const STATUS = {
  critical: '#d03b3b',
  warning: '#fab219',
  good: '#0ca30c',
};

const fmt = (n: number) => n.toLocaleString('th-TH');

const SeatCount = ({ total, invite }: { total: number; invite?: number }) => (
  <Stack direction="row" spacing={0.5} alignItems="baseline" justifyContent="flex-end">
    <span>{fmt(total)}</span>
    {!!invite && (
      <Typography
        component="span"
        variant="caption"
        sx={{ fontWeight: 800, color: '#8a6100' }}
        title={`รวมที่นั่ง VIP/เชิญพิเศษ ${fmt(invite)} ที่`}
      >
        (VIP {fmt(invite)})
      </Typography>
    )}
  </Stack>
);
const pct = (n: number) => `${Math.round(n * 100)}%`;

const formatRound = (date: string, start?: string, end?: string) => {
  const d = new Date(`${date}T00:00:00`);
  const day = isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', weekday: 'short' });
  return start ? `${day} · ${start}${end ? `–${end}` : ''}` : day;
};

/** Headline numbers. No colour on the value — the label carries the meaning. */
const StatTile = ({ label, value, sub, icon }: {
  label: string; value: string; sub?: React.ReactNode; icon: React.ReactNode;
}) => (
  <Card sx={{ height: '100%', borderRadius: 4, boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)' }}>
    <CardContent>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: '#f1f5f9', color: '#475569', display: 'flex' }}>{icon}</Box>
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
      </Stack>
      <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.1 }}>{value}</Typography>
      {sub && <Box sx={{ mt: 0.75 }}>{sub}</Box>}
    </CardContent>
  </Card>
);

/** A proportion bar with its number written beside it, never colour alone. */
/**
 * A row's seats, read either way.
 *
 * Invite seats are extra: a round of 24 with an allowance of 18 seats 42 people
 * in total, and the 18 never appear in public availability. Counting them as
 * registered therefore adds to both sides — the room is bigger by the seats
 * being held and fuller by the same number.
 *
 * The catch is that some of that allowance may already have been used. A family
 * who booked through the invite link is in `booked` already, and adding the
 * whole allowance on top counts them twice — which showed up as a round more
 * than full, with a meter past 100%. Only the part of the allowance nobody has
 * taken yet is added, so the two readings stay arithmetic.
 */
const readSeats = (
  row: { seats?: number; capacity?: number; booked: number; remaining: number; inviteSeats?: number; inviteCapacity?: number },
  vipAsBooked: boolean,
) => {
  const seats = row.seats ?? row.capacity ?? 0;
  const invite = row.inviteSeats ?? row.inviteCapacity ?? 0;
  if (!vipAsBooked || invite === 0) return { seats, booked: row.booked, remaining: row.remaining, invite };

  // Anything booked past the public capacity can only have come through an
  // invite link, since that is the one path allowed to exceed it.
  const inviteUsed = Math.min(invite, Math.max(0, row.booked - seats));
  const stillHeld = invite - inviteUsed;
  const total = seats + invite;
  const booked = row.booked + stillHeld;
  return { seats: total, booked, remaining: Math.max(0, total - booked), invite };
};

const FillMeter = ({ booked, capacity }: { booked: number; capacity: number }) => {
  const rate = capacity > 0 ? booked / capacity : 0;
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 180 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, rate * 100)}
        sx={{
          flex: 1, height: 8, borderRadius: 999, bgcolor: FILL_TRACK,
          '& .MuiLinearProgress-bar': { bgcolor: FILL_HUE, borderRadius: 999 },
        }}
      />
      <Typography variant="caption" sx={{ fontWeight: 800, minWidth: 92, color: 'text.secondary' }}>
        {fmt(booked)}/{fmt(capacity)} · {pct(rate)}
      </Typography>
    </Stack>
  );
};

const DashboardBookings = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  // Empty means everything. A filter that starts with nothing selected would
  // open the screen on an empty dashboard, which reads as broken rather than
  // as unfiltered.
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  // Invite seats are held for people who have been asked but have not booked
  // yet. Off, the numbers answer "what can still be sold"; on, they answer
  // "how full is the room going to be" — the question staff have on the day.
  const [vipAsBooked, setVipAsBooked] = useStickyState('dashboardBookings.vipAsBooked', false);
  // Starred rounds and calendars, keyed the same way the server stores them.
  // Kept as a Set of "kind:key" so a lookup while rendering a table row is a
  // hash hit rather than a scan of the list.
  const [watched, setWatched] = useState<Set<string>>(new Set());

  const roundKeyOf = (calendarId: number, date: string, startTime: string) => `${calendarId}|${date} ${startTime}`;
  const isWatched = (kind: 'round' | 'calendar', key: string) => watched.has(`${kind}:${key}`);

  const toggleWatch = async (kind: 'round' | 'calendar', key: string) => {
    // Flipped before the request answers: a star that waits on the network
    // feels broken, and the only cost of being wrong is a star that snaps back.
    const id = `${kind}:${key}`;
    setWatched(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    try {
      await axios.post(`${API_BASE}/analytics/booking-watchlist`, { kind, targetKey: key });
    } catch {
      setWatched(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  useEffect(() => {
    axios.get(`${API_BASE}/analytics/booking-watchlist`)
      .then(res => {
        if (!res.data.success) return;
        setWatched(new Set(res.data.watchlist.map((w: any) => `${w.kind}:${w.target_key}`)));
      })
      .catch(() => { /* an unreachable watchlist just means no stars, not a broken page */ });
  }, []);

  // The key a team row carries is the round it was booked for; the round rows
  // are built from the calendar, so the two are matched on the same string.
  const teamsForRound = (courseIds: number[], date: string, startTime: string) =>
    (data?.teams ?? []).filter((t: any) =>
      courseIds.includes(t.courseId) && String(t.round).slice(0, 16) === `${date} ${startTime}`);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/analytics/booking-capacity`, { params: { days } })
      .then(res => { if (res.data.success) setData(res.data); })
      .finally(() => setLoading(false));
  }, [days]);

  const totals = data?.totals;
  const intakeDelta = totals ? totals.bookedLast7Days - totals.bookedPrev7Days : 0;

  // Every course that has rounds in this window, for the filter list.
  const courseOptions = React.useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of data?.calendars ?? []) {
      for (const course of c.courses) if (!seen.has(course.id)) seen.set(course.id, course.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [data]);

  const isFiltered = selectedCourseIds.length > 0;
  const matchesFilter = (c: any) => !isFiltered || c.courses.some((x: any) => selectedCourseIds.includes(x.id));

  // Only rounds that still exist are worth showing; a calendar with no upcoming
  // rounds in the window is noise on a monitoring screen.
  const calendars = (data?.calendars ?? []).filter((c: any) => c.roundCount > 0 && matchesFilter(c));
  const emptyCalendars = (data?.calendars ?? []).filter((c: any) => c.roundCount === 0 && matchesFilter(c));

  // Totals follow the filter. Reusing the server's figures while the table
  // below showed a subset would put two different answers to "how many seats"
  // on one screen — the exact failure this dashboard exists to avoid.
  const shown = (data?.calendars ?? []).filter(matchesFilter);
  const view = isFiltered
    ? {
        seats: shown.reduce((n: number, c: any) => n + c.seats, 0),
        booked: shown.reduce((n: number, c: any) => n + c.booked, 0),
        remaining: shown.reduce((n: number, c: any) => n + c.remaining, 0),
        inviteSeats: shown.reduce((n: number, c: any) => n + c.inviteSeats, 0),
        rounds: shown.reduce((n: number, c: any) => n + c.roundCount, 0),
        fullRounds: shown.reduce((n: number, c: any) => n + c.fullRounds, 0),
        calendars: shown.length,
      }
    : totals;
  // Stars are resolved against the rounds that exist right now, so a round
  // that has since been rescheduled simply stops appearing rather than showing
  // a row with nothing behind it.
  const watchedRounds = (data?.calendars ?? []).flatMap((c: any) =>
    c.rounds
      .filter((r: any) => isWatched('round', roundKeyOf(c.calendarId, r.date, r.startTime)))
      .map((r: any) => ({ ...r, calendarName: c.calendarName, key: roundKeyOf(c.calendarId, r.date, r.startTime) })),
  ).sort((a: any, b: any) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const nearlyFull = (data?.nearlyFull ?? []).filter(matchesFilter);
  const quietAndSoon = (data?.quietAndSoon ?? []).filter(matchesFilter);

  return (
    <Box>
      <DashboardTabs />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>ภาพรวมการจอง</Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 260, maxWidth: 360 }}>
          <InputLabel>เฉพาะกิจกรรม/คลาสที่เลือก</InputLabel>
          <Select
            multiple
            value={selectedCourseIds}
            label="เฉพาะกิจกรรม/คลาสที่เลือก"
            onChange={e => setSelectedCourseIds(e.target.value as number[])}
            renderValue={sel => (sel as number[]).length === 0
              ? 'ทั้งหมด'
              : `เลือกไว้ ${(sel as number[]).length} รายการ`}
          >
            {courseOptions.length === 0 && <MenuItem disabled>ไม่มีคลาสที่มีรอบในช่วงนี้</MenuItem>}
            {courseOptions.map(c => (
              <MenuItem key={c.id} value={c.id}>
                <Checkbox size="small" checked={selectedCourseIds.includes(c.id)} />
                <ListItemText primary={c.name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {isFiltered && (
          <Button size="small" onClick={() => setSelectedCourseIds([])} sx={{ fontWeight: 700 }}>ล้างตัวกรอง</Button>
        )}
        <ToggleButtonGroup
          size="small" exclusive value={days}
          onChange={(_, v) => v && setDays(v)}
        >
          <ToggleButton value={7}>7 วัน</ToggleButton>
          <ToggleButton value={30}>30 วัน</ToggleButton>
          <ToggleButton value={60}>60 วัน</ToggleButton>
          <ToggleButton value={90}>90 วัน</ToggleButton>
        </ToggleButtonGroup>
        </Stack>
      </Stack>

      <FormControlLabel
        sx={{ mb: 2 }}
        control={<Checkbox checked={vipAsBooked} onChange={e => setVipAsBooked(e.target.checked)} />}
        label={
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>มุมมองรวมผู้ถูกเชิญ (นับที่นั่ง VIP เป็นลงทะเบียนแล้ว)</Typography>
            <Typography variant="caption" color="text.secondary">
              เปิดไว้เพื่อดูว่าห้องจะเต็มแค่ไหนจริงๆ · ปิดไว้เพื่อดูว่ายังเปิดขายได้อีกเท่าไหร่
            </Typography>
          </Box>
        }
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
      ) : !data ? (
        <Alert severity="error">โหลดข้อมูลไม่สำเร็จ</Alert>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <StatTile
                label={`ที่นั่งทั้งหมด (${days} วันข้างหน้า)`}
                value={fmt(readSeats(view, vipAsBooked).seats)}
                sub={<Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {fmt(view.rounds)} รอบ · {fmt(view.calendars)} ปฏิทิน
                  {!!view.inviteSeats && ` · ${vipAsBooked ? 'นับ' : 'รวม'} VIP ${fmt(view.inviteSeats)} ที่`}
                </Typography>}
                icon={<SeatIcon />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatTile
                label={vipAsBooked ? 'จองแล้ว + เชิญ' : 'จองแล้ว'}
                value={fmt(readSeats(view, vipAsBooked).booked)}
                sub={<FillMeter booked={readSeats(view, vipAsBooked).booked} capacity={readSeats(view, vipAsBooked).seats} />}
                icon={<BookedIcon />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatTile
                label="ที่นั่งคงเหลือ"
                value={fmt(view.remaining)}
                sub={<Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  รอบที่เต็มแล้ว {fmt(view.fullRounds)} รอบ
                </Typography>}
                icon={<RemainingIcon />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatTile
                label="ยอดจองใน 7 วันล่าสุด"
                value={fmt(totals.bookedLast7Days)}
                sub={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {intakeDelta >= 0
                      ? <TrendUpIcon sx={{ fontSize: 16, color: STATUS.good }} />
                      : <TrendDownIcon sx={{ fontSize: 16, color: STATUS.critical }} />}
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                      {intakeDelta >= 0 ? '+' : ''}{fmt(intakeDelta)} เทียบ 7 วันก่อนหน้า ({fmt(totals.bookedPrev7Days)})
                    </Typography>
                  </Stack>
                }
                icon={<TrendUpIcon />}
              />
            </Grid>
          </Grid>

          {watchedRounds.length > 0 && (
            <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <StarIcon sx={{ color: '#f0a500', fontSize: 20 }} />
                <Typography sx={{ fontWeight: 800 }}>รอบที่ติดตาม</Typography>
                <Typography variant="caption" color="text.secondary">— รอบที่อยากให้เต็มที่สุด ดูก่อนใคร</Typography>
              </Stack>
              <Stack spacing={1.25}>
                {watchedRounds.map((r: any, i: number) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <IconButton size="small" onClick={() => toggleWatch('round', r.key)} title="เลิกติดตาม">
                      <StarIcon sx={{ fontSize: 18, color: '#f0a500' }} />
                    </IconButton>
                    <Box sx={{ minWidth: 200, flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.calendarName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatRound(r.date, r.startTime, r.endTime)}
                        {r.daysAway >= 0 ? ` · อีก ${r.daysAway} วัน` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 90 }}>
                      {r.remaining === 0 ? 'เต็มแล้ว' : `เหลือ ${fmt(r.remaining)} ที่`}
                    </Typography>
                    <Box sx={{ minWidth: 220 }}><FillMeter booked={r.booked} capacity={r.capacity} /></Box>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Two lists that ask for a decision, before the full table that
              merely reports. Both carry a word as well as a colour. */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <CriticalIcon sx={{ color: STATUS.critical, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800 }}>รอบที่ใกล้เต็ม (เหลือ ≤ 20%)</Typography>
                </Stack>
                {nearlyFull.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">ยังไม่มีรอบไหนใกล้เต็ม</Typography>
                ) : (
                  <Stack spacing={1}>
                    {nearlyFull.map((r: any, i: number) => (
                      <Stack key={i} direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{r.calendarName}</Typography>
                          <Typography variant="caption" color="text.secondary">{formatRound(r.date, r.startTime, r.endTime)}</Typography>
                        </Box>
                        <Chip
                          size="small" label={`เหลือ ${fmt(r.remaining)} ที่`}
                          sx={{ fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }}
                        />
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <WarningIcon sx={{ color: STATUS.warning, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800 }}>ใกล้ถึงวันแต่ยังว่างเยอะ (ภายใน 7 วัน)</Typography>
                </Stack>
                {quietAndSoon.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">ไม่มีรอบที่ต้องเร่งประชาสัมพันธ์</Typography>
                ) : (
                  <Stack spacing={1}>
                    {quietAndSoon.map((r: any, i: number) => (
                      <Stack key={i} direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{r.calendarName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatRound(r.date, r.startTime, r.endTime)} · อีก {r.daysAway} วัน
                          </Typography>
                        </Box>
                        <Chip
                          size="small" label={`จองแล้ว ${pct(r.fillRate)}`}
                          sx={{ fontWeight: 800, bgcolor: '#fef6e3', color: '#8a6100' }}
                        />
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Grid>
          </Grid>

          <Paper sx={{ borderRadius: 3, mb: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>ที่นั่งตามปฏิทิน</Typography>
              <Typography variant="caption" color="text.secondary">
                นับตามปฏิทิน ไม่ใช่ตามคลาส — คลาสหลายรายการที่ใช้ปฏิทินเดียวกันแบ่งที่นั่งชุดเดียวกัน กดแถวเพื่อดูรายรอบ และกดรอบเพื่อดูทีม
                {isFiltered && ' · เมื่อกรองเฉพาะบางคลาส ปฏิทินที่ใช้ร่วมกับคลาสอื่นจะยังนับที่นั่งของทั้งปฏิทิน เพราะที่นั่งเป็นของรอบ ไม่ใช่ของคลาส'}
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={40} />
                    <TableCell sx={{ fontWeight: 800 }}>ปฏิทิน / คลาสที่ใช้ร่วมกัน</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>รอบ</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>ที่นั่ง</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>จองแล้ว</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>เหลือ</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>อัตราการจอง</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {calendars.map((c: any) => (
                    <React.Fragment key={c.calendarId}>
                      <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === c.calendarId ? null : c.calendarId)}>
                        <TableCell>
                          <IconButton size="small">{expanded === c.calendarId ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}</IconButton>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="flex-start">
                            <IconButton
                              size="small"
                              sx={{ p: 0.25, mt: 0.25 }}
                              title={isWatched('calendar', String(c.calendarId)) ? 'เลิกติดตามคลาสนี้' : 'ติดตามคลาสนี้'}
                              onClick={e => { e.stopPropagation(); toggleWatch('calendar', String(c.calendarId)); }}
                            >
                              {isWatched('calendar', String(c.calendarId))
                                ? <StarIcon sx={{ fontSize: 18, color: '#f0a500' }} />
                                : <StarOutlineIcon sx={{ fontSize: 18, color: '#cbd5e1' }} />}
                            </IconButton>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.calendarName}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {c.courses.map((x: any) => x.name).join(' · ')}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          {fmt(c.roundCount)}
                          {c.fullRounds > 0 && (
                            <Chip size="small" label={`เต็ม ${c.fullRounds}`} sx={{ ml: 0.5, height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          <SeatCount total={readSeats(c, vipAsBooked).seats} invite={vipAsBooked ? 0 : c.inviteSeats} />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(readSeats(c, vipAsBooked).booked)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{fmt(readSeats(c, vipAsBooked).remaining)}</TableCell>
                        <TableCell><FillMeter booked={readSeats(c, vipAsBooked).booked} capacity={readSeats(c, vipAsBooked).seats} /></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                          <Collapse in={expanded === c.calendarId} unmountOnExit>
                            <Box sx={{ px: 3, py: 2, bgcolor: '#fafbfc' }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 800 }}>รอบ</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800 }}>ที่นั่ง</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800 }}>จองแล้ว</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800 }}>เหลือ</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>อัตราการจอง</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {c.rounds.map((r: any, i: number) => {
                                    const roundKey = `${c.calendarId}|${r.date} ${r.startTime}`;
                                    const teams = teamsForRound(c.courses.map((x: any) => x.id), r.date, r.startTime);
                                    const roundOpen = expandedRound === roundKey;
                                    return (
                                    <React.Fragment key={i}>
                                    <TableRow
                                      hover={teams.length > 0}
                                      sx={{ cursor: teams.length > 0 ? 'pointer' : 'default' }}
                                      onClick={() => teams.length > 0 && setExpandedRound(roundOpen ? null : roundKey)}
                                    >
                                      <TableCell>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                          {/* Only rounds that have teams open, and the arrow is the
                                              only thing that says so — an arrow on every row would
                                              promise a level that is not there. */}
                                          {teams.length > 0 && (
                                            <IconButton size="small" sx={{ p: 0.25 }}>
                                              {roundOpen ? <CollapseIcon sx={{ fontSize: 16 }} /> : <ExpandIcon sx={{ fontSize: 16 }} />}
                                            </IconButton>
                                          )}
                                          <IconButton
                                            size="small"
                                            sx={{ p: 0.25 }}
                                            title={isWatched('round', roundKey) ? 'เลิกติดตามรอบนี้' : 'ติดตามรอบนี้'}
                                            onClick={e => { e.stopPropagation(); toggleWatch('round', roundKey); }}
                                          >
                                            {isWatched('round', roundKey)
                                              ? <StarIcon sx={{ fontSize: 16, color: '#f0a500' }} />
                                              : <StarOutlineIcon sx={{ fontSize: 16, color: '#cbd5e1' }} />}
                                          </IconButton>
                                          <span>{formatRound(r.date, r.startTime, r.endTime)}</span>
                                          {r.label && <Chip size="small" label={r.label} sx={{ height: 20 }} />}
                                          {teams.length > 0 && (
                                            <Chip
                                              size="small"
                                              icon={<TeamIcon sx={{ fontSize: 14 }} />}
                                              label={`${teams.filter((t: any) => t.remaining > 0).length}/${teams.length} ทีมยังว่าง`}
                                              sx={{ height: 20, fontWeight: 700 }}
                                            />
                                          )}
                                        </Stack>
                                      </TableCell>
                                      <TableCell align="right">
                                        <SeatCount total={readSeats(r, vipAsBooked).seats} invite={vipAsBooked ? 0 : r.inviteCapacity} />
                                      </TableCell>
                                      <TableCell align="right">{fmt(readSeats(r, vipAsBooked).booked)}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 800 }}>
                                        {r.remaining === 0
                                          ? <Chip size="small" label="เต็มแล้ว" sx={{ height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                                          : fmt(readSeats(r, vipAsBooked).remaining)}
                                      </TableCell>
                                      <TableCell><FillMeter booked={readSeats(r, vipAsBooked).booked} capacity={readSeats(r, vipAsBooked).seats} /></TableCell>
                                    </TableRow>
                                    {teams.length > 0 && (
                                      <TableRow>
                                        <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                                          <Collapse in={roundOpen} unmountOnExit>
                                            <Box sx={{ px: 2, py: 1.5, bgcolor: '#f2f5f8' }}>
                                              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                                                ทีมในรอบนี้ — โควตานับใหม่ทุกรอบ
                                              </Typography>
                                              <Table size="small" sx={{ mt: 0.5 }}>
                                                <TableBody>
                                                  {teams.map((t: any, k: number) => (
                                                    <TableRow key={k}>
                                                      <TableCell sx={{ border: 0, py: 0.5 }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.teamLabel}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{t.courseName} · {t.fieldLabel}</Typography>
                                                      </TableCell>
                                                      <TableCell align="right" sx={{ border: 0, py: 0.5, width: 110 }}>
                                                        {fmt(t.booked)}/{fmt(t.capacity)}
                                                      </TableCell>
                                                      <TableCell align="right" sx={{ border: 0, py: 0.5, width: 110, fontWeight: 800 }}>
                                                        {/* A team can end up holding more than its cap — a cap
                                                            edited after people booked, or a booking that got past
                                                            the check. Calling that "เต็มแล้ว" would hide it. */}
                                                        {t.booked > t.capacity
                                                          ? <Chip size="small" label={`เกินโควตา ${fmt(t.booked - t.capacity)}`} sx={{ height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                                                          : t.remaining === 0
                                                            ? <Chip size="small" label="เต็มแล้ว" sx={{ height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                                                            : `เหลือ ${fmt(t.remaining)}`}
                                                      </TableCell>
                                                      <TableCell sx={{ border: 0, py: 0.5, width: 220 }}>
                                                        <FillMeter booked={t.booked} capacity={t.capacity} />
                                                      </TableCell>
                                                    </TableRow>
                                                  ))}
                                                </TableBody>
                                              </Table>
                                            </Box>
                                          </Collapse>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                    </React.Fragment>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {emptyCalendars.length > 0 && (
              <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid #eef0f3' }}>
                <Typography variant="caption" color="text.secondary">
                  ไม่มีรอบใน {days} วันข้างหน้า: {emptyCalendars.map((c: any) => c.calendarName).join(' · ')}
                </Typography>
              </Box>
            )}
          </Paper>

        </>
      )}
    </Box>
  );
};

export default DashboardBookings;
