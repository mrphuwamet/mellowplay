import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  Chip, CircularProgress, Alert, FormControl, InputLabel, Select, MenuItem,
  Avatar,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Campaign as AdsIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

interface Ad {
  id: number;
  title: string;
  targetType: 'course' | 'news';
  targetId: number;
  targetTitle: string | null;
  targetExists: boolean;
  imageUrl: string | null;
  caption: string | null;
  isActive: boolean;
  clickCount: number;
  createdAt: string;
}

interface PickableTarget { id: number; label: string; }

const emptyForm = {
  title: '',
  targetType: 'course' as 'course' | 'news',
  targetId: '',
  customImageUrl: '',
  customCaption: '',
};

const AdsManagement = () => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<PickableTarget[]>([]);
  const [newsItems, setNewsItems] = useState<PickableTarget[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Ad | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/ads`);
      if (res.data.success) setAds(res.data.ads);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchAds();
    axios.get(`${API_BASE}/courses`).then(res => {
      if (res.data.success) setCourses(res.data.courses.map((c: any) => ({ id: c.id, label: c.name })));
    }).catch(() => {});
    axios.get(`${API_BASE}/news-feed`).then(res => {
      if (res.data.success) setNewsItems(res.data.items.map((n: any) => ({ id: n.id, label: n.title })));
    }).catch(() => {});
  }, []);

  const targetOptions = form.targetType === 'course' ? courses : newsItems;

  const openCreate = () => { setForm(emptyForm); setError(''); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('กรุณากรอกชื่อโฆษณา (สำหรับใช้งานภายใน)'); return; }
    if (!form.targetId) { setError('กรุณาเลือกคลาสหรือข่าวที่จะโปรโมท'); return; }
    setSaving(true);
    setError('');
    try {
      await axios.post(`${API_BASE}/ads`, {
        title: form.title.trim(),
        targetType: form.targetType,
        targetId: parseInt(form.targetId),
        customImageUrl: form.customImageUrl.trim() || undefined,
        customCaption: form.customCaption.trim() || undefined,
      });
      setDialogOpen(false);
      fetchAds();
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: Ad) => {
    await axios.put(`${API_BASE}/ads/${ad.id}`, { isActive: !ad.isActive });
    fetchAds();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_BASE}/ads/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchAds();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AdsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>โฆษณาในฟีด</Typography>
            <Typography variant="body2" color="text.secondary">
              การ์ดโปรโมทคลาส/ข่าวของเราเอง สุ่มแทรกในฟีดหน้า Home ของแอปลูกค้า
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 3, fontWeight: 700 }}>
          สร้างโฆษณา
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>โฆษณา</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>โปรโมทไปยัง</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">คลิก</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">เปิดใช้งาน</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">ลบ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ads.map(ad => (
                  <TableRow key={ad.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar variant="rounded" src={ad.imageUrl || undefined} sx={{ width: 44, height: 44 }}>
                          <AdsIcon fontSize="small" />
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{ad.title}</Typography>
                          {ad.caption && <Typography variant="caption" color="text.secondary">{ad.caption}</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ad.targetType === 'course' ? 'คลาส' : 'ข่าว'}
                        sx={{ fontWeight: 700, fontSize: '11px', mr: 1 }}
                      />
                      {ad.targetExists ? (
                        <Typography variant="body2" component="span">{ad.targetTitle}</Typography>
                      ) : (
                        <Typography variant="body2" component="span" color="error.main">ไม่พบข้อมูลเป้าหมาย (ถูกลบไปแล้ว?)</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={700}>{ad.clickCount}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch checked={ad.isActive} onChange={() => toggleActive(ad)} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(ad)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {ads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      ยังไม่มีโฆษณา — กด "สร้างโฆษณา" เพื่อเริ่มโปรโมทคลาสหรือข่าว
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>สร้างโฆษณาใหม่</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="ชื่อโฆษณา (ใช้ภายในเท่านั้น)"
            fullWidth
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <FormControl fullWidth>
            <InputLabel>ประเภทเป้าหมาย</InputLabel>
            <Select
              label="ประเภทเป้าหมาย"
              value={form.targetType}
              onChange={e => setForm({ ...form, targetType: e.target.value as 'course' | 'news', targetId: '' })}
            >
              <MenuItem value="course">คลาส</MenuItem>
              <MenuItem value="news">ข่าว</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>{form.targetType === 'course' ? 'เลือกคลาส' : 'เลือกข่าว'}</InputLabel>
            <Select
              label={form.targetType === 'course' ? 'เลือกคลาส' : 'เลือกข่าว'}
              value={form.targetId}
              onChange={e => setForm({ ...form, targetId: e.target.value })}
            >
              {targetOptions.map(t => (
                <MenuItem key={t.id} value={String(t.id)}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="รูปภาพ (ถ้าไม่ใส่ จะใช้รูปของคลาส/ข่าวนั้น)"
            fullWidth
            value={form.customImageUrl}
            onChange={e => setForm({ ...form, customImageUrl: e.target.value })}
          />
          <TextField
            label="ข้อความโฆษณา (ถ้ามี)"
            fullWidth
            multiline
            minRows={2}
            value={form.customCaption}
            onChange={e => setForm({ ...form, customCaption: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ borderRadius: 3, fontWeight: 700 }}>
            {saving ? <CircularProgress size={20} /> : 'สร้างโฆษณา'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ลบโฆษณา</DialogTitle>
        <DialogContent>
          <Typography variant="body2">ต้องการลบโฆษณา "{deleteTarget?.title}" ใช่หรือไม่?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting} sx={{ borderRadius: 3, fontWeight: 700 }}>
            {deleting ? <CircularProgress size={20} /> : 'ลบ'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdsManagement;
