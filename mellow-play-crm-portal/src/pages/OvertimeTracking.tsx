import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
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
  AccessTime as OTIcon,
  Add as AddIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  HourglassEmpty as PendingIcon,
} from '@mui/icons-material';

interface OTRecord {
  id: number;
  date: string;
  hours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  note?: string;
}

const mockData: OTRecord[] = [
  { id: 1, date: '2026-05-28', hours: 2, reason: 'สอนคลาสพิเศษ', status: 'approved', submittedBy: 'นายสมชาย ใจดี' },
  { id: 2, date: '2026-05-25', hours: 3, reason: 'จัดเตรียมสื่อการสอน', status: 'pending', submittedBy: 'นายสมชาย ใจดี' },
  { id: 3, date: '2026-05-20', hours: 1.5, reason: 'ประชุมทีม', status: 'rejected', submittedBy: 'นายสมชาย ใจดี', note: 'ไม่ครบเอกสาร' },
];

const statusConfig = {
  pending: { label: 'รอพิจารณา', color: 'warning' as const, icon: <PendingIcon fontSize="small" /> },
  approved: { label: 'อนุมัติแล้ว', color: 'success' as const, icon: <ApproveIcon fontSize="small" /> },
  rejected: { label: 'ไม่อนุมัติ', color: 'error' as const, icon: <RejectIcon fontSize="small" /> },
};

const OvertimeTracking: React.FC = () => {
  const [records, setRecords] = useState<OTRecord[]>(mockData);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ date: '', hours: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const totalApprovedHours = records.filter((r) => r.status === 'approved').reduce((s, r) => s + r.hours, 0);
  const totalPendingHours = records.filter((r) => r.status === 'pending').reduce((s, r) => s + r.hours, 0);

  const handleSubmit = () => {
    if (!form.date || !form.hours || !form.reason.trim()) {
      setFormError('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    const hours = parseFloat(form.hours);
    if (isNaN(hours) || hours <= 0) {
      setFormError('จำนวนชั่วโมงไม่ถูกต้อง');
      return;
    }
    const newRecord: OTRecord = {
      id: Date.now(),
      date: form.date,
      hours,
      reason: form.reason.trim(),
      status: 'pending',
      submittedBy: 'ฉัน',
    };
    setRecords((prev) => [newRecord, ...prev]);
    setForm({ date: '', hours: '', reason: '' });
    setFormError('');
    setDialogOpen(false);
    setSuccessMsg('บันทึก OT สำเร็จ รอการอนุมัติจากผู้จัดการ');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <OTIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>บันทึกวันทำงานล่วงเวลา (OT)</Typography>
            <Typography variant="body2" color="text.secondary">ยื่นคำขอ OT และติดตามสถานะการอนุมัติ</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} sx={{ borderRadius: 3, fontWeight: 700 }}>
          บันทึก OT ใหม่
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'success.light', bgcolor: 'success.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>ชั่วโมง OT ที่อนุมัติแล้ว</Typography>
            <Typography variant="h4" fontWeight={800} color="success.main">{totalApprovedHours} <Typography component="span" variant="body1" fontWeight={600}>ชม.</Typography></Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'warning.light', bgcolor: 'warning.50' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>ชั่วโมง OT รอพิจารณา</Typography>
            <Typography variant="h4" fontWeight={800} color="warning.main">{totalPendingHours} <Typography component="span" variant="body1" fontWeight={600}>ชม.</Typography></Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>รายการทั้งหมด</Typography>
            <Typography variant="h4" fontWeight={800}>{records.length} <Typography component="span" variant="body1" fontWeight={600}>รายการ</Typography></Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ชั่วโมง OT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>เหตุผล</TableCell>
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
                    <TableCell>{r.hours} ชม.</TableCell>
                    <TableCell>{r.reason}</TableCell>
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
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีรายการ OT</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>บันทึก OT ใหม่</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            label="วันที่ทำ OT"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="จำนวนชั่วโมง OT"
            type="number"
            fullWidth
            inputProps={{ min: 0.5, step: 0.5 }}
            value={form.hours}
            onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="เหตุผล / รายละเอียด"
            fullWidth
            multiline
            rows={3}
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setDialogOpen(false); setFormError(''); }} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSubmit} sx={{ borderRadius: 3, fontWeight: 700 }}>ส่งคำขอ OT</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OvertimeTracking;
