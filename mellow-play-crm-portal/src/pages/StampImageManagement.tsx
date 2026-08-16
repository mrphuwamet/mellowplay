import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { Add, Edit, Delete, CloudUpload } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';
import LoadingOverlay from '../components/LoadingOverlay';
import StampDesignsTab from '../components/stamps/StampDesignsTab';
import BadgeDesignsTab from '../components/stamps/BadgeDesignsTab';

const API_BASE = `${API_URL}/api/v1/admin`;

interface StampImageRange {
  id: number;
  range_start: number;
  range_end: number;
  image_url: string;
}

interface StampPageBackground {
  id: number;
  page_number: number;
  image_url: string;
}

const StampImageManagement = () => {
  const [tab, setTab] = useState(0);
  const [ranges, setRanges] = useState<StampImageRange[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StampImageRange | null>(null);
  const [form, setForm] = useState({ rangeStart: 1, rangeEnd: 10, imageUrl: '' });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backgrounds, setBackgrounds] = useState<StampPageBackground[]>([]);
  const [bgOpen, setBgOpen] = useState(false);
  const [bgEditing, setBgEditing] = useState<StampPageBackground | null>(null);
  const [bgForm, setBgForm] = useState({ pageNumber: 1, imageUrl: '' });
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState('');

  const fetchRanges = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/stamp-image-ranges`);
      if (data.success) setRanges(data.ranges);
    } catch (e) {
      console.error('Failed to fetch stamp image ranges', e);
    }
  };

  const fetchBackgrounds = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/stamp-page-backgrounds`);
      if (data.success) setBackgrounds(data.backgrounds);
    } catch (e) {
      console.error('Failed to fetch stamp page backgrounds', e);
    }
  };

  useEffect(() => { fetchRanges(); fetchBackgrounds(); }, []);

  const handleBgOpen = (bg?: StampPageBackground) => {
    setBgError('');
    if (bg) {
      setBgEditing(bg);
      setBgForm({ pageNumber: bg.page_number, imageUrl: bg.image_url });
    } else {
      setBgEditing(null);
      const nextPage = backgrounds.length ? Math.max(...backgrounds.map(b => b.page_number)) + 1 : 1;
      setBgForm({ pageNumber: nextPage, imageUrl: '' });
    }
    setBgOpen(true);
  };

  const uploadBgImage = async (file: File) => {
    setBgUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'stamp-backgrounds');
      const res = await axios.post(`${API_BASE}/upload`, fd);
      if (res.data.success) setBgForm(f => ({ ...f, imageUrl: res.data.url }));
      else setBgError('อัปโหลดรูปไม่สำเร็จ');
    } catch {
      setBgError('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setBgUploading(false);
    }
  };

  const handleBgSave = async () => {
    setBgError('');
    if (bgForm.pageNumber < 1) { setBgError('ลำดับหน้าต้องเริ่มจาก 1'); return; }
    if (!bgForm.imageUrl) { setBgError('กรุณาอัปโหลดรูปพื้นหลัง'); return; }
    try {
      if (bgEditing) await axios.put(`${API_BASE}/stamp-page-backgrounds/${bgEditing.id}`, bgForm);
      else await axios.post(`${API_BASE}/stamp-page-backgrounds`, bgForm);
      setBgOpen(false);
      fetchBackgrounds();
    } catch (e: any) {
      setBgError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const handleBgDelete = async (id: number) => {
    if (!window.confirm('ต้องการลบพื้นหลังหน้านี้ใช่หรือไม่?')) return;
    try {
      await axios.delete(`${API_BASE}/stamp-page-backgrounds/${id}`);
      fetchBackgrounds();
    } catch (e) {
      console.error('Failed to delete stamp page background', e);
    }
  };

  // Distinct images already uploaded across other ranges, so staff can
  // reuse one instead of uploading the same icon again for every range.
  const existingImages = Array.from(new Set(ranges.map(r => r.image_url).filter(Boolean)));

  const handleOpen = (range?: StampImageRange) => {
    setError('');
    if (range) {
      setEditing(range);
      setForm({ rangeStart: range.range_start, rangeEnd: range.range_end, imageUrl: range.image_url });
    } else {
      setEditing(null);
      const nextStart = ranges.length ? Math.max(...ranges.map(r => r.range_end)) + 1 : 1;
      // Default span matches the consumer app's 12-per-page stamp grid.
      setForm({ rangeStart: nextStart, rangeEnd: nextStart + 11, imageUrl: '' });
    }
    setOpen(true);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'stamp-images');
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
    if (form.rangeStart > form.rangeEnd) { setError('ลำดับเริ่มต้นต้องน้อยกว่าหรือเท่ากับลำดับสิ้นสุด'); return; }
    if (!form.imageUrl) { setError('กรุณาอัปโหลดรูปแสตมป์'); return; }
    try {
      if (editing) await axios.put(`${API_BASE}/stamp-image-ranges/${editing.id}`, form);
      else await axios.post(`${API_BASE}/stamp-image-ranges`, form);
      setOpen(false);
      fetchRanges();
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('ต้องการลบช่วงรูปแสตมป์นี้ใช่หรือไม่?')) return;
    try {
      await axios.delete(`${API_BASE}/stamp-image-ranges/${id}`);
      fetchRanges();
    } catch (e) {
      console.error('Failed to delete stamp image range', e);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight="bold">แสตมป์ & เหรียญรางวัล</Typography>
        <Typography variant="body2" color="text.secondary">
          แสตมป์ = บันทึกว่ามาร่วมกิจกรรมไหน (รูปตามกิจกรรม/รอบ) · เหรียญ = อันดับ 1 · 2 · 3 ที่สะสมข้ามกิจกรรม ·
          แต้มสำหรับแลกของรางวัลแยกจากแสตมป์ แลกของแล้วคอลเลกชันไม่หาย
        </Typography>
      </Box>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable" scrollButtons="auto"
      >
        <Tab label="คลังดีไซน์แสตมป์" />
        <Tab label="เหรียญรางวัล" />
        <Tab label="พื้นหลังหน้าสะสม" />
        <Tab label="ลำดับดวง (แบบเดิม)" />
      </Tabs>

      {tab === 0 && <StampDesignsTab />}
      {tab === 1 && <BadgeDesignsTab />}

      <Box sx={{ display: tab === 3 ? 'block' : 'none' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" fontWeight="bold">รูปตามลำดับดวง (ของเดิม)</Typography>
          <Typography variant="body2" color="text.secondary">
            ใช้เป็นตัวสำรองเท่านั้น — เมื่อกิจกรรมนั้นยังไม่ได้ผูกดีไซน์ไว้ แสตมป์จะใช้รูปตามลำดับที่ได้รับตามตารางนี้
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>เพิ่มช่วงรูปแสตมป์</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>รูปแสตมป์</TableCell>
              <TableCell>แสตมป์ลำดับที่</TableCell>
              <TableCell>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ranges.length === 0 && (
              <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 4 }}>ยังไม่มีการตั้งค่ารูปแสตมป์</TableCell></TableRow>
            )}
            {ranges.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Box component="img" src={r.image_url} alt="stamp" sx={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 1 }} />
                </TableCell>
                <TableCell>#{r.range_start} - #{r.range_end}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleOpen(r)} color="primary"><Edit /></IconButton>
                  <IconButton onClick={() => handleDelete(r.id)} color="error"><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      </Box>

      <Box sx={{ display: tab === 2 ? 'block' : 'none' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" fontWeight="bold">พื้นหลังการ์ดแสตมป์</Typography>
          <Typography variant="body2" color="text.secondary">
            กำหนดรูปพื้นหลังของการ์ดแสตมป์แต่ละหน้า (ตามหมายเลขหน้าที่แสดงในแอป เช่น "2 / 3")
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleBgOpen()}>เพิ่มพื้นหลัง</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>พื้นหลัง</TableCell>
              <TableCell>หน้าที่</TableCell>
              <TableCell>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {backgrounds.length === 0 && (
              <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 4 }}>ยังไม่มีการตั้งค่าพื้นหลัง (จะใช้พื้นหลังปกติ)</TableCell></TableRow>
            )}
            {backgrounds.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Box component="img" src={b.image_url} alt="background" sx={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 1 }} />
                </TableCell>
                <TableCell>หน้า {b.page_number}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleBgOpen(b)} color="primary"><Edit /></IconButton>
                  <IconButton onClick={() => handleBgDelete(b.id)} color="error"><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      </Box>

      <Dialog open={bgOpen} onClose={() => setBgOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{bgEditing ? 'แก้ไขพื้นหลัง' : 'เพิ่มพื้นหลัง'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {bgError && <Alert severity="error">{bgError}</Alert>}
            <TextField
              label="หน้าที่ (#)"
              type="number"
              fullWidth
              inputProps={{ min: 1 }}
              value={bgForm.pageNumber}
              onChange={e => setBgForm(f => ({ ...f, pageNumber: parseInt(e.target.value) || 1 }))}
            />

            <Button
              variant="outlined"
              component="label"
              startIcon={bgUploading ? <CircularProgress size={16} /> : <CloudUpload />}
              disabled={bgUploading}
            >
              {bgForm.imageUrl ? 'เปลี่ยนรูปพื้นหลัง' : 'อัปโหลดรูปพื้นหลัง'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadBgImage(file);
                  e.target.value = '';
                }}
              />
            </Button>

            {bgForm.imageUrl && (
              <Box>
                <Typography variant="caption" color="text.secondary">ตัวอย่าง:</Typography>
                <Box mt={1}>
                  <img src={bgForm.imageUrl} alt="Preview" style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'cover', borderRadius: 8 }} />
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBgOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleBgSave} variant="contained" disabled={bgUploading}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      <LoadingOverlay active={bgUploading} message="กำลังอัปโหลดรูปพื้นหลัง..." />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'แก้ไขช่วงรูปแสตมป์' : 'เพิ่มช่วงรูปแสตมป์'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box display="flex" gap={2}>
              <TextField
                label="แสตมป์เริ่มต้น (#)"
                type="number"
                fullWidth
                inputProps={{ min: 1 }}
                value={form.rangeStart}
                onChange={e => setForm(f => ({ ...f, rangeStart: parseInt(e.target.value) || 1 }))}
              />
              <TextField
                label="แสตมป์สิ้นสุด (#)"
                type="number"
                fullWidth
                inputProps={{ min: 1 }}
                value={form.rangeEnd}
                onChange={e => setForm(f => ({ ...f, rangeEnd: parseInt(e.target.value) || 1 }))}
              />
            </Box>

            <Button
              variant="outlined"
              component="label"
              startIcon={uploading ? <CircularProgress size={16} /> : <CloudUpload />}
              disabled={uploading}
            >
              {form.imageUrl ? 'เปลี่ยนรูปแสตมป์' : 'อัปโหลดรูปแสตมป์'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadImage(file);
                  e.target.value = '';
                }}
              />
            </Button>

            {form.imageUrl && (
              <Box>
                <Typography variant="caption" color="text.secondary">ตัวอย่าง:</Typography>
                <Box mt={1}>
                  <img src={form.imageUrl} alt="Preview" style={{ maxHeight: 96, objectFit: 'contain' }} />
                </Box>
              </Box>
            )}

            {existingImages.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  หรือใช้รูปที่เคยอัปโหลดแล้ว:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {existingImages.map((url, i) => (
                    <Box
                      key={i}
                      component="img"
                      src={url}
                      alt="stamp option"
                      onClick={() => setForm(f => ({ ...f, imageUrl: url }))}
                      sx={{
                        width: 44, height: 44, objectFit: 'contain', borderRadius: 1.5, p: 0.5,
                        cursor: 'pointer', border: '2px solid', borderColor: form.imageUrl === url ? 'primary.main' : 'divider',
                        bgcolor: '#fafafa',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained" disabled={uploading}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      <LoadingOverlay active={uploading} message="กำลังอัปโหลดรูปแสตมป์..." />
    </Box>
  );
};

export default StampImageManagement;
