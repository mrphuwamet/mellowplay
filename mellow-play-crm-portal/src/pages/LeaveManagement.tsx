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
  LinearProgress,
  MenuItem,
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
  BeachAccess as AnnualIcon,
  LocalHospital as SickIcon,
  Work as PersonalIcon,
  Add as AddIcon,
  ThumbUp as ApproveIcon,
  ThumbDown as RejectIcon,
  EventNote as LeaveIcon,
  Settings as PolicyIcon,
} from '@mui/icons-material';

type LeaveType = 'annual' | 'sick' | 'personal';
type LeaveStatus = 'pending' | 'approved' | 'rejected';

interface LeaveRequest {
  id: number;
  staffName: string;
  staffRole: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approverNote?: string;
  isPaid: boolean;
}

interface LeavePolicy {
  annual: number;
  sick: number;
  personal: number;
}

interface LeaveBalance {
  annual: { used: number; total: number };
  sick: { used: number; total: number };
  personal: { used: number; total: number };
}

const defaultPolicy: LeavePolicy = { annual: 10, sick: 30, personal: 3 };

const mockRequests: LeaveRequest[] = [
  { id: 1, staffName: 'ฉัน', staffRole: 'Play Facilitator', type: 'annual', startDate: '2026-06-10', endDate: '2026-06-12', days: 3, reason: 'เดินทางพักผ่อน', status: 'approved', isPaid: false },
  { id: 2, staffName: 'ฉัน', staffRole: 'Play Facilitator', type: 'sick', startDate: '2026-05-15', endDate: '2026-05-15', days: 1, reason: 'ป่วยไข้', status: 'approved', isPaid: false },
  { id: 3, staffName: 'ฉัน', staffRole: 'Play Facilitator', type: 'personal', startDate: '2026-05-01', endDate: '2026-05-01', days: 1, reason: 'ธุระส่วนตัว', status: 'pending', isPaid: false },
  { id: 4, staffName: 'นายสมชาย ใจดี', staffRole: 'Play Facilitator', type: 'annual', startDate: '2026-06-20', endDate: '2026-06-21', days: 2, reason: 'พักผ่อน', status: 'pending', isPaid: false },
  { id: 5, staffName: 'นางสาวมณี รักดี', staffRole: 'Play Facilitator', type: 'sick', startDate: '2026-05-28', endDate: '2026-05-28', days: 1, reason: 'ป่วย', status: 'approved', isPaid: false },
  { id: 6, staffName: 'นายประเสริฐ ทำงานดี', staffRole: 'Operator', type: 'personal', startDate: '2026-06-05', endDate: '2026-06-05', days: 1, reason: 'ธุระด่วน', status: 'pending', isPaid: false },
];

const leaveTypeConfig: Record<LeaveType, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  annual: { label: 'ลาพักร้อน', icon: <AnnualIcon />, color: '#2196f3', bgColor: '#e3f2fd' },
  sick: { label: 'ลาป่วย', icon: <SickIcon />, color: '#f44336', bgColor: '#fce4ec' },
  personal: { label: 'ลากิจ', icon: <PersonalIcon />, color: '#ff9800', bgColor: '#fff3e0' },
};

const statusConfig: Record<LeaveStatus, { label: string; color: 'warning' | 'success' | 'error' }> = {
  pending: { label: 'รอพิจารณา', color: 'warning' },
  approved: { label: 'อนุมัติแล้ว', color: 'success' },
  rejected: { label: 'ไม่อนุมัติ', color: 'error' },
};

const diffDays = (start: string, end: string): number => {
  const d1 = new Date(start);
  const d2 = new Date(end);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
};

interface LeaveManagementProps {
  canApprove?: boolean;
  isAdmin?: boolean;
}

const LeaveManagement: React.FC<LeaveManagementProps> = ({ canApprove = false, isAdmin = false }) => {
  const [tab, setTab] = useState(0);
  const [requests, setRequests] = useState<LeaveRequest[]>(mockRequests);
  const [policy, setPolicy] = useState<LeavePolicy>(defaultPolicy);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [form, setForm] = useState({ type: 'annual' as LeaveType, startDate: '', endDate: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [approveDialogId, setApproveDialogId] = useState<number | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [approverNote, setApproverNote] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [policyEdit, setPolicyEdit] = useState<LeavePolicy>(defaultPolicy);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const myRequests = requests.filter((r) => r.staffName === 'ฉัน');
  const allStaffRequests = requests.filter((r) => r.staffName !== 'ฉัน');

  const balance: LeaveBalance = {
    annual: { used: myRequests.filter((r) => r.type === 'annual' && r.status === 'approved').reduce((s, r) => s + r.days, 0), total: policy.annual },
    sick: { used: myRequests.filter((r) => r.type === 'sick' && r.status === 'approved').reduce((s, r) => s + r.days, 0), total: policy.sick },
    personal: { used: myRequests.filter((r) => r.type === 'personal' && r.status === 'approved').reduce((s, r) => s + r.days, 0), total: policy.personal },
  };

  const handleRequestSubmit = () => {
    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      setFormError('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError('วันที่สิ้นสุดต้องหลังวันที่เริ่มต้น');
      return;
    }
    const days = diffDays(form.startDate, form.endDate);
    const remaining = balance[form.type].total - balance[form.type].used;
    if (days > remaining) {
      setFormError(`วันลาคงเหลือไม่พอ (เหลือ ${remaining} วัน)`);
      return;
    }
    const newReq: LeaveRequest = {
      id: Date.now(),
      staffName: 'ฉัน',
      staffRole: 'Staff',
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      days,
      reason: form.reason.trim(),
      status: 'pending',
      isPaid: false,
    };
    setRequests((prev) => [newReq, ...prev]);
    setForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
    setFormError('');
    setRequestDialogOpen(false);
    showSuccess(`ส่งคำขอ${leaveTypeConfig[newReq.type].label}สำเร็จ (${days} วัน) รอการอนุมัติ`);
  };

  const handleApprove = (id: number) => {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: 'approved', approverNote: approverNote || 'อนุมัติ' } : r));
    setApproveDialogId(null);
    setApproverNote('');
    showSuccess('อนุมัติวันลาเรียบร้อย');
  };

  const handleReject = (id: number) => {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: 'rejected', approverNote: approverNote || 'ไม่อนุมัติ' } : r));
    setRejectDialogId(null);
    setApproverNote('');
    showSuccess('ปฏิเสธคำขอวันลาเรียบร้อย');
  };

  const handleSavePolicy = () => {
    setPolicy({ ...policyEdit });
    showSuccess('บันทึกนโยบายวันลาเรียบร้อย');
  };

  const pendingApprovalCount = allStaffRequests.filter((r) => r.status === 'pending').length;

  const tabList = [
    { label: 'วันลาของฉัน' },
    ...(canApprove ? [{ label: `อนุมัติวันลา${pendingApprovalCount > 0 ? ` (${pendingApprovalCount})` : ''}` }] : []),
    ...(isAdmin ? [{ label: 'นโยบายวันลา' }] : []),
  ];

  const approvalTabIndex = canApprove ? 1 : -1;
  const policyTabIndex = isAdmin ? (canApprove ? 2 : 1) : -1;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LeaveIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>ระบบลางาน</Typography>
            <Typography variant="body2" color="text.secondary">จัดการวันลาและติดตามสิทธิ์วันลาประจำปี</Typography>
          </Box>
        </Box>
        {tab === 0 && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRequestDialogOpen(true)} sx={{ borderRadius: 3, fontWeight: 700 }}>
            ขอลา
          </Button>
        )}
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Leave balance cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(Object.entries(leaveTypeConfig) as [LeaveType, typeof leaveTypeConfig[LeaveType]][]).map(([type, cfg]) => {
          const bal = balance[type];
          const pct = bal.total > 0 ? (bal.used / bal.total) * 100 : 0;
          const remaining = bal.total - bal.used;
          return (
            <Grid item xs={12} sm={4} key={type}>
              <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box sx={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</Box>
                  <Typography fontWeight={700}>{cfg.label}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">ใช้ไป</Typography>
                  <Typography variant="body2" fontWeight={700}>{bal.used} / {bal.total} วัน</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(pct, 100)}
                  sx={{
                    height: 8, borderRadius: 4, mb: 1,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': { bgcolor: pct >= 100 ? 'error.main' : cfg.color, borderRadius: 4 },
                  }}
                />
                <Typography variant="caption" sx={{ color: remaining <= 2 ? 'error.main' : 'text.secondary', fontWeight: remaining <= 2 ? 700 : 400 }}>
                  เหลือ {remaining} วัน
                  {remaining === 0 && ' (หมดสิทธิ์แล้ว)'}
                </Typography>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" fontWeight={600}>หมายเหตุเกี่ยวกับการลา</Typography>
        <Typography variant="body2">• พนักงานที่ได้รับค่าจ้างรายวัน: <strong>วันที่ลาทุกประเภทจะไม่ได้รับค่าจ้าง</strong></Typography>
        <Typography variant="body2">• พนักงานรายเดือน: กรุณาตรวจสอบข้อกำหนดในสัญญาจ้าง</Typography>
      </Alert>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {tabList.map((t, i) => <Tab key={i} label={t.label} />)}
        </Tabs>
      </Box>

      {/* Tab: My leave requests */}
      {tab === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>ประเภทการลา</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่เริ่ม</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่สิ้นสุด</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">จำนวนวัน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>เหตุผล</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {myRequests.map((r) => {
                  const ltc = leaveTypeConfig[r.type];
                  const sc = statusConfig[r.status];
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Chip
                          icon={ltc.icon as React.ReactElement}
                          label={ltc.label}
                          size="small"
                          sx={{ fontWeight: 700, bgcolor: ltc.bgColor, color: ltc.color, border: 'none' }}
                        />
                      </TableCell>
                      <TableCell>{r.startDate}</TableCell>
                      <TableCell>{r.endDate}</TableCell>
                      <TableCell align="center">{r.days} วัน</TableCell>
                      <TableCell>{r.reason}</TableCell>
                      <TableCell>
                        <Chip label={sc.label} color={sc.color} size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{r.approverNote || '—'}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {myRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีรายการลา</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab: Manager approval */}
      {canApprove && tab === approvalTabIndex && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>พนักงาน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>ประเภท</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>วันที่ลา</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">วัน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>เหตุผล</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">การดำเนินการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allStaffRequests.map((r) => {
                  const ltc = leaveTypeConfig[r.type];
                  const sc = statusConfig[r.status];
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
                      <TableCell>
                        <Chip
                          label={ltc.label}
                          size="small"
                          sx={{ fontWeight: 700, bgcolor: ltc.bgColor, color: ltc.color, border: 'none' }}
                        />
                      </TableCell>
                      <TableCell>{r.startDate}{r.startDate !== r.endDate ? ` ถึง ${r.endDate}` : ''}</TableCell>
                      <TableCell align="center">{r.days} วัน</TableCell>
                      <TableCell>{r.reason}</TableCell>
                      <TableCell>
                        <Chip label={sc.label} color={sc.color} size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell align="center">
                        {r.status === 'pending' ? (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                            <Tooltip title="อนุมัติ">
                              <Button size="small" variant="contained" color="success" onClick={() => { setApproveDialogId(r.id); setApproverNote(''); }} sx={{ minWidth: 0, px: 1.5, borderRadius: 2 }}>
                                <ApproveIcon fontSize="small" />
                              </Button>
                            </Tooltip>
                            <Tooltip title="ปฏิเสธ">
                              <Button size="small" variant="outlined" color="error" onClick={() => { setRejectDialogId(r.id); setApproverNote(''); }} sx={{ minWidth: 0, px: 1.5, borderRadius: 2 }}>
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
                {allStaffRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>ไม่มีคำขอที่รอพิจารณา</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab: Leave Policy (Admin only) */}
      {isAdmin && tab === policyTabIndex && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <PolicyIcon color="primary" />
            <Typography variant="h6" fontWeight={800}>กำหนดนโยบายวันลาประจำปี</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            ตั้งค่าจำนวนวันลาสูงสุดที่พนักงานสามารถใช้ได้ในแต่ละปี แยกตามประเภท
          </Typography>
          <Grid container spacing={3}>
            {(Object.entries(leaveTypeConfig) as [LeaveType, typeof leaveTypeConfig[LeaveType]][]).map(([type, cfg]) => (
              <Grid item xs={12} sm={4} key={type}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Box sx={{ color: cfg.color }}>{cfg.icon}</Box>
                    <Typography fontWeight={700}>{cfg.label}</Typography>
                  </Box>
                  <TextField
                    label="จำนวนวันสูงสุด / ปี"
                    type="number"
                    fullWidth
                    size="small"
                    inputProps={{ min: 0, step: 1 }}
                    value={policyEdit[type]}
                    onChange={(e) => setPolicyEdit((p) => ({ ...p, [type]: parseInt(e.target.value) || 0 }))}
                  />
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Alert severity="warning" sx={{ mt: 3 }}>
            <Typography variant="body2">
              <strong>หมายเหตุ:</strong> การเปลี่ยนแปลงนโยบายวันลาจะมีผลกับพนักงานทุกคน สิทธิ์วันลาที่ใช้ไปแล้วจะไม่เปลี่ยนแปลง
            </Typography>
          </Alert>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSavePolicy} sx={{ borderRadius: 3, fontWeight: 700 }}>
              บันทึกนโยบาย
            </Button>
          </Box>
        </Paper>
      )}

      {/* Request Leave Dialog */}
      <Dialog open={requestDialogOpen} onClose={() => setRequestDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ขอลา</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            select
            label="ประเภทการลา"
            fullWidth
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as LeaveType }))}
            sx={{ mb: 2 }}
          >
            {(Object.entries(leaveTypeConfig) as [LeaveType, typeof leaveTypeConfig[LeaveType]][]).map(([type, cfg]) => (
              <MenuItem key={type} value={type}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</Box>
                  {cfg.label}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    เหลือ {balance[type].total - balance[type].used} วัน
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                label="วันที่เริ่มลา"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value, endDate: e.target.value }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="วันที่สิ้นสุด"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                inputProps={{ min: form.startDate }}
              />
            </Grid>
          </Grid>
          {form.startDate && form.endDate && (
            <Alert severity="info" sx={{ mb: 2 }}>
              จำนวนวันลา: <strong>{diffDays(form.startDate, form.endDate)} วัน</strong>
              {' '}— วันลาประเภทนี้จะ<strong>ไม่ได้รับค่าจ้าง</strong> (สำหรับพนักงานรายวัน)
            </Alert>
          )}
          <TextField
            label="เหตุผลการลา"
            fullWidth
            multiline
            rows={3}
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setRequestDialogOpen(false); setFormError(''); }} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleRequestSubmit} sx={{ borderRadius: 3, fontWeight: 700 }}>ส่งคำขอลา</Button>
        </DialogActions>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogId !== null} onClose={() => setApproveDialogId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'success.main' }}>ยืนยันอนุมัติวันลา</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="หมายเหตุ (ถ้ามี)" fullWidth value={approverNote} onChange={(e) => setApproverNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveDialogId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="success" onClick={() => handleApprove(approveDialogId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>อนุมัติ</Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogId !== null} onClose={() => setRejectDialogId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ยืนยันปฏิเสธคำขอลา</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="เหตุผลที่ปฏิเสธ" fullWidth value={approverNote} onChange={(e) => setApproverNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectDialogId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => handleReject(rejectDialogId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ปฏิเสธ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LeaveManagement;
