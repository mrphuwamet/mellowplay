import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Stack, CircularProgress, Divider, List, ListItem, ListItemButton, ListItemText, ListItemAvatar,
  Avatar, Card, CardContent,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Store as BranchIcon,
  AccessTime as TimeIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  open_time?: string;
  close_time?: string;
}


const SystemSettings = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; onConfirm: () => void }>({ open: false, title: '', onConfirm: () => {} });

  const [branchOpen, setBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState<Partial<Branch>>({});
  const [isEditBranch, setIsEditBranch] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/branches`);
      if (res.data.success) {
        setBranches(res.data.branches);
        if (res.data.branches.length > 0) {
          setSelectedBranchId(res.data.branches[0].id);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveBranch = async () => {
    try {
      if (isEditBranch) {
        await axios.patch(`${API_BASE}/branches/${branchForm.id}`, branchForm);
      } else {
        await axios.post(`${API_BASE}/branches`, branchForm);
      }
      setBranchOpen(false);
      fetchData();
    } catch (e: any) {
      alert('Failed to save branch: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleDeleteBranch = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmDialog({
      open: true,
      title: 'ลบสาขานี้?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await axios.delete(`${API_BASE}/branches/${id}`);
          fetchData();
        } catch (e: any) { alert('Error: ' + e.message); }
      }
    });
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>ตั้งค่าระบบและสาขา</Typography>
        <Typography variant="body2" color="text.secondary">จัดการค่าเริ่มต้นสำหรับแต่ละสาขา (Super Admin Only)</Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={12}>
          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <BranchIcon color="primary" /> สาขา
              </Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => { setBranchForm({}); setIsEditBranch(false); setBranchOpen(true); }} sx={{ borderRadius: 2 }}>
                เพิ่ม
              </Button>
            </Box>
            <List>
              {branches.map(b => (
                <ListItem key={b.id} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton 
                    selected={selectedBranchId === b.id}
                    onClick={() => setSelectedBranchId(b.id)}
                    sx={{ borderRadius: 2 }}
                  >
                    <ListItemText primary={b.name} secondary={b.address || 'ไม่มีข้อมูลที่อยู่'} primaryTypographyProps={{ fontWeight: 700 }} />
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setBranchForm(b); setIsEditBranch(true); setBranchOpen(true); }}><SettingsIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={(e) => handleDeleteBranch(e, b.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
      </Grid>
      </Grid>

      <Dialog open={branchOpen} onClose={() => setBranchOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{isEditBranch ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField label="ชื่อสาขา *" fullWidth value={branchForm.name || ''} onChange={e => setBranchForm({...branchForm, name: e.target.value})} />
            <TextField label="ที่อยู่" fullWidth value={branchForm.address || ''} onChange={e => setBranchForm({...branchForm, address: e.target.value})} />
            <Grid container spacing={2}>
              <Grid item xs={6}><TextField label="เบอร์โทร" fullWidth value={branchForm.phone || ''} onChange={e => setBranchForm({...branchForm, phone: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="อีเมล" fullWidth value={branchForm.email || ''} onChange={e => setBranchForm({...branchForm, email: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="เวลาเปิด" type="time" InputLabelProps={{ shrink: true }} fullWidth value={branchForm.open_time || ''} onChange={e => setBranchForm({...branchForm, open_time: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="เวลาปิด" type="time" InputLabelProps={{ shrink: true }} fullWidth value={branchForm.close_time || ''} onChange={e => setBranchForm({...branchForm, close_time: e.target.value})} /></Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setBranchOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSaveBranch} variant="contained">บันทึก</Button>
        </DialogActions>
      </Dialog>
      
      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.title}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={confirmDialog.onConfirm} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบข้อมูล</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SystemSettings;
