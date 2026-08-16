import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Grid, Card, CardContent, Chip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
  MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { Edit, Delete, CloudUpload, Add } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../../config';
import { uploadEditorImage } from '../../utils/imageUpload';

const API_BASE = `${API_URL}/api/v1/admin`;

interface BadgeDesign {
  id: number;
  tier: number;
  name: string;
  description: string | null;
  image_url: string | null;
  accent_color: string | null;
  course_id: number | null;
  course_name: string | null;
  awarded_count: number;
}

// Fallback colours for the medals before anyone uploads artwork — gold, silver,
// bronze, in that order.
const TIER_FALLBACK: Record<number, string> = { 1: '#f2b418', 2: '#a8b3c1', 3: '#c98a5e' };

/**
 * Medal artwork. The three default medals are always present and apply
 * everywhere; adding a set for one item gives that item its own medals without
 * affecting anything else.
 */
const BadgeDesignsTab: React.FC = () => {
  const [badges, setBadges] = useState<BadgeDesign[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ tier: 1, name: '', description: '', image_url: '', accent_color: '', course_id: '' as string | number });

  const fetchAll = async () => {
    try {
      const [b, c] = await Promise.all([
        axios.get(`${API_BASE}/badge-designs`),
        axios.get(`${API_BASE}/courses`),
      ]);
      if (b.data.success) setBadges(b.data.badges);
      if (c.data.success) setCourses(c.data.courses || []);
    } catch (e) {
      console.error('Failed to load badge designs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openDialog = (badge?: BadgeDesign, tier?: number) => {
    if (badge) {
      setForm({
        tier: badge.tier, name: badge.name, description: badge.description || '',
        image_url: badge.image_url || '', accent_color: badge.accent_color || '',
        course_id: badge.course_id ?? '',
      });
    } else {
      setForm({ tier: tier || 1, name: `อันดับ ${tier || 1}`, description: '', image_url: '', accent_color: '', course_id: '' });
    }
    setOpen(true);
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadEditorImage(file, 'badge-images');
      setForm(f => ({ ...f, image_url: url }));
    } catch {
      alert('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    await axios.put(`${API_BASE}/badge-designs`, {
      ...form,
      course_id: form.course_id === '' ? null : Number(form.course_id),
    });
    setOpen(false);
    fetchAll();
  };

  const remove = async (badge: BadgeDesign) => {
    if (!window.confirm(`ลบเหรียญ "${badge.name}" ของ ${badge.course_name || 'ค่าเริ่มต้น'}?`)) return;
    try {
      await axios.delete(`${API_BASE}/badge-designs/${badge.id}`);
      fetchAll();
    } catch (e: any) {
      alert(e.response?.data?.message || 'ลบไม่สำเร็จ');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  const defaults = badges.filter(b => b.course_id === null);
  const perCourse = badges.filter(b => b.course_id !== null);

  const medal = (b: BadgeDesign) => (
    <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent sx={{ textAlign: 'center' }}>
        <Box
          sx={{
            width: 92, height: 92, mx: 'auto', mb: 1.5, borderRadius: '50%', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: b.image_url ? 'transparent' : (b.accent_color || TIER_FALLBACK[b.tier] || '#94a3b8'),
          }}
        >
          {b.image_url
            ? <Box component="img" src={b.image_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 34 }}>{b.tier}</Typography>}
        </Box>
        <Typography variant="subtitle1" fontWeight={800}>{b.name}</Typography>
        {b.description && <Typography variant="caption" color="text.secondary" display="block">{b.description}</Typography>}
        {b.course_name && <Chip size="small" sx={{ mt: 1 }} label={b.course_name} />}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          แจกไปแล้ว {b.awarded_count} เหรียญ
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <IconButton size="small" color="primary" onClick={() => openDialog(b)}><Edit fontSize="small" /></IconButton>
          {b.course_id !== null && (
            <IconButton size="small" color="error" onClick={() => remove(b)}><Delete fontSize="small" /></IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Typography variant="h6" fontWeight={800}>เหรียญรางวัล (Badge)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        อันดับ 1 · 2 · 3 สะสมข้ามกิจกรรม · กิจกรรมที่ไม่มีการแข่ง ตั้งให้ "เข้าร่วมแล้วได้อันดับ 3" อัตโนมัติได้ในหน้าจัดการกิจกรรม
        ส่วนอันดับ 1-2 มอบจากรายการจองหลังจบการแข่ง
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        เหรียญค่าเริ่มต้นสามอันนี้ใช้กับทุกกิจกรรม แก้ชื่อ/รูปได้แต่ลบไม่ได้ · ถ้าอยากให้บางกิจกรรมมีเหรียญของตัวเอง ให้เพิ่มชุดใหม่แล้วเลือกกิจกรรม
      </Alert>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {defaults.sort((a, b) => a.tier - b.tier).map(b => (
          <Grid item xs={12} sm={4} md={3} key={b.id}>{medal(b)}</Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>เหรียญเฉพาะกิจกรรม</Typography>
        <Button variant="outlined" startIcon={<Add />} onClick={() => openDialog(undefined, 1)}>เพิ่มเหรียญเฉพาะกิจกรรม</Button>
      </Box>

      {perCourse.length === 0
        ? <Alert severity="info">ยังไม่มี — ทุกกิจกรรมใช้เหรียญค่าเริ่มต้น</Alert>
        : (
          <Grid container spacing={2}>
            {perCourse.map(b => <Grid item xs={12} sm={4} md={3} key={b.id}>{medal(b)}</Grid>)}
          </Grid>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>เหรียญรางวัล</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>อันดับ</InputLabel>
              <Select label="อันดับ" value={form.tier} onChange={e => setForm(f => ({ ...f, tier: Number(e.target.value) }))}>
                <MenuItem value={1}>อันดับ 1 (ทอง)</MenuItem>
                <MenuItem value={2}>อันดับ 2 (เงิน)</MenuItem>
                <MenuItem value={3}>อันดับ 3 (ทองแดง / เข้าร่วม)</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>ใช้กับ</InputLabel>
              <Select
                label="ใช้กับ" value={form.course_id}
                onChange={e => setForm(f => ({ ...f, course_id: e.target.value as any }))}
              >
                <MenuItem value="">ทุกกิจกรรม (ค่าเริ่มต้น)</MenuItem>
                {courses.map((c: any) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="ชื่อเหรียญ" fullWidth value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextField label="คำอธิบายสั้นๆ" fullWidth value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Button variant="outlined" component="label" startIcon={uploading ? <CircularProgress size={16} /> : <CloudUpload />} disabled={uploading}>
              {form.image_url ? 'เปลี่ยนรูปเหรียญ' : 'อัปโหลดรูปเหรียญ'}
              <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
            </Button>
            {form.image_url && (
              <Box sx={{ textAlign: 'center' }}>
                <Box component="img" src={form.image_url} alt="" sx={{ width: 110, height: 110, objectFit: 'cover', borderRadius: '50%' }} />
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                component="input" type="color" value={form.accent_color || TIER_FALLBACK[form.tier] || '#94a3b8'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, accent_color: e.target.value }))}
                sx={{ width: 44, height: 44, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, cursor: 'pointer', flexShrink: 0 }}
              />
              <TextField
                size="small" fullWidth label="สีเหรียญ (ใช้เมื่อไม่มีรูป)" value={form.accent_color}
                onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={save} disabled={uploading}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BadgeDesignsTab;
