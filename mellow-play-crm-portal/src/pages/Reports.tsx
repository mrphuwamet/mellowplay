import { API_URL } from '../config';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonGroup, Chip, CircularProgress,
  Divider, Grid, MenuItem, Paper, Select, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import {
  BarChart as ChartIcon, Receipt as TxIcon,
  TrendingUp as TrendIcon, CalendarMonth as CalIcon,
  StarRate as StarIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

const formatBaht = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });

const DOW_NAMES = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const TX_TYPE_LABELS: Record<string, string> = {
  guest_sale:    'ลูกค้า Walk-in',
  class_booking: 'จองคลาส (คูปอง)',
  package_sale:  'ขายแพ็คเกจ',
  service_sale:  'บริการ',
  topup:         'เติมคูปอง',
};

// Simple bar chart using CSS
const BarChartSimple = ({ data, labelKey, valueKey, color = '#7c3aed' }: {
  data: any[]; labelKey: string; valueKey: string; color?: string;
}) => {
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {data.map((row, i) => {
        const val = Number(row[valueKey]) || 0;
        const pct = (val / max) * 100;
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" sx={{ minWidth: 64, textAlign: 'right', color: 'text.secondary', fontWeight: 600 }}>
              {row[labelKey]}
            </Typography>
            <Box sx={{ flex: 1, height: 24, bgcolor: 'grey.100', borderRadius: 1, overflow: 'hidden' }}>
              <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 1,
                display: 'flex', alignItems: 'center', px: 1, minWidth: val > 0 ? 40 : 0,
                transition: 'width 0.4s ease' }}>
                {pct > 20 && <Typography variant="caption" sx={{ color: 'white', fontWeight: 700, fontSize: '10px' }}>
                  {formatBaht(val)}
                </Typography>}
              </Box>
            </Box>
            {pct <= 20 && <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '10px', minWidth: 64 }}>{formatBaht(val)}</Typography>}
          </Box>
        );
      })}
    </Box>
  );
};

const KPICard = ({ label, value, sub, color = 'primary.main' }: { label: string; value: string; sub?: string; color?: string }) => (
  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
    <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 0.5 }}>{label}</Typography>
    <Typography variant="h5" fontWeight={800} color={color}>{value}</Typography>
    {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
  </Paper>
);

const Reports: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';

  const [tab, setTab] = useState(0);
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [txType, setTxType] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  const [kpis, setKpis] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [bestSellers, setBestSellers] = useState<{ services: any[]; packages: any[] }>({ services: [], packages: [] });
  const [busiestDays, setBusiestDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const qs = `startDate=${startDate}&endDate=${endDate}`;
      const [kpisRes, txRes, dailyRes, bestsRes, busiestRes] = await Promise.all([
        axios.get(`${API_BASE}/reports/kpis?${qs}`),
        axios.get(`${API_BASE}/reports/transactions?${qs}${txType ? `&type=${txType}` : ''}`),
        axios.get(`${API_BASE}/reports/daily-sales?${qs}`),
        axios.get(`${API_BASE}/reports/best-sellers?${qs}`),
        axios.get(`${API_BASE}/reports/busiest-days?${qs}`),
      ]);
      setKpis(kpisRes.data.kpis);
      setTransactions(txRes.data.rows ?? []);
      setTxTotal(txRes.data.total ?? 0);
      setDailySales(dailyRes.data.data ?? []);
      setBestSellers({ services: bestsRes.data.services ?? [], packages: bestsRes.data.packages ?? [] });
      setBusiestDays(busiestRes.data.data ?? []);
    } finally { setLoading(false); }
  };

  const fetchMonthly = async () => {
    const res = await axios.get(`${API_BASE}/reports/monthly-sales?year=${year}`);
    setMonthlySales(res.data.data ?? []);
  };

  useEffect(() => { fetchAll(); }, [startDate, endDate, txType]);
  useEffect(() => { fetchMonthly(); }, [year]);

  // Preset ranges
  const setPreset = (preset: 'today' | 'week' | 'month' | 'last30') => {
    const now = new Date();
    if (preset === 'today') { setStartDate(today); setEndDate(today); }
    else if (preset === 'week') {
      const dow = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
      setStartDate(mon.toISOString().slice(0, 10)); setEndDate(today);
    } else if (preset === 'month') { setStartDate(firstOfMonth); setEndDate(today); }
    else if (preset === 'last30') {
      const d30 = new Date(now); d30.setDate(now.getDate() - 30);
      setStartDate(d30.toISOString().slice(0, 10)); setEndDate(today);
    }
  };

  const busiestDaysFormatted = useMemo(() =>
    DOW_NAMES.map((name, i) => {
      const found = busiestDays.find(d => parseInt(d.dow) === i);
      return { name, bookings: found?.bookings ?? 0 };
    }),
    [busiestDays]
  );

  const monthlyFormatted = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const found = monthlySales.find(m => parseInt(m.month) === i + 1);
      return { name: THAI_MONTHS[i], revenue: found?.revenue ?? 0 };
    }),
    [monthlySales]
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ChartIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>รายงาน</Typography>
          <Typography variant="body2" color="text.secondary">ภาพรวมยอดขายและการใช้บริการ</Typography>
        </Box>
      </Box>

      {/* Date filter */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <ButtonGroup size="small" variant="outlined">
          {(['today','week','month','last30'] as const).map(p => (
            <Button key={p} onClick={() => setPreset(p)} sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
              {p === 'today' ? 'วันนี้' : p === 'week' ? 'สัปดาห์นี้' : p === 'month' ? 'เดือนนี้' : '30 วัน'}
            </Button>
          ))}
        </ButtonGroup>
        <TextField type="date" size="small" label="ตั้งแต่" InputLabelProps={{ shrink: true }} value={startDate}
          onChange={(e) => setStartDate(e.target.value)} />
        <TextField type="date" size="small" label="ถึง" InputLabelProps={{ shrink: true }} value={endDate}
          onChange={(e) => setEndDate(e.target.value)} />
        {loading && <CircularProgress size={20} />}
      </Paper>

      {/* KPI Cards */}
      {kpis && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <KPICard label="รายรับรวม" value={formatBaht(kpis.revenue)} color="primary.main" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KPICard label="รายการขาย" value={`${kpis.txCount} รายการ`} color="info.main" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KPICard label="การจองทั้งหมด" value={`${kpis.bookings} ครั้ง`}
              sub={`เสร็จสิ้น ${kpis.completedBookings} / ยกเลิก ${kpis.cancelledBookings}`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KPICard label="Completion Rate"
              value={kpis.bookings > 0 ? `${Math.round((kpis.completedBookings / kpis.bookings) * 100)}%` : '—'}
              color="success.main" />
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<TxIcon fontSize="small" />} iconPosition="start" label="ประวัติรายการ" />
          <Tab icon={<TrendIcon fontSize="small" />} iconPosition="start" label="ยอดขายรายวัน" />
          <Tab icon={<CalIcon fontSize="small" />} iconPosition="start" label="ยอดขายรายเดือน" />
          <Tab icon={<StarIcon fontSize="small" />} iconPosition="start" label="ขายดี / วันที่คนมากสุด" />
        </Tabs>
      </Box>

      {/* ── Tab 0: Transaction History ─────────────────────────────────────── */}
      {tab === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography fontWeight={700}>รายการทั้งหมด {txTotal} รายการ</Typography>
            <Select size="small" value={txType} onChange={(e) => setTxType(e.target.value)} displayEmpty sx={{ minWidth: 160 }}>
              <MenuItem value="">ทุกประเภท</MenuItem>
              {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่/เวลา</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>ประเภท</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>รายละเอียด</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>ช่องทางชำระ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">ยอด</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map(tx => (
                  <TableRow key={tx.id} hover>
                    <TableCell>
                      <Typography variant="body2">{new Date(tx.created_at).toLocaleDateString('th-TH')}</Typography>
                      <Typography variant="caption" color="text.secondary">{new Date(tx.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={TX_TYPE_LABELS[tx.type] ?? tx.type} size="small" sx={{ fontWeight: 600, fontSize: '10px' }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{tx.course_name || tx.package_name || '—'}</Typography>
                      {tx.staff_name && <Typography variant="caption" color="text.secondary">{tx.staff_name}</Typography>}
                    </TableCell>
                    <TableCell>{tx.payment_method || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>
                      {formatBaht(tx.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>ไม่มีรายการในช่วงนี้</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── Tab 1: Daily Sales ────────────────────────────────────────────── */}
      {tab === 1 && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography fontWeight={700} sx={{ mb: 2 }}>ยอดขายรายวัน</Typography>
          {dailySales.length === 0
            ? <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>ไม่มีข้อมูลในช่วงนี้</Typography>
            : (
              <>
                <BarChartSimple data={dailySales} labelKey="date" valueKey="revenue" color="#7c3aed" />
                <Divider sx={{ my: 2 }} />
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">รายการ</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">คลาส</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">แพ็คเกจ</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">บริการ</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">รวม</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dailySales.map(d => (
                        <TableRow key={d.date} hover>
                          <TableCell>{d.date}</TableCell>
                          <TableCell align="right">{d.count}</TableCell>
                          <TableCell align="right">{formatBaht(d.class_revenue)}</TableCell>
                          <TableCell align="right">{formatBaht(d.package_revenue)}</TableCell>
                          <TableCell align="right">{formatBaht(d.service_revenue)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>{formatBaht(d.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
        </Paper>
      )}

      {/* ── Tab 2: Monthly Sales ───────────────────────────────────────────── */}
      {tab === 2 && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography fontWeight={700}>ยอดขายรายเดือน ปี {year + 543}</Typography>
            <Select size="small" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[0, 1, 2].map(offset => {
                const y = new Date().getFullYear() - offset;
                return <MenuItem key={y} value={y}>{y + 543}</MenuItem>;
              })}
            </Select>
          </Box>
          <BarChartSimple data={monthlyFormatted} labelKey="name" valueKey="revenue" color="#0284c7" />
        </Paper>
      )}

      {/* ── Tab 3: Best Sellers + Busiest Days ─────────────────────────────── */}
      {tab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <StarIcon sx={{ color: '#d97706' }} />
                <Typography fontWeight={700}>วันที่คนมากที่สุด (จำนวนจอง)</Typography>
              </Box>
              <BarChartSimple data={busiestDaysFormatted} labelKey="name" valueKey="bookings" color="#059669" />
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography fontWeight={700} sx={{ mb: 2 }}>บริการที่ขายดี</Typography>
              {bestSellers.services.length === 0
                ? <Typography color="text.secondary" variant="body2">ยังไม่มีข้อมูล</Typography>
                : bestSellers.services.map((s, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="body2">{i + 1}. {s.name}</Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight={700}>{s.count} ครั้ง</Typography>
                        <Typography variant="caption" color="text.secondary">{formatBaht(s.revenue)}</Typography>
                      </Box>
                    </Box>
                  ))}
            </Paper>
          </Grid>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography fontWeight={700} sx={{ mb: 2 }}>แพ็คเกจที่ขายดี</Typography>
              {bestSellers.packages.length === 0
                ? <Typography color="text.secondary" variant="body2">ยังไม่มีข้อมูล</Typography>
                : bestSellers.packages.map((p, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="body2">{i + 1}. {p.name}</Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight={700}>{p.count} ชุด</Typography>
                        <Typography variant="caption" color="text.secondary">{formatBaht(p.revenue)}</Typography>
                      </Box>
                    </Box>
                  ))}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default Reports;
