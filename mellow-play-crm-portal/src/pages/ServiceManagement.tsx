import { API_URL } from '../config';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem,
  Paper, Select, Switch, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  MiscellaneousServices as ServiceIcon, Category as CategoryIcon,
  Percent as PercentIcon, AttachMoney as FixedIcon,
} from '@mui/icons-material';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Service {
  id: number;
  name: string;
  categoryId: number;
  description: string;
  price: number;
  durationMin: number;
  commissionType: 'percent' | 'fixed';
  commissionValue: string;
  active: boolean;
}

interface ServiceCategory {
  id: number;
  name: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = `${API_URL}/api/v1/admin`;

const EMPTY_FORM: Omit<Service, 'id'> = {
  name: '', categoryId: 1, description: '', price: 0,
  durationMin: 30, commissionType: 'percent', commissionValue: '',
  active: true,
};

const CATEGORY_COLORS = ['#7c3aed','#0284c7','#059669','#d97706','#dc2626','#db2777','#0d9488'];

// ─── Component ────────────────────────────────────────────────────────────────

const ServiceManagement: React.FC = () => {
  const [services, setServices]     = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterCat, setFilterCat]   = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [tab, setTab]               = useState(0);
  const [successMsg, setSuccessMsg] = useState('');

  // Service dialog
  const [formOpen, setFormOpen]   = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<Omit<Service, 'id'>>(EMPTY_FORM);
  const [deleteId, setDeleteId]   = useState<number | null>(null);

  // Category dialog
  const [catDialogOpen, setCatDialogOpen]   = useState(false);
  const [catEditId, setCatEditId]           = useState<number | null>(null);
  const [catForm, setCatForm]               = useState({ name: '', color: '#7c3aed' });
  const [catDeleteId, setCatDeleteId]       = useState<number | null>(null);

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchServices = async () => {
    try {
      const res = await axios.get(`${API_BASE}/services`);
      const mapped: Service[] = (res.data.services || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        categoryId: s.category_id,
        description: s.description ?? '',
        price: s.price,
        durationMin: s.duration_min,
        commissionType: s.commission_type,
        commissionValue: String(s.commission_value ?? ''),
        active: Boolean(s.active),
      }));
      setServices(mapped);
    } catch (err) {
      console.error('Failed to fetch services', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API_BASE}/service-categories`);
      setCategories(res.data.categories || res.data.serviceCategories || []);
    } catch (err) {
      console.error('Failed to fetch service categories', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchServices(), fetchCategories()]);
      setLoading(false);
    };
    init();
  }, []);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => services.filter(s => {
    const matchCat    = !filterCat    || s.categoryId === parseInt(filterCat);
    const matchSearch = !filterSearch || s.name.toLowerCase().includes(filterSearch.toLowerCase());
    return matchCat && matchSearch;
  }), [services, filterCat, filterSearch]);

  // ── Service CRUD ──────────────────────────────────────────────────────────
  const openCreate = () => { setEditId(null); setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id || 1 }); setFormOpen(true); };
  const openEdit   = (s: Service) => { setEditId(s.id); const { id, ...rest } = s; setForm(rest); setFormOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      const payload = {
        name: form.name,
        category_id: form.categoryId,
        description: form.description,
        price: form.price,
        duration_min: form.durationMin,
        commission_type: form.commissionType,
        commission_value: form.commissionValue,
        active: form.active ? 1 : 0,
      };
      if (editId !== null) {
        await axios.put(`${API_BASE}/services/${editId}`, payload);
        showSuccess('แก้ไขบริการเรียบร้อย');
      } else {
        await axios.post(`${API_BASE}/services`, payload);
        showSuccess('เพิ่มบริการใหม่เรียบร้อย');
      }
      setFormOpen(false);
      await fetchServices();
    } catch (err) {
      console.error('Failed to save service', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/services/${id}`);
      setDeleteId(null);
      showSuccess('ลบบริการเรียบร้อย');
      await fetchServices();
    } catch (err) {
      console.error('Failed to delete service', err);
    }
  };

  const toggleActive = async (id: number) => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    try {
      await axios.put(`${API_BASE}/services/${id}`, {
        name: svc.name,
        category_id: svc.categoryId,
        description: svc.description,
        price: svc.price,
        duration_min: svc.durationMin,
        commission_type: svc.commissionType,
        commission_value: svc.commissionValue,
        active: svc.active ? 0 : 1,
      });
      await fetchServices();
    } catch (err) {
      console.error('Failed to toggle service active', err);
    }
  };

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const openCreateCat = () => { setCatEditId(null); setCatForm({ name: '', color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] }); setCatDialogOpen(true); };
  const openEditCat   = (c: ServiceCategory) => { setCatEditId(c.id); setCatForm({ name: c.name, color: c.color }); setCatDialogOpen(true); };

  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    try {
      if (catEditId !== null) {
        await axios.put(`${API_BASE}/service-categories/${catEditId}`, catForm);
      } else {
        await axios.post(`${API_BASE}/service-categories`, catForm);
      }
      setCatDialogOpen(false);
      await fetchCategories();
    } catch (err) {
      console.error('Failed to save category', err);
    }
  };

  const deleteCat = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/service-categories/${id}`);
      setCatDeleteId(null);
      await fetchCategories();
    } catch (err) {
      console.error('Failed to delete category', err);
    }
  };

  const catOf = (id: number) => categories.find(c => c.id === id);
  const fmtDuration = (m: number) => m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ''}` : `${m} น.`;
  const fmtCommission = (s: Service) => !s.commissionValue ? '—' : s.commissionType === 'percent' ? `${s.commissionValue}%` : `฿${s.commissionValue}`;

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ServiceIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จัดการบริการ</Typography>
            <Typography variant="body2" color="text.secondary">บริการเสริมในร้าน พร้อมค่าคอมมิชชันพนักงาน</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<CategoryIcon />} onClick={() => setTab(1)} sx={{ borderRadius: 3, fontWeight: 700 }}>
            หมวดหมู่
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 3, fontWeight: 700 }}>
            เพิ่มบริการ
          </Button>
        </Box>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="รายการบริการ" />
          <Tab label="หมวดหมู่" />
        </Tabs>
      </Box>

      {/* ── Tab 0: Service list ──────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          {/* Filters */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <TextField
              size="small" placeholder="ค้นหาบริการ..." value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)} sx={{ minWidth: 220 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>หมวดหมู่</InputLabel>
              <Select value={filterCat} label="หมวดหมู่" onChange={e => setFilterCat(e.target.value as string)}>
                <MenuItem value="">ทั้งหมด</MenuItem>
                {categories.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700 }}>ชื่อบริการ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>หมวดหมู่</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">ราคา</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ระยะเวลา</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ค่าคอมฯ พนักงาน</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">สถานะ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">จัดการ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(s => {
                    const cat = catOf(s.categoryId);
                    return (
                      <TableRow key={s.id} hover sx={{ opacity: s.active ? 1 : 0.55 }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>{s.name}</Typography>
                          {s.description && <Typography variant="caption" color="text.secondary">{s.description}</Typography>}
                        </TableCell>
                        <TableCell>
                          {cat && (
                            <Chip size="small" label={cat.name}
                              sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: cat.color + '18', color: cat.color }} />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={800}>฿{s.price.toLocaleString()}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{fmtDuration(s.durationMin)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} color="success.main">{fmtCommission(s)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Switch size="small" checked={s.active} onChange={() => toggleActive(s.id)} color="primary" />
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="แก้ไข">
                              <IconButton size="small" onClick={() => openEdit(s)} sx={{ color: 'primary.main' }}><EditIcon fontSize="small" /></IconButton>
                            </Tooltip>
                            <Tooltip title="ลบ">
                              <IconButton size="small" onClick={() => setDeleteId(s.id)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่มีบริการในหมวดนี้</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* ── Tab 1: Categories ────────────────────────────────────────────────── */}
      {tab === 1 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateCat} sx={{ borderRadius: 3, fontWeight: 700 }}>
              เพิ่มหมวดหมู่
            </Button>
          </Box>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700 }}>ชื่อหมวดหมู่</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">จำนวนบริการ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">จัดการ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {categories.map(c => (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={700}>{c.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={`${services.filter(s => s.categoryId === c.id).length} บริการ`} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <IconButton size="small" onClick={() => openEditCat(c)} sx={{ color: 'primary.main' }}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => setCatDeleteId(c.id)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* ── Service Form Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>{editId !== null ? 'แก้ไขบริการ' : 'เพิ่มบริการใหม่'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField label="ชื่อบริการ" fullWidth value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>หมวดหมู่</InputLabel>
                <Select value={form.categoryId} label="หมวดหมู่" onChange={e => setForm(f => ({ ...f, categoryId: Number(e.target.value) }))}>
                  {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField label="คำอธิบาย" fullWidth multiline rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="ราคา (฿)" type="number" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="ระยะเวลา (นาที)" type="number" fullWidth
                value={form.durationMin || ''} onChange={e => setForm(f => ({ ...f, durationMin: parseInt(e.target.value) || 0 }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>ค่าคอมมิชชันพนักงาน</Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <ToggleButtonGroup exclusive size="small"
                  value={form.commissionType}
                  onChange={(_, v) => v && setForm(f => ({ ...f, commissionType: v }))}
                  sx={{ height: 40 }}>
                  <ToggleButton value="percent" sx={{ fontWeight: 700, px: 1.5 }}><PercentIcon sx={{ fontSize: 16, mr: 0.5 }} />%</ToggleButton>
                  <ToggleButton value="fixed"   sx={{ fontWeight: 700, px: 1.5 }}><FixedIcon sx={{ fontSize: 16, mr: 0.5 }} />฿</ToggleButton>
                </ToggleButtonGroup>
                <TextField
                  size="small" type="number" fullWidth
                  label={form.commissionType === 'percent' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (฿)'}
                  value={form.commissionValue}
                  onChange={e => setForm(f => ({ ...f, commissionValue: e.target.value }))}
                  inputProps={{ min: 0 }}
                />
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim()} sx={{ borderRadius: 3, fontWeight: 700 }}>
            {editId !== null ? 'บันทึก' : 'เพิ่มบริการ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Category Form */}
      <Dialog open={catDialogOpen} onClose={() => setCatDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{catEditId !== null ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="ชื่อหมวดหมู่" fullWidth value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} sx={{ mb: 2 }} />
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>สีหมวดหมู่</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {CATEGORY_COLORS.map(color => (
                <Box key={color} onClick={() => setCatForm(f => ({ ...f, color }))}
                  sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: color, cursor: 'pointer',
                    border: catForm.color === color ? '3px solid #333' : '3px solid transparent',
                    transition: 'border 0.15s' }} />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCatDialogOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveCat} disabled={!catForm.name.trim()} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Service */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบบริการ</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>บริการ <strong>"{services.find(s => s.id === deleteId)?.name}"</strong> จะถูกลบออกถาวร</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => handleDelete(deleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบ</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Category */}
      <Dialog open={catDeleteId !== null} onClose={() => setCatDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบหมวดหมู่</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>หมวดหมู่ <strong>"{categories.find(c => c.id === catDeleteId)?.name}"</strong> จะถูกลบออกถาวร</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCatDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => deleteCat(catDeleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ServiceManagement;
