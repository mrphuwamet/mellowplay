import { API_URL } from '../config';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonGroup, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  InputLabel, FormControl, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Receipt as ReceiptIcon,
  MoneyOff as VoidIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  TrendingUp as TrendIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

const fmt  = (n: number) => Number(n ?? 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });
const fmtN = (n: number) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0 });

const TX_TYPE_LABELS: Record<string, string> = {
  guest_sale:    'ลูกค้า Walk-in',
  class_booking: 'จองคลาส (คูปอง)',
  package_sale:  'ขายแพ็คเกจ',
  service_sale:  'บริการ',
  topup:         'เติมคูปอง',
};

const TX_TYPE_COLORS: Record<string, 'primary'|'success'|'info'|'warning'|'default'> = {
  guest_sale:    'primary',
  class_booking: 'info',
  package_sale:  'success',
  service_sale:  'warning',
  topup:         'default',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash:   'เงินสด',
  transfer: 'โอน',
  credit_card: 'บัตรเครดิต',
  coupon: 'คูปอง',
  later:  'ค้างชำระ',
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KPICard = ({ label, value, sub, color = 'primary.main', icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode;
}) => (
  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
      <Box>
        <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 0.5 }}>{label}</Typography>
        <Typography variant="h5" fontWeight={800} color={color}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </Box>
      {icon && <Box sx={{ color, opacity: 0.2, fontSize: 40 }}>{icon}</Box>}
    </Stack>
  </Paper>
);

// ─── Void Dialog ─────────────────────────────────────────────────────────────

const VoidDialog = ({ open, tx, onClose, onSuccess }: {
  open: boolean; tx: any; onClose: () => void; onSuccess: () => void;
}) => {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => { if (!open) { setReason(''); setErr(''); } }, [open]);

  const handleVoid = async () => {
    if (!reason.trim()) { setErr('กรุณาระบุเหตุผล'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/transactions/${tx.id}/void`, { reason: reason.trim() });
      onSuccess();
      onClose();
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  if (!tx) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, color: 'error.main', pb: 1 }}>
        Void Transaction #{tx.id}
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2, mb: 2 }}>
          <Typography variant="body2" fontWeight={700}>
            {TX_TYPE_LABELS[tx.type] ?? tx.type}
            {tx.course_name ? ` — ${tx.course_name}` : ''}
            {tx.package_name ? ` — ${tx.package_name}` : ''}
          </Typography>
          <Typography variant="body2" color="primary.main" fontWeight={800}>{fmt(tx.amount)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(tx.created_at).toLocaleString('th-TH')} · {PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method ?? '—'}
          </Typography>
        </Box>
        <TextField
          label="เหตุผลที่ Void *" fullWidth multiline rows={3}
          value={reason} onChange={e => setReason(e.target.value)}
          placeholder="เช่น ลูกค้าขอยกเลิก, บันทึกผิด, ทดสอบระบบ"
          autoFocus
        />
        {err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
        <Button variant="contained" color="error" onClick={handleVoid} disabled={loading} sx={{ fontWeight: 800, borderRadius: 2 }}>
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Void รายการนี้'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const POSSalesHistory: React.FC = () => {
  const today          = new Date().toISOString().slice(0, 10);
  const firstOfMonth   = today.slice(0, 8) + '01';

  const userJson    = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const branchId    = currentUser?.selectedBranchId;
  const branchName  = currentUser?.selectedBranchName ?? '';

  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [txType,    setTxType]    = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [voidTx,    setVoidTx]    = useState<any>(null);
  const [successMsg,setSuccessMsg]= useState('');

  const show = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const fetchTx = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (txType)   params.set('type', txType);
      if (branchId) params.set('branchId', String(branchId));
      params.set('limit', '200');
      const res = await axios.get(`${API_BASE}/reports/transactions?${params}`);
      setTransactions(res.data.rows ?? []);
    } finally { setLoading(false); }
  }, [startDate, endDate, txType, branchId]);

  useEffect(() => { fetchTx(); }, [fetchTx]);

  // ── Presets ────────────────────────────────────────────────────────────────
  const setPreset = (p: 'today' | 'yesterday' | 'week' | 'month') => {
    const now = new Date();
    if (p === 'today') {
      setStartDate(today); setEndDate(today);
    } else if (p === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const d = y.toISOString().slice(0, 10);
      setStartDate(d); setEndDate(d);
    } else if (p === 'week') {
      const dow = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - ((dow + 6) % 7));
      setStartDate(mon.toISOString().slice(0, 10)); setEndDate(today);
    } else {
      setStartDate(firstOfMonth); setEndDate(today);
    }
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active  = transactions.filter(t => !t.is_voided);
    const voided  = transactions.filter(t => t.is_voided);
    const revenue = active.reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const byType  = Object.entries(TX_TYPE_LABELS).map(([k, label]) => ({
      key: k, label,
      count:   active.filter(t => t.type === k).length,
      revenue: active.filter(t => t.type === k).reduce((s, t) => s + Number(t.amount ?? 0), 0),
    })).filter(x => x.count > 0);
    return { revenue, count: active.length, voidedCount: voided.length, byType };
  }, [transactions]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ReceiptIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>ประวัติการขาย</Typography>
          <Typography variant="body2" color="text.secondary">
            {branchName ? `สาขา ${branchName}` : 'ทุกสาขา'}
          </Typography>
        </Box>
        <Tooltip title="รีเฟรช">
          <IconButton onClick={fetchTx} disabled={loading}>
            {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Date/Filter toolbar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap">
          <ButtonGroup size="small" variant="outlined" sx={{ flexShrink: 0 }}>
            {([
              { key: 'today',     label: 'วันนี้'       },
              { key: 'yesterday', label: 'เมื่อวาน'     },
              { key: 'week',      label: 'สัปดาห์นี้'   },
              { key: 'month',     label: 'เดือนนี้'     },
            ] as const).map(p => (
              <Button key={p.key} onClick={() => setPreset(p.key)}
                variant={startDate === today && endDate === today && p.key === 'today' ? 'contained' : 'outlined'}
                sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                {p.label}
              </Button>
            ))}
          </ButtonGroup>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="date" size="small" label="ตั้งแต่" InputLabelProps={{ shrink: true }}
              value={startDate} onChange={e => setStartDate(e.target.value)} sx={{ width: 160 }} />
            <Typography variant="body2" color="text.secondary">—</Typography>
            <TextField type="date" size="small" label="ถึง" InputLabelProps={{ shrink: true }}
              value={endDate} onChange={e => setEndDate(e.target.value)} sx={{ width: 160 }} />
          </Stack>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>ประเภท</InputLabel>
            <Select value={txType} label="ประเภท" onChange={e => setTxType(e.target.value)}>
              <MenuItem value="">ทุกประเภท</MenuItem>
              {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">{transactions.length} รายการ</Typography>
          </Box>
        </Stack>
      </Paper>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <KPICard
            label="รายรับสุทธิ"
            value={fmt(kpis.revenue)}
            sub={`${kpis.count} รายการ`}
            color="primary.main"
            icon={<TrendIcon />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KPICard
            label="Walk-in / Guest"
            value={fmt(kpis.byType.find(x => x.key === 'guest_sale')?.revenue ?? 0)}
            sub={`${kpis.byType.find(x => x.key === 'guest_sale')?.count ?? 0} รายการ`}
            color="primary.main"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KPICard
            label="ขายแพ็คเกจ"
            value={fmt(kpis.byType.find(x => x.key === 'package_sale')?.revenue ?? 0)}
            sub={`${kpis.byType.find(x => x.key === 'package_sale')?.count ?? 0} รายการ`}
            color="success.main"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KPICard
            label="Voided"
            value={`${kpis.voidedCount} รายการ`}
            color={kpis.voidedCount > 0 ? 'error.main' : 'text.disabled'}
          />
        </Grid>
      </Grid>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Transaction table */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReceiptIcon fontSize="small" color="action" />
          <Typography fontWeight={700}>รายการทั้งหมด</Typography>
          {loading && <CircularProgress size={16} />}
        </Box>

        {transactions.length === 0 && !loading ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <ReceiptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">ไม่มีรายการในช่วงเวลานี้</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50', width: 140 }}>วันที่ / เวลา</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50', width: 140 }}>ประเภท</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50' }}>รายละเอียด</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50', width: 110 }}>ช่องทางชำระ</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50', width: 100 }}>พนักงาน</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50', width: 120 }} align="right">ยอด</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50', width: 64 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map(tx => {
                  const isVoided = Boolean(tx.is_voided);
                  const typeColor = TX_TYPE_COLORS[tx.type] ?? 'default';
                  return (
                    <TableRow
                      key={tx.id}
                      sx={{
                        opacity: isVoided ? 0.45 : 1,
                        bgcolor: isVoided ? 'grey.50' : 'white',
                        '&:hover': { bgcolor: isVoided ? 'grey.100' : 'action.hover' },
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {new Date(tx.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(tx.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Chip
                          label={TX_TYPE_LABELS[tx.type] ?? tx.type}
                          size="small"
                          color={isVoided ? 'default' : typeColor}
                          variant={isVoided ? 'outlined' : 'filled'}
                          sx={{ fontWeight: 700, fontSize: '10px' }}
                        />
                        {isVoided && (
                          <Chip label="VOID" size="small" color="error" sx={{ fontWeight: 800, fontSize: '10px', ml: 0.5 }} />
                        )}
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" sx={{ textDecoration: isVoided ? 'line-through' : 'none' }}>
                          {tx.course_name || tx.package_name || '—'}
                        </Typography>
                        {isVoided && tx.void_reason && (
                          <Typography variant="caption" color="error.main">
                            เหตุผล: {tx.void_reason}
                          </Typography>
                        )}
                        {!isVoided && tx.branch_name && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {tx.branch_name}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">
                          {PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method ?? '—'}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 90 }}>
                          {tx.staff_name ?? '—'}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Typography
                          variant="body1"
                          fontWeight={800}
                          color={isVoided ? 'text.disabled' : 'primary.main'}
                          sx={{ textDecoration: isVoided ? 'line-through' : 'none' }}
                        >
                          {fmt(tx.amount)}
                        </Typography>
                      </TableCell>

                      <TableCell align="center" sx={{ px: 1 }}>
                        {!isVoided && tx.payment_method !== 'later' && (
                          <Tooltip title="Void Transaction">
                            <IconButton size="small" color="error" onClick={() => setVoidTx(tx)}>
                              <VoidIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Summary footer */}
        {transactions.length > 0 && (
          <Box sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 3, bgcolor: 'grey.50' }}>
            <Typography variant="body2" color="text.secondary">
              รายการที่ valid: <strong>{kpis.count}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              รวม: <strong style={{ color: '#7c3aed' }}>{fmt(kpis.revenue)}</strong>
            </Typography>
          </Box>
        )}
      </Paper>

      <VoidDialog
        open={!!voidTx}
        tx={voidTx}
        onClose={() => setVoidTx(null)}
        onSuccess={() => { setVoidTx(null); fetchTx(); show('Void สำเร็จ'); }}
      />
    </Box>
  );
};

export default POSSalesHistory;
