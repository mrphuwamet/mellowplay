import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Skeleton,
  TextField, FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Button, Alert,
} from '@mui/material';
import {
  Link as TagIcon,
  HowToReg as RegistrationsIcon,
  Groups as OrganicIcon,
  Sell as TaggedIcon,
  FileDownload as ExportIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { API_URL } from '../config';
import DashboardTabs from '../components/DashboardTabs';
import { downloadCsv } from '../utils/csvExport';

const API_BASE = `${API_URL}/api/v1/admin`;
const NO_TAG_LABEL = '(ไม่มี tag)';

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

interface Branch { id: number; name: string; }
interface SummaryRow { tag: string; booking_count: number; unique_children: number; first_seen: string; last_seen: string; }
interface TrendRow { date: string; tag: string; booking_count: number; }
interface ByCourseRow { tag: string; course_name: string; booking_count: number; unique_children: number; }

const StatCard = ({
  title, value, icon, color, loading,
}: { title: string; value: string; icon: React.ReactNode; color: string; loading: boolean }) => {
  if (loading) return <Skeleton variant="rounded" height={110} sx={{ borderRadius: 4 }} />;
  return (
    <Card sx={{ height: '100%', boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Box sx={{
            p: 1.5, borderRadius: 3, bgcolor: `${color}.main`, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>{title}</Typography>
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>{value}</Typography>
      </CardContent>
    </Card>
  );
};

const SectionPaper = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none', height: '100%' }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>{title}</Typography>
    {children}
  </Paper>
);

const TagAttributionDashboard = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState('all');
  const [dateFrom, setDateFrom] = useState(daysAgoISO(29));
  const [dateTo, setDateTo] = useState(todayISO());

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [byCourse, setByCourse] = useState<ByCourseRow[]>([]);
  const [peopleTag, setPeopleTag] = useState('');
  const [downloadingPeople, setDownloadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/branches`)
      .then((res) => { if (res.data?.success) setBranches(res.data.branches ?? []); })
      .catch(() => {});
  }, []);

  const branchId = branch === 'all' ? undefined : branch;

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/reports/tag-attribution`, {
      params: { startDate: dateFrom, endDate: dateTo, ...(branchId ? { branchId } : {}) },
    }).then((res) => {
      if (res.data.success) { setSummary(res.data.summary); setTrend(res.data.trend); setByCourse(res.data.byCourse ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [dateFrom, dateTo, branchId]);

  const totalRegistrations = summary.reduce((sum, r) => sum + r.booking_count, 0);
  const noTagRow = summary.find((r) => r.tag === NO_TAG_LABEL);
  const organicCount = noTagRow?.booking_count ?? 0;
  const taggedCount = totalRegistrations - organicCount;
  const distinctTags = summary.filter((r) => r.tag !== NO_TAG_LABEL).length;

  // Everything else on the chart is per-tag; organic (no tag) is broken out
  // as its own bar so it reads as a baseline rather than just another tag.
  const trendChartData = useMemo(() => {
    const byDate = new Map<string, { label: string; tagged: number; organic: number }>();
    trend.forEach((r) => {
      const label = new Date(r.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      const entry = byDate.get(r.date) ?? { label, tagged: 0, organic: 0 };
      if (r.tag === NO_TAG_LABEL) entry.organic += r.booking_count;
      else entry.tagged += r.booking_count;
      byDate.set(r.date, entry);
    });
    return Array.from(byDate.keys()).sort().map((date) => byDate.get(date)!);
  }, [trend]);

  // One row per tag × activity so an exported file shows not just how many
  // signups a tag drove, but which class/event/service they were for.
  // Tags actually present in the current window, so the picker cannot offer
  // a campaign that would download an empty file.
  const tagOptions = useMemo(
    () => Array.from(new Set(byCourse.map(r => r.tag))).sort((a, b) => a.localeCompare(b, 'th')),
    [byCourse]
  );

  // Fetched on click rather than with the dashboard: the charts need none of
  // these rows, and pulling every booking on each date change would slow the
  // page down for everyone who never exports.
  const exportPeopleCSV = async () => {
    setDownloadingPeople(true);
    setPeopleError(null);
    try {
      const res = await axios.get(`${API_BASE}/reports/tag-attribution/people`, {
        params: {
          startDate: dateFrom,
          endDate: dateTo,
          ...(branch !== 'all' ? { branchId: branch } : {}),
          ...(peopleTag ? { tag: peopleTag } : {}),
        },
      });
      const people = res.data.people ?? [];
      if (people.length === 0) {
        setPeopleError('ไม่พบรายชื่อในช่วงเวลา/เงื่อนไขที่เลือก');
        return;
      }
      downloadCsv(
        `tag-people-${peopleTag || 'all'}-${dateFrom}_${dateTo}`,
        ['Tag', 'ชื่อเด็ก', 'ชื่อเล่น', 'ชื่อผู้ปกครอง', 'เบอร์โทร', 'อีเมล', 'คลาส/กิจกรรม', 'สาขา', 'วันที่เรียน', 'สถานะ', 'วันที่สมัคร'],
        people.map((p: any) => [
          p.tag,
          p.child_name || '(ไม่ระบุ)',
          p.child_nickname || '',
          p.parent_name || '(ไม่ระบุ)',
          p.parent_phone || '',
          p.parent_email || '',
          p.course_name || '',
          p.branch_name || '',
          p.scheduled_at || '',
          p.status,
          p.created_at || '',
        ]),
      );
    } catch (err: any) {
      setPeopleError(err.response?.data?.message || 'ดึงรายชื่อไม่สำเร็จ');
    } finally {
      setDownloadingPeople(false);
    }
  };

  const exportCSV = () => {
    downloadCsv(
      `tag-attribution-${dateFrom}_${dateTo}`,
      ['Tag', 'กิจกรรม', 'จำนวนการสมัคร', 'จำนวนเด็กที่ไม่ซ้ำ'],
      byCourse.map((r) => [r.tag, r.course_name || '-', r.booking_count, r.unique_children]),
    );
  };

  return (
    <Box>
      <DashboardTabs />

      <Box sx={{
        position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default', py: 1.5, mb: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            type="date" size="small" label="ตั้งแต่" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }} inputProps={{ max: dateTo }}
          />
          <TextField
            type="date" size="small" label="ถึง" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }} inputProps={{ min: dateFrom, max: todayISO() }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>สาขา</InputLabel>
            <Select value={branch} label="สาขา" onChange={(e) => setBranch(e.target.value)}>
              <MenuItem value="all">ทุกสาขา</MenuItem>
              {branches.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Which tag the name list is for. The summary export above ignores
              this — it is the whole report by design — but a name list is
              almost always wanted for one campaign at a time. */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>รายชื่อของ Tag</InputLabel>
            <Select value={peopleTag} label="รายชื่อของ Tag" onChange={(e) => setPeopleTag(e.target.value)}>
              <MenuItem value="">ทุก Tag</MenuItem>
              {tagOptions.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="outlined" startIcon={<PeopleIcon />} onClick={exportPeopleCSV} disabled={loading || downloadingPeople}>
            {downloadingPeople ? 'กำลังดึงข้อมูล...' : 'โหลดรายชื่อ'}
          </Button>
          <Button variant="contained" startIcon={<ExportIcon />} onClick={exportCSV} disabled={loading || byCourse.length === 0}>
            Export สรุป
          </Button>
        </Box>
      </Box>
      {peopleError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPeopleError(null)}>{peopleError}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="การสมัครทั้งหมด" value={totalRegistrations.toLocaleString()} icon={<RegistrationsIcon />} color="primary" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="มาจาก Tag" value={taggedCount.toLocaleString()} icon={<TaggedIcon />} color="secondary" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="ไม่มี Tag (Organic)" value={organicCount.toLocaleString()} icon={<OrganicIcon />} color="info" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="จำนวน Tag ที่พบ" value={distinctTags.toLocaleString()} icon={<TagIcon />} color="success" loading={loading} />
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <SectionPaper title="แนวโน้มการสมัครรายวัน: มาจาก Tag เทียบกับไม่มี Tag">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="tagged" name="มาจาก Tag" stackId="a" fill="#7452d6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="organic" name="ไม่มี Tag" stackId="a" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionPaper>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <SectionPaper title="จำนวนการสมัครแยกตาม Tag">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tag</TableCell>
                    <TableCell align="right">จำนวนการสมัคร</TableCell>
                    <TableCell align="right">จำนวนเด็กที่ไม่ซ้ำ</TableCell>
                    <TableCell>พบครั้งแรก</TableCell>
                    <TableCell>พบครั้งล่าสุด</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading && summary.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ไม่พบข้อมูลในช่วงเวลานี้</Typography>
                    </TableCell></TableRow>
                  )}
                  {summary.map((r) => (
                    <TableRow key={r.tag} hover>
                      <TableCell>
                        {r.tag === NO_TAG_LABEL
                          ? <Chip label={r.tag} size="small" sx={{ height: 22, fontSize: 12 }} />
                          : <Chip label={r.tag} size="small" color="primary" sx={{ height: 22, fontSize: 12, fontWeight: 700 }} />}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{r.booking_count.toLocaleString()}</TableCell>
                      <TableCell align="right">{r.unique_children.toLocaleString()}</TableCell>
                      <TableCell>{r.first_seen}</TableCell>
                      <TableCell>{r.last_seen}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionPaper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid item xs={12}>
          <SectionPaper title="รายละเอียด: Tag สมัครกิจกรรมไหนบ้าง">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tag</TableCell>
                    <TableCell>กิจกรรม</TableCell>
                    <TableCell align="right">จำนวนการสมัคร</TableCell>
                    <TableCell align="right">จำนวนเด็กที่ไม่ซ้ำ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading && byCourse.length === 0 && (
                    <TableRow><TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ไม่พบข้อมูลในช่วงเวลานี้</Typography>
                    </TableCell></TableRow>
                  )}
                  {byCourse.map((r) => (
                    <TableRow key={`${r.tag}-${r.course_name}`} hover>
                      <TableCell>
                        {r.tag === NO_TAG_LABEL
                          ? <Chip label={r.tag} size="small" sx={{ height: 22, fontSize: 12 }} />
                          : <Chip label={r.tag} size="small" color="primary" sx={{ height: 22, fontSize: 12, fontWeight: 700 }} />}
                      </TableCell>
                      <TableCell>{r.course_name || '-'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{r.booking_count.toLocaleString()}</TableCell>
                      <TableCell align="right">{r.unique_children.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionPaper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TagAttributionDashboard;
