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
  location: string;
}

interface DefaultSlot {
  id: string;
  branch_id: string;
  label: string;
  start_time: string;
  end_time: string;
}

const SystemSettings = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [defaultSlots, setDefaultSlots] = useState<DefaultSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const [slotOpen, setSlotOpen] = useState(false);
  const [newSlot, setNewSlot] = useState({ label: '', startTime: '10:00', endTime: '13:00' });

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

  const fetchSlots = async (branchId: string) => {
    if (!branchId) return;
    try {
      const res = await axios.get(`${API_BASE}/branch-default-slots?branchId=${branchId}`);
      if (res.data.success) setDefaultSlots(res.data.slots);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchSlots(selectedBranchId); }, [selectedBranchId]);

  const handleAddSlot = async () => {
    if (!selectedBranchId) {
      alert('กรุณาเลือกสาขาก่อนเพิ่มช่วงเวลา');
      return;
    }
    if (!newSlot.label || !newSlot.startTime || !newSlot.endTime) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      await axios.post(`${API_BASE}/branch-default-slots`, {
        ...newSlot,
        branchId: selectedBranchId
      });
      setSlotOpen(false);
      setNewSlot({ label: '', startTime: '10:00', endTime: '13:00' });
      fetchSlots(selectedBranchId);
    } catch (e: any) { 
      console.error(e);
      alert('Failed to add default slot: ' + (e.response?.data?.message || e.message)); 
    }
  };

  const handleDeleteSlot = async (id: string) => {
    if (!window.confirm('ลบช่วงเวลามาตรฐานนี้?')) return;
    try {
      await axios.delete(`${API_BASE}/branch-default-slots/${id}`);
      fetchSlots(selectedBranchId);
    } catch (e) { console.error(e); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>ตั้งค่าระบบและสาขา</Typography>
        <Typography variant="body2" color="text.secondary">จัดการค่าเริ่มต้นสำหรับแต่ละสาขา (Super Admin Only)</Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
              <BranchIcon color="primary" /> เลือกสาขาที่ต้องการตั้งค่า
            </Typography>
            <List>
              {branches.map(b => (
                <ListItem key={b.id} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton 
                    selected={selectedBranchId === b.id}
                    onClick={() => setSelectedBranchId(b.id)}
                    sx={{ borderRadius: 2 }}
                  >
                    <ListItemText primary={b.name} secondary={b.location} primaryTypographyProps={{ fontWeight: 700 }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 4, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>ช่วงเวลาเปิดสอนมาตรฐาน (Default Slots)</Typography>
                <Typography variant="body2" color="text.secondary">ค่าเริ่มต้นสำหรับหน้า "จัดตารางเรียน" ของสาขานี้</Typography>
              </Box>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSlotOpen(true)} sx={{ borderRadius: 3, fontWeight: 800 }}>
                เพิ่มช่วงเวลา
              </Button>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <List>
              {defaultSlots.map(slot => (
                <ListItem 
                  key={slot.id} 
                  secondaryAction={
                    <IconButton edge="end" color="error" onClick={() => handleDeleteSlot(slot.id)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                  sx={{ bgcolor: '#f8fafc', borderRadius: 3, mb: 2, py: 2 }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main' }}>
                      <TimeIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={slot.label} 
                    secondary={`${slot.start_time} - ${slot.end_time}`} 
                    primaryTypographyProps={{ fontWeight: 800 }}
                  />
                </ListItem>
              ))}
              {defaultSlots.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 6, border: '1px dashed #cbd5e1', borderRadius: 4 }}>
                  <Typography color="text.secondary">ยังไม่มีการตั้งค่าช่วงเวลามาตรฐาน</Typography>
                  <Button sx={{ mt: 1, fontWeight: 700 }} onClick={() => setSlotOpen(true)}>สร้างตอนนี้</Button>
                </Box>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={slotOpen} onClose={() => setSlotOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>เพิ่มช่วงเวลามาตรฐาน</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField 
              label="ชื่อเรียก (e.g. รอบเช้า)" 
              fullWidth 
              value={newSlot.label} 
              onChange={e => setNewSlot({...newSlot, label: e.target.value})} 
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField 
                  label="เริ่ม" 
                  type="time" 
                  fullWidth 
                  value={newSlot.startTime} 
                  onChange={e => setNewSlot({...newSlot, startTime: e.target.value})} 
                  InputLabelProps={{ shrink: true }} 
                />
              </Grid>
              <Grid item xs={6}>
                <TextField 
                  label="สิ้นสุด" 
                  type="time" 
                  fullWidth 
                  value={newSlot.endTime} 
                  onChange={e => setNewSlot({...newSlot, endTime: e.target.value})} 
                  InputLabelProps={{ shrink: true }} 
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSlotOpen(false)} variant="outlined" sx={{ borderRadius: 3, fontWeight: 700 }}>ยกเลิก</Button>
          <Button onClick={handleAddSlot} variant="contained" sx={{ borderRadius: 3, fontWeight: 800 }}>บันทึกค่าเริ่มต้น</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SystemSettings;
