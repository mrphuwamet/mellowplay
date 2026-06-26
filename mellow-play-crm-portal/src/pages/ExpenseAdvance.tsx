import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  Add as AddIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  HourglassEmpty as PendingIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

interface ExpenseRecord {
  id: number;
  date: string;
  amount: number;
  category: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_by: string;
  note?: string;
}

const CATEGORIES = [
  'ค่าเดินทาง',
  'ค่าอุปกรณ์การสอน',
  'ค่าสื่อการเรียนการสอน',
  'ค่าอาหาร/เครื่องดื่ม',
  'อื่น ๆ',
];

const statusConfig = {
  pending: { label: 'รอพิจารณา', color: 'warning' as const, icon: <PendingIcon fontSize="small" /> },
  approved: { label: 'อนุมัติแล้ว', color: 'success' as const, icon: <ApproveIcon fontSize="small" /> },
  rejected: { label: 'ไม่อนุมัติ', color: 'error' as const, icon: <RejectIcon fontSize="small" /> },
};

const formatBaht = (amount: number) =>
  amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });

const getCurrentUserId = (): number | null => {
  try { return JSON.parse(localStorage.getItem('crm_user') || 'null')?.id ?? null; } catch { return null; }
};

const ExpenseAdvance: React.FC = () => {
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ date: '', amount: '', category: '', description: '' });
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const userId = getCurrentUserId();

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const params = userId ? `?userId=${userId}` : '';
      const res = await axios.get(`${API_BASE}/expense-advances${params}`);
      setRecords(res.data.advances ?? []);
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecords(); }, []);

  const totalApproved = records.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const totalPending = records.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);

  const handleSubmit = async () => {
    if (!form.date || !form.amount || !form.category || !form.description.trim()) {
      setFormError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setFormError('จำนวนเงินไม่ถูกต้อง');
      return;
    }
    try {
      await axios.post(`${API_BASE}/expense-advances`, {
        crmUserId: userId,
        date: form.date,
        amount,
        category: form.category,
        description: form.description.trim(),
      });
      setForm({ date: '', amount: '', category: '', description: '' });
      setFormError('');
      setDialogOpen(false);
      setSuccessMsg('ส่งคำขอเบิกเงินสำรองจ่ายสำเร็จ รอการอนุมัติ');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchRecords();
    } catch {
      setFormError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WalletIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>เบิกเงินสำรองจ่าย</Typography>
            <Typography variant="body2" color="text.secondary">ยื่นคำขอเบิกเงินสำรองจ่ายและติดตามสถานะ</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} sx={{ borderRadius: 3, fontWeight: 700 }}>
          ยื่นคำขอใหม่
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'success.light', bgcolor: 'success.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>ยอดอนุมัติแล้ว</Typography>
            <Typography variant="h5" fontWeight={800} color="success.main">{formatBaht(totalApproved)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'warning.light', bgcolor: 'warning.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>ยอดรอพิจารณา</Typography>
            <Typography variant="h5" fontWeight={800} color="warning.main">{formatBaht(totalPending)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>รายการทั้งหมด</Typography>
            <Typography variant="h5" fontWeight={800}>{records.length} <Typography component="span" variant="body1" fontWeight={600}>รายการ</Typography></Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>จำนวนเงิน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>หมวดหมู่</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>รายละเอียด</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((r) => {
                  const s = statusConfig[r.status];
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.date}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{formatBaht(r.amount)}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell>
                        <Chip icon={s.icon} label={s.label} color={s.color} size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{r.note || '—'}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีรายการเบิกเงิน</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยื่นคำขอเบิกเงินสำรองจ่าย</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            label="วันที่"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="จำนวนเงิน (บาท)"
            type="number"
            fullWidth
            inputProps={{ min: 1, step: 1 }}
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            select
            label="หมวดหมู่"
            fullWidth
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            sx={{ mb: 2 }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="รายละเอียด"
            fullWidth
            multiline
            rows={3}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setDialogOpen(false); setFormError(''); }} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSubmit} sx={{ borderRadius: 3, fontWeight: 700 }}>ส่งคำขอ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExpenseAdvance;
