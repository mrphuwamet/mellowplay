import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Stack, CircularProgress, Divider, List, ListItem, ListItemButton, ListItemText, ListItemAvatar,
  Avatar, Card, CardContent, Switch, FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Store as BranchIcon,
  AccessTime as TimeIcon,
  Settings as SettingsIcon,
  VpnKey as KeyIcon,
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


// sensitive: true fields use the "type a new value to change it" masked
// pattern; non-sensitive ones (just a display label, not a credential) are
// pre-filled with their real current value and edited directly.
const INTEGRATION_KEY_FIELDS: { key: string; label: string; sensitive: boolean }[] = [
  { key: 'beam_api_key', label: 'Beam API Key', sensitive: true },
  { key: 'beam_merchant_id', label: 'Beam Merchant ID', sensitive: true },
  { key: 'sms_api_key', label: 'SMS API Key (ThaiBulkSMS)', sensitive: true },
  { key: 'sms_api_secret', label: 'SMS API Secret (ThaiBulkSMS)', sensitive: true },
  { key: 'sms_sender_name', label: 'SMS Sender Name (ชื่อผู้ส่ง ที่ลงทะเบียนกับ ThaiBulkSMS)', sensitive: false },
];

const SystemSettings = () => {
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; onConfirm: () => void }>({ open: false, title: '', onConfirm: () => {} });

  const [branchOpen, setBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState<Partial<Branch>>({});
  const [isEditBranch, setIsEditBranch] = useState(false);
  const [systemSettings, setSystemSettings] = useState<{ [key: string]: string }>({});

  // Beam/SMS credentials — super_admin only. GET returns a masked preview
  // only; typing into a field stages a NEW value, an untouched field is
  // never sent back so the masked placeholder can't overwrite the real secret.
  const [integrationKeys, setIntegrationKeys] = useState<{ [key: string]: { masked: string; isSet: boolean } }>({});
  const [keyEdits, setKeyEdits] = useState<{ [key: string]: string }>({});
  const [savingKeys, setSavingKeys] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [branchRes, settingsRes] = await Promise.all([
        axios.get(`${API_BASE}/branches`),
        axios.get(`${API_BASE}/system/settings`),
      ]);

      if (branchRes.data.success) {
        setBranches(branchRes.data.branches);
        if (branchRes.data.branches.length > 0) {
          setSelectedBranchId(branchRes.data.branches[0].id);
        }
      }
      if (settingsRes.data.success) {
        const settingsMap: { [key: string]: string } = {};
        settingsRes.data.settings.forEach((s: any) => settingsMap[s.key] = s.value);
        setSystemSettings(settingsMap);
      }
      if (isSuperAdmin) {
        const keysRes = await axios.get(`${API_BASE}/integration-keys`);
        if (keysRes.data.success) {
          setIntegrationKeys(keysRes.data.keys);
          prefillNonSensitive(keysRes.data.keys);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Non-sensitive fields (e.g. SMS sender name) show their real current
  // value directly in the editable field, unlike the masked secret fields.
  const prefillNonSensitive = (keys: { [key: string]: { masked: string; isSet: boolean } }) => {
    const prefill: { [key: string]: string } = {};
    for (const { key, sensitive } of INTEGRATION_KEY_FIELDS) {
      if (!sensitive && keys[key]?.isSet) prefill[key] = keys[key].masked;
    }
    setKeyEdits(prev => ({ ...prev, ...prefill }));
  };

  const handleSaveIntegrationKeys = async () => {
    const payload: { [key: string]: string } = {};
    for (const { key } of INTEGRATION_KEY_FIELDS) {
      if (keyEdits[key]?.trim()) payload[key] = keyEdits[key].trim();
    }
    if (Object.keys(payload).length === 0) return;
    setSavingKeys(true);
    try {
      await axios.put(`${API_BASE}/integration-keys`, payload);
      setKeyEdits({});
      const keysRes = await axios.get(`${API_BASE}/integration-keys`);
      if (keysRes.data.success) {
        setIntegrationKeys(keysRes.data.keys);
        prefillNonSensitive(keysRes.data.keys);
      }
    } catch (e: any) {
      alert('บันทึกคีย์ไม่สำเร็จ: ' + (e.response?.data?.message || e.message));
    } finally {
      setSavingKeys(false);
    }
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

  const handleToggleSetting = async (key: string, value: string) => {
    try {
      await axios.put(`${API_BASE}/system/settings`, { key, value });
      setSystemSettings(prev => ({ ...prev, [key]: value }));
    } catch (e: any) {
      alert('Error updating setting: ' + e.message);
    }
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
          <Paper sx={{ p: 3, borderRadius: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SettingsIcon color="primary" /> ตั้งค่าระบบ
              </Typography>
            </Box>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch 
                    checked={systemSettings['otp_enabled'] === '1'} 
                    onChange={(e) => handleToggleSetting('otp_enabled', e.target.checked ? '1' : '0')}
                  />
                }
                label="เปิดใช้งานการส่ง SMS OTP จริง (ThaiBulkSMS)"
              />
              <FormControlLabel
                control={
                  <Switch 
                    checked={systemSettings['payment_enabled'] !== '0'} // default true if undefined
                    onChange={(e) => handleToggleSetting('payment_enabled', e.target.checked ? '1' : '0')}
                  />
                }
                label="เปิดใช้งานระบบจ่ายเงินจริง (Beam Payment)"
              />
            </Stack>
          </Paper>

          {isSuperAdmin && (
            <Paper sx={{ p: 3, borderRadius: 4, mb: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <KeyIcon color="primary" /> คีย์เชื่อมต่อระบบ (Beam / SMS)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                เห็นได้เฉพาะ Super Admin — พิมพ์ค่าใหม่เพื่อเปลี่ยน ถ้าไม่พิมพ์อะไรจะไม่มีผลกับค่าที่ตั้งไว้เดิม
              </Typography>
              <Stack spacing={2}>
                {INTEGRATION_KEY_FIELDS.map(({ key, label, sensitive }) => (
                  <TextField
                    key={key}
                    label={label}
                    fullWidth
                    size="small"
                    value={keyEdits[key] ?? ''}
                    onChange={(e) => setKeyEdits(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={sensitive ? (integrationKeys[key]?.isSet ? `ตั้งค่าไว้แล้ว (${integrationKeys[key].masked})` : 'ยังไม่ได้ตั้งค่า') : undefined}
                    helperText={
                      sensitive
                        ? (integrationKeys[key]?.isSet ? `ปัจจุบัน: ${integrationKeys[key].masked}` : 'ยังไม่ได้ตั้งค่า — ระบบจะ fallback ไปใช้ค่าจาก Cloudflare secret แทน')
                        : (integrationKeys[key]?.isSet ? undefined : 'ยังไม่ได้ตั้งค่า — ระบบจะใช้ค่าเริ่มต้น "Demo" ไปก่อน')
                    }
                  />
                ))}
                <Box>
                  <Button
                    variant="contained"
                    onClick={handleSaveIntegrationKeys}
                    disabled={savingKeys || Object.values(keyEdits).every(v => !v?.trim())}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    {savingKeys ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'บันทึกคีย์'}
                  </Button>
                </Box>
              </Stack>
            </Paper>
          )}

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
