import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, Switch, FormControlLabel,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

interface BirthdayWish {
  id: number;
  message_th: string;
  message_en: string | null;
  is_active: boolean;
}

const BirthdayWishManagement = () => {
  const [wishes, setWishes] = useState<BirthdayWish[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BirthdayWish | null>(null);
  const [form, setForm] = useState({ messageTh: '', messageEn: '', isActive: true });
  const [error, setError] = useState('');

  const fetchWishes = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/birthday-wishes`);
      if (data.success) setWishes(data.wishes);
    } catch (e) {
      console.error('Failed to fetch birthday wishes', e);
    }
  };

  useEffect(() => { fetchWishes(); }, []);

  const handleOpen = (wish?: BirthdayWish) => {
    setError('');
    if (wish) {
      setEditing(wish);
      setForm({ messageTh: wish.message_th, messageEn: wish.message_en || '', isActive: !!wish.is_active });
    } else {
      setEditing(null);
      setForm({ messageTh: '', messageEn: '', isActive: true });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.messageTh.trim()) { setError('กรุณากรอกข้อความอวยพร (ภาษาไทย)'); return; }
    try {
      if (editing) await axios.put(`${API_BASE}/birthday-wishes/${editing.id}`, form);
      else await axios.post(`${API_BASE}/birthday-wishes`, form);
      setOpen(false);
      fetchWishes();
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('ต้องการลบคำอวยพรนี้ใช่หรือไม่?')) return;
    try {
      await axios.delete(`${API_BASE}/birthday-wishes/${id}`);
      fetchWishes();
    } catch (e) {
      console.error('Failed to delete birthday wish', e);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight="bold">คลังคำอวยพรวันเกิด</Typography>
          <Typography variant="body2" color="text.secondary">
            ข้อความที่จะสุ่มแสดงในหน้าวันเกิดของแอปฝั่งผู้ปกครอง (เฉพาะที่เปิดใช้งาน)
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>เพิ่มคำอวยพร</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ข้อความ (ไทย)</TableCell>
              <TableCell>ข้อความ (English)</TableCell>
              <TableCell align="center">เปิดใช้งาน</TableCell>
              <TableCell>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {wishes.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 4 }}>ยังไม่มีคำอวยพรในระบบ</TableCell></TableRow>
            )}
            {wishes.map((w) => (
              <TableRow key={w.id} sx={{ opacity: w.is_active ? 1 : 0.5 }}>
                <TableCell sx={{ maxWidth: 320 }}>{w.message_th}</TableCell>
                <TableCell sx={{ maxWidth: 320, color: 'text.secondary' }}>{w.message_en || '-'}</TableCell>
                <TableCell align="center">{w.is_active ? '✓' : '—'}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleOpen(w)} color="primary"><Edit /></IconButton>
                  <IconButton onClick={() => handleDelete(w.id)} color="error"><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'แก้ไขคำอวยพร' : 'เพิ่มคำอวยพร'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="ข้อความอวยพร (ไทย)"
              multiline
              minRows={2}
              fullWidth
              value={form.messageTh}
              onChange={e => setForm(f => ({ ...f, messageTh: e.target.value }))}
            />
            <TextField
              label="ข้อความอวยพร (English)"
              multiline
              minRows={2}
              fullWidth
              value={form.messageEn}
              onChange={e => setForm(f => ({ ...f, messageEn: e.target.value }))}
            />
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />}
              label="เปิดใช้งาน"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained">บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BirthdayWishManagement;
