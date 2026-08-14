import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import {
  Box, Typography, Paper, Grid, Card, CardContent, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, LinearProgress, Stack, Collapse, IconButton, Alert,
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

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/analytics/booking-capacity`, { params: { days } })
      .then(res => { if (res.data.success) setData(res.data); })
      .finally(() => setLoading(false));
  }, [days]);

  const totals = data?.totals;
  const intakeDelta = totals ? totals.bookedLast7Days - totals.bookedPrev7Days : 0;

  // Only rounds that still exist are worth showing; a calendar with no upcoming
  // rounds in the window is noise on a monitoring screen.
  const calendars = (data?.calendars ?? []).filter((c: any) => c.roundCount > 0);
  const emptyCalendars = (data?.calendars ?? []).filter((c: any) => c.roundCount === 0);

  const teamsSoon = (data?.teams ?? [])
    .filter((t: any) => t.capacity > 0)
    .sort((a: any, b: any) => String(a.round).localeCompare(String(b.round)) || a.remaining - b.remaining)
    .slice(0, 30);

  return (
    <Box>
      <DashboardTabs />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>ภาพรวมการจอง</Typography>
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
                value={fmt(totals.seats)}
                sub={<Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {fmt(totals.rounds)} รอบ · {fmt(totals.calendars)} ปฏิทิน
                </Typography>}
                icon={<SeatIcon />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatTile
                label="จองแล้ว"
                value={fmt(totals.booked)}
                sub={<FillMeter booked={totals.booked} capacity={totals.seats} />}
                icon={<BookedIcon />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatTile
                label="ที่นั่งคงเหลือ"
                value={fmt(totals.remaining)}
                sub={<Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  รอบที่เต็มแล้ว {fmt(totals.fullRounds)} รอบ
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

          {/* Two lists that ask for a decision, before the full table that
              merely reports. Both carry a word as well as a colour. */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <CriticalIcon sx={{ color: STATUS.critical, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800 }}>รอบที่ใกล้เต็ม (เหลือ ≤ 20%)</Typography>
                </Stack>
                {data.nearlyFull.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">ยังไม่มีรอบไหนใกล้เต็ม</Typography>
                ) : (
                  <Stack spacing={1}>
                    {data.nearlyFull.map((r: any, i: number) => (
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
                {data.quietAndSoon.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">ไม่มีรอบที่ต้องเร่งประชาสัมพันธ์</Typography>
                ) : (
                  <Stack spacing={1}>
                    {data.quietAndSoon.map((r: any, i: number) => (
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
                นับตามปฏิทิน ไม่ใช่ตามคลาส — คลาสหลายรายการที่ใช้ปฏิทินเดียวกันแบ่งที่นั่งชุดเดียวกัน กดแถวเพื่อดูรายรอบ
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
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.calendarName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {c.courses.map((x: any) => x.name).join(' · ')}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {fmt(c.roundCount)}
                          {c.fullRounds > 0 && (
                            <Chip size="small" label={`เต็ม ${c.fullRounds}`} sx={{ ml: 0.5, height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(c.seats)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(c.booked)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{fmt(c.remaining)}</TableCell>
                        <TableCell><FillMeter booked={c.booked} capacity={c.seats} /></TableCell>
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
                                  {c.rounds.map((r: any, i: number) => (
                                    <TableRow key={i}>
                                      <TableCell>
                                        {formatRound(r.date, r.startTime, r.endTime)}
                                        {r.label && <Chip size="small" label={r.label} sx={{ ml: 1, height: 20 }} />}
                                      </TableCell>
                                      <TableCell align="right">{fmt(r.capacity)}</TableCell>
                                      <TableCell align="right">{fmt(r.booked)}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 800 }}>
                                        {r.remaining === 0
                                          ? <Chip size="small" label="เต็มแล้ว" sx={{ height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                                          : fmt(r.remaining)}
                                      </TableCell>
                                      <TableCell><FillMeter booked={r.booked} capacity={r.capacity} /></TableCell>
                                    </TableRow>
                                  ))}
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

          {teamsSoon.length > 0 && (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TeamIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                  <Typography sx={{ fontWeight: 800 }}>ทีมคงเหลือรายรอบ</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  โควตาทีมนับใหม่ทุกรอบ ตัวเลขนี้จึงแยกตามรอบ ไม่ได้รวมทั้งเดือน
                </Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>รอบ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>คลาส</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>ทีม</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>เต็ม</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>เหลือ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>สัดส่วน</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {teamsSoon.map((t: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{formatRound(String(t.round).slice(0, 10), String(t.round).slice(11, 16))}</TableCell>
                        <TableCell>{t.courseName}</TableCell>
                        <TableCell>{t.teamLabel}</TableCell>
                        <TableCell align="right">{fmt(t.booked)}/{fmt(t.capacity)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>
                          {t.remaining === 0
                            ? <Chip size="small" label="เต็มแล้ว" sx={{ height: 20, fontWeight: 800, bgcolor: '#fdecec', color: STATUS.critical }} />
                            : fmt(t.remaining)}
                        </TableCell>
                        <TableCell><FillMeter booked={t.booked} capacity={t.capacity} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default DashboardBookings;
