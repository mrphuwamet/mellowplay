import React, { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
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
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Payments as PayoutIcon,
  CheckCircle as PaidIcon,
  Schedule as PendingIcon,
  Add as AddIcon,
} from '@mui/icons-material';

interface PayoutRecord {
  id: number;
  staffName: string;
  staffRole: string;
  period: string;
  incentive: number;
  otHours: number;
  otRate: number;
  expense: number;
  total: number;
  status: 'pending' | 'paid';
  paidAt?: string;
}

const mockPayouts: PayoutRecord[] = [
  {
    id: 1, staffName: 'นายสมชาย ใจดี', staffRole: 'Play Facilitator', period: 'พฤษภาคม 2026',
    incentive: 8500, otHours: 5, otRate: 150, expense: 500, total: 9750, status: 'pending',
  },
  {
    id: 2, staffName: 'นางสาวมณี รักดี', staffRole: 'Play Facilitator', period: 'พฤษภาคม 2026',
    incentive: 6000, otHours: 2, otRate: 150, expense: 0, total: 6300, status: 'paid', paidAt: '2026-05-30',
  },
  {
    id: 3, staffName: 'นายประเสริฐ ทำงานดี', staffRole: 'Operator', period: 'เมษายน 2026',
    incentive: 5000, otHours: 0, otRate: 150, expense: 1200, total: 6200, status: 'paid', paidAt: '2026-04-30',
  },
];

const formatBaht = (amount: number) =>
  amount.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });

const Payout: React.FC = () => {
  const [payouts, setPayouts] = useState<PayoutRecord[]>(mockPayouts);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const totalPending = payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.total, 0);
  const totalPaid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.total, 0);
  const pendingCount = payouts.filter((p) => p.status === 'pending').length;

  const confirmPay = (id: number) => setConfirmId(id);

  const handlePay = () => {
    if (confirmId === null) return;
    setPayouts((prev) =>
      prev.map((p) =>
        p.id === confirmId ? { ...p, status: 'paid', paidAt: new Date().toISOString().slice(0, 10) } : p
      )
    );
    setConfirmId(null);
    setSuccessMsg('บันทึกการจ่าย Payout สำเร็จ');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const selected = payouts.find((p) => p.id === confirmId);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <PayoutIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>ระบบ Payout</Typography>
          <Typography variant="body2" color="text.secondary">จัดการการจ่ายเงินให้พนักงาน (สำหรับ Super Admin / Owner)</Typography>
        </Box>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'warning.light', bgcolor: 'warning.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>รอจ่าย ({pendingCount} คน)</Typography>
            <Typography variant="h5" fontWeight={800} color="warning.main">{formatBaht(totalPending)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'success.light', bgcolor: 'success.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>จ่ายแล้วเดือนนี้</Typography>
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
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>พนักงาน</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>งวด</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Incentive</TableCell>
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
                        {p.staffName[2] || 'A'}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>{p.staffName}</Typography>
                        <Typography variant="caption" color="text.secondary">{p.staffRole}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{p.period}</TableCell>
                  <TableCell align="right">{formatBaht(p.incentive)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title={`${p.otHours} ชม. × ${formatBaht(p.otRate)}`}>
                      <span>{formatBaht(p.otHours * p.otRate)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">{formatBaht(p.expense)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>{formatBaht(p.total)}</TableCell>
                  <TableCell>
                    {p.status === 'paid' ? (
                      <Chip icon={<PaidIcon fontSize="small" />} label={`จ่ายแล้ว ${p.paidAt || ''}`} color="success" size="small" sx={{ fontWeight: 700 }} />
                    ) : (
                      <Chip icon={<PendingIcon fontSize="small" />} label="รอจ่าย" color="warning" size="small" sx={{ fontWeight: 700 }} />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {p.status === 'pending' && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => confirmPay(p.id)}
                        sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.75rem' }}
                      >
                        บันทึกจ่าย
                      </Button>
                    )}
                    {p.status === 'paid' && (
                      <Typography variant="caption" color="text.secondary">เสร็จสิ้น</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {payouts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีรายการ Payout</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={confirmId !== null} onClose={() => setConfirmId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการจ่าย Payout</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selected && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>พนักงาน: <strong>{selected.staffName}</strong></Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>งวด: <strong>{selected.period}</strong></Typography>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">Incentive</Typography>
                <Typography variant="body2">{formatBaht(selected.incentive)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">OT ({selected.otHours} ชม.)</Typography>
                <Typography variant="body2">{formatBaht(selected.otHours * selected.otRate)}</Typography>
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
