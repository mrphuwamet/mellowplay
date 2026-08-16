import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Paper, Grid, Card, CardContent, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  FormControlLabel, Switch, CircularProgress, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { Add, Edit, Delete, CloudUpload, LinkOff } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../../config';
import { uploadEditorImage } from '../../utils/imageUpload';

const API_BASE = `${API_URL}/api/v1/admin`;

export interface StampDesign {
  id: number;
  name: string;
  image_url: string | null;
  accent_color: string | null;
  show_visit_number: number;
  is_active: number;
  binding_count?: number;
  issued_count?: number;
}

interface Binding {
  id: number;
  scope: 'course' | 'calendar' | 'slot_rule';
  ref_id: number;
  design_id: number;
  ref_label: string | null;
}

const SCOPE_LABEL: Record<string, string> = {
  course: 'กิจกรรม/คลาส',
  calendar: 'ปฏิทิน',
  slot_rule: 'รอบเวลา',
};

const EMPTY_FORM = { name: '', image_url: '', accent_color: '#7452d6', show_visit_number: true, is_active: true };

/**
 * The artwork library, and the list of what uses each design.
 *
 * A design is written once and pointed at from as many items or rounds as
 * needed — that is what makes "a different stamp for each competition round" a
 * couple of clicks rather than an upload every time.
 */
const StampDesignsTab: React.FC = () => {
  const [designs, setDesigns] = useState<StampDesign[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StampDesign | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [bindOpen, setBindOpen] = useState(false);
  const [bindForm, setBindForm] = useState({ courseId: '', designId: '' });

  const fetchAll = async () => {
    try {
      const [d, c] = await Promise.all([
        axios.get(`${API_BASE}/stamp-designs`),
        axios.get(`${API_BASE}/courses`),
      ]);
      if (d.data.success) { setDesigns(d.data.designs); setBindings(d.data.bindings); }
      if (c.data.success) setCourses(c.data.courses || []);
    } catch (e) {
      console.error('Failed to load stamp designs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openDialog = (design?: StampDesign) => {
    setError('');
    if (design) {
      setEditing(design);
      setForm({
        name: design.name,
        image_url: design.image_url || '',
        accent_color: design.accent_color || '#7452d6',
        show_visit_number: design.show_visit_number === 1,
        is_active: design.is_active === 1,
      });
    } else {
      setEditing(null);
      setForm(EMPTY_FORM);
    }
    setOpen(true);
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadEditorImage(file, 'stamp-images');
      setForm(f => ({ ...f, image_url: url }));
    } catch {
      setError('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) { setError('ตั้งชื่อดีไซน์ก่อน เช่น "Baby Quest รอบชิง"'); return; }
    try {
      if (editing) await axios.put(`${API_BASE}/stamp-designs/${editing.id}`, form);
      else await axios.post(`${API_BASE}/stamp-designs`, form);
      setOpen(false);
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.message || 'บันทึกไม่สำเร็จ');
    }
  };

  const remove = async (design: StampDesign) => {
    const issued = design.issued_count || 0;
    const msg = issued > 0
      ? `ดีไซน์นี้ถูกใช้ไปแล้ว ${issued} ดวง จะปิดการใช้งานแทนการลบ (แสตมป์เดิมยังเห็นรูปนี้อยู่) ดำเนินการต่อ?`
      : 'ต้องการลบดีไซน์นี้ใช่หรือไม่?';
    if (!window.confirm(msg)) return;
    await axios.delete(`${API_BASE}/stamp-designs/${design.id}`);
    fetchAll();
  };

  const saveBinding = async () => {
    if (!bindForm.courseId || !bindForm.designId) return;
    await axios.put(`${API_BASE}/stamp-design-bindings`, {
      scope: 'course', ref_id: Number(bindForm.courseId), design_id: Number(bindForm.designId),
    });
    setBindOpen(false);
    setBindForm({ courseId: '', designId: '' });
    fetchAll();
  };

  const unbind = async (b: Binding) => {
    await axios.put(`${API_BASE}/stamp-design-bindings`, { scope: b.scope, ref_id: b.ref_id, design_id: null });
    fetchAll();
  };

  const designName = (id: number) => designs.find(d => d.id === id)?.name || `#${id}`;

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>คลังดีไซน์แสตมป์</Typography>
          <Typography variant="body2" color="text.secondary">
            หนึ่งดีไซน์ใช้ซ้ำได้หลายกิจกรรม · แสตมป์ที่แจกไปแล้วจะเก็บรูป ณ วันที่ได้รับไว้เสมอ แก้รูปทีหลังไม่กระทบของเดิม
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => openDialog()}>เพิ่มดีไซน์</Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {designs.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info">
              ยังไม่มีดีไซน์ — ระบบจะใช้รูปตาม "ลำดับดวง (แบบเดิม)" ไปก่อน เพิ่มดีไซน์แล้วผูกกับกิจกรรมเพื่อให้แต่ละรายการมีแสตมป์ของตัวเอง
            </Alert>
          </Grid>
        )}
        {designs.map(d => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={d.id}>
            <Card variant="outlined" sx={{ borderRadius: 3, opacity: d.is_active ? 1 : 0.5, height: '100%' }}>
              <CardContent sx={{ textAlign: 'center', p: 2 }}>
                <Box
                  sx={{
                    width: 84, height: 84, mx: 'auto', mb: 1.5, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    bgcolor: d.image_url ? 'transparent' : (d.accent_color || '#7452d6'),
                    border: '2px dashed', borderColor: d.image_url ? 'transparent' : 'divider',
                  }}
                >
                  {d.image_url
                    ? <Box component="img" src={d.image_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Typography sx={{ color: '#fff', fontWeight: 900 }}>#1</Typography>}
                </Box>
                <Typography variant="subtitle2" fontWeight={800} noWrap title={d.name}>{d.name}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap', my: 1 }}>
                  {d.show_visit_number === 1 && <Chip size="small" label="โชว์ #ครั้งที่" />}
                  {!d.is_active && <Chip size="small" color="default" label="ปิดใช้งาน" />}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  ใช้กับ {d.binding_count || 0} รายการ · แจกแล้ว {d.issued_count || 0} ดวง
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <IconButton size="small" color="primary" onClick={() => openDialog(d)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => remove(d)}><Delete fontSize="small" /></IconButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>ดีไซน์ถูกใช้ที่ไหนบ้าง</Typography>
          <Typography variant="body2" color="text.secondary">
            ระบบเลือกจากที่เจาะจงที่สุดก่อน: รอบเวลา → ปฏิทิน → กิจกรรม (ตั้งรายรอบได้ในหน้าจัดการกิจกรรม)
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<Add />} onClick={() => setBindOpen(true)}>ผูกกับกิจกรรม</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ระดับ</TableCell>
              <TableCell>รายการ</TableCell>
              <TableCell>ดีไซน์</TableCell>
              <TableCell align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bindings.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีการผูกดีไซน์</TableCell></TableRow>
            )}
            {bindings.map(b => (
              <TableRow key={b.id}>
                <TableCell><Chip size="small" label={SCOPE_LABEL[b.scope] || b.scope} /></TableCell>
                <TableCell>{b.ref_label || `#${b.ref_id}`}</TableCell>
                <TableCell>{designName(b.design_id)}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" color="error" onClick={() => unbind(b)} title="เลิกผูก"><LinkOff fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'แก้ไขดีไซน์แสตมป์' : 'เพิ่มดีไซน์แสตมป์'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="ชื่อดีไซน์ (ใช้ในระบบหลังบ้าน)" fullWidth value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <Button variant="outlined" component="label" startIcon={uploading ? <CircularProgress size={16} /> : <CloudUpload />} disabled={uploading}>
              {form.image_url ? 'เปลี่ยนรูป' : 'อัปโหลดรูปแสตมป์'}
              <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
            </Button>
            {form.image_url && (
              <Box sx={{ textAlign: 'center' }}>
                <Box component="img" src={form.image_url} alt="" sx={{ width: 110, height: 110, objectFit: 'cover', borderRadius: '50%' }} />
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                component="input" type="color" value={form.accent_color}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, accent_color: e.target.value }))}
                sx={{ width: 44, height: 44, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, cursor: 'pointer', flexShrink: 0 }}
              />
              <TextField
                size="small" fullWidth label="สีประจำดีไซน์ (ใช้เมื่อไม่มีรูป)" value={form.accent_color}
                onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
              />
            </Box>
            <FormControlLabel
              control={<Switch checked={form.show_visit_number} onChange={e => setForm(f => ({ ...f, show_visit_number: e.target.checked }))} />}
              label='แสดง "#ครั้งที่" บนแสตมป์ (มาครั้งที่ 2 จะขึ้น #2)'
            />
            <FormControlLabel
              control={<Switch checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />}
              label="เปิดใช้งาน (ปิดแล้วจะไม่ขึ้นในตัวเลือก แต่แสตมป์เดิมยังใช้รูปนี้)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={save} disabled={uploading}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bindOpen} onClose={() => setBindOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>ผูกดีไซน์กับกิจกรรม</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>กิจกรรม / คลาส</InputLabel>
              <Select
                label="กิจกรรม / คลาส" value={bindForm.courseId}
                onChange={e => setBindForm(f => ({ ...f, courseId: String(e.target.value) }))}
              >
                {courses.map((c: any) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>ดีไซน์</InputLabel>
              <Select
                label="ดีไซน์" value={bindForm.designId}
                onChange={e => setBindForm(f => ({ ...f, designId: String(e.target.value) }))}
              >
                {designs.filter(d => d.is_active).map(d => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBindOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveBinding}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StampDesignsTab;
