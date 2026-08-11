import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Alert,
  Avatar,
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
  BusinessCenter as MonthlyIcon,
  AccessTime as DailyIcon,
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

interface EmployeeTypePolicy {
  annual: number;
  sick: number;
  personal: number;
}

interface LeavePolicy {
  monthly: EmployeeTypePolicy;
  daily: EmployeeTypePolicy;
}

interface LeaveBalance {
  annual: { used: number; total: number };
  sick: { used: number; total: number };
  personal: { used: number; total: number };
}

const defaultPolicy: LeavePolicy = {
  monthly: { annual: 10, sick: 30, personal: 3 },
  daily:   { annual: 6,  sick: 30, personal: 3 },
};

interface PolicyEditStr {
  monthly: { annual: string; sick: string; personal: string };
  daily:   { annual: string; sick: string; personal: string };
}

const policyToStr = (p: LeavePolicy): PolicyEditStr => ({
  monthly: { annual: String(p.monthly.annual), sick: String(p.monthly.sick), personal: String(p.monthly.personal) },
  daily:   { annual: String(p.daily.annual),   sick: String(p.daily.sick),   personal: String(p.daily.personal)   },
});

const API_BASE = `${API_URL}/api/v1/admin`;

// Mock: in a real app this comes from the logged-in user's CRM profile
// (CRM_Users.employment_type). The `as` keeps the type the full union —
// with a plain annotation TypeScript narrows the const to its literal
// initializer and flags every `=== 'monthly'` check below as impossible.
const EMPLOYEE_TYPE = 'daily' as 'monthly' | 'daily';

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
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<LeavePolicy>(defaultPolicy);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [form, setForm] = useState({ type: 'annual' as LeaveType, startDate: '', endDate: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [approveDialogId, setApproveDialogId] = useState<number | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [approverNote, setApproverNote] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [policyEdit, setPolicyEdit] = useState<PolicyEditStr>(() => policyToStr(defaultPolicy));

  const crmUserId: number | null = (() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || 'null')?.id ?? null; } catch { return null; }
  })();

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // ── API fetch ──────────────────────────────────────────────────────────────
  const fetchRequests = async () => {
    try {
      const params = canApprove ? {} : { userId: crmUserId };
      const res = await axios.get(`${API_BASE}/leave-requests`, { params });
      const data: LeaveRequest[] = res.data.requests.map((r: any) => ({
        id: r.id,
        crm_user_id: r.crm_user_id,
        staffName: r.staff_name ?? '',
        staffRole: r.staff_role ?? '',
        type: r.type as LeaveType,
        startDate: r.start_date,
        endDate: r.end_date,
        days: r.days,
        reason: r.reason,
        status: r.status as LeaveStatus,
        approverNote: r.approver_note ?? undefined,
        isPaid: Boolean(r.is_paid),
      }));
      setRequests(data);
    } catch (err) {
      console.error('fetchRequests error:', err);
    }
  };

  const fetchPolicies = async () => {
    try {
      const res = await axios.get(`${API_BASE}/leave-policies`);
      const monthly = res.data.policies.find((p: any) => p.employee_type === 'monthly');
      const daily   = res.data.policies.find((p: any) => p.employee_type === 'daily');
      const newPolicy: LeavePolicy = {
        monthly: { annual: monthly?.annual_days ?? defaultPolicy.monthly.annual, sick: monthly?.sick_days ?? defaultPolicy.monthly.sick, personal: monthly?.personal_days ?? defaultPolicy.monthly.personal },
        daily:   { annual: daily?.annual_days   ?? defaultPolicy.daily.annual,   sick: daily?.sick_days   ?? defaultPolicy.daily.sick,   personal: daily?.personal_days   ?? defaultPolicy.daily.personal   },
      };
      setPolicy(newPolicy);
      setPolicyEdit(policyToStr(newPolicy));
    } catch (err) {
      console.error('fetchPolicies error:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchRequests(), fetchPolicies()]);
      setLoading(false);
    };
    init();
  }, []);

  const myRequests = requests.filter((r: any) => r.crm_user_id === crmUserId);
  const allStaffRequests = requests.filter((r: any) => r.crm_user_id !== crmUserId);

  const currentPolicy = policy[EMPLOYEE_TYPE];
  const isPaidEmployee = EMPLOYEE_TYPE === 'monthly';

  const balance: LeaveBalance = {
    annual:   { used: myRequests.filter((r) => r.type === 'annual'   && r.status === 'approved').reduce((s, r) => s + r.days, 0), total: currentPolicy.annual   },
    sick:     { used: myRequests.filter((r) => r.type === 'sick'     && r.status === 'approved').reduce((s, r) => s + r.days, 0), total: currentPolicy.sick     },
    personal: { used: myRequests.filter((r) => r.type === 'personal' && r.status === 'approved').reduce((s, r) => s + r.days, 0), total: currentPolicy.personal },
  };

  const handleRequestSubmit = async () => {
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
    try {
      await axios.post(`${API_BASE}/leave-requests`, {
        crmUserId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        days,
        reason: form.reason.trim(),
        isPaid: isPaidEmployee,
      });
      await fetchRequests();
      setForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
      setFormError('');
      setRequestDialogOpen(false);
      showSuccess(`ส่งคำขอ${leaveTypeConfig[form.type].label}สำเร็จ (${days} วัน) รอการอนุมัติ`);
    } catch (err) {
      console.error('handleRequestSubmit error:', err);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await axios.put(`${API_BASE}/leave-requests/${id}/status`, {
        status: 'approved',
        approverNote: approverNote || 'อนุมัติ',
      });
      await fetchRequests();
      setApproveDialogId(null);
      setApproverNote('');
      showSuccess('อนุมัติวันลาเรียบร้อย');
    } catch (err) {
      console.error('handleApprove error:', err);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await axios.put(`${API_BASE}/leave-requests/${id}/status`, {
        status: 'rejected',
        approverNote: approverNote || 'ไม่อนุมัติ',
      });
      await fetchRequests();
      setRejectDialogId(null);
      setApproverNote('');
      showSuccess('ปฏิเสธคำขอวันลาเรียบร้อย');
    } catch (err) {
      console.error('handleReject error:', err);
    }
  };

  const handleSavePolicy = async () => {
    const parse = (s: string) => Math.max(0, parseInt(s) || 0);
    try {
      await axios.post(`${API_BASE}/leave-policies`, {
        employeeType: 'monthly',
        annualDays:   parse(policyEdit.monthly.annual),
        sickDays:     parse(policyEdit.monthly.sick),
        personalDays: parse(policyEdit.monthly.personal),
      });
      await axios.post(`${API_BASE}/leave-policies`, {
        employeeType: 'daily',
        annualDays:   parse(policyEdit.daily.annual),
        sickDays:     parse(policyEdit.daily.sick),
        personalDays: parse(policyEdit.daily.personal),
      });
      await fetchPolicies();
      showSuccess('บันทึกนโยบายวันลาเรียบร้อย');
    } catch (err) {
      console.error('handleSavePolicy error:', err);
    }
  };

  const pendingApprovalCount = allStaffRequests.filter((r) => r.status === 'pending').length;

  const tabList = [
    { label: 'วันลาของฉัน' },
    ...(canApprove ? [{ label: `อนุมัติวันลา${pendingApprovalCount > 0 ? ` (${pendingApprovalCount})` : ''}` }] : []),
    ...(isAdmin ? [{ label: 'นโยบายวันลา' }] : []),
  ];

  const approvalTabIndex = canApprove ? 1 : -1;
  const policyTabIndex = isAdmin ? (canApprove ? 2 : 1) : -1;

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  );

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

      <Alert severity={isPaidEmployee ? 'success' : 'warning'} sx={{ mb: 2 }}>
        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
          {isPaidEmployee ? '👔 พนักงานประจำ (รายเดือน)' : '🕐 พนักงานรายวัน'}
        </Typography>
        <Typography variant="body2">
          {isPaidEmployee
            ? 'วันลาพักร้อนและลากิจ: ได้รับค่าจ้างตามปกติ • ลาป่วย: ได้รับค่าจ้างตามกฎหมาย'
            : 'วันลาทุกประเภทจะ ไม่ได้รับค่าจ้าง — ยอดหักจะคำนวณในรอบเงินเดือน'
          }
        </Typography>
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
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <PolicyIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={800}>นโยบายวันลาประจำปี</Typography>
              <Typography variant="body2" color="text.secondary">กำหนดสิทธิ์วันลาสูงสุดต่อปี แยกตามประเภทพนักงาน</Typography>
            </Box>
          </Box>

          {/* Monthly employees */}
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3, border: '2px solid', borderColor: 'primary.light' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <MonthlyIcon color="primary" />
              <Box>
                <Typography variant="subtitle1" fontWeight={800} color="primary.main">พนักงานประจำ (รายเดือน)</Typography>
              </Box>
              <Chip label="ได้รับค่าจ้างในวันลา" color="success" size="small" sx={{ ml: 'auto', fontWeight: 700 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              วันลาพักร้อนและลากิจนับเป็นวันทำงาน ได้รับค่าจ้างปกติ
            </Typography>
            <Grid container spacing={2}>
              {(Object.entries(leaveTypeConfig) as [LeaveType, typeof leaveTypeConfig[LeaveType]][]).map(([type, cfg]) => (
                <Grid item xs={12} sm={4} key={type}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Box sx={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</Box>
                      <Typography variant="body2" fontWeight={700}>{cfg.label}</Typography>
                    </Box>
                    <TextField
                      label="วันสูงสุด / ปี"
                      type="number"
                      fullWidth
                      size="small"
                      inputProps={{ min: 0, step: 1 }}
                      value={policyEdit.monthly[type]}
                      onChange={(e) => setPolicyEdit((p) => ({ ...p, monthly: { ...p.monthly, [type]: e.target.value } }))}
                    />
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* Daily employees */}
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3, border: '2px solid', borderColor: 'warning.light' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <DailyIcon color="warning" />
              <Box>
                <Typography variant="subtitle1" fontWeight={800} color="warning.dark">พนักงานรายวัน</Typography>
              </Box>
              <Chip label="ไม่ได้รับค่าจ้างในวันลา" color="warning" size="small" sx={{ ml: 'auto', fontWeight: 700 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              วันที่ลาทุกประเภทจะหักค่าจ้างตามจำนวนวันที่ขาด — ระบุสิทธิ์วันลาสูงสุดที่อนุญาต
            </Typography>
            <Grid container spacing={2}>
              {(Object.entries(leaveTypeConfig) as [LeaveType, typeof leaveTypeConfig[LeaveType]][]).map(([type, cfg]) => (
                <Grid item xs={12} sm={4} key={type}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Box sx={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</Box>
                      <Typography variant="body2" fontWeight={700}>{cfg.label}</Typography>
                    </Box>
                    <TextField
                      label="วันสูงสุด / ปี"
                      type="number"
                      fullWidth
                      size="small"
                      inputProps={{ min: 0, step: 1 }}
                      value={policyEdit.daily[type]}
                      onChange={(e) => setPolicyEdit((p) => ({ ...p, daily: { ...p.daily, [type]: e.target.value } }))}
                    />
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>

          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>หมายเหตุ:</strong> การเปลี่ยนแปลงนโยบายจะมีผลกับพนักงานทุกคนในกลุ่มนั้น สิทธิ์วันลาที่ใช้ไปแล้วจะไม่เปลี่ยนแปลง
            </Typography>
          </Alert>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSavePolicy} sx={{ borderRadius: 3, fontWeight: 700 }}>
              บันทึกนโยบาย
            </Button>
          </Box>
        </Box>
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
            <Alert severity={isPaidEmployee ? 'success' : 'warning'} sx={{ mb: 2 }}>
              จำนวนวันลา: <strong>{diffDays(form.startDate, form.endDate)} วัน</strong>
              {' '}—{' '}
              {isPaidEmployee
                ? 'ได้รับค่าจ้างตามปกติ'
                : <><strong>ไม่ได้รับค่าจ้าง</strong> (พนักงานรายวัน)</>
              }
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
