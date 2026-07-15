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
} from '@mui/material';
import { Add, Edit, Delete, CloudUpload } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

interface StampImageRange {
  id: number;
  range_start: number;
  range_end: number;
  image_url: string;
}

const StampImageManagement = () => {
  const [ranges, setRanges] = useState<StampImageRange[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StampImageRange | null>(null);
  const [form, setForm] = useState({ rangeStart: 1, rangeEnd: 10, imageUrl: '' });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRanges = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/stamp-image-ranges`);
      if (data.success) setRanges(data.ranges);
    } catch (e) {
      console.error('Failed to fetch stamp image ranges', e);
    }
  };

  useEffect(() => { fetchRanges(); }, []);

  const handleOpen = (range?: StampImageRange) => {
    setError('');
    if (range) {
      setEditing(range);
      setForm({ rangeStart: range.range_start, rangeEnd: range.range_end, imageUrl: range.image_url });
    } else {
      setEditing(null);
      const nextStart = ranges.length ? Math.max(...ranges.map(r => r.range_end)) + 1 : 1;
      setForm({ rangeStart: nextStart, rangeEnd: nextStart + 9, imageUrl: '' });
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight="bold">จัดการรูปแสตมป์</Typography>
          <Typography variant="body2" color="text.secondary">
            กำหนดว่ารูปแสตมป์ใดใช้กับแสตมป์ลำดับที่เท่าไหร่ (นับตามลำดับที่ลูกค้าได้รับ)
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained" disabled={uploading}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StampImageManagement;
