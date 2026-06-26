import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, Grid, InputLabel, MenuItem, Paper, Select,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip, Typography,
} from '@mui/material';
import {
  Payments as PayoutIcon, CheckCircle as PaidIcon,
  Schedule as PendingIcon, AutoAwesome as GenerateIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

interface PayoutRecord {
  id: number;
  staff_name: string;
  staff_role: string;
  period: string;
  incentive: number;
  ot_hours: number;
  ot_rate: number;
  expense: number;
  total: number;
  status: 'pending' | 'paid';
  paid_at?: string;
}

interface CrmUser { id: number; full_name: string; role: string; }

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

const formatBaht = (amount: number) =>
  amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });

const Payout: React.FC = () => {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  // Generate dialog
  const [genOpen, setGenOpen] = useState(false);
  const [staffList, setStaffList] = useState<CrmUser[]>([]);
  const [genStaffId, setGenStaffId] = useState('');
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/payouts`);
      setPayouts(res.data.payouts ?? []);
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await axios.get(`${API_BASE}/crm-users`);
      setStaffList(res.data.users ?? []);
    } catch {}
  };

  useEffect(() => { fetchPayouts(); fetchStaff(); }, []);

  const totalPending = payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.total, 0);
  const totalPaid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.total, 0);
  const pendingCount = payouts.filter((p) => p.status === 'pending').length;

  const handlePay = async () => {
    if (confirmId === null) return;
    try {
      await axios.put(`${API_BASE}/payouts/${confirmId}/pay`);
      setConfirmId(null);
      setSuccessMsg('บันทึกการจ่าย Payout สำเร็จ');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPayouts();
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  const handleGenerate = async () => {
    if (!genStaffId) return;
    setGenerating(true);
    try {
      const period = `${THAI_MONTHS[genMonth - 1]} ${genYear + 543}`;
      await axios.post(`${API_BASE}/payouts/generate`, {
        crmUserId: parseInt(genStaffId),
        period,
        month: genMonth,
        year: genYear,
      });
      setGenOpen(false);
      setSuccessMsg(`สร้าง Payout ของ ${period} สำเร็จ`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPayouts();
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setGenerating(false);
    }
  };

  const selected = payouts.find((p) => p.id === confirmId);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PayoutIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>ระบบ Payout</Typography>
            <Typography variant="body2" color="text.secondary">จัดการการจ่ายเงินให้พนักงาน (สำหรับ Super Admin / Owner)</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<GenerateIcon />} onClick={() => setGenOpen(true)} sx={{ borderRadius: 3, fontWeight: 700 }}>
          สร้าง Payout
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'warning.light', bgcolor: 'warning.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>รอจ่าย ({pendingCount} คน)</Typography>
            <Typography variant="h5" fontWeight={800} color="warning.main">{formatBaht(totalPending)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'success.light', bgcolor: 'success.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>จ่ายแล้ว</Typography>
            <Typography variant="h5" fontWeight={800} color="success.main">{formatBaht(totalPaid)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>รายการทั้งหมด</Typography>
            <Typography variant="h5" fontWeight={800}>{payouts.length} <Typography component="span" variant="body1" fontWeight={600}>รายการ</Typography></Typography>
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
                  <TableCell sx={{ fontWeight: 700 }}>พนักงาน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>งวด</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">ค่าปฏิบัติงาน/คอม</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">OT</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">เบิกเงิน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">รวม</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">การดำเนินการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: '0.8rem', bgcolor: 'primary.main' }}>
                          {p.staff_name?.[2] || 'A'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{p.staff_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.staff_role}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{p.period}</TableCell>
                    <TableCell align="right">{formatBaht(p.incentive)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title={`${p.ot_hours} ชม. × ${formatBaht(p.ot_rate)}`}>
                        <span>{formatBaht(p.ot_hours * p.ot_rate)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">{formatBaht(p.expense)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>{formatBaht(p.total)}</TableCell>
                    <TableCell>
                      {p.status === 'paid' ? (
                        <Chip icon={<PaidIcon fontSize="small" />} label={`จ่ายแล้ว ${p.paid_at || ''}`} color="success" size="small" sx={{ fontWeight: 700 }} />
                      ) : (
                        <Chip icon={<PendingIcon fontSize="small" />} label="รอจ่าย" color="warning" size="small" sx={{ fontWeight: 700 }} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {p.status === 'pending' && (
                        <Button variant="contained" size="small" onClick={() => setConfirmId(p.id)} sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.75rem' }}>
                          บันทึกจ่าย
                        </Button>
                      )}
                      {p.status === 'paid' && <Typography variant="caption" color="text.secondary">เสร็จสิ้น</Typography>}
                    </TableCell>
                  </TableRow>
                ))}
                {payouts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีรายการ Payout — กด "สร้าง Payout" เพื่อคำนวณ</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Generate Payout Dialog */}
      <Dialog open={genOpen} onClose={() => setGenOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>สร้าง Payout อัตโนมัติ</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            ระบบจะคำนวณค่าปฏิบัติงาน + ค่าคอมมิชชัน + เบิกเงินสำรองที่อนุมัติแล้วโดยอัตโนมัติ
          </Typography>
          <FormControl fullWidth>
            <InputLabel>พนักงาน</InputLabel>
            <Select value={genStaffId} label="พนักงาน" onChange={(e) => setGenStaffId(e.target.value)}>
              {staffList.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>{s.full_name} ({s.role})</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <FormControl fullWidth>
              <InputLabel>เดือน</InputLabel>
              <Select value={genMonth} label="เดือน" onChange={(e) => setGenMonth(Number(e.target.value))}>
                {THAI_MONTHS.map((m, i) => <MenuItem key={i} value={i + 1}>{m}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>ปี (พ.ศ.)</InputLabel>
              <Select value={genYear} label="ปี (พ.ศ.)" onChange={(e) => setGenYear(Number(e.target.value))}>
                {[0, 1, 2].map((offset) => {
                  const y = new Date().getFullYear() - offset;
                  return <MenuItem key={y} value={y}>{y + 543}</MenuItem>;
                })}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setGenOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleGenerate} disabled={!genStaffId || generating} sx={{ borderRadius: 3, fontWeight: 700 }}>
            {generating ? <CircularProgress size={20} /> : 'คำนวณ & สร้าง'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Pay Dialog */}
      <Dialog open={confirmId !== null} onClose={() => setConfirmId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการจ่าย Payout</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selected && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>พนักงาน: <strong>{selected.staff_name}</strong></Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>งวด: <strong>{selected.period}</strong></Typography>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">ค่าปฏิบัติงาน / คอมมิชชัน</Typography>
                <Typography variant="body2">{formatBaht(selected.incentive)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">OT ({selected.ot_hours} ชม.)</Typography>
                <Typography variant="body2">{formatBaht(selected.ot_hours * selected.ot_rate)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">เบิกเงินสำรองจ่าย</Typography>
                <Typography variant="body2">{formatBaht(selected.expense)}</Typography>
              </Box>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography fontWeight={800}>รวมทั้งหมด</Typography>
                <Typography fontWeight={800} color="primary.main">{formatBaht(selected.total)}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="success" onClick={handlePay} sx={{ borderRadius: 3, fontWeight: 700 }}>ยืนยันจ่าย</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Payout;
