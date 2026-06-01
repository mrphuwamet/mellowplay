import { API_URL } from '../config';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
  Typography,
} from '@mui/material';
import {
  Warehouse as StockIcon,
  AddCircle as StockInIcon,
  RemoveCircle as StockOutIcon,
  Tune as AdjustIcon,
  Warning as LowIcon,
  ErrorOutline as OutIcon,
  CheckCircle as OkIcon,
} from '@mui/icons-material';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  currentQty: number;
  minQty: number;
}

type TxnType = 'in' | 'out' | 'adjust';

interface StockTxn {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  unit: string;
  type: TxnType;
  qty: number;
  qtyAfter: number;
  note: string;
  date: string;
  staffName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = `${API_URL}/api/v1/admin`;

const TXN_CONFIG: Record<TxnType, { label: string; color: 'success' | 'error' | 'warning'; sign: string }> = {
  in:     { label: 'รับเข้า',   color: 'success', sign: '+' },
  out:    { label: 'จ่ายออก',   color: 'error',   sign: '-' },
  adjust: { label: 'ปรับปรุง',  color: 'warning', sign: '±' },
};

const EMPTY_ADJ_FORM = { productId: 0, type: 'in' as TxnType, qty: '', note: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getStockStatus = (s: StockItem) =>
  s.currentQty === 0 ? 'out' : s.currentQty < s.minQty ? 'low' : 'ok';

// ─── Component ────────────────────────────────────────────────────────────────

const StockManagement: React.FC = () => {
  const [stock, setStock]       = useState<StockItem[]>([]);
  const [txns, setTxns]         = useState<StockTxn[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [adjOpen, setAdjOpen]   = useState(false);
  const [adjForm, setAdjForm]   = useState(EMPTY_ADJ_FORM);
  const [adjError, setAdjError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchStock = async () => {
    try {
      const res = await axios.get(`${API_BASE}/stock`);
      const mapped: StockItem[] = (res.data.stock || []).map((s: any) => ({
        productId: s.productId,
        sku: s.sku,
        name: s.name,
        unit: s.unit,
        currentQty: s.current_qty,
        minQty: s.min_qty,
      }));
      setStock(mapped);
    } catch (err) {
      console.error('Failed to fetch stock', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/stock/transactions`);
      const mapped: StockTxn[] = (res.data.transactions || []).map((t: any) => ({
        id: t.id,
        productId: t.productId,
        productName: t.product_name ?? t.productName,
        sku: t.sku,
        unit: t.unit,
        type: t.type,
        qty: t.qty,
        qtyAfter: t.qty_after ?? t.qtyAfter,
        note: t.note ?? '',
        date: t.date,
        staffName: t.staff_name ?? t.staffName,
      }));
      setTxns(mapped);
    } catch (err) {
      console.error('Failed to fetch stock transactions', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStock(), fetchTransactions()]);
      setLoading(false);
    };
    init();
  }, []);

  // Stats
  const outCount  = stock.filter(s => getStockStatus(s) === 'out').length;
  const lowCount  = stock.filter(s => getStockStatus(s) === 'low').length;
  const okCount   = stock.filter(s => getStockStatus(s) === 'ok').length;

  const filtered = useMemo(() => stock.filter(s => {
    const st     = getStockStatus(s);
    const matchSt = !filterStatus || st === filterStatus;
    const matchSr = !filterSearch || s.name.toLowerCase().includes(filterSearch.toLowerCase()) || s.sku.toLowerCase().includes(filterSearch.toLowerCase());
    return matchSt && matchSr;
  }), [stock, filterStatus, filterSearch]);

  const openAdj = (productId?: number) => {
    setAdjForm({ ...EMPTY_ADJ_FORM, productId: productId ?? 0 });
    setAdjError('');
    setAdjOpen(true);
  };

  const handleAdjSubmit = async () => {
    if (!adjForm.productId) { setAdjError('กรุณาเลือกสินค้า'); return; }
    const qty = parseInt(adjForm.qty as string);
    if (isNaN(qty) || qty <= 0) { setAdjError('กรุณาระบุจำนวนที่ถูกต้อง'); return; }
    if (!adjForm.note.trim()) { setAdjError('กรุณาระบุหมายเหตุ'); return; }

    const item = stock.find(s => s.productId === adjForm.productId);
    if (!item) return;

    // Client-side validation: out qty must not exceed current stock
    if (adjForm.type === 'out' && qty > item.currentQty) {
      setAdjError(`สต๊อกไม่พอ (มีอยู่ ${item.currentQty} ${item.unit})`);
      return;
    }

    try {
      await axios.post(`${API_BASE}/stock/adjust`, {
        productId: adjForm.productId,
        type: adjForm.type,
        qty,
        note: adjForm.note.trim(),
        date: new Date().toISOString().split('T')[0],
        staffName: 'ฉัน',
      });
      setAdjOpen(false);
      showSuccess(`บันทึกการ${TXN_CONFIG[adjForm.type].label}สำเร็จ`);
      await Promise.all([fetchStock(), fetchTransactions()]);
    } catch (err) {
      console.error('Failed to submit stock adjustment', err);
      setAdjError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  const StatusChip = ({ s }: { s: StockItem }) => {
    const st = getStockStatus(s);
    if (st === 'out') return <Chip size="small" label="หมดสต๊อก" color="error" icon={<OutIcon sx={{ fontSize: '14px !important' }} />} sx={{ fontWeight: 700, fontSize: '0.65rem' }} />;
    if (st === 'low') return <Chip size="small" label="สต๊อกต่ำ"  color="warning" icon={<LowIcon sx={{ fontSize: '14px !important' }} />} sx={{ fontWeight: 700, fontSize: '0.65rem' }} />;
    return <Chip size="small" label="ปกติ" color="success" icon={<OkIcon sx={{ fontSize: '14px !important' }} />} sx={{ fontWeight: 700, fontSize: '0.65rem' }} />;
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <StockIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จัดการสต๊อก</Typography>
            <Typography variant="body2" color="text.secondary">ติดตามปริมาณสต๊อกสินค้า และประวัติการรับ-จ่าย</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AdjustIcon />} onClick={() => openAdj()} sx={{ borderRadius: 3, fontWeight: 700 }}>
          ปรับสต๊อก
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'ปกติ',       value: okCount,  color: 'success.main', bg: '#f0fdf4', icon: <OkIcon />  },
          { label: 'สต๊อกต่ำ',  value: lowCount, color: 'warning.main', bg: '#fffbeb', icon: <LowIcon /> },
          { label: 'หมดสต๊อก',  value: outCount, color: 'error.main',   bg: '#fef2f2', icon: <OutIcon /> },
        ].map(({ label, value, color, bg, icon }) => (
          <Grid item xs={4} key={label}>
            <Paper sx={{ p: 2, borderRadius: 3, textAlign: 'center', bgcolor: bg, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }}
              onClick={() => setFilterStatus(label === 'ปกติ' ? 'ok' : label === 'สต๊อกต่ำ' ? 'low' : 'out')}>
              <Box sx={{ color, mb: 0.5 }}>{icon}</Box>
              <Typography variant="h5" fontWeight={900} color={color}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="ยอดสต๊อกปัจจุบัน" />
          <Tab label={`ประวัติการเคลื่อนไหว (${txns.length})`} />
        </Tabs>
      </Box>

      {/* ── Tab 0: Current stock ─────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" placeholder="ค้นหาชื่อหรือ SKU..."
              value={filterSearch} onChange={e => setFilterSearch(e.target.value)} sx={{ minWidth: 220 }} />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>สถานะ</InputLabel>
              <Select value={filterStatus} label="สถานะ" onChange={e => setFilterStatus(e.target.value as string)}>
                <MenuItem value="">ทั้งหมด</MenuItem>
                <MenuItem value="ok">ปกติ</MenuItem>
                <MenuItem value="low">สต๊อกต่ำ</MenuItem>
                <MenuItem value="out">หมดสต๊อก</MenuItem>
              </Select>
            </FormControl>
            {filterStatus && (
              <Button size="small" onClick={() => setFilterStatus('')} sx={{ fontWeight: 700 }}>ล้างตัวกรอง</Button>
            )}
          </Box>

          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ชื่อสินค้า</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">สต๊อกปัจจุบัน</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">สต๊อกขั้นต่ำ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">สถานะ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">จัดการ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(s => {
                    const st = getStockStatus(s);
                    return (
                      <TableRow key={s.productId} hover sx={{ bgcolor: st === 'out' ? '#fef2f2' : st === 'low' ? '#fffbeb' : 'transparent' }}>
                        <TableCell>
                          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontFamily: 'monospace' }}>{s.sku}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>{s.name}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body1" fontWeight={900}
                            color={st === 'out' ? 'error.main' : st === 'low' ? 'warning.main' : 'text.primary'}>
                            {s.currentQty} {s.unit}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" color="text.secondary">{s.minQty} {s.unit}</Typography>
                        </TableCell>
                        <TableCell align="center"><StatusChip s={s} /></TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Button size="small" variant="outlined" color="success" startIcon={<StockInIcon />}
                              onClick={() => openAdj(s.productId)}
                              sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.7rem', py: 0.25 }}>
                              รับเข้า
                            </Button>
                            <Button size="small" variant="outlined" color="error" startIcon={<StockOutIcon />}
                              onClick={() => { setAdjForm({ ...EMPTY_ADJ_FORM, productId: s.productId, type: 'out' }); setAdjError(''); setAdjOpen(true); }}
                              disabled={s.currentQty === 0}
                              sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.7rem', py: 0.25 }}>
                              จ่ายออก
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่มีสินค้า</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* ── Tab 1: Transaction history ───────────────────────────────────────── */}
      {tab === 1 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>SKU / สินค้า</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">ประเภท</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">จำนวน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">คงเหลือหลัง</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>ผู้บันทึก</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {txns.map(t => {
                  const cfg = TXN_CONFIG[t.type];
                  return (
                    <TableRow key={t.id} hover>
                      <TableCell><Typography variant="body2" color="text.secondary">{t.date}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>{t.sku}</Typography>
                        <Typography variant="body2" fontWeight={700}>{t.productName}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={cfg.label} color={cfg.color} sx={{ fontWeight: 700, fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={800} color={cfg.color + '.main'}>
                          {cfg.sign}{t.qty} {t.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700}>{t.qtyAfter} {t.unit}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{t.note}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{t.staffName}</Typography></TableCell>
                    </TableRow>
                  );
                })}
                {txns.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่มีประวัติการเคลื่อนไหว</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── Adjustment Dialog ────────────────────────────────────────────────── */}
      <Dialog open={adjOpen} onClose={() => setAdjOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>ปรับสต๊อก</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {adjError && <Alert severity="error" sx={{ mb: 2 }}>{adjError}</Alert>}

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>สินค้า</InputLabel>
            <Select value={adjForm.productId} label="สินค้า"
              onChange={e => setAdjForm(f => ({ ...f, productId: Number(e.target.value) }))}>
              <MenuItem value={0} disabled>เลือกสินค้า</MenuItem>
              {stock.map(s => (
                <MenuItem key={s.productId} value={s.productId}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>{s.name}</span>
                    <Typography variant="caption" color="text.secondary">{s.currentQty} {s.unit}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>ประเภท</InputLabel>
            <Select value={adjForm.type} label="ประเภท" onChange={e => setAdjForm(f => ({ ...f, type: e.target.value as TxnType }))}>
              <MenuItem value="in">รับเข้า (+)</MenuItem>
              <MenuItem value="out">จ่ายออก (−)</MenuItem>
              <MenuItem value="adjust">ปรับปรุงยอด (ระบุจำนวนที่ถูกต้อง)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label={adjForm.type === 'adjust' ? 'จำนวนที่ถูกต้อง' : 'จำนวน'}
            type="number" fullWidth sx={{ mb: 2 }}
            value={adjForm.qty}
            onChange={e => setAdjForm(f => ({ ...f, qty: e.target.value }))}
            inputProps={{ min: 0 }}
            helperText={adjForm.type === 'adjust' ? 'ระบุปริมาณสต๊อกที่นับได้จริง' : undefined}
          />

          <TextField
            label="หมายเหตุ" fullWidth multiline rows={2}
            value={adjForm.note}
            onChange={e => setAdjForm(f => ({ ...f, note: e.target.value }))}
            placeholder="เช่น รับจากซัพพลายเออร์, ชำรุด, ผลการตรวจนับ..."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAdjOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAdjSubmit} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StockManagement;
