import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  Chip, Tooltip, InputAdornment, CircularProgress, Alert, Autocomplete
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  LocalOffer as PromoIcon, ContentCopy as CopyIcon, CheckCircle,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

interface Promotion {
  id: number;
  code: string;
  description: string;
  consumer_label: string | null;
  discount_amount: number;
  discount_percent: number;
  max_uses: number;
  current_uses: number;
  valid_from: string | null;
  valid_until: string | null;
  applicable_course_ids: string; // JSON string from DB
  applicable_service_ids: string; // JSON string from DB
  is_active: number;
  created_at: string;
}

interface Course { id: number; name: string; }
interface Service { id: number; name: string; }

const emptyForm = {
  code: '',
  description: '',
  consumer_label: '',
  discount_amount: 0,
  discount_percent: 0,
  max_uses: 0,
  valid_from: '',
  valid_until: '',
  applicable_course_ids: [] as number[],
  applicable_service_ids: [] as number[],
  is_active: true,
};

const PromotionManagement = () => {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [promoRes, courseRes, serviceRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/admin/promotions`, { headers }),
        axios.get(`${API_URL}/api/v1/admin/courses`, { headers }),
        axios.get(`${API_URL}/api/v1/admin/services`, { headers })
      ]);
      if (promoRes.data.success) setPromos(promoRes.data.promotions);
      setCourses(courseRes.data.courses || []);
      setServices(serviceRes.data.services || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const parseIds = (jsonString: string) => {
    try { return JSON.parse(jsonString || '[]'); } catch { return []; }
  };

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setError(''); setDialogOpen(true); };
  const openEdit = (p: Promotion) => {
    setEditTarget(p);
    setForm({
      code: p.code,
      description: p.description || '',
      consumer_label: p.consumer_label || '',
      discount_amount: p.discount_amount,
      discount_percent: p.discount_percent,
      max_uses: p.max_uses,
      valid_from: p.valid_from ? p.valid_from.replace(' ', 'T').slice(0, 16) : '',
      valid_until: p.valid_until ? p.valid_until.replace(' ', 'T').slice(0, 16) : '',
      applicable_course_ids: parseIds(p.applicable_course_ids),
      applicable_service_ids: parseIds(p.applicable_service_ids),
      is_active: !!p.is_active,
    });
    setError(''); setDialogOpen(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.code.trim()) { setError('กรุณาระบุ Promo Code'); return; }
    if (form.discount_amount <= 0 && form.discount_percent <= 0) { setError('กรุณาระบุส่วนลดอย่างน้อย 1 ประเภท'); return; }
    setSaving(true);
    try {
      const payload = { 
        ...form, 
        code: form.code.toUpperCase().trim(), 
        valid_from: form.valid_from || null, 
        valid_until: form.valid_until || null,
        consumer_label: form.consumer_label.trim() || null 
      };
      if (editTarget) { await axios.put(`${API_URL}/api/v1/admin/promotions/${editTarget.id}`, payload, { headers }); }
      else { await axios.post(`${API_URL}/api/v1/admin/promotions`, payload, { headers }); }
      setDialogOpen(false); fetchData();
    } catch (e: any) { setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await axios.delete(`${API_URL}/api/v1/admin/promotions/${deleteTarget.id}`, { headers }); setDeleteDialogOpen(false); setDeleteTarget(null); fetchData(); } catch {}
  };

  const copyCode = (p: Promotion) => { navigator.clipboard.writeText(p.code); setCopiedId(p.id); setTimeout(() => setCopiedId(null), 1500); };
  const isExpired = (p: Promotion) => !!p.valid_until && new Date(p.valid_until + 'Z') < new Date();
  const isExhausted = (p: Promotion) => p.max_uses > 0 && p.current_uses >= p.max_uses;
  const getStatus = (p: Promotion) => {
    if (!p.is_active) return { label: 'ปิดใช้งาน', color: 'default' as const };
    if (isExpired(p)) return { label: 'หมดอายุ', color: 'error' as const };
    if (isExhausted(p)) return { label: 'สิทธิ์เต็ม', color: 'warning' as const };
    return { label: 'เปิดใช้งาน', color: 'success' as const };
  };
  const formatDate = (dt: string | null) => dt ? new Date(dt + 'Z').toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <PromoIcon sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">โปรโมชัน & Promo Code</Typography>
            <Typography variant="body2" color="text.secondary">จัดการโค้ดส่วนลดและโปรโมชันต่างๆ</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 'bold' }}>สร้าง Promo Code</Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width={140} sx={{ fontWeight: 'bold' }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>รายละเอียด</TableCell>
              <TableCell width={160} sx={{ fontWeight: 'bold' }}>ส่วนลด</TableCell>
              <TableCell width={130} sx={{ fontWeight: 'bold' }}>จำนวนสิทธิ์</TableCell>
              <TableCell width={160} sx={{ fontWeight: 'bold' }}>ใช้ได้ถึง</TableCell>
              <TableCell width={110} sx={{ fontWeight: 'bold' }}>สถานะ</TableCell>
              <TableCell width={90} align="center" sx={{ fontWeight: 'bold' }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><CircularProgress size={32} /></TableCell></TableRow>
            ) : promos.length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่พบข้อมูล Promo Code</TableCell></TableRow>
            ) : promos.map((p) => {
              const st = getStatus(p);
              return (
                <TableRow key={p.id} hover sx={{ opacity: (!p.is_active || isExpired(p)) ? 0.55 : 1 }}>
                  <TableCell>
                    <Box display="flex" flexDirection="column" gap={0.5}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography fontWeight="bold" fontFamily="monospace" fontSize={14} color="primary.main">{p.code}</Typography>
                        <Tooltip title={copiedId === p.id ? 'Copied!' : 'Copy'}>
                          <IconButton size="small" onClick={() => copyCode(p)} sx={{ p: 0.5 }}>
                            {copiedId === p.id ? <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} /> : <CopyIcon sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {p.consumer_label && <Chip label={p.consumer_label} size="small" sx={{ height: 20, fontSize: '0.65rem', alignSelf: 'flex-start' }} color="warning" variant="outlined" />}
                    </Box>
                  </TableCell>
                  <TableCell><Typography variant="body2">{p.description || '-'}</Typography></TableCell>
                  <TableCell>
                    {p.discount_percent > 0 && <Chip label={`${p.discount_percent}%`} size="small" color="info" sx={{ fontWeight: 'bold', mr: 0.5 }} />}
                    {p.discount_amount > 0 && <Chip label={`-฿${p.discount_amount.toLocaleString()}`} size="small" color="secondary" sx={{ fontWeight: 'bold' }} />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{p.current_uses} / {p.max_uses === 0 ? '∞' : p.max_uses}</Typography>
                    {p.max_uses > 0 && (
                      <Box sx={{ width: 80, height: 4, bgcolor: 'grey.200', borderRadius: 2, mt: 0.5 }}>
                        <Box sx={{ width: `${Math.min(100, (p.current_uses / p.max_uses) * 100)}%`, height: '100%', bgcolor: isExhausted(p) ? 'error.main' : 'primary.main', borderRadius: 2 }} />
                      </Box>
                    )}
                  </TableCell>
                  <TableCell><Typography variant="body2">{formatDate(p.valid_until)}</Typography></TableCell>
                  <TableCell><Chip label={st.label} color={st.color} size="small" sx={{ fontWeight: 'bold' }} /></TableCell>
                  <TableCell align="center">
                    <Tooltip title="แก้ไข"><IconButton size="small" onClick={() => openEdit(p)} color="primary"><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="ลบ"><IconButton size="small" onClick={() => { setDeleteTarget(p); setDeleteDialogOpen(true); }} color="error"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold', pb: 1 }}>{editTarget ? 'แก้ไข Promo Code' : 'สร้าง Promo Code ใหม่'}</DialogTitle>
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={2.5} pt={1}>
            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
            
            <Box display="flex" gap={2}>
              <TextField label="Promo Code *" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} fullWidth inputProps={{ style: { fontFamily: 'monospace', fontWeight: 'bold', fontSize: 16, letterSpacing: 2 } }} placeholder="เช่น MELLOW20" />
              <TextField label="Label แสดงหน้าแอป" value={form.consumer_label} onChange={(e) => setForm(f => ({ ...f, consumer_label: e.target.value }))} fullWidth placeholder="เช่น Early Bird, Flash Sale" />
            </Box>
            
            <TextField label="รายละเอียด" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} fullWidth placeholder="เช่น ส่วนลด 20% สำหรับสมาชิกใหม่" />
            
            <Box display="flex" gap={2}>
              <TextField label="ส่วนลดเป็นบาท" type="number" value={form.discount_amount || ''} onChange={(e) => setForm(f => ({ ...f, discount_amount: parseFloat(e.target.value) || 0 }))} fullWidth InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }} helperText="ตัวอย่าง ลด 100 บาท" />
              <TextField label="ส่วนลด %" type="number" value={form.discount_percent || ''} onChange={(e) => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || 0 }))} fullWidth InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} inputProps={{ min: 0, max: 100 }} helperText="เช่น 20%" />
            </Box>
            
            <Autocomplete
              multiple
              options={courses}
              getOptionLabel={(option) => option.name}
              value={courses.filter(c => form.applicable_course_ids.includes(c.id))}
              onChange={(_, newValue) => setForm(f => ({ ...f, applicable_course_ids: newValue.map(v => v.id) }))}
              renderInput={(params) => <TextField {...params} label="คลาสเรียนที่ร่วมรายการ" placeholder="เลือกคลาสเรียน" helperText="เว้นว่างไว้หากใช้ได้กับทุกคลาส" />}
            />

            <Autocomplete
              multiple
              options={services}
              getOptionLabel={(option) => option.name}
              value={services.filter(s => form.applicable_service_ids.includes(s.id))}
              onChange={(_, newValue) => setForm(f => ({ ...f, applicable_service_ids: newValue.map(v => v.id) }))}
              renderInput={(params) => <TextField {...params} label="บริการที่ร่วมรายการ" placeholder="เลือกบริการ" helperText="เว้นว่างไว้หากใช้ได้กับทุกบริการ" />}
            />

            <TextField label="จำนวนสิทธิ์ (0 = ไม่จำกัด)" type="number" value={form.max_uses || ''} onChange={(e) => setForm(f => ({ ...f, max_uses: parseInt(e.target.value) || 0 }))} fullWidth inputProps={{ min: 0 }} />
            
            <Box display="flex" gap={2}>
              <TextField label="เริ่มใช้งาน" type="datetime-local" value={form.valid_from} onChange={(e) => setForm(f => ({ ...f, valid_from: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="สิ้นสุด" type="datetime-local" value={form.valid_until} onChange={(e) => setForm(f => ({ ...f, valid_until: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
            </Box>
            
            <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} color="success" />} label={<Typography fontWeight="bold">{form.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</Typography>} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving} sx={{ borderRadius: 2, fontWeight: 'bold', minWidth: 120 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : (editTarget ? 'บันทึก' : 'สร้าง')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>คุณต้องการลบ Promo Code <b style={{ fontFamily: 'monospace', color: '#6c47ff' }}>{deleteTarget?.code}</b> ใช่หรือไม่?</Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>การลบจะไม่สามารถกู้คืนกลับมาได้</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>ยกเลิก</Button>
          <Button onClick={handleDelete} variant="contained" color="error" startIcon={<DeleteIcon />} sx={{ borderRadius: 2, fontWeight: 'bold' }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PromotionManagement;
