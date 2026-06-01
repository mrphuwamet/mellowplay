import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, IconButton, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Tooltip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LibraryBooks as LibIcon,
} from '@mui/icons-material';
import axios from 'axios';
import {
  getSkillsLibrary,
  saveSkillsLibrary,
  generateSkillId,
  ICON_OPTIONS,
  renderSkillIcon,
  type SkillItem,
  type SkillType,
} from '../utils/skillsLibrary';

interface Props {
  currentUserRole: string;
}

const themeColor = '#7452d6';
const indicatorColor = '#ef4f55';

const SkillsLibraryManagement: React.FC<Props> = ({ currentUserRole }) => {
  const isSuperAdmin = currentUserRole === 'super_admin';
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<SkillItem | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillItem | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('Star');
  const [formType, setFormType] = useState<SkillType>('achievement');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/v1/admin/skills-library`);
        if (response.data.success) {
          setSkills(response.data.skills);
        }
      } catch (error) {
        console.error('Failed to fetch skills library', error);
      }
    };
    fetchSkills();
  }, []);

  const achievementSkills = skills.filter((s) => s.type === 'achievement');
  const indicatorSkills = skills.filter((s) => s.type === 'indicator');

  const openAdd = (type: SkillType) => {
    setEditItem(null);
    setFormName('');
    setFormIcon('Star');
    setFormType(type);
    setFormError('');
    setEditDialogOpen(true);
  };

  const openEdit = (item: SkillItem) => {
    setEditItem(item);
    setFormName(item.name);
    setFormIcon(item.icon);
    setFormType(item.type);
    setFormError('');
    setEditDialogOpen(true);
  };

  const handleSaveItem = async () => {
    if (!formName.trim()) {
      setFormError('กรุณาระบุชื่อ');
      return;
    }
    
    setFormError('');
    try {
      const payload = {
        name: formName.trim(),
        icon: formIcon,
        type: formType,
        color: formType === 'achievement' ? themeColor : indicatorColor
      };

      if (editItem) {
        await axios.put(`${API_URL}/api/v1/admin/skills-library/${editItem.id}`, payload);
      } else {
        await axios.post(`${API_URL}/api/v1/admin/skills-library`, payload);
      }

      // Refresh list
      const response = await axios.get(`${API_URL}/api/v1/admin/skills-library`);
      if (response.data.success) {
        setSkills(response.data.skills);
      }

      setEditDialogOpen(false);
      setSaveSuccess(true);
      window.dispatchEvent(new Event('skills-library-updated'));
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      setFormError(error.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const confirmDelete = (item: SkillItem) => {
    setDeleteTarget(item);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${API_URL}/api/v1/admin/skills-library/${deleteTarget.id}`);
      
      // Refresh list
      const response = await axios.get(`${API_URL}/api/v1/admin/skills-library`);
      if (response.data.success) {
        setSkills(response.data.skills);
      }

      setDeleteDialogOpen(false);
      window.dispatchEvent(new Event('skills-library-updated'));
    } catch (error) {
      console.error('Failed to delete skill', error);
    }
  };

  const SkillTable = ({ items, accentColor }: { items: SkillItem[]; accentColor: string }) => (
    items.length === 0 ? (
      <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
        <LibIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
        <Typography variant="body2">ยังไม่มีรายการ</Typography>
      </Box>
    ) : (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 52 }}>Icon</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ชื่อ</TableCell>
              {isSuperAdmin && <TableCell sx={{ fontWeight: 700, width: 96 }} align="right">จัดการ</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: 2,
                    bgcolor: item.type === 'achievement' ? 'rgba(116,82,214,0.1)' : 'rgba(239,79,85,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {renderSkillIcon(item.icon, { sx: { fontSize: 20, color: accentColor } })}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.name}</Typography>
                </TableCell>
                {isSuperAdmin && (
                  <TableCell align="right">
                    <Tooltip title="แก้ไข">
                      <IconButton size="small" onClick={() => openEdit(item)} sx={{ color: themeColor }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="ลบ">
                      <IconButton size="small" onClick={() => confirmDelete(item)} sx={{ color: indicatorColor }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <LibIcon sx={{ fontSize: 32, color: themeColor }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>จัดการ Skills & ตัวชี้วัด</Typography>
          <Typography variant="body2" color="text.secondary">คลังกลางสำหรับ Achievement Skills และตัวชี้วัด (Strength/Weakness)</Typography>
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 3 }}>บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว</Alert>
      )}

      {!isSuperAdmin && (
        <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>คุณมีสิทธิ์ดูข้อมูลเท่านั้น</Alert>
      )}

      {/* Two-column layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, alignItems: 'stretch' }}>
        {/* Achievement Skills */}
        <Paper sx={{ borderRadius: 4, border: '1px solid #ede8fc', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{
            px: 3, py: 2.5, bgcolor: 'rgba(116,82,214,0.05)',
            borderBottom: '1px solid #ede8fc',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: themeColor }}>Achievement Skills</Typography>
              <Typography variant="caption" color="text.secondary">{achievementSkills.length} รายการ</Typography>
            </Box>
            {isSuperAdmin && (
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openAdd('achievement')}
                sx={{ bgcolor: themeColor, '&:hover': { bgcolor: themeColor, filter: 'brightness(0.9)' }, borderRadius: 2.5, fontWeight: 700 }}>
                เพิ่ม
              </Button>
            )}
          </Box>
          <Box sx={{ p: 1.5, flex: 1 }}>
            <SkillTable items={achievementSkills} accentColor={themeColor} />
          </Box>
        </Paper>

        {/* ตัวชี้วัด */}
        <Paper sx={{ borderRadius: 4, border: '1px solid #fde8e9', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{
            px: 3, py: 2.5, bgcolor: 'rgba(239,79,85,0.05)',
            borderBottom: '1px solid #fde8e9',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: indicatorColor }}>ตัวชี้วัด (Strength/Weakness)</Typography>
              <Typography variant="caption" color="text.secondary">{indicatorSkills.length} รายการ</Typography>
            </Box>
            {isSuperAdmin && (
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openAdd('indicator')}
                sx={{ bgcolor: indicatorColor, '&:hover': { bgcolor: indicatorColor, filter: 'brightness(0.9)' }, borderRadius: 2.5, fontWeight: 700 }}>
                เพิ่ม
              </Button>
            )}
          </Box>
          <Box sx={{ p: 1.5, flex: 1 }}>
            <SkillTable items={indicatorSkills} accentColor={indicatorColor} />
          </Box>
        </Paper>
      </Box>

      {/* Add/Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          {editItem ? 'แก้ไข' : 'เพิ่ม'}{formType === 'achievement' ? 'ทักษะ (Achievement Skills)' : 'ตัวชี้วัด'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {formError && <Alert severity="error" sx={{ borderRadius: 2 }}>{formError}</Alert>}

            {/* Name field with Icon preview */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box sx={{
                width: 56, height: 56, borderRadius: 3, flexShrink: 0,
                bgcolor: formType === 'achievement' ? 'rgba(116,82,214,0.12)' : 'rgba(239,79,85,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {renderSkillIcon(formIcon, { sx: { fontSize: 28, color: formType === 'achievement' ? themeColor : indicatorColor } })}
              </Box>
              <TextField
                label="ชื่อ"
                fullWidth
                value={formName}
                onChange={(e) => { setFormName(e.target.value); setFormError(''); }}
                autoFocus
              />
            </Box>

            {/* Icon picker */}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary' }}>เลือก Icon</Typography>

              {/* Inline icon grid */}
              <Box sx={{
                display: 'flex', flexWrap: 'wrap', gap: 1,
                maxHeight: 220, overflowY: 'auto',
                p: 1.5, border: '1px solid #e5e7eb', borderRadius: 3
              }}>
                {ICON_OPTIONS.map((opt) => (
                  <Tooltip key={opt.key} title={opt.label} arrow>
                    <Box
                      onClick={() => setFormIcon(opt.key)}
                      sx={{
                        width: 40, height: 40, borderRadius: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', border: '2px solid',
                        borderColor: formIcon === opt.key ? (formType === 'achievement' ? themeColor : indicatorColor) : 'transparent',
                        bgcolor: formIcon === opt.key
                          ? (formType === 'achievement' ? 'rgba(116,82,214,0.12)' : 'rgba(239,79,85,0.12)')
                          : 'transparent',
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                      }}
                    >
                      {React.createElement(opt.Component, {
                        sx: { fontSize: 20, color: formIcon === opt.key ? (formType === 'achievement' ? themeColor : indicatorColor) : 'text.secondary' }
                      })}
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setEditDialogOpen(false)} variant="outlined" sx={{ borderRadius: 3, fontWeight: 700 }}>ยกเลิก</Button>
          <Button onClick={handleSaveItem} variant="contained"
            sx={{ bgcolor: formType === 'achievement' ? themeColor : indicatorColor, '&:hover': { filter: 'brightness(0.9)', bgcolor: formType === 'achievement' ? themeColor : indicatorColor }, borderRadius: 3, fontWeight: 700 }}>
            {editItem ? 'บันทึก' : 'เพิ่ม'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>คุณต้องการลบ <strong>"{deleteTarget?.name}"</strong> ออกจากคลัง?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>การลบจะไม่กระทบต่อคลาสที่บันทึกข้อมูลไปแล้ว</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={{ borderRadius: 3, fontWeight: 700 }}>ยกเลิก</Button>
          <Button onClick={handleDelete} variant="contained" color="error" sx={{ borderRadius: 3, fontWeight: 700 }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SkillsLibraryManagement;
