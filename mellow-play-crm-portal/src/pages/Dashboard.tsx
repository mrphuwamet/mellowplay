import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, Card, CardContent, CircularProgress, ToggleButtonGroup, ToggleButton, Chip, Rating, TextField, InputAdornment } from '@mui/material';
import {
  People as PeopleIcon,
  ChildCare as ChildIcon,
  CalendarToday as CalendarIcon,
  Search as SearchIcon,
  ArrowUpward as SortAscIcon,
  ArrowDownward as SortDescIcon,
  UnfoldMore as SortNoneIcon,
  FiberManualRecord as LiveDotIcon,
  Visibility as VisitsIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

interface DashboardStats {
  activeMembers: number;
  totalChildren: number;
  upcomingBookings: number;
}

const COLORS = ['#7452d6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#ec4899'];

const StatCard = ({ title, value, icon, color }: { title: string, value: number, icon: React.ReactNode, color: string }) => (
  <Card sx={{ height: '100%', boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{
          p: 1.5,
          borderRadius: 3,
          bgcolor: `${color}.main`,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '& svg': { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }
        }}>
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 900 }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

const SectionPaper = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none', height: '100%' }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>{title}</Typography>
    {children}
  </Paper>
);

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [range, setRange] = useState<'week' | 'month' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = useState(daysAgoISO(30));
  const [customEnd, setCustomEnd] = useState(todayISO());

  // Funnel table sorting + smart search
  const [funnelSearch, setFunnelSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'views' | 'bookings' | 'completions' | 'completionRate' | 'avg_rating'>('bookings');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // "Active now" is a near-realtime proxy (distinct sessions pinged in the
  // last 5 minutes), not a true push-based websocket presence system.
  const [activeUsers, setActiveUsers] = useState<{ activeNow: number; visitsToday: number } | null>(null);

  const userJson = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const branchName = currentUser?.selectedBranchName;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get(`${API_BASE}/stats`);
        if (response.data.success) setStats(response.data.stats);
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchActiveUsers = async () => {
      try {
        const response = await axios.get(`${API_BASE}/analytics/active-users`);
        if (response.data.success) setActiveUsers({ activeNow: response.data.activeNow, visitsToday: response.data.visitsToday });
      } catch (error) {
        console.error('Failed to fetch active users', error);
      }
    };
    fetchActiveUsers();
    const interval = setInterval(fetchActiveUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return;
    const fetchAnalytics = async () => {
      setAnalyticsLoading(true);
      try {
        const params: any = { range };
        if (range === 'custom') { params.startDate = customStart; params.endDate = customEnd; }
        const response = await axios.get(`${API_BASE}/analytics`, { params });
        if (response.data.success) setAnalytics(response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard analytics', error);
      } finally {
        setAnalyticsLoading(false);
      }
    };
    fetchAnalytics();
  }, [range, customStart, customEnd]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const formatPeriodLabel = (period: string) => {
    if (range === 'year') {
      const [y, m] = period.split('-');
      return `${m}/${y.slice(2)}`;
    }
    const d = new Date(period);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  const trendData = (analytics?.trends || []).map((t: any) => ({ ...t, label: formatPeriodLabel(t.period) }));
  const genderData = (analytics?.demographics?.genderCounts || []).map((g: any) => ({ name: g.gender, value: g.count }));
  const ageData = analytics?.demographics?.ageGroups || [];

  const MEMBERSHIP_LABELS: Record<string, string> = { premium: 'พรีเมียม', regular: 'ทั่วไป' };
  const membershipTypeData = (analytics?.parents?.byMembershipType || []).map((p: any) => ({ name: MEMBERSHIP_LABELS[p.type] || p.type, value: p.count }));

  const RELATIONSHIP_LABELS: Record<string, string> = { father: 'บิดา', mother: 'มารดา', grandparent: 'ปู่/ย่า/ตา/ยาย', other: 'อื่นๆ', unspecified: 'ไม่ระบุ' };
  const parentRelationshipData = (analytics?.parentRelationships || []).map((r: any) => ({ name: RELATIONSHIP_LABELS[r.relationship] || r.relationship, value: r.count }));

  const funnelWithRate = (analytics?.funnel || []).map((f: any) => ({
    ...f,
    completionRate: f.bookings > 0 ? (f.completions / f.bookings) * 100 : -1,
  }));
  const filteredFunnel = funnelSearch.trim()
    ? funnelWithRate.filter((f: any) => f.name.toLowerCase().includes(funnelSearch.trim().toLowerCase()))
    : funnelWithRate;
  const sortedFunnel = [...filteredFunnel].sort((a: any, b: any) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const SortIcon = ({ col }: { col: typeof sortKey }) =>
    sortKey !== col ? <SortNoneIcon sx={{ fontSize: 14 }} /> : sortDir === 'asc' ? <SortAscIcon sx={{ fontSize: 14 }} /> : <SortDescIcon sx={{ fontSize: 14 }} />;

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>ภาพรวมระบบ ({branchName})</Typography>
          <Typography variant="body2" color="text.secondary">ข้อมูลสรุปและสถานะการทำงานของสาขา {branchName}</Typography>
        </Box>
        {activeUsers && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#f9fafb', border: '1px solid #eef0f3', borderRadius: 3, px: 2, py: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <LiveDotIcon sx={{
                fontSize: 12, color: 'success.main',
                animation: activeUsers.activeNow > 0 ? 'pulse 1.8s ease-in-out infinite' : 'none',
                '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
              }} />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>Active now: {activeUsers.activeNow}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <VisitsIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">เข้าชมวันนี้ {activeUsers.visitsToday}</Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="สมาชิกที่ใช้งานอยู่" value={stats?.activeMembers || 0} icon={<PeopleIcon />} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="จำนวนเด็กทั้งหมด" value={stats?.totalChildren || 0} icon={<ChildIcon />} color="secondary" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="รายการจองเรียน" value={stats?.upcomingBookings || 0} icon={<CalendarIcon />} color="info" />
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>ข้อมูลเชิงลึก</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {range === 'custom' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                type="date" size="small" label="ตั้งแต่" value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: customEnd }}
              />
              <TextField
                type="date" size="small" label="ถึง" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: customStart, max: todayISO() }}
              />
            </Box>
          )}
          <ToggleButtonGroup value={range} exclusive size="small" onChange={(_, v) => v && setRange(v)}>
            <ToggleButton value="week">1 อาทิตย์</ToggleButton>
            <ToggleButton value="month">1 เดือน</ToggleButton>
            <ToggleButton value="year">1 ปี</ToggleButton>
            <ToggleButton value="custom">กำหนดเอง</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {analyticsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Bookings Trend */}
          <Grid item xs={12} md={6}>
            <SectionPaper title="ยอดจอง">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="bookings" name="ยอดจอง" stroke="#7452d6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>

          {/* Sales/Revenue Trend */}
          <Grid item xs={12} md={6}>
            <SectionPaper title="ยอดขาย">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(v: number) => `฿${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" name="ยอดขาย (฿)" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>

          {/* Gender breakdown */}
          <Grid item xs={12} sm={6} md={3}>
            <SectionPaper title="สัดส่วนเพศของเด็ก">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {genderData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>

          {/* Age groups */}
          <Grid item xs={12} sm={6} md={3}>
            <SectionPaper title="ช่วงอายุเด็ก">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="count" name="จำนวนเด็ก" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>

          {/* Relationship to child (father/mother/grandparent/other) — lives
              on Users.relationship, distinct from membership_type
              (Premium/Regular), which has its own section elsewhere. */}
          <Grid item xs={12} sm={6} md={3}>
            <SectionPaper title="ความสัมพันธ์กับลูก">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={parentRelationshipData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                    {parentRelationshipData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>

          {/* Membership type: Premium vs Regular */}
          <Grid item xs={12} sm={6} md={3}>
            <SectionPaper title="ประเภทสมาชิก">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={membershipTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                    {membershipTypeData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>

          {/* Top classes - regular */}
          <Grid item xs={12} md={6}>
            <SectionPaper title="คลาสยอดนิยม (คลาสปกติ)">
              {(analytics?.topClasses?.regular || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">ยังไม่มีข้อมูล</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.topClasses.regular} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <RechartsTooltip />
                    <Bar dataKey="bookings" name="ยอดจอง" fill="#10b981" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionPaper>
          </Grid>

          {/* Top classes - extra */}
          <Grid item xs={12} md={6}>
            <SectionPaper title="คลาสยอดนิยม (คลาสพิเศษ)">
              {(analytics?.topClasses?.extra || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">ยังไม่มีข้อมูล</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.topClasses.extra} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <RechartsTooltip />
                    <Bar dataKey="bookings" name="ยอดจอง" fill="#f59e0b" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionPaper>
          </Grid>

          {/* Funnel table */}
          <Grid item xs={12}>
            <SectionPaper title="วิเคราะห์การมีส่วนร่วมคลาส">
              <TextField
                size="small"
                placeholder="ค้นหาชื่อคลาส..."
                value={funnelSearch}
                onChange={e => setFunnelSearch(e.target.value)}
                sx={{ mb: 2, width: { xs: '100%', sm: 320 } }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> }}
              />
              <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.2fr', gap: 1, minWidth: 640 }}>
                  {([
                    { key: 'name' as const, label: 'คลาส' },
                    { key: 'views' as const, label: 'เข้าชม' },
                    { key: 'bookings' as const, label: 'จอง' },
                    { key: 'completions' as const, label: 'เรียนจบ' },
                    { key: 'completionRate' as const, label: 'อัตราจบ' },
                    { key: 'avg_rating' as const, label: 'คะแนน' },
                  ]).map(h => (
                    <Box
                      key={h.key}
                      onClick={() => toggleSort(h.key)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pb: 1, borderBottom: '1px solid #eef0f3', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>{h.label}</Typography>
                      <SortIcon col={h.key} />
                    </Box>
                  ))}
                  {sortedFunnel.length === 0 && (
                    <Box sx={{ gridColumn: '1 / -1', py: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.disabled">ไม่พบคลาสที่ตรงกับคำค้นหา</Typography>
                    </Box>
                  )}
                  {sortedFunnel.map((f: any) => (
                    <React.Fragment key={f.course_id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: '1px solid #f5f5f7' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{f.name}</Typography>
                        <Chip label={f.is_extraclass ? 'พิเศษ' : 'ปกติ'} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                      </Box>
                      <Typography variant="body2" sx={{ py: 1, borderBottom: '1px solid #f5f5f7' }}>{f.views}</Typography>
                      <Typography variant="body2" sx={{ py: 1, borderBottom: '1px solid #f5f5f7' }}>{f.bookings}</Typography>
                      <Typography variant="body2" sx={{ py: 1, borderBottom: '1px solid #f5f5f7' }}>{f.completions}</Typography>
                      <Typography variant="body2" sx={{ py: 1, borderBottom: '1px solid #f5f5f7' }}>
                        {f.completionRate >= 0 ? `${Math.round(f.completionRate)}%` : '-'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 1, borderBottom: '1px solid #f5f5f7' }}>
                        {f.review_count > 0 ? (
                          <>
                            <Rating value={f.avg_rating} readOnly size="small" precision={0.1} />
                            <Typography variant="caption" color="text.secondary">({f.review_count})</Typography>
                          </>
                        ) : (
                          <Typography variant="caption" color="text.disabled">-</Typography>
                        )}
                      </Box>
                    </React.Fragment>
                  ))}
                </Box>
              </Box>
            </SectionPaper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default Dashboard;
