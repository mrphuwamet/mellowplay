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
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccessTime as ClockIcon,
  CheckCircle as CheckInIcon,
  Cancel as CheckOutIcon,
  Add as AddIcon,
  ThumbUp as ApproveIcon,
  ThumbDown as RejectIcon,
  Pending as PendingIcon,
  Schedule as OTIcon,
  CalendarToday as DateIcon,
} from '@mui/icons-material';

interface AttendanceRecord {
  id: number;
  date: string;
  checkIn: string;
  checkOut: string;
  hours: number;
  otHours: number;
  status: 'normal' | 'late' | 'ot' | 'absent';
  note?: string;
}

interface OTRequest {
  id: number;
  staffName: string;
  staffRole: string;
  date: string;
  hours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approverNote?: string;
}

const mockAttendance: AttendanceRecord[] = [
  { id: 1, date: '2026-05-30', checkIn: '09:02', checkOut: '18:30', hours: 9.47, otHours: 0.5, status: 'ot' },
  { id: 2, date: '2026-05-29', checkIn: '08:55', checkOut: '18:00', hours: 9.08, otHours: 0, status: 'normal' },
  { id: 3, date: '2026-05-28', checkIn: '09:35', checkOut: '18:00', hours: 8.42, otHours: 0, status: 'late' },
  { id: 4, date: '2026-05-27', checkIn: '09:00', checkOut: '18:00', hours: 9.0, otHours: 0, status: 'normal' },
  { id: 5, date: '2026-05-26', checkIn: '09:00', checkOut: '20:00', hours: 11.0, otHours: 2, status: 'ot' },
];

const mockOTRequests: OTRequest[] = [
  { id: 1, staffName: 'นายสมชาย ใจดี', staffRole: 'Play Facilitator', date: '2026-05-30', hours: 0.5, reason: 'สอนคลาสพิเศษต่อเนื่อง', status: 'pending' },
  { id: 2, staffName: 'นางสาวมณี รักดี', staffRole: 'Play Facilitator', date: '2026-05-26', hours: 2, reason: 'จัดกิจกรรมพิเศษ', status: 'approved', approverNote: 'อนุมัติ' },
  { id: 3, staffName: 'นายประเสริฐ ทำงานดี', staffRole: 'Operator', date: '2026-05-20', hours: 1, reason: 'ประชุมนอกเวลา', status: 'rejected', approverNote: 'ไม่เข้าเงื่อนไข OT' },
];

const statusLabel: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  normal: { label: 'ปกติ', color: 'success' },
  late: { label: 'สาย', color: 'warning' },
  ot: { label: 'OT', color: 'info' },
  absent: { label: 'ขาดงาน', color: 'error' },
};

const otStatusLabel: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  pending: { label: 'รอพิจารณา', color: 'warning' },
  approved: { label: 'อนุมัติแล้ว', color: 'success' },
  rejected: { label: 'ไม่อนุมัติ', color: 'error' },
};

interface AttendanceManagementProps {
  canApprove?: boolean;
}

const AttendanceManagement: React.FC<AttendanceManagementProps> = ({ canApprove = false }) => {
  const [tab, setTab] = useState(0);
  const [attendance] = useState<AttendanceRecord[]>(mockAttendance);
  const [otRequests, setOtRequests] = useState<OTRequest[]>(mockOTRequests);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState('');
  const [otDialogOpen, setOtDialogOpen] = useState(false);
  const [otForm, setOtForm] = useState({ date: '', hours: '', reason: '' });
  const [otFormError, setOtFormError] = useState('');
  const [approveDialogId, setApproveDialogId] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleCheckIn = () => {
    const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    setCheckedIn(true);
    setCheckInTime(now);
    showSuccess(`บันทึกเวลาเข้างาน ${now} เรียบร้อย`);
  };

  const handleCheckOut = () => {
    const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    setCheckedIn(false);
    showSuccess(`บันทึกเวลาออกงาน ${now} เรียบร้อย`);
  };

  const handleOTSubmit = () => {
    if (!otForm.date || !otForm.hours || !otForm.reason.trim()) {
      setOtFormError('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    const hours = parseFloat(otForm.hours);
    if (isNaN(hours) || hours <= 0) {
      setOtFormError('จำนวนชั่วโมงไม่ถูกต้อง');
      return;
    }
    const newRequest: OTRequest = {
      id: Date.now(),
      staffName: 'ฉัน',
      staffRole: 'Staff',
      date: otForm.date,
      hours,
      reason: otForm.reason.trim(),
      status: 'pending',
    };
    setOtRequests((prev) => [newRequest, ...prev]);
    setOtForm({ date: '', hours: '', reason: '' });
    setOtFormError('');
    setOtDialogOpen(false);
    showSuccess('ส่งคำขอ OT สำเร็จ รอการอนุมัติจากผู้จัดการ');
  };

  const handleApprove = (id: number) => {
    setOtRequests((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: 'approved', approverNote: approveNote || 'อนุมัติ' } : r)
    );
    setApproveDialogId(null);
    setApproveNote('');
    showSuccess('อนุมัติ OT เรียบร้อย');
  };

  const handleReject = (id: number) => {
    setOtRequests((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: 'rejected', approverNote: approveNote || 'ไม่อนุมัติ' } : r)
    );
    setRejectDialogId(null);
    setApproveNote('');
    showSuccess('ปฏิเสธ OT เรียบร้อย');
  };

  const pendingOTCount = otRequests.filter((r) => r.status === 'pending').length;

  const totalWorkHours = attendance.reduce((s, a) => s + a.hours, 0);
  const totalOTHours = attendance.reduce((s, a) => s + a.otHours, 0);
  const lateCount = attendance.filter((a) => a.status === 'late').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ClockIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>บันทึกวันทำงาน / OT</Typography>
          <Typography variant="body2" color="text.secondary">ติดตามเวลาเข้า-ออกงาน และการทำงานล่วงเวลา</Typography>
        </Box>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Today's check-in card */}
      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3, border: '1px solid', borderColor: checkedIn ? 'success.light' : 'divider', bgcolor: checkedIn ? 'success.50' : 'background.paper' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">วันนี้ — {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Typography>
            <Typography variant="h6" fontWeight={800} color={checkedIn ? 'success.main' : 'text.primary'}>
              {checkedIn ? `เข้างานแล้ว เมื่อ ${checkInTime}` : 'ยังไม่ได้บันทึกเวลาเข้างาน'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {!checkedIn ? (
              <Button variant="contained" color="success" startIcon={<CheckInIcon />} onClick={handleCheckIn} sx={{ borderRadius: 3, fontWeight: 700 }}>
                บันทึกเข้างาน
              </Button>
            ) : (
              <Button variant="outlined" color="error" startIcon={<CheckOutIcon />} onClick={handleCheckOut} sx={{ borderRadius: 3, fontWeight: 700 }}>
                บันทึกออกงาน
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>ชั่วโมงทำงาน</Typography>
            <Typography variant="h5" fontWeight={800}>{totalWorkHours.toFixed(1)}</Typography>
            <Typography variant="caption" color="text.secondary">ชั่วโมง (เดือนนี้)</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, borderRadius: 3, textAlign: 'center', bgcolor: 'info.50', border: '1px solid', borderColor: 'info.light' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>ชั่วโมง OT</Typography>
            <Typography variant="h5" fontWeight={800} color="info.main">{totalOTHours.toFixed(1)}</Typography>
            <Typography variant="caption" color="text.secondary">ชั่วโมง (เดือนนี้)</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, borderRadius: 3, textAlign: 'center', bgcolor: lateCount > 0 ? 'warning.50' : undefined, border: '1px solid', borderColor: lateCount > 0 ? 'warning.light' : 'divider' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>มาสาย</Typography>
            <Typography variant="h5" fontWeight={800} color={lateCount > 0 ? 'warning.main' : 'text.primary'}>{lateCount}</Typography>
            <Typography variant="caption" color="text.secondary">ครั้ง (เดือนนี้)</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>วันทำงาน</Typography>
            <Typography variant="h5" fontWeight={800}>{attendance.length}</Typography>
            <Typography variant="caption" color="text.secondary">วัน (เดือนนี้)</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="ประวัติเวลาทำงาน" />
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>คำขอ OT {pendingOTCount > 0 && tab !== 1 && <Chip label={pendingOTCount} size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem' }} />}</Box>} />
          {canApprove && <Tab label="อนุมัติคำขอ (Manager)" />}
        </Tabs>
      </Box>

      {/* Tab 0: Attendance log */}
      {tab === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>เวลาเข้า</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>เวลาออก</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">รวม (ชม.)</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">OT (ชม.)</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {attendance.map((r) => {
                  const s = statusLabel[r.status];
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.checkIn}</TableCell>
                      <TableCell>{r.checkOut}</TableCell>
                      <TableCell align="right">{r.hours.toFixed(2)}</TableCell>
                      <TableCell align="right">{r.otHours > 0 ? r.otHours.toFixed(1) : '—'}</TableCell>
                      <TableCell>
                        <Chip label={s.label} color={s.color} size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab 1: OT requests */}
      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOtDialogOpen(true)} sx={{ borderRadius: 3, fontWeight: 700 }}>
              ขอ OT ใหม่
            </Button>
          </Box>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">ชั่วโมง OT</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>เหตุผล</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>หมายเหตุจาก Manager</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {otRequests.filter((r) => r.staffName === 'ฉัน' || r.staffName !== 'ฉัน').map((r) => {
                    const s = otStatusLabel[r.status];
                    return (
                      <TableRow key={r.id} hover>
                        <TableCell>{r.date}</TableCell>
                        <TableCell align="right">{r.hours} ชม.</TableCell>
                        <TableCell>{r.reason}</TableCell>
                        <TableCell>
                          <Chip label={s.label} color={s.color} size="small" sx={{ fontWeight: 700 }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{r.approverNote || '—'}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {otRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>ไม่มีคำขอ OT</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* Tab 2: Manager approval */}
      {canApprove && tab === 2 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>พนักงาน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">ชั่วโมง OT</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>เหตุผล</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">การดำเนินการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {otRequests.map((r) => {
                  const s = otStatusLabel[r.status];
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                            {r.staffName[2] || 'A'}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={700}>{r.staffName}</Typography>
                            <Typography variant="caption" color="text.secondary">{r.staffRole}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell align="right">{r.hours} ชม.</TableCell>
                      <TableCell>{r.reason}</TableCell>
                      <TableCell>
                        <Chip label={s.label} color={s.color} size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell align="center">
                        {r.status === 'pending' ? (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                            <Tooltip title="อนุมัติ">
                              <Button size="small" variant="contained" color="success" onClick={() => { setApproveDialogId(r.id); setApproveNote(''); }} sx={{ minWidth: 0, px: 1.5, borderRadius: 2 }}>
                                <ApproveIcon fontSize="small" />
                              </Button>
                            </Tooltip>
                            <Tooltip title="ปฏิเสธ">
                              <Button size="small" variant="outlined" color="error" onClick={() => { setRejectDialogId(r.id); setApproveNote(''); }} sx={{ minWidth: 0, px: 1.5, borderRadius: 2 }}>
                                <RejectIcon fontSize="small" />
                              </Button>
                            </Tooltip>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">{r.approverNote || '—'}</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {otRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>ไม่มีคำขอที่รอพิจารณา</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* OT Request Dialog */}
      <Dialog open={otDialogOpen} onClose={() => setOtDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ขอทำงานล่วงเวลา (OT)</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {otFormError && <Alert severity="error" sx={{ mb: 2 }}>{otFormError}</Alert>}
          <TextField
            label="วันที่ทำ OT"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={otForm.date}
            onChange={(e) => setOtForm((p) => ({ ...p, date: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="จำนวนชั่วโมง OT"
            type="number"
            fullWidth
            inputProps={{ min: 0.5, step: 0.5 }}
            value={otForm.hours}
            onChange={(e) => setOtForm((p) => ({ ...p, hours: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="เหตุผล / รายละเอียด"
            fullWidth
            multiline
            rows={3}
            value={otForm.reason}
            onChange={(e) => setOtForm((p) => ({ ...p, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setOtDialogOpen(false); setOtFormError(''); }} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleOTSubmit} sx={{ borderRadius: 3, fontWeight: 700 }}>ส่งคำขอ OT</Button>
        </DialogActions>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogId !== null} onClose={() => setApproveDialogId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'success.main' }}>ยืนยันอนุมัติ OT</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="หมายเหตุ (ถ้ามี)" fullWidth value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveDialogId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="success" onClick={() => handleApprove(approveDialogId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>อนุมัติ</Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogId !== null} onClose={() => setRejectDialogId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ยืนยันปฏิเสธ OT</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="เหตุผลที่ปฏิเสธ" fullWidth value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectDialogId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => handleReject(rejectDialogId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ปฏิเสธ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AttendanceManagement;
