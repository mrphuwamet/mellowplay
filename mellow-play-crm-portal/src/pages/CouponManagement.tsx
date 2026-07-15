import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { Add, Edit, Delete, LocalActivity as CouponIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

const CouponManagement = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', color: '#A78BFA' });

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<any>(null);
  const [transferTargetId, setTransferTargetId] = useState<number | ''>('');
  const [deleteError, setDeleteError] = useState('');

  const fetchCoupons = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/coupon-types`);
      if (data.success) {
        setCoupons(data.couponTypes);
      }
    } catch (error) {
      console.error('Failed to fetch coupons', error);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleOpen = (coupon?: any) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setFormData({ name: coupon.name, color: coupon.color });
    } else {
      setEditingCoupon(null);
      setFormData({ name: '', color: '#A78BFA' });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = async () => {
    try {
      if (editingCoupon) {
        await axios.put(`${API_BASE}/coupon-types/${editingCoupon.id}`, formData);
      } else {
        await axios.post(`${API_BASE}/coupon-types`, formData);
      }
      fetchCoupons();
      handleClose();
    } catch (error) {
      console.error('Failed to save coupon', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('คุณต้องการลบคูปองนี้ใช่หรือไม่?')) {
      try {
        await axios.delete(`${API_BASE}/coupon-types/${id}`);
        fetchCoupons();
      } catch (error: any) {
        if (error.response && error.response.status === 400) {
          // Open transfer dialog
          setDeleteError(error.response.data.message);
          setCouponToDelete(coupons.find(c => c.id === id));
          setTransferTargetId('');
          setTransferDialogOpen(true);
        } else {
          console.error('Failed to delete coupon', error);
          alert('ไม่สามารถลบคูปองได้');
        }
      }
    }
  };

  const handleConfirmTransfer = async () => {
    if (!couponToDelete || !transferTargetId) return;
    try {
      await axios.delete(`${API_BASE}/coupon-types/${couponToDelete.id}?transferTo=${transferTargetId}`);
      fetchCoupons();
      setTransferDialogOpen(false);
      setCouponToDelete(null);
    } catch (error) {
      console.error('Failed to transfer and delete', error);
      alert('เกิดข้อผิดพลาดในการลบและโอนย้ายข้อมูล');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">จัดการคูปอง (Coupons)</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>เพิ่มคูปองใหม่</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ไอดี</TableCell>
              <TableCell>ไอคอน</TableCell>
              <TableCell>ชื่อคูปอง</TableCell>
              <TableCell>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell>{coupon.id}</TableCell>
                <TableCell>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', bgcolor: `${coupon.color}20`,
                  }}>
                    <CouponIcon sx={{ color: coupon.color }} />
                  </Box>
                </TableCell>
                <TableCell>{coupon.name}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleOpen(coupon)} color="primary"><Edit /></IconButton>
                  <IconButton onClick={() => handleDelete(coupon.id)} color="error"><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>{editingCoupon ? 'แก้ไขคูปอง' : 'เพิ่มคูปองใหม่'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <Box sx={{
                width: 64, height: 64, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', bgcolor: `${formData.color}20`,
              }}>
                <CouponIcon sx={{ color: formData.color, fontSize: 32 }} />
              </Box>
            </Box>
            <TextField
              label="ชื่อคูปอง"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <TextField
              label="สีของคูปอง (HEX Code)"
              fullWidth
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box
                      component="input"
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(formData.color) ? formData.color : '#A78BFA'}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      sx={{ width: 28, height: 28, border: 'none', borderRadius: '50%', p: 0, cursor: 'pointer' }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formData.name}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>โอนย้ายคูปองและลบ</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1" color="error" gutterBottom sx={{ fontWeight: 'bold' }}>
            {deleteError}
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            เพื่อที่จะลบ "{couponToDelete?.name}" คุณต้องเลือกคูปองเป้าหมายที่จะรับโอนสิทธิ์และข้อมูลที่เกี่ยวข้องทั้งหมด (CourseCoupons, ChildCoupons, UserCoupons) ไปยังคูปองใหม่นี้
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>เลือกคูปองเป้าหมาย</InputLabel>
            <Select
              value={transferTargetId}
              label="เลือกคูปองเป้าหมาย"
              onChange={(e) => setTransferTargetId(e.target.value as number)}
            >
              <MenuItem value=""><em>-- กรุณาเลือก --</em></MenuItem>
              {coupons.filter(c => c.id !== couponToDelete?.id).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferDialogOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleConfirmTransfer} variant="contained" color="error" disabled={!transferTargetId}>โอนย้ายและลบถาวร</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CouponManagement;
