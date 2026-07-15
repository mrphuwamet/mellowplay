import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  Chip, Tooltip, CircularProgress, Alert, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Feed as FeedIcon, Article as NewsIcon, PermMedia as MediaIcon,
  CloudUpload as UploadIcon, Close as ClearIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

interface NewsItem {
  id: number;
  type: 'news' | 'media';
  title: string;
  title_en: string | null;
  content: string | null;
  content_en: string | null;
  image_url: string | null;
  video_url: string | null;
  link_url: string | null;
  is_published: number;
  display_order: number;
  created_at: string;
}

const emptyForm = {
  type: 'news' as 'news' | 'media',
  title: '',
  titleEn: '',
  content: '',
  contentEn: '',
  imageUrl: '',
  videoUrl: '',
  linkUrl: '',
  isPublished: true,
  displayOrder: 0,
};

const getImageUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const NewsFeedManagement = () => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'news' | 'media'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NewsItem | null>(null);
  const [editTarget, setEditTarget] = useState<NewsItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/news-feed`);
      if (res.data.success) setItems(res.data.items);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredItems = filterType === 'all' ? items : items.filter(i => i.type === filterType);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setError(''); setDialogOpen(true); };
  const openEdit = (item: NewsItem) => {
    setEditTarget(item);
    setForm({
      type: item.type,
      title: item.title,
      titleEn: item.title_en || '',
      content: item.content || '',
      contentEn: item.content_en || '',
      imageUrl: item.image_url || '',
      videoUrl: item.video_url || '',
      linkUrl: item.link_url || '',
      isPublished: !!item.is_published,
      displayOrder: item.display_order,
    });
    setError('');
    setDialogOpen(true);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'news-feed');
      const res = await axios.post(`${API_BASE}/upload`, fd);
      if (res.data.success) setForm(f => ({ ...f, imageUrl: res.data.url }));
      else setError('อัปโหลดรูปไม่สำเร็จ');
    } catch {
      setError('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!form.title.trim()) { setError('กรุณากรอกหัวข้อ'); return; }
    setSaving(true);
    try {
      if (editTarget) await axios.put(`${API_BASE}/news-feed/${editTarget.id}`, form);
      else await axios.post(`${API_BASE}/news-feed`, form);
      setDialogOpen(false);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${API_BASE}/news-feed/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch { /* ignore */ }
  };

  const togglePublished = async (item: NewsItem) => {
    try {
      await axios.put(`${API_BASE}/news-feed/${item.id}`, {
        type: item.type,
        title: item.title,
        titleEn: item.title_en,
        content: item.content,
        contentEn: item.content_en,
        imageUrl: item.image_url,
        videoUrl: item.video_url,
        linkUrl: item.link_url,
        isPublished: !item.is_published,
        displayOrder: item.display_order,
      });
      fetchData();
    } catch { /* ignore */ }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <FeedIcon sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">จัดการฟีดข่าวสาร / สื่อความรู้</Typography>
            <Typography variant="body2" color="text.secondary">เนื้อหาที่แสดงในหน้า Explore ของแอป Consumer</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 'bold' }}>
          เพิ่มเนื้อหา
        </Button>
      </Box>

      <ToggleButtonGroup
        value={filterType}
        exclusive
        onChange={(_, v) => v && setFilterType(v)}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all">ทั้งหมด</ToggleButton>
        <ToggleButton value="news"><NewsIcon sx={{ fontSize: 16, mr: 0.5 }} /> ข่าวสาร</ToggleButton>
        <ToggleButton value="media"><MediaIcon sx={{ fontSize: 16, mr: 0.5 }} /> สื่อความรู้</ToggleButton>
      </ToggleButtonGroup>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width={64} sx={{ fontWeight: 'bold' }}>รูป</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>หัวข้อ</TableCell>
              <TableCell width={100} sx={{ fontWeight: 'bold' }}>ประเภท</TableCell>
              <TableCell width={140} sx={{ fontWeight: 'bold' }}>วันที่สร้าง</TableCell>
              <TableCell width={110} sx={{ fontWeight: 'bold' }}>สถานะ</TableCell>
              <TableCell width={90} align="center" sx={{ fontWeight: 'bold' }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}><CircularProgress size={32} /></TableCell></TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่พบเนื้อหา</TableCell></TableRow>
            ) : filteredItems.map((item) => (
              <TableRow key={item.id} hover sx={{ opacity: item.is_published ? 1 : 0.55 }}>
                <TableCell>
                  <Box sx={{ width: 44, height: 44, borderRadius: 1.5, overflow: 'hidden', bgcolor: '#f1f5f9', border: '1px solid #eee' }}>
                    {item.image_url && (
                      <img src={getImageUrl(item.image_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">{item.title}</Typography>
                  {item.title_en && <Typography variant="caption" color="text.secondary">{item.title_en}</Typography>}
                </TableCell>
                <TableCell>
                  <Chip
                    label={item.type === 'news' ? 'ข่าวสาร' : 'สื่อความรู้'}
                    size="small"
                    color={item.type === 'news' ? 'info' : 'secondary'}
                    sx={{ fontWeight: 'bold' }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(item.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={item.is_published ? 'เผยแพร่' : 'ซ่อนอยู่'}
                    size="small"
                    color={item.is_published ? 'success' : 'default'}
                    onClick={() => togglePublished(item)}
                    sx={{ fontWeight: 'bold', cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="แก้ไข"><IconButton size="small" onClick={() => openEdit(item)} color="primary"><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="ลบ"><IconButton size="small" onClick={() => setDeleteTarget(item)} color="error"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold', pb: 1 }}>{editTarget ? 'แก้ไขเนื้อหา' : 'เพิ่มเนื้อหาใหม่'}</DialogTitle>
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={2.5} pt={1}>
            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

            <ToggleButtonGroup
              value={form.type}
              exclusive
              onChange={(_, v) => v && setForm(f => ({ ...f, type: v }))}
              size="small"
            >
              <ToggleButton value="news"><NewsIcon sx={{ fontSize: 16, mr: 0.5 }} /> ข่าวสาร</ToggleButton>
              <ToggleButton value="media"><MediaIcon sx={{ fontSize: 16, mr: 0.5 }} /> สื่อความรู้</ToggleButton>
            </ToggleButtonGroup>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>รูปภาพประกอบ</Typography>
              <Box
                onClick={() => imageInputRef.current?.click()}
                sx={{
                  position: 'relative', aspectRatio: '16/9', maxWidth: 320, borderRadius: 2, overflow: 'hidden',
                  border: '2px dashed #e2e8f0', cursor: 'pointer', bgcolor: '#f9fafb',
                  '&:hover': { borderColor: 'primary.main', bgcolor: '#f5f0ff' },
                }}
              >
                {form.imageUrl ? (
                  <>
                    <img src={getImageUrl(form.imageUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    <IconButton
                      onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, imageUrl: '' })); }}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.45)', color: 'white', p: 0.5 }}
                    >
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </>
                ) : (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {uploading ? <CircularProgress size={24} /> : (
                      <>
                        <UploadIcon color="disabled" sx={{ mb: 0.5 }} />
                        <Typography variant="caption" color="text.disabled">คลิกเพื่ออัปโหลดรูป</Typography>
                      </>
                    )}
                  </Box>
                )}
              </Box>
              <input type="file" hidden accept="image/*" ref={imageInputRef} onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
                e.target.value = '';
              }} />
            </Box>

            <TextField label="หัวข้อ (ภาษาไทย) *" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} fullWidth />
            <TextField label="หัวข้อ (English)" value={form.titleEn} onChange={(e) => setForm(f => ({ ...f, titleEn: e.target.value }))} fullWidth />

            <TextField label="เนื้อหา (ภาษาไทย)" value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} fullWidth multiline rows={4} />
            <TextField label="เนื้อหา (English)" value={form.contentEn} onChange={(e) => setForm(f => ({ ...f, contentEn: e.target.value }))} fullWidth multiline rows={4} />

            <Box display="flex" gap={2}>
              <TextField label="ลิงก์วิดีโอ (ถ้ามี)" value={form.videoUrl} onChange={(e) => setForm(f => ({ ...f, videoUrl: e.target.value }))} fullWidth placeholder="https://..." />
              <TextField label="ลิงก์ภายนอก (ถ้ามี)" value={form.linkUrl} onChange={(e) => setForm(f => ({ ...f, linkUrl: e.target.value }))} fullWidth placeholder="https://..." />
            </Box>

            <TextField
              label="ลำดับการแสดงผล (น้อยไปมาก)"
              type="number"
              value={form.displayOrder}
              onChange={(e) => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))}
              sx={{ maxWidth: 220 }}
            />

            <FormControlLabel
              control={<Switch checked={form.isPublished} onChange={(e) => setForm(f => ({ ...f, isPublished: e.target.checked }))} color="success" />}
              label={<Typography fontWeight="bold">{form.isPublished ? 'เผยแพร่' : 'ซ่อนไว้ก่อน'}</Typography>}
            />
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
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>คุณต้องการลบเนื้อหา <b>{deleteTarget?.title}</b> ใช่หรือไม่?</Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>การลบจะไม่สามารถกู้คืนกลับมาได้</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} variant="outlined" sx={{ borderRadius: 2 }}>ยกเลิก</Button>
          <Button onClick={handleDelete} variant="contained" color="error" startIcon={<DeleteIcon />} sx={{ borderRadius: 2, fontWeight: 'bold' }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NewsFeedManagement;
