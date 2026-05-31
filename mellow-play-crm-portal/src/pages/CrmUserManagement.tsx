import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Paper, Typography, Box, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Avatar, Button, IconButton,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Alert, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Radio, RadioGroup, FormControlLabel, FormLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Save as SaveIcon,
  ArrowBack as BackIcon,
  Person as PersonIcon,
  Work as WorkIcon,
  Payment as PaymentIcon,
  AccountBalance as BankIcon,
  Assignment as EmploymentIcon,
  LockReset as LockResetIcon,
  Security as SecurityIcon,
  CameraAlt as CameraAltIcon,
  Schedule as ScheduleIcon2,
} from '@mui/icons-material';
import { Checkbox, FormGroup, FormControlLabel as FCL2, Divider as MuiDivider } from '@mui/material';
import axios from 'axios';

const API_BASE = 'http://localhost:8787/api/v1/admin';

interface CrmUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  branch_id?: number;
  branch_name?: string;
  phone?: string;
  national_id?: string;
  address?: string;
  salary?: number;
  salary_type?: 'daily' | 'monthly';
  start_date?: string;
  department?: string;
  position?: string;
  employment_type?: string;
  employment_status?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  profile_image_url?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  note?: string;
  has_pending_reset?: boolean;
  reset_token_expires_at?: string;
  work_days?: string[];
  work_start_time?: string;
  work_end_time?: string;
}

const emptyForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'operator',
  branch_id: '',
  phone: '',
  national_id: '',
  address: '',
  salary: '',
  salary_type: 'monthly',
  start_date: '',
  department: '',
  position: '',
  employment_type: 'Full-time',
  employment_status: 'active',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  profile_image_url: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  note: '',
  work_days: [] as string[],
  work_start_time: '09:00',
  work_end_time: '18:00',
};

const BANKS = [
  { label: 'กสิกรไทย (KBank)', value: 'kbank' },
  { label: 'ไทยพาณิชย์ (SCB)', value: 'scb' },
  { label: 'กรุงเทพ (BBL)', value: 'bbl' },
  { label: 'กรุงไทย (KTB)', value: 'ktb' },
  { label: 'กรุงศรี (BAY)', value: 'bay' },
];

const EMPLOYMENT_STATUSES = [
  { label: 'ทำงานอยู่', value: 'active' },
  { label: 'ลาออก', value: 'resigned' },
];

const WORK_DAYS = [
  { key: 'mon', label: 'จ' },
  { key: 'tue', label: 'อ' },
  { key: 'wed', label: 'พ' },
  { key: 'thu', label: 'พฤ' },
  { key: 'fri', label: 'ศ' },
  { key: 'sat', label: 'ส' },
  { key: 'sun', label: 'อา' },
];

const COVER_GRADIENT = 'linear-gradient(135deg, #141e30 0%, #1a3a5c 40%, #0f3460 70%, #e94560 100%)';

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, mt: 1 }}>
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Typography>
  </Box>
);

const CrmUserManagement = () => {
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [editUser, setEditUser] = useState<CrmUser | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile image
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string>('');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<CrmUser | null>(null);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<CrmUser | null>(null);
  const [resetting, setResetting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const roleOptions = useMemo(() => [
    { label: 'Super Admin (ดูแลระบบทั้งหมด)', value: 'super_admin' },
    { label: 'Play Facilitator (ผู้สอน/ดูแลเด็ก)', value: 'play_facilitator' },
    { label: 'Operator (พนักงานสาขา/ต้อนรับ)', value: 'operator' },
  ], []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, branchesRes] = await Promise.all([
        axios.get(`${API_BASE}/crm-users`),
        axios.get(`${API_BASE}/branches`)
      ]);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (branchesRes.data.success) setBranches(branchesRes.data.branches);
      else setBranches([
        { id: 'br_central', name: 'Central World' },
        { id: 'br_chidlom', name: 'Chidlom' }
      ]);
    } catch (e) { console.error('Failed to fetch CRM data', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const clearImageState = () => {
    if (profileImagePreview.startsWith('blob:')) URL.revokeObjectURL(profileImagePreview);
    setProfileImageFile(null);
    setProfileImagePreview('');
  };

  const handleClose = () => {
    clearImageState();
    setIsEditing(false);
    setEditUser(null);
    setForm(emptyForm);
    setError(null);
  };

  const openAdd = () => {
    clearImageState();
    setEditUser(null);
    setForm({ ...emptyForm, branch_id: branches[0]?.id || '' });
    setReadOnly(false);
    setIsEditing(true);
  };

  const openEdit = (user: CrmUser) => {
    clearImageState();
    setEditUser(user);
    setProfileImagePreview(user.profile_image_url || '');
    setForm({
      email: user.email,
      password: '',
      full_name: user.full_name,
      role: user.role,
      branch_id: user.branch_id || '',
      phone: user.phone || '',
      national_id: user.national_id || '',
      address: user.address || '',
      salary: user.salary?.toString() || '',
      salary_type: user.salary_type || 'monthly',
      start_date: user.start_date || '',
      department: user.department || '',
      position: user.position || '',
      employment_type: user.employment_type || 'Full-time',
      employment_status: user.employment_status || 'active',
      bank_name: user.bank_name || '',
      bank_account_name: user.bank_account_name || '',
      bank_account_number: user.bank_account_number || '',
      profile_image_url: user.profile_image_url || '',
      emergency_contact_name: user.emergency_contact_name || '',
      emergency_contact_phone: user.emergency_contact_phone || '',
      note: user.note || '',
      work_days: user.work_days || [],
      work_start_time: user.work_start_time || '09:00',
      work_end_time: user.work_end_time || '18:00',
    });
    setReadOnly(false);
    setIsEditing(true);
  };

  const openView = (user: CrmUser) => { openEdit(user); setReadOnly(true); };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (profileImagePreview.startsWith('blob:')) URL.revokeObjectURL(profileImagePreview);
    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
    // reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleSave = async () => {
    setError(null);
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('กรุณากรอกชื่อและอีเมล');
      return;
    }
    if (!form.salary_type) {
      setError('กรุณาเลือกประเภทเงินเดือน');
      return;
    }
    if (!form.bank_name) {
      setError('กรุณาเลือกธนาคาร');
      return;
    }
    if (!form.bank_account_name.trim()) {
      setError('กรุณากรอกชื่อบัญชีธนาคาร');
      return;
    }
    if (!form.bank_account_number.trim()) {
      setError('กรุณากรอกเลขบัญชีธนาคาร');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        ...form,
        salary: parseFloat(form.salary) || null,
        bank_account_number: form.bank_account_number.trim(),
      };

      let savedId: number;
      if (editUser) {
        await axios.put(`${API_BASE}/crm-users/${editUser.id}`, payload);
        savedId = editUser.id;
      } else {
        const res = await axios.post(`${API_BASE}/crm-users`, payload);
        savedId = res.data.user?.id ?? res.data.id;
      }

      if (profileImageFile && savedId) {
        const fd = new FormData();
        fd.append('avatar', profileImageFile);
        await axios.post(`${API_BASE}/crm-users/${savedId}/upload-avatar`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      handleClose();
      fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const handleResetClick = (user: CrmUser) => { setUserToReset(user); setResetDialogOpen(true); };
  const confirmReset = async () => {
    if (!userToReset) return;
    setResetting(true);
    try {
      const res = await axios.post(`${API_BASE}/crm-users/${userToReset.id}/reset-password`);
      setResetDialogOpen(false);
      const expiresAt = res.data.expires_at;
      const expiryNote = expiresAt
        ? ` · ลิงก์หมดอายุ ${new Date(expiresAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`
        : '';
      setSuccessMsg(`ส่งลิงก์ไปยัง ${userToReset.email} แล้ว${expiryNote} — รหัสผ่านเดิมยังใช้งานได้จนกว่าจะรีเซ็ตสำเร็จ`);
      // Update pending state in list without full reload
      setUsers(prev => prev.map(u => u.id === userToReset.id
        ? { ...u, has_pending_reset: true, reset_token_expires_at: expiresAt ?? u.reset_token_expires_at }
        : u
      ));
      if (editUser?.id === userToReset.id) {
        setEditUser(prev => prev ? { ...prev, has_pending_reset: true, reset_token_expires_at: expiresAt ?? prev.reset_token_expires_at } : null);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(msg || 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่');
      setResetDialogOpen(false);
    } finally {
      setResetting(false);
      setUserToReset(null);
    }
  };

  const handleRevokeReset = async () => {
    if (!editUser) return;
    setRevoking(true);
    try {
      await axios.delete(`${API_BASE}/crm-users/${editUser.id}/reset-token`);
      setSuccessMsg('ยกเลิกคำขอรีเซ็ตรหัสผ่านเรียบร้อยแล้ว — รหัสผ่านเดิมยังคงใช้งานได้ตามปกติ');
      setEditUser(prev => prev ? { ...prev, has_pending_reset: false, reset_token_expires_at: undefined } : null);
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, has_pending_reset: false } : u));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ไม่สามารถยกเลิกการรีเซ็ตได้');
    } finally {
      setRevoking(false);
    }
  };

  const handleDeleteClick = (user: CrmUser) => { setUserToDelete(user); setDeleteDialogOpen(true); };
  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await axios.delete(`${API_BASE}/crm-users/${userToDelete.id}`);
      setDeleteDialogOpen(false);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const getRoleChip = (role: string) => {
    switch (role) {
      case 'super_admin': return <Chip label="Super Admin" size="small" color="error" sx={{ fontWeight: 800 }} />;
      case 'play_facilitator': return <Chip label="Facilitator" size="small" color="primary" sx={{ fontWeight: 800 }} />;
      default: return <Chip label="Operator" size="small" variant="outlined" />;
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  if (isEditing) {
    return (
      <Box sx={{ pb: 12 }}>
        {/* Cover + Profile card */}
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
          {/* Cover */}
          <Box sx={{ height: 200, background: COVER_GRADIENT, position: 'relative', overflow: 'hidden' }}>
            {/* Decorative circles */}
            <Box sx={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', top: -100, right: 80 }} />
            <Box sx={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.07)', bottom: -60, right: 280 }} />
            <Box sx={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', top: 24, right: 40 }} />
            <Box sx={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)', bottom: 32, left: '45%' }} />
            {/* Back button */}
            <IconButton
              onClick={handleClose}
              sx={{
                position: 'absolute', top: 16, left: 16,
                bgcolor: 'rgba(255,255,255,0.15)', color: 'white',
                backdropFilter: 'blur(8px)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
              }}
            >
              <BackIcon />
            </IconButton>
            {/* Mode chip */}
            <Chip
              label={readOnly ? 'ข้อมูลพนักงาน' : editUser ? 'แก้ไขข้อมูล' : 'เพิ่มพนักงาน'}
              size="small"
              sx={{
                position: 'absolute', top: 20, right: 20,
                bgcolor: 'rgba(255,255,255,0.15)', color: 'white',
                backdropFilter: 'blur(8px)', fontWeight: 700,
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            />
          </Box>

          {/* Profile row */}
          <Box sx={{ px: 3, pb: 2.5, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            {/* Avatar */}
            <Box sx={{ position: 'relative', mt: '-52px', flexShrink: 0 }}>
              <Avatar
                src={profileImagePreview || undefined}
                sx={{
                  width: 96, height: 96,
                  border: '4px solid white',
                  fontSize: 36, fontWeight: 800,
                  bgcolor: 'secondary.main',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                }}
              >
                {form.full_name?.[0]?.toUpperCase()}
              </Avatar>
              {!readOnly && (
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  title="เปลี่ยนรูปโปรไฟล์"
                  sx={{
                    position: 'absolute', bottom: 2, right: 2,
                    bgcolor: 'white', boxShadow: 2,
                    width: 28, height: 28,
                    '&:hover': { bgcolor: 'grey.100' },
                  }}
                >
                  <CameraAltIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleProfileImageChange} />
            </Box>

            {/* Name + meta */}
            <Box sx={{ pb: 0.5, flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>
                {form.full_name || 'ชื่อพนักงาน'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary">{form.email || '-'}</Typography>
                {form.role && getRoleChip(form.role)}
              </Box>
            </Box>
          </Box>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        <Grid container spacing={3}>
          {/* Left column */}
          <Grid item xs={12} md={8}>
            {/* ข้อมูลส่วนตัว */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <SectionHeader icon={<PersonIcon />} title="ข้อมูลส่วนตัว" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField label="ชื่อ-นามสกุล *" fullWidth value={form.full_name} onChange={e => !readOnly && setForm({ ...form, full_name: e.target.value })} InputProps={{ readOnly }} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="เบอร์โทรศัพท์" fullWidth value={form.phone} onChange={e => !readOnly && setForm({ ...form, phone: e.target.value })} InputProps={{ readOnly }} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="อีเมล *" fullWidth value={form.email} onChange={e => !readOnly && setForm({ ...form, email: e.target.value })} InputProps={{ readOnly }} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="เลขบัตรประชาชน" fullWidth value={form.national_id} onChange={e => !readOnly && setForm({ ...form, national_id: e.target.value })} InputProps={{ readOnly }} />
                </Grid>
              </Grid>
            </Paper>

            {/* การทำงาน */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <SectionHeader icon={<WorkIcon />} title="การทำงาน" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField label="ตำแหน่ง" fullWidth value={form.position} onChange={e => !readOnly && setForm({ ...form, position: e.target.value })} InputProps={{ readOnly }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <InputLabel>สิทธิ์</InputLabel>
                    <Select value={form.role} label="สิทธิ์" onChange={e => !readOnly && setForm({ ...form, role: e.target.value })} inputProps={{ readOnly }}>
                      {roleOptions.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <InputLabel>สาขาประจำ</InputLabel>
                    <Select value={form.branch_id} label="สาขาประจำ" onChange={e => !readOnly && setForm({ ...form, branch_id: e.target.value })} inputProps={{ readOnly }}>
                      {branches.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Paper>

            {/* ข้อมูลบัญชีธนาคาร */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <SectionHeader icon={<BankIcon />} title="ข้อมูลบัญชีธนาคาร" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth required>
                    <InputLabel>ธนาคาร *</InputLabel>
                    <Select value={form.bank_name} label="ธนาคาร *" onChange={e => !readOnly && setForm({ ...form, bank_name: e.target.value })} inputProps={{ readOnly }}>
                      {BANKS.map(b => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="ชื่อบัญชี *"
                    fullWidth
                    required
                    value={form.bank_account_name}
                    onChange={e => !readOnly && setForm({ ...form, bank_account_name: e.target.value })}
                    InputProps={{ readOnly }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="เลขบัญชี *"
                    fullWidth
                    required
                    value={form.bank_account_number}
                    onChange={e => {
                      if (!readOnly && /^\d*$/.test(e.target.value)) {
                        setForm({ ...form, bank_account_number: e.target.value });
                      }
                    }}
                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                    InputProps={{ readOnly }}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* รายละเอียดการจ้างงาน */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <SectionHeader icon={<EmploymentIcon />} title="รายละเอียดการจ้างงาน" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>สถานะการจ้างงาน</InputLabel>
                    <Select value={form.employment_status} label="สถานะการจ้างงาน" onChange={e => !readOnly && setForm({ ...form, employment_status: e.target.value })} inputProps={{ readOnly }}>
                      {EMPLOYMENT_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="วันที่เริ่มงาน"
                    fullWidth
                    type="date"
                    value={form.start_date}
                    onChange={e => !readOnly && setForm({ ...form, start_date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ readOnly }}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Work Schedule */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <SectionHeader icon={<ScheduleIcon2 />} title="ตารางเวลาทำงาน" />
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>วันทำงาน</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {WORK_DAYS.map((d) => {
                    const checked = (form.work_days as string[]).includes(d.key);
                    return (
                      <Box
                        key={d.key}
                        onClick={() => {
                          if (readOnly) return;
                          const current = form.work_days as string[];
                          const next = checked ? current.filter((x) => x !== d.key) : [...current, d.key];
                          setForm({ ...form, work_days: next });
                        }}
                        sx={{
                          width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: readOnly ? 'default' : 'pointer',
                          fontWeight: 700, fontSize: '0.8rem',
                          bgcolor: checked ? 'primary.main' : 'grey.100',
                          color: checked ? 'white' : 'text.secondary',
                          border: '2px solid',
                          borderColor: checked ? 'primary.main' : 'grey.300',
                          transition: 'all 0.15s',
                          '&:hover': readOnly ? {} : { bgcolor: checked ? 'primary.dark' : 'grey.200' },
                        }}
                      >
                        {d.label}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="เวลาเข้างาน"
                    type="time"
                    fullWidth
                    value={form.work_start_time}
                    onChange={e => !readOnly && setForm({ ...form, work_start_time: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ readOnly }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="เวลาออกงาน"
                    type="time"
                    fullWidth
                    value={form.work_end_time}
                    onChange={e => !readOnly && setForm({ ...form, work_end_time: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ readOnly }}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Right column */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <SectionHeader icon={<PaymentIcon />} title="เงินเดือน" />
              <FormControl component="fieldset" sx={{ mb: 2 }}>
                <FormLabel component="legend" sx={{ fontSize: '0.75rem', mb: 0.5 }}>ประเภทเงินเดือน *</FormLabel>
                <RadioGroup
                  row
                  value={form.salary_type}
                  onChange={e => !readOnly && setForm({ ...form, salary_type: e.target.value })}
                >
                  <FormControlLabel value="monthly" control={<Radio size="small" disabled={readOnly} />} label="รายเดือน" />
                  <FormControlLabel value="daily" control={<Radio size="small" disabled={readOnly} />} label="รายวัน" />
                </RadioGroup>
              </FormControl>
              <TextField
                label={form.salary_type === 'daily' ? 'ค่าจ้างต่อวัน (บาท)' : 'เงินเดือน (บาท)'}
                fullWidth
                type="number"
                value={form.salary}
                onChange={e => !readOnly && setForm({ ...form, salary: e.target.value })}
                InputProps={{ readOnly }}
                inputProps={{ min: 0 }}
              />
            </Paper>

            {editUser && (
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <SectionHeader icon={<SecurityIcon />} title="ความปลอดภัย" />

                {editUser.has_pending_reset && (
                  <Box sx={{ border: '1px solid', borderColor: 'warning.main', borderRadius: 2, p: 1.5, mb: 2, bgcolor: 'rgba(255,152,0,0.06)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip label="รอรีเซ็ต" size="small" color="warning" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.dark' }}>มีคำขอค้างอยู่</Typography>
                    </Box>
                    {editUser.reset_token_expires_at && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        ลิงก์หมดอายุ: {new Date(editUser.reset_token_expires_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      รหัสผ่านเดิมยังใช้งานได้อยู่
                    </Typography>
                  </Box>
                )}

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของพนักงาน
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  fullWidth
                  startIcon={<LockResetIcon />}
                  onClick={() => handleResetClick(editUser)}
                  sx={{ borderRadius: 2, mb: editUser.has_pending_reset ? 1 : 0 }}
                >
                  {editUser.has_pending_reset ? 'ส่งลิงก์ใหม่อีกครั้ง' : 'รีเซ็ตรหัสผ่าน'}
                </Button>
                {editUser.has_pending_reset && (
                  <Button
                    variant="text"
                    color="error"
                    fullWidth
                    size="small"
                    onClick={handleRevokeReset}
                    disabled={revoking}
                    sx={{ borderRadius: 2 }}
                  >
                    {revoking ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอรีเซ็ต'}
                  </Button>
                )}
              </Paper>
            )}
          </Grid>
        </Grid>

        {!readOnly && (
          <Box sx={{ position: 'fixed', bottom: 32, right: 32, display: 'flex', gap: 2 }}>
            <Button variant="contained" size="large" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />} onClick={handleSave} disabled={saving} sx={{ borderRadius: 10, px: 4 }}>
              {saving ? 'บันทึก...' : 'บันทึกข้อมูล'}
            </Button>
            <Button variant="outlined" size="large" onClick={handleClose} sx={{ borderRadius: 10, bgcolor: 'white' }}>ยกเลิก</Button>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>จัดการผู้ใช้ CRM</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>เพิ่มพนักงาน</Button>
      </Box>

      {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)} sx={{ mb: 3 }}>{successMsg}</Alert>}
      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f9fafb' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>ชื่อ-นามสกุล</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>สิทธิ์</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>สาขา</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800 }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar
                      src={user.profile_image_url || undefined}
                      sx={{ bgcolor: 'secondary.main', width: 36, height: 36 }}
                    >
                      {!user.profile_image_url && user.full_name[0]}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.full_name}</Typography>
                      {user.has_pending_reset && (
                        <Chip label="รอรีเซ็ตรหัส" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.6rem', height: 16, mt: 0.25 }} />
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>{getRoleChip(user.role)}</TableCell>
                <TableCell>{user.branch_name || 'HQ / All'}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => openView(user)}><ViewIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => openEdit(user)} sx={{ color: 'primary.main' }}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleResetClick(user)} sx={{ color: 'warning.main' }} title="รีเซ็ตรหัสผ่าน"><LockResetIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleDeleteClick(user)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>คุณต้องการลบผู้ใช้ <strong>"{userToDelete?.full_name}"</strong> ใช่หรือไม่?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined">ยกเลิก</Button>
          <Button onClick={confirmDelete} variant="contained" color="error">ลบพนักงาน</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resetDialogOpen} onClose={() => !resetting && setResetDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockResetIcon color="warning" />
          รีเซ็ตรหัสผ่าน
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมล:
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>{userToReset?.email}</Typography>
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'info.50', borderRadius: 2, border: '1px solid', borderColor: 'info.200' }}>
            <Typography variant="caption" color="info.dark" sx={{ display: 'block', lineHeight: 1.6 }}>
              ℹ️ รหัสผ่านเดิมจะยังคงใช้งานได้ตามปกติ จนกว่าพนักงานจะกดลิงก์และตั้งรหัสใหม่สำเร็จ
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setResetDialogOpen(false)} variant="outlined" disabled={resetting}>ยกเลิก</Button>
          <Button
            onClick={confirmReset}
            variant="contained"
            color="warning"
            disabled={resetting}
            startIcon={resetting ? <CircularProgress size={16} color="inherit" /> : <LockResetIcon />}
          >
            {resetting ? 'กำลังส่ง...' : 'ส่งอีเมล'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CrmUserManagement;
