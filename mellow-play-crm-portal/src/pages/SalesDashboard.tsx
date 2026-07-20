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

const formatThb = (n: number) => `฿${Math.round(n || 0).toLocaleString()}`;

// Transactions.type → this dashboard's category buckets. There's no
// physical-product ("สินค้า") sale type recorded in Transactions today —
// POS retail goods live in Orders/Order_Items, a separate model — so that
// mock-data category has no real equivalent yet and is intentionally absent.
const TYPE_TO_CATEGORY: Record<string, string> = {
  guest_sale: 'คอร์สเรียน',
  class_booking: 'คอร์สเรียน',
  package_sale: 'แพ็คเกจ',
  service_sale: 'บริการเสริม',
};
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต',
  coupon: 'คูปอง', promptpay: 'พร้อมเพย์', beam: 'Beam', later: 'ค้างชำระ',
};

interface Branch { id: number; name: string; }
interface DailySalesRow { date: string; count: number; revenue: number; package_revenue: number; class_revenue: number; service_revenue: number; }
interface BestSellerRow { name: string; count: number; units_sold: number; revenue: number; }
interface TransactionRow {
  id: number; created_at: string; type: string; amount: number; payment_method: string; is_voided: number;
  branch_name?: string; customer_name?: string; course_name?: string; package_name?: string; service_name?: string;
}

const SalesDashboard = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState('all');
  const [dateFrom, setDateFrom] = useState(daysAgoISO(29));
  const [dateTo, setDateTo] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [exporting, setExporting] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [kpis, setKpis] = useState({ revenue: 0, txCount: 0, uniqueCustomers: 0 });
  const [prevKpis, setPrevKpis] = useState({ revenue: 0, txCount: 0, uniqueCustomers: 0 });
  const [dailySales, setDailySales] = useState<DailySalesRow[]>([]);
  const [bestSellers, setBestSellers] = useState<{ courses: BestSellerRow[]; packages: BestSellerRow[]; services: BestSellerRow[] }>({ courses: [], packages: [], services: [] });

  const [txLoading, setTxLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/branches`)
      .then((res) => { if (res.data?.success) setBranches(res.data.branches ?? []); })
      .catch(() => {});
  }, []);

  const branchId = branch === 'all' ? undefined : branch;
  const rangeDays = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);
  const prevTo = addDays(dateFrom, -1);
  const prevFrom = addDays(prevTo, -(rangeDays - 1));

  // KPIs + trend/category chart + top products — everything derived from
  // the full range, not the transaction table's current page, so these
  // stay correct regardless of how many rows the range actually has.
  useEffect(() => {
    setSummaryLoading(true);
    const params = { startDate: dateFrom, endDate: dateTo, ...(branchId ? { branchId } : {}) };
    const prevParams = { startDate: prevFrom, endDate: prevTo, ...(branchId ? { branchId } : {}) };
    Promise.all([
      axios.get(`${API_BASE}/reports/kpis`, { params }),
      axios.get(`${API_BASE}/reports/kpis`, { params: prevParams }),
      axios.get(`${API_BASE}/reports/daily-sales`, { params }),
      axios.get(`${API_BASE}/reports/best-sellers`, { params }),
    ]).then(([kpiRes, prevKpiRes, dailyRes, bestRes]) => {
      if (kpiRes.data.success) setKpis(kpiRes.data.kpis);
      if (prevKpiRes.data.success) setPrevKpis(prevKpiRes.data.kpis);
      if (dailyRes.data.success) setDailySales(dailyRes.data.data);
      if (bestRes.data.success) setBestSellers({ courses: bestRes.data.courses, packages: bestRes.data.packages, services: bestRes.data.services });
    }).catch(() => {}).finally(() => setSummaryLoading(false));
  }, [dateFrom, dateTo, branchId, prevFrom, prevTo]);

  // Transaction list — server-paginated (a wide date range can have far
  // more rows than one page, unlike the summary queries above).
  useEffect(() => {
    setTxLoading(true);
    axios.get(`${API_BASE}/reports/transactions`, {
      params: {
        startDate: dateFrom, endDate: dateTo,
        ...(branchId ? { branchId } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        limit: rowsPerPage, offset: page * rowsPerPage,
      },
    }).then((res) => {
      if (res.data.success) { setTransactions(res.data.rows); setTxTotal(res.data.total); }
    }).catch(() => {}).finally(() => setTxLoading(false));
  }, [dateFrom, dateTo, branchId, search, page, rowsPerPage]);

  const aov = kpis.txCount > 0 ? kpis.revenue / kpis.txCount : 0;
  const prevAov = prevKpis.txCount > 0 ? prevKpis.revenue / prevKpis.txCount : 0;

  const revenueByCategory = useMemo(() => {
    const totals = dailySales.reduce(
      (acc, d) => ({
        คอร์สเรียน: acc.คอร์สเรียน + (d.class_revenue || 0),
        แพ็คเกจ: acc.แพ็คเกจ + (d.package_revenue || 0),
        บริการเสริม: acc.บริการเสริม + (d.service_revenue || 0),
      }),
      { คอร์สเรียน: 0, แพ็คเกจ: 0, บริการเสริม: 0 },
    );
    return Object.entries(totals).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [dailySales]);

  const revenueTrend = useMemo(() => dailySales.map((d) => ({
    label: new Date(d.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
    revenue: d.revenue || 0,
  })), [dailySales]);

  const topProducts = useMemo(() => {
    const tagged = [
      ...bestSellers.courses.map((r) => ({ ...r, category: 'คอร์สเรียน' })),
      ...bestSellers.packages.map((r) => ({ ...r, category: 'แพ็คเกจ' })),
      ...bestSellers.services.map((r) => ({ ...r, category: 'บริการเสริม' })),
    ];
    return tagged.sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [bestSellers]);

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportDashboardPdf({
        element: reportRef.current,
        fileName: `sales-report-${dateFrom}_${dateTo}.pdf`,
        reportTitle: 'รายงานยอดขายและรายได้',
        periodLabel: `${dateFrom} ถึง ${dateTo}`,
        branchLabel: branch === 'all' ? 'ทุกสาขา' : branches.find((b) => String(b.id) === branch)?.name ?? '',
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
            <Select value={branch} label="สาขา" onChange={(e) => { setBranch(e.target.value); setPage(0); }}>
              <MenuItem value="all">ทุกสาขา</MenuItem>
              {branches.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Button
          variant="contained" startIcon={<PdfIcon />} onClick={handleExportPdf} disabled={exporting || summaryLoading}
        >
          {exporting ? 'กำลังสร้าง PDF...' : 'Export PDF'}
        </Button>
      </Box>

      <Box ref={reportRef}>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="ยอดขายรวม" value={formatThb(kpis.revenue)} icon={<RevenueIcon />} color="primary"
              changePct={pctChange(kpis.revenue, prevKpis.revenue)} loading={summaryLoading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="จำนวนออเดอร์" value={kpis.txCount.toLocaleString()} icon={<TxnIcon />} color="info"
              changePct={pctChange(kpis.txCount, prevKpis.txCount)} loading={summaryLoading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="มูลค่าเฉลี่ยต่อออเดอร์" value={formatThb(aov)} icon={<AovIcon />} color="secondary"
              changePct={pctChange(aov, prevAov)} loading={summaryLoading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="ลูกค้าที่ซื้อในช่วงนี้" value={kpis.uniqueCustomers.toLocaleString()} icon={<CustomersIcon />} color="success"
              changePct={pctChange(kpis.uniqueCustomers, prevKpis.uniqueCustomers)} loading={summaryLoading} />
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
                      <TableRow key={`${p.category}-${p.name}`}>
                        <TableCell sx={{ fontWeight: 700 }}>{p.name}</TableCell>
                        <TableCell><Chip label={p.category} size="small" sx={{ height: 20, fontSize: 11 }} /></TableCell>
                        <TableCell align="right">{(p.units_sold ?? p.count).toLocaleString()}</TableCell>
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
                    {!txLoading && transactions.length === 0 && (
                      <TableRow><TableCell colSpan={8} align="center">
                        <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ไม่พบรายการที่ตรงกับเงื่อนไข</Typography>
                      </TableCell></TableRow>
                    )}
                    {transactions.map((t) => {
                      const dt = new Date(t.created_at);
                      return (
                        <TableRow key={t.id} hover>
                          <TableCell>TXN-{t.id}</TableCell>
                          <TableCell>{dt.toLocaleDateString('th-TH')} {dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                          <TableCell>{t.customer_name || '-'}</TableCell>
                          <TableCell>{t.branch_name || '-'}</TableCell>
                          <TableCell>{t.course_name || t.package_name || t.service_name || TYPE_TO_CATEGORY[t.type] || t.type}</TableCell>
                          <TableCell align="right">{formatThb(t.amount)}</TableCell>
                          <TableCell>{PAYMENT_LABELS[t.payment_method] || t.payment_method}</TableCell>
                          <TableCell>
                            <Chip
                              label={t.is_voided ? 'คืนเงิน' : 'สำเร็จ'}
                              color={t.is_voided ? 'error' : 'success'}
                              size="small"
                              sx={{ fontWeight: 700 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={txTotal}
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
