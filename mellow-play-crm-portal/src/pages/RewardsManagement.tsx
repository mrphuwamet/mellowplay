import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Typography, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Switch, FormControlLabel } from '@mui/material';
import { Redeem, Add, Edit, Delete } from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api/v1';

interface Reward {
  id: number;
  name: string;
  description: string;
  image_url: string;
  stamp_cost: number;
  stock: number;
  is_active: boolean;
}

const RewardsManagement = () => {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image_url: '',
    stamp_cost: 1,
    stock: 10,
    is_active: true
  });

  const fetchRewards = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/rewards`);
      if (res.data.success) {
        setRewards(res.data.rewards);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRewards();
  }, []);

  const handleOpen = (reward?: Reward) => {
    if (reward) {
      setEditingId(reward.id);
      setFormData({
        name: reward.name,
        description: reward.description || '',
        image_url: reward.image_url || '',
        stamp_cost: reward.stamp_cost,
        stock: reward.stock,
        is_active: Boolean(reward.is_active)
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        image_url: '',
        stamp_cost: 1,
        stock: 10,
        is_active: true
      });
    }
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  const handleSave = async () => {
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/admin/rewards/${editingId}`, formData);
      } else {
        await axios.post(`${API_BASE}/admin/rewards`, formData);
      }
      fetchRewards();
      handleClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('คุณต้องการลบของรางวัลนี้ใช่หรือไม่?')) {
      try {
        await axios.delete(`${API_BASE}/admin/rewards/${id}`);
        fetchRewards();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#fdfdfd', minHeight: '85vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ p: 1.25, bgcolor: 'primary.light', color: 'primary.main', borderRadius: 2 }}>
            <Redeem sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>จัดการของรางวัล (Rewards Catalog)</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>จัดการแคตตาล็อกของรางวัลและสต๊อก</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<Add sx={{ fontSize: 18 }} />} onClick={() => handleOpen()} sx={{ borderRadius: 2, px: 3, py: 1 }}>
          เพิ่มของรางวัล
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #eee', borderRadius: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8f9fa' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>รูปภาพ</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ชื่อของรางวัล</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ใช้แสตมป์</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>สต๊อกคงเหลือ</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rewards.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <Box sx={{ width: 40, height: 40, bgcolor: '#eee', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Redeem sx={{ fontSize: 20, color: '#ccc' }} />
                    </Box>
                  )}
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                <TableCell>{r.stamp_cost} ดวง</TableCell>
                <TableCell>{r.stock} ชิ้น</TableCell>
                <TableCell>
                  <Box sx={{ 
                    px: 1.5, py: 0.5, borderRadius: 10, display: 'inline-block', fontSize: 12, fontWeight: 700,
                    bgcolor: r.is_active ? 'success.light' : 'error.light',
                    color: r.is_active ? 'success.dark' : 'error.dark'
                  }}>
                    {r.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => handleOpen(r)} sx={{ minWidth: 0, mr: 1 }}><Edit sx={{ fontSize: 16 }} /></Button>
                  <Button size="small" color="error" onClick={() => handleDelete(r.id)} sx={{ minWidth: 0 }}><Delete sx={{ fontSize: 16 }} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {rewards.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  ยังไม่มีข้อมูลของรางวัล
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{editingId ? 'แก้ไขของรางวัล' : 'เพิ่มของรางวัล'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField 
            label="ชื่อของรางวัล" fullWidth 
            value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} 
          />
          <TextField 
            label="รายละเอียด" fullWidth multiline rows={2}
            value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} 
          />
          <TextField 
            label="URL รูปภาพ" fullWidth 
            value={formData.image_url} onChange={(e) => setFormData({...formData, image_url: e.target.value})} 
            helperText="ใส่ลิงก์รูปภาพของรางวัล"
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField 
              label="ใช้แสตมป์ (ดวง)" type="number" fullWidth 
              value={formData.stamp_cost} onChange={(e) => setFormData({...formData, stamp_cost: parseInt(e.target.value)})} 
            />
            <TextField 
              label="สต๊อก (ชิ้น)" type="number" fullWidth 
              value={formData.stock} onChange={(e) => setFormData({...formData, stock: parseInt(e.target.value)})} 
            />
          </Box>
          <FormControlLabel 
            control={<Switch checked={formData.is_active} onChange={(e) => setFormData({...formData, is_active: e.target.checked})} />} 
            label="เปิดให้แลกได้" 
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} color="inherit">ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained" sx={{ borderRadius: 2 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RewardsManagement;
