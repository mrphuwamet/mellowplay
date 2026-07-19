import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Skeleton, Button,
  TextField, FormControl, InputLabel, Select, MenuItem, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Chip,
} from '@mui/material';
import {
  AttachMoney as RevenueIcon,
  Receipt as TxnIcon,
  ShoppingCart as AovIcon,
  People as CustomersIcon,
  PictureAsPdf as PdfIcon,
  Search as SearchIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { API_URL } from '../config';
import DashboardTabs from '../components/DashboardTabs';
import { SALES_TRANSACTIONS, MOCK_BRANCHES } from '../mocks/salesData';
import { exportDashboardPdf } from '../utils/pdfExport';

const API_BASE = `${API_URL}/api/v1/admin`;
const COLORS = ['#7452d6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#ec4899'];

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const pctChange = (curr: number, prev: number) => {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
};

const StatCard = ({
  title, value, icon, color, changePct, loading,
}: { title: string; value: string; icon: React.ReactNode; color: string; changePct: number; loading: boolean }) => {
  if (loading) return <Skeleton variant="rounded" height={130} sx={{ borderRadius: 4 }} />;
  const up = changePct >= 0;
  return (
    <Card sx={{ height: '100%', boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{
            p: 1.5, borderRadius: 3, bgcolor: `${color}.main`, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            '& svg': { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' },
          }}>
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>{title}</Typography>
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 900, mb: 0.5 }}>{value}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {up ? <UpIcon sx={{ fontSize: 14, color: 'success.main' }} /> : <DownIcon sx={{ fontSize: 14, color: 'error.main' }} />}
          <Typography variant="caption" sx={{ fontWeight: 700, color: up ? 'success.main' : 'error.main' }}>
            {Math.abs(changePct).toFixed(1)}%
          </Typography>
          <Typography variant="caption" color="text.secondary">เทียบช่วงก่อนหน้า</Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

const SectionPaper = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none', height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
      {action}
    </Box>
    {children}
  </Paper>
);

const formatThb = (n: number) => `฿${Math.round(n).toLocaleString()}`;

const STATUS_META: Record<string, { label: string; color: string }> = {
  'สำเร็จ': { label: 'สำเร็จ', color: 'success' },
  'คืนเงิน': { label: 'คืนเงิน', color: 'error' },
  'รอดำเนินการ': { label: 'รอดำเนินการ', color: 'warning' },
};

const SalesDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [branchOptions, setBranchOptions] = useState<string[]>(MOCK_BRANCHES);
  const [branch, setBranch] = useState('all');
  const [dateFrom, setDateFrom] = useState(daysAgoISO(29));
  const [dateTo, setDateTo] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/branches`)
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.branches) && res.data.branches.length > 0) {
          setBranchOptions(res.data.branches.map((b: any) => b.name));
        }
      })
      .catch(() => { /* keep mock branch list */ });
  }, []);

  const inRange = (t: typeof SALES_TRANSACTIONS[number], from: string, to: string) =>
    t.date >= from && t.date <= to && (branch === 'all' || t.branch === branch);

  const filtered = useMemo(
    () => SALES_TRANSACTIONS.filter((t) => inRange(t, dateFrom, dateTo)),
    [dateFrom, dateTo, branch],
  );

  const rangeDays = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);
  const prevTo = addDays(dateFrom, -1);
  const prevFrom = addDays(prevTo, -(rangeDays - 1));
  const prevFiltered = useMemo(
    () => SALES_TRANSACTIONS.filter((t) => inRange(t, prevFrom, prevTo)),
    [prevFrom, prevTo, branch],
  );

  const computeKpis = (rows: typeof SALES_TRANSACTIONS) => {
    const paid = rows.filter((r) => r.status !== 'คืนเงิน');
    const totalRevenue = paid.reduce((sum, r) => sum + r.amount, 0);
    const totalTransactions = paid.length;
    const aov = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const uniqueCustomers = new Set(paid.map((r) => r.customerName)).size;
    return { totalRevenue, totalTransactions, aov, uniqueCustomers };
  };

  const kpis = computeKpis(filtered);
  const prevKpis = computeKpis(prevFiltered);

  const revenueByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.filter((t) => t.status !== 'คืนเงิน').forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amount));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const revenueTrend = useMemo(() => {
    const map = new Map<string, number>();
    filtered.filter((t) => t.status !== 'คืนเงิน').forEach((t) => map.set(t.date, (map.get(t.date) || 0) + t.amount));
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ label: new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), revenue }));
  }, [filtered]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { category: string; unitsSold: number; revenue: number }>();
    filtered.filter((t) => t.status !== 'คืนเงิน').forEach((t) => {
      const curr = map.get(t.productName) || { category: t.category, unitsSold: 0, revenue: 0 };
      curr.unitsSold += t.quantity;
      curr.revenue += t.amount;
      map.set(t.productName, curr);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filtered]);

  const searchedTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((t) =>
      t.id.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q) || t.productName.toLowerCase().includes(q));
  }, [filtered, search]);

  const paginatedTransactions = searchedTransactions
    .slice()
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportDashboardPdf({
        element: reportRef.current,
        fileName: `sales-report-${dateFrom}_${dateTo}.pdf`,
        reportTitle: 'รายงานยอดขายและรายได้',
        periodLabel: `${dateFrom} ถึง ${dateTo}`,
        branchLabel: branch === 'all' ? 'ทุกสาขา' : branch,
      });
    } finally {
      setExporting(false);
    }
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
              {branchOptions.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Button
          variant="contained" startIcon={<PdfIcon />} onClick={handleExportPdf} disabled={exporting || loading}
        >
          {exporting ? 'กำลังสร้าง PDF...' : 'Export PDF'}
        </Button>
      </Box>

      <Box ref={reportRef}>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="ยอดขายรวม" value={formatThb(kpis.totalRevenue)} icon={<RevenueIcon />} color="primary"
              changePct={pctChange(kpis.totalRevenue, prevKpis.totalRevenue)} loading={loading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="จำนวนออเดอร์" value={kpis.totalTransactions.toLocaleString()} icon={<TxnIcon />} color="info"
              changePct={pctChange(kpis.totalTransactions, prevKpis.totalTransactions)} loading={loading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="มูลค่าเฉลี่ยต่อออเดอร์" value={formatThb(kpis.aov)} icon={<AovIcon />} color="secondary"
              changePct={pctChange(kpis.aov, prevKpis.aov)} loading={loading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="ลูกค้าที่ซื้อในช่วงนี้" value={kpis.uniqueCustomers.toLocaleString()} icon={<CustomersIcon />} color="success"
              changePct={pctChange(kpis.uniqueCustomers, prevKpis.uniqueCustomers)} loading={loading} />
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={5}>
            <SectionPaper title="สัดส่วนยอดขายตามหมวดหมู่">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={revenueByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {revenueByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => formatThb(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>
          <Grid item xs={12} md={7}>
            <SectionPaper title="แนวโน้มยอดขายรายวัน">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(v: number) => formatThb(v)} />
                  <Bar dataKey="revenue" name="ยอดขาย" fill="#7452d6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionPaper>
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12}>
            <SectionPaper title="สินค้า/บริการยอดนิยม">
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ชื่อสินค้า/บริการ</TableCell>
                      <TableCell>หมวดหมู่</TableCell>
                      <TableCell align="right">จำนวนที่ขาย</TableCell>
                      <TableCell align="right">ยอดขายรวม</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topProducts.length === 0 && (
                      <TableRow><TableCell colSpan={4} align="center">
                        <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ไม่พบข้อมูลในช่วงเวลานี้</Typography>
                      </TableCell></TableRow>
                    )}
                    {topProducts.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell sx={{ fontWeight: 700 }}>{p.name}</TableCell>
                        <TableCell><Chip label={p.category} size="small" sx={{ height: 20, fontSize: 11 }} /></TableCell>
                        <TableCell align="right">{p.unitsSold.toLocaleString()}</TableCell>
                        <TableCell align="right">{formatThb(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </SectionPaper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <SectionPaper
              title="รายการธุรกรรม"
              action={(
                <TextField
                  size="small" placeholder="ค้นหา (ลูกค้า / สินค้า / เลขที่)" value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  sx={{ width: { xs: '100%', sm: 280 } }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> }}
                />
              )}
            >
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>เลขที่</TableCell>
                      <TableCell>วันที่/เวลา</TableCell>
                      <TableCell>ลูกค้า</TableCell>
                      <TableCell>สาขา</TableCell>
                      <TableCell>สินค้า/บริการ</TableCell>
                      <TableCell align="right">จำนวนเงิน</TableCell>
                      <TableCell>ช่องทางชำระ</TableCell>
                      <TableCell>สถานะ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedTransactions.length === 0 && (
                      <TableRow><TableCell colSpan={8} align="center">
                        <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ไม่พบรายการที่ตรงกับเงื่อนไข</Typography>
                      </TableCell></TableRow>
                    )}
                    {paginatedTransactions.map((t) => (
                      <TableRow key={t.id} hover>
                        <TableCell>{t.id}</TableCell>
                        <TableCell>{t.date} {t.time}</TableCell>
                        <TableCell>{t.customerName}</TableCell>
                        <TableCell>{t.branch}</TableCell>
                        <TableCell>{t.productName}</TableCell>
                        <TableCell align="right">{formatThb(t.amount)}</TableCell>
                        <TableCell>{t.paymentMethod}</TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_META[t.status]?.label || t.status}
                            color={(STATUS_META[t.status]?.color as any) || 'default'}
                            size="small"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={searchedTransactions.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50]}
              />
            </SectionPaper>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default SalesDashboard;
