import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  Chip, Tooltip, InputAdornment, CircularProgress, Alert, Checkbox,
  List, ListItem, ListItemText, ListItemIcon, Divider, RadioGroup, Radio
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  LocalOffer as CampaignIcon, Search as SearchIcon
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

interface CampaignItem {
  id: number;
  discount_amount?: number;
  discount_percent?: number;
}

interface Campaign {
  id: number;
  name: string;
  description: string;
  consumer_label: string | null;
  discount_amount: number;
  discount_percent: number;
  valid_from: string | null;
  valid_until: string | null;
  applicable_course_ids: string; // JSON string of CampaignItem[]
  applicable_service_ids: string; // JSON string of CampaignItem[]
  is_active: number;
  created_at: string;
}

interface Course { id: number; name: string; price: number; type: string; category?: string; }
interface Service { id: number; name: string; price: number; category_name?: string; }

const emptyForm = {
  name: '',
  description: '',
  consumer_label: '',
  discount_type: 'amount' as 'amount' | 'percent',
  discount_amount: 0,
  discount_percent: 0,
  valid_from: '',
  valid_until: '',
  applicable_courses: [] as CampaignItem[],
  applicable_services: [] as CampaignItem[],
  is_active: true,
};

// Item Selection Dialog Component
const ItemSelectionModal = ({
  open,
  title,
  items,
  selectedIds,
  onClose,
  onSave
}: {
  open: boolean;
  title: string;
  items: any[];
  selectedIds: number[];
  onClose: () => void;
  onSave: (ids: number[]) => void;
}) => {
  const [search, setSearch] = useState('');
  const [localSelected, setLocalSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) setLocalSelected(new Set(selectedIds));
  }, [open, selectedIds]);

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(term) || 
      (item.category_name && item.category_name.toLowerCase().includes(term)) ||
      (item.type && item.type.toLowerCase().includes(term))
    );
  }, [items, search]);

  const toggle = (id: number) => {
    const next = new Set(localSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocalSelected(next);
  };

  const toggleAll = () => {
    if (localSelected.size === filteredItems.length && filteredItems.length > 0) {
      setLocalSelected(new Set());
    } else {
      const next = new Set(localSelected);
      filteredItems.forEach(i => next.add(i.id));
      setLocalSelected(next);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 'bold' }}>{title}</DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', height: 400 }}>
        <Box p={2} borderBottom={1} borderColor="divider">
          <TextField
            fullWidth
            placeholder="ค้นหาชื่อ หรือ หมวดหมู่..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            }}
            size="small"
          />
        </Box>
        <Box flex={1} overflow="auto">
          <List disablePadding>
            <ListItem dense button onClick={toggleAll} sx={{ bgcolor: 'grey.50' }}>
              <ListItemIcon><Checkbox edge="start" checked={filteredItems.length > 0 && localSelected.size === filteredItems.length} indeterminate={localSelected.size > 0 && localSelected.size < filteredItems.length} disableRipple /></ListItemIcon>
              <ListItemText primary={<Typography fontWeight="bold">เลือกทั้งหมดที่แสดง</Typography>} />
            </ListItem>
            <Divider />
            {filteredItems.map(item => (
              <ListItem key={item.id} dense button onClick={() => toggle(item.id)}>
                <ListItemIcon><Checkbox edge="start" checked={localSelected.has(item.id)} disableRipple /></ListItemIcon>
                <ListItemText 
                  primary={item.name} 
                  secondary={item.category_name || item.type || ''} 
                />
                <Typography variant="body2" color="primary.main" fontWeight="bold">฿{(item.price || 0).toLocaleString()}</Typography>
              </ListItem>
            ))}
            {filteredItems.length === 0 && (
              <Box p={4} textAlign="center"><Typography color="text.secondary">ไม่พบรายการ</Typography></Box>
            )}
          </List>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: 2 }}>ยกเลิก</Button>
        <Button onClick={() => onSave(Array.from(localSelected))} variant="contained" sx={{ borderRadius: 2, fontWeight: 'bold' }}>
          เลือก {localSelected.size} รายการ
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const SaleCampaignManagement = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, courseRes, serviceRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/admin/campaigns`, { headers }),
        axios.get(`${API_URL}/api/v1/admin/courses`, { headers }),
        axios.get(`${API_URL}/api/v1/admin/services`, { headers })
      ]);
      if (campRes.data.success) setCampaigns(campRes.data.campaigns);
      setCourses(courseRes.data.courses || []);
      setServices(serviceRes.data.services || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const parseItems = (jsonString: string): CampaignItem[] => {
    try { 
      const parsed = JSON.parse(jsonString || '[]'); 
      return parsed.map((item: any) => {
        if (typeof item === 'number') return { id: item };
        return item;
      });
    } catch { return []; }
  };

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setError(''); setDialogOpen(true); };
  
  const openEdit = (c: Campaign) => {
    setEditTarget(c);
    setForm({
      name: c.name,
      description: c.description || '',
      consumer_label: c.consumer_label || '',
      discount_type: (c.discount_percent > 0 || (c.applicable_course_ids && c.applicable_course_ids.includes('"discount_percent"')) || (c.applicable_service_ids && c.applicable_service_ids.includes('"discount_percent"')) ? 'percent' : 'amount') as 'amount' | 'percent',
      discount_amount: c.discount_amount,
      discount_percent: c.discount_percent,
      valid_from: c.valid_from ? c.valid_from.replace(' ', 'T').slice(0, 16) : '',
      valid_until: c.valid_until ? c.valid_until.replace(' ', 'T').slice(0, 16) : '',
      applicable_courses: parseItems(c.applicable_course_ids),
      applicable_services: parseItems(c.applicable_service_ids),
      is_active: !!c.is_active,
    });
    setError(''); setDialogOpen(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('กรุณาระบุชื่อแคมเปญ'); return; }
    if (form.discount_amount <= 0 && form.discount_percent <= 0) { 
        // We will allow 0 global discount if they set item-level discounts.
        if (form.applicable_courses.length === 0 && form.applicable_services.length === 0) {
            setError('กรุณาระบุส่วนลดอย่างน้อย 1 ประเภท หรือระบุในรายการย่อย'); return; 
        }
    }
    setSaving(true);
    try {
      const payload = { 
        ...form, 
        name: form.name.trim(), 
        valid_from: form.valid_from || null, 
        valid_until: form.valid_until || null,
        consumer_label: form.consumer_label.trim() || null,
        discount_amount: form.discount_type === 'amount' ? form.discount_amount : 0,
        discount_percent: form.discount_type === 'percent' ? form.discount_percent : 0,
        applicable_course_ids: form.applicable_courses.map(i => ({
            ...i,
            discount_amount: form.discount_type === 'amount' ? i.discount_amount : undefined,
            discount_percent: form.discount_type === 'percent' ? i.discount_percent : undefined
        })),
        applicable_service_ids: form.applicable_services.map(i => ({
            ...i,
            discount_amount: form.discount_type === 'amount' ? i.discount_amount : undefined,
            discount_percent: form.discount_type === 'percent' ? i.discount_percent : undefined
        })),
      };
      if (editTarget) { await axios.put(`${API_URL}/api/v1/admin/campaigns/${editTarget.id}`, payload, { headers }); }
      else { await axios.post(`${API_URL}/api/v1/admin/campaigns`, payload, { headers }); }
      setDialogOpen(false); fetchData();
    } catch (e: any) { setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await axios.delete(`${API_URL}/api/v1/admin/campaigns/${deleteTarget.id}`, { headers }); setDeleteDialogOpen(false); setDeleteTarget(null); fetchData(); } catch {}
  };

  const isExpired = (c: Campaign) => !!c.valid_until && new Date(c.valid_until + 'Z') < new Date();
  const getStatus = (c: Campaign) => {
    if (!c.is_active) return { label: 'ปิดใช้งาน', color: 'default' as const };
    if (isExpired(c)) return { label: 'หมดอายุ', color: 'error' as const };
    return { label: 'เปิดใช้งาน', color: 'success' as const };
  };
  const formatDate = (dt: string | null) => dt ? new Date(dt + 'Z').toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  // Handling item arrays
  const handleSelectCourses = (ids: number[]) => {
    setForm(f => ({
      ...f, 
      applicable_courses: ids.map(id => {
        const existing = f.applicable_courses.find(c => c.id === id);
        return existing || { id };
      })
    }));
    setCourseModalOpen(false);
  };

  const handleSelectServices = (ids: number[]) => {
    setForm(f => ({
      ...f, 
      applicable_services: ids.map(id => {
        const existing = f.applicable_services.find(c => c.id === id);
        return existing || { id };
      })
    }));
    setServiceModalOpen(false);
  };

  const updateItemDiscount = (type: 'course' | 'service', id: number, field: 'discount_amount' | 'discount_percent', value: string) => {
    const num = parseFloat(value);
    const arrKey = type === 'course' ? 'applicable_courses' : 'applicable_services';
    setForm(f => ({
      ...f,
      [arrKey]: f[arrKey].map(i => i.id === id ? { ...i, [field]: isNaN(num) ? undefined : num } : i)
    }));
  };

  const removeItem = (type: 'course' | 'service', id: number) => {
    const arrKey = type === 'course' ? 'applicable_courses' : 'applicable_services';
    setForm(f => ({
      ...f,
      [arrKey]: f[arrKey].filter(i => i.id !== id)
    }));
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <CampaignIcon sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">แคมเปญลดราคา (Flash Sale)</Typography>
            <Typography variant="body2" color="text.secondary">จัดการส่วนลดอัตโนมัติตามช่วงเวลาต่างๆ</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 'bold' }}>สร้างแคมเปญ</Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width={200} sx={{ fontWeight: 'bold' }}>ชื่อแคมเปญ</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>รายละเอียด</TableCell>
              <TableCell width={160} sx={{ fontWeight: 'bold' }}>ส่วนลดเริ่มต้น</TableCell>
              <TableCell width={160} sx={{ fontWeight: 'bold' }}>ระยะเวลา</TableCell>
              <TableCell width={110} sx={{ fontWeight: 'bold' }}>สถานะ</TableCell>
              <TableCell width={90} align="center" sx={{ fontWeight: 'bold' }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}><CircularProgress size={32} /></TableCell></TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่พบข้อมูลแคมเปญ</TableCell></TableRow>
            ) : campaigns.map((c) => {
              const st = getStatus(c);
              return (
                <TableRow key={c.id} hover sx={{ opacity: (!c.is_active || isExpired(c)) ? 0.55 : 1 }}>
                  <TableCell>
                    <Box display="flex" flexDirection="column" gap={0.5}>
                      <Typography fontWeight="bold" color="primary.main">{c.name}</Typography>
                      {c.consumer_label && <Chip label={c.consumer_label} size="small" sx={{ height: 20, fontSize: '0.65rem', alignSelf: 'flex-start' }} color="warning" variant="outlined" />}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{c.description || '-'}</Typography>
                    {(parseItems(c.applicable_course_ids).length > 0 || parseItems(c.applicable_service_ids).length > 0) && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                            * มีการระบุรายการเฉพาะ ({parseItems(c.applicable_course_ids).length + parseItems(c.applicable_service_ids).length} รายการ)
                        </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.discount_percent > 0 && <Chip label={`${c.discount_percent}%`} size="small" color="info" sx={{ fontWeight: 'bold', mr: 0.5 }} />}
                    {c.discount_amount > 0 && <Chip label={`-฿${c.discount_amount.toLocaleString()}`} size="small" color="secondary" sx={{ fontWeight: 'bold' }} />}
                    {c.discount_percent === 0 && c.discount_amount === 0 && <Typography variant="caption" color="text.secondary">-</Typography>}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(c.valid_from)}</Typography>
                    <Typography variant="body2" color="text.secondary">ถึง {formatDate(c.valid_until)}</Typography>
                  </TableCell>
                  <TableCell><Chip label={st.label} color={st.color} size="small" sx={{ fontWeight: 'bold' }} /></TableCell>
                  <TableCell align="center">
                    <Tooltip title="แก้ไข"><IconButton size="small" onClick={() => openEdit(c)} color="primary"><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="ลบ"><IconButton size="small" onClick={() => { setDeleteTarget(c); setDeleteDialogOpen(true); }} color="error"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold', pb: 1 }}>{editTarget ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญใหม่'}</DialogTitle>
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={2.5} pt={1}>
            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
            
            <Box display="flex" gap={2}>
              <TextField label="ชื่อแคมเปญ *" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} fullWidth placeholder="เช่น 11.11 Mega Sale" />
              <TextField label="Label แสดงหน้าแอป" value={form.consumer_label} onChange={(e) => setForm(f => ({ ...f, consumer_label: e.target.value }))} fullWidth placeholder="เช่น Flash Sale" />
            </Box>
            
            <TextField label="รายละเอียด" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} fullWidth placeholder="เช่น ลดราคาทุกบริการ 20%" />
            
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 2 }}>
                <Typography fontWeight="bold" color="primary.main" mb={2}>ส่วนลดตั้งต้น (Global Default)</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>ส่วนลดนี้จะถูกใช้กับรายการที่ไม่ได้ระบุส่วนลดแยกเฉพาะ</Typography>
                <RadioGroup row value={form.discount_type} onChange={(e) => setForm(f => ({ ...f, discount_type: e.target.value as 'amount' | 'percent' }))} sx={{ mb: 2 }}>
                  <FormControlLabel value="amount" control={<Radio />} label="ลดเป็นจำนวนเงิน (บาท)" />
                  <FormControlLabel value="percent" control={<Radio />} label="ลดเป็นเปอร์เซ็นต์ (%)" />
                </RadioGroup>
                <Box display="flex" gap={2}>
                  {form.discount_type === 'amount' ? (
                    <TextField label="ส่วนลดเป็นบาท" type="number" value={form.discount_amount || ''} onChange={(e) => setForm(f => ({ ...f, discount_amount: parseFloat(e.target.value) || 0 }))} fullWidth InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }} helperText="ตัวอย่าง ลด 100 บาท" />
                  ) : (
                    <TextField label="ส่วนลด %" type="number" value={form.discount_percent || ''} onChange={(e) => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || 0 }))} fullWidth InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} inputProps={{ min: 0, max: 100 }} helperText="เช่น 20%" />
                  )}
                </Box>
            </Paper>

            <Divider />
            <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography fontWeight="bold">รายการที่ร่วมรายการเฉพาะเจาะจง (Line-Items)</Typography>
                    <Box display="flex" gap={1}>
                        <Button variant="outlined" size="small" onClick={() => setCourseModalOpen(true)}>+ เพิ่มคลาส</Button>
                        <Button variant="outlined" size="small" onClick={() => setServiceModalOpen(true)}>+ เพิ่มบริการ</Button>
                    </Box>
                </Box>
                
                {form.applicable_courses.length === 0 && form.applicable_services.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
                        ไม่มีรายการเฉพาะเจาะจง (แคมเปญนี้จะใช้ไม่ได้กับรายการใดเลย หากไม่เลือกรายการใด หรือหากเว้นว่างในเวอร์ชันก่อนคือใช้ได้ทุกรายการ ซึ่งตอนนี้แนะนำให้เลือกให้ชัดเจน)
                    </Typography>
                ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>รายการ</TableCell>
                                    <TableCell>ประเภท</TableCell>
                                    <TableCell>{form.discount_type === 'amount' ? 'ส่วนลดบาท (เฉพาะรายการ)' : 'ส่วนลด % (เฉพาะรายการ)'}</TableCell>
                                    <TableCell width={50}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {form.applicable_courses.map(ci => {
                                    const course = courses.find(c => c.id === ci.id);
                                    return (
                                        <TableRow key={`c-${ci.id}`}>
                                            <TableCell>{course?.name || `Course #${ci.id}`}</TableCell>
                                            <TableCell><Chip label="คลาสเรียน" size="small" color="info" variant="outlined" /></TableCell>
                                            <TableCell>
                                                {form.discount_type === 'amount' ? (
                                                    <TextField size="small" type="number" placeholder={form.discount_amount.toString()} value={ci.discount_amount ?? ''} onChange={e => updateItemDiscount('course', ci.id, 'discount_amount', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }} />
                                                ) : (
                                                    <TextField size="small" type="number" placeholder={form.discount_percent.toString()} value={ci.discount_percent ?? ''} onChange={e => updateItemDiscount('course', ci.id, 'discount_percent', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                                                )}
                                            </TableCell>
                                            <TableCell><IconButton size="small" color="error" onClick={() => removeItem('course', ci.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                                        </TableRow>
                                    );
                                })}
                                {form.applicable_services.map(si => {
                                    const service = services.find(s => s.id === si.id);
                                    return (
                                        <TableRow key={`s-${si.id}`}>
                                            <TableCell>{service?.name || `Service #${si.id}`}</TableCell>
                                            <TableCell><Chip label="บริการ" size="small" color="secondary" variant="outlined" /></TableCell>
                                            <TableCell>
                                                {form.discount_type === 'amount' ? (
                                                    <TextField size="small" type="number" placeholder={form.discount_amount.toString()} value={si.discount_amount ?? ''} onChange={e => updateItemDiscount('service', si.id, 'discount_amount', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }} />
                                                ) : (
                                                    <TextField size="small" type="number" placeholder={form.discount_percent.toString()} value={si.discount_percent ?? ''} onChange={e => updateItemDiscount('service', si.id, 'discount_percent', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                                                )}
                                            </TableCell>
                                            <TableCell><IconButton size="small" color="error" onClick={() => removeItem('service', si.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            <Box display="flex" gap={2} mt={1}>
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
          <Typography>คุณต้องการลบแคมเปญ <b style={{ color: '#6c47ff' }}>{deleteTarget?.name}</b> ใช่หรือไม่?</Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>การลบจะไม่สามารถกู้คืนกลับมาได้</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>ยกเลิก</Button>
          <Button onClick={handleDelete} variant="contained" color="error" startIcon={<DeleteIcon />} sx={{ borderRadius: 2, fontWeight: 'bold' }}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <ItemSelectionModal
        open={courseModalOpen}
        title="เลือกคลาสเรียนที่ร่วมรายการ"
        items={courses}
        selectedIds={form.applicable_courses.map(c => c.id)}
        onClose={() => setCourseModalOpen(false)}
        onSave={handleSelectCourses}
      />

      <ItemSelectionModal
        open={serviceModalOpen}
        title="เลือกบริการที่ร่วมรายการ"
        items={services}
        selectedIds={form.applicable_services.map(c => c.id)}
        onClose={() => setServiceModalOpen(false)}
        onSave={handleSelectServices}
      />
    </Box>
  );
};

export default SaleCampaignManagement;
