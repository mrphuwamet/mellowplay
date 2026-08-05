import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import {
  Typography, Box, CircularProgress, Grid, Button, Chip,
  TextField, MenuItem, Select, FormControl, InputLabel,
  IconButton, Paper, Stack, Alert, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as BackIcon,
  Save as SaveIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  Title as HeadingIcon,
  ShortText as TextFieldIcon,
  Notes as TextareaIcon,
  Numbers as NumberIcon,
  Event as DateIcon,
  ArrowDropDownCircle as SelectIcon,
  RadioButtonChecked as RadioIcon,
  CheckBox as CheckboxIcon,
  FamilyRestroom as FamilyPickerIcon,
} from '@mui/icons-material';

const API_BASE = `${API_URL}/api/v1/admin`;

type FieldType = 'heading' | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'family_member_picker';

interface FieldDraft {
  fieldKey: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];       // select/radio/checkbox
  role?: 'adult' | 'child'; // family_member_picker
  duplicateCheckScope?: 'none' | 'course' | 'round';
}

const FIELD_TYPE_META: Record<FieldType, { label: string; icon: React.ReactNode }> = {
  heading: { label: 'หัวข้อ/คำอธิบาย', icon: <HeadingIcon fontSize="small" /> },
  text: { label: 'ข้อความสั้น', icon: <TextFieldIcon fontSize="small" /> },
  textarea: { label: 'ข้อความยาว', icon: <TextareaIcon fontSize="small" /> },
  number: { label: 'ตัวเลข', icon: <NumberIcon fontSize="small" /> },
  date: { label: 'วันที่', icon: <DateIcon fontSize="small" /> },
  select: { label: 'ตัวเลือก (Dropdown)', icon: <SelectIcon fontSize="small" /> },
  radio: { label: 'ตัวเลือก (Radio)', icon: <RadioIcon fontSize="small" /> },
  checkbox: { label: 'ช่องติ๊ก (หลายตัวเลือก)', icon: <CheckboxIcon fontSize="small" /> },
  family_member_picker: { label: 'เลือกสมาชิกในครอบครัว', icon: <FamilyPickerIcon fontSize="small" /> },
};

const newFieldKey = () => (crypto as any).randomUUID ? crypto.randomUUID() : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const emptyField = (type: FieldType): FieldDraft => ({
  fieldKey: newFieldKey(),
  type,
  label: FIELD_TYPE_META[type].label,
  required: false,
  options: (type === 'select' || type === 'radio' || type === 'checkbox') ? ['ตัวเลือก 1'] : undefined,
  role: type === 'family_member_picker' ? 'child' : undefined,
});

const SectionLabel = ({ title }: { title: string }) => (
  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>{title}</Typography>
);

const RegistrationFormManagement = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pages, setPages] = useState<FieldDraft[][]>([[]]);
  const [activePage, setActivePage] = useState(0);

  const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string } | null>(null);

  const fetchForms = () => {
    setLoading(true);
    axios.get(`${API_BASE}/registration-forms`)
      .then(res => { if (res.data.success) setForms(res.data.forms); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchForms(); }, []);

  const resetFormState = () => {
    setName(''); setDescription(''); setIsActive(true);
    setPages([[]]); setActivePage(0); setSaveError(null);
  };

  const startCreate = () => {
    resetFormState();
    setEditId(null);
    setIsEditing(true);
  };

  const startEdit = async (id: number) => {
    resetFormState();
    setEditId(id);
    setIsEditing(true);
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/registration-forms/${id}`);
      if (res.data.success) {
        const form = res.data.form;
        setName(form.name || '');
        setDescription(form.description || '');
        setIsActive(!!form.is_active);

        const grouped: FieldDraft[][] = [];
        (form.fields || []).forEach((f: any) => {
          const pIdx = f.page_index ?? 0;
          if (!grouped[pIdx]) grouped[pIdx] = [];
          grouped[pIdx][f.field_index] = {
            fieldKey: f.field_key,
            type: f.type,
            label: f.label,
            required: !!f.required,
            options: f.options_json ? JSON.parse(f.options_json) : undefined,
            role: f.config_json ? JSON.parse(f.config_json).role : undefined,
            duplicateCheckScope: f.duplicate_check_scope || 'none',
          };
        });
        const compacted = grouped.map(page => page.filter(Boolean));
        setPages(compacted.length > 0 ? compacted : [[]]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setSaveError('กรุณากรอกชื่อฟอร์ม'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const fields = pages.flatMap((page, pageIndex) => page.map((f, fieldIndex) => ({
        fieldKey: f.fieldKey,
        pageIndex,
        fieldIndex,
        type: f.type,
        label: f.label,
        required: f.required,
        optionsJson: f.options ? JSON.stringify(f.options) : undefined,
        configJson: f.role ? JSON.stringify({ role: f.role }) : undefined,
        duplicateCheckScope: f.duplicateCheckScope,
      })));
      const payload = { name, description, isActive, fields };
      if (editId) {
        await axios.put(`${API_BASE}/registration-forms/${editId}`, payload);
      } else {
        await axios.post(`${API_BASE}/registration-forms`, payload);
      }
      setIsEditing(false);
      fetchForms();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    await axios.delete(`${API_BASE}/registration-forms/${itemToDelete.id}`);
    setItemToDelete(null);
    fetchForms();
  };

  // ── Page/field editing helpers ──────────────────────────────────────────
  const addPage = () => { setPages([...pages, []]); setActivePage(pages.length); };
  const removePage = (pageIdx: number) => {
    const next = pages.filter((_, i) => i !== pageIdx);
    setPages(next.length > 0 ? next : [[]]);
    setActivePage(Math.max(0, Math.min(activePage, next.length - 1)));
  };
  const addField = (type: FieldType) => {
    const next = pages.map((page, i) => i === activePage ? [...page, emptyField(type)] : page);
    setPages(next);
  };
  const updateField = (fieldIdx: number, patch: Partial<FieldDraft>) => {
    const next = pages.map((page, i) => i === activePage
      ? page.map((f, j) => j === fieldIdx ? { ...f, ...patch } : f)
      : page);
    setPages(next);
  };
  const removeField = (fieldIdx: number) => {
    const next = pages.map((page, i) => i === activePage ? page.filter((_, j) => j !== fieldIdx) : page);
    setPages(next);
  };
  const moveField = (fieldIdx: number, dir: -1 | 1) => {
    const page = pages[activePage];
    const targetIdx = fieldIdx + dir;
    if (targetIdx < 0 || targetIdx >= page.length) return;
    const reordered = [...page];
    [reordered[fieldIdx], reordered[targetIdx]] = [reordered[targetIdx], reordered[fieldIdx]];
    const next = pages.map((p, i) => i === activePage ? reordered : p);
    setPages(next);
  };

  if (loading && !isEditing) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  // ─── Edit/Create Form ────────────────────────────────────────────────────
  if (isEditing) {
    const currentPageFields = pages[activePage] || [];
    return (
      <Box sx={{ pb: 12 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {editId ? 'แก้ไขแบบฟอร์มลงทะเบียน' : 'สร้างแบบฟอร์มลงทะเบียนใหม่'}
          </Typography>
        </Box>

        {saveError && <Alert severity="error" onClose={() => setSaveError(null)} sx={{ mb: 3 }}>{saveError}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel title="ข้อมูลทั่วไป" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="ชื่อฟอร์ม" value={name} onChange={e => setName(e.target.value)} required />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="คำอธิบาย" value={description} onChange={e => setDescription(e.target.value)} />
                </Grid>
              </Grid>
              <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 2 }}>
                <FormControlLabel
                  control={<Switch checked={isActive} onChange={e => setIsActive(e.target.checked)} />}
                  label="เปิดใช้งาน"
                />
              </Stack>
            </Paper>

            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel title="หน้าและฟิลด์" />

              <Tabs
                value={activePage}
                onChange={(_, v) => setActivePage(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, borderBottom: '1px solid #eee' }}
              >
                {pages.map((_, i) => <Tab key={i} label={`หน้า ${i + 1}`} sx={{ fontWeight: 700, textTransform: 'none' }} />)}
              </Tabs>

              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Button size="small" startIcon={<AddIcon />} onClick={addPage}>เพิ่มหน้า</Button>
                {pages.length > 1 && (
                  <Button size="small" color="error" onClick={() => removePage(activePage)}>ลบหน้านี้</Button>
                )}
              </Stack>

              <Stack spacing={2}>
                {currentPageFields.length === 0 && (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
                    ยังไม่มีฟิลด์ในหน้านี้ — เลือกเพิ่มฟิลด์ด้านล่าง
                  </Typography>
                )}
                {currentPageFields.map((field, idx) => (
                  <Paper key={field.fieldKey} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ mt: 1.5, color: 'text.secondary' }}>{FIELD_TYPE_META[field.type].icon}</Box>
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                          <Chip label={FIELD_TYPE_META[field.type].label} size="small" sx={{ fontWeight: 700 }} />
                          {field.type !== 'heading' && (
                            <FormControlLabel
                              control={<Switch size="small" checked={field.required} onChange={e => updateField(idx, { required: e.target.checked })} />}
                              label={<Typography variant="caption">จำเป็นต้องกรอก</Typography>}
                            />
                          )}
                        </Stack>
                        <TextField
                          fullWidth size="small" label="ข้อความ/คำถาม"
                          value={field.label}
                          onChange={e => updateField(idx, { label: e.target.value })}
                          sx={{ mb: field.options || field.role ? 1.5 : 0 }}
                        />
                        {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                          <TextField
                            fullWidth size="small" label="ตัวเลือก (คั่นด้วย ,)"
                            value={(field.options || []).join(', ')}
                            onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          />
                        )}
                        {field.type === 'family_member_picker' && (
                          <FormControl size="small" sx={{ minWidth: 200, mb: 1.5 }}>
                            <InputLabel>ให้เลือกสมาชิกบทบาท</InputLabel>
                            <Select
                              value={field.role || 'child'}
                              label="ให้เลือกสมาชิกบทบาท"
                              onChange={e => updateField(idx, { role: e.target.value as 'adult' | 'child' })}
                            >
                              <MenuItem value="child">เด็ก (เลือกจากสมาชิกในครอบครัวที่มีบทบาทเป็น "ลูก")</MenuItem>
                              <MenuItem value="adult">ผู้ใหญ่ (เลือกได้จากสมาชิกในครอบครัวทุกคนที่ไม่ใช่ "ลูก")</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                        {field.type !== 'heading' && (
                          <FormControl size="small" sx={{ minWidth: 280, display: 'block' }}>
                            <InputLabel>ป้องกันการลงทะเบียนซ้ำ</InputLabel>
                            <Select
                              value={field.duplicateCheckScope || 'none'}
                              label="ป้องกันการลงทะเบียนซ้ำ"
                              onChange={e => updateField(idx, { duplicateCheckScope: e.target.value as 'none' | 'course' | 'round' })}
                            >
                              <MenuItem value="none">ไม่ป้องกัน</MenuItem>
                              <MenuItem value="course">ห้ามซ้ำ — ทั้งคลาส/กิจกรรมนี้ (ทุกรอบ)</MenuItem>
                              <MenuItem value="round">ห้ามซ้ำ — เฉพาะรอบ/วันเวลาเดียวกัน</MenuItem>
                            </Select>
                            {field.duplicateCheckScope && field.duplicateCheckScope !== 'none' && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                ตรวจสอบการซ้ำโดยเทียบจากค่าของฟิลด์นี้เป็นหลัก (เช่น ชื่อ-นามสกุลผู้เข้าร่วม)
                                {field.duplicateCheckScope === 'course'
                                  ? ' — จะบล็อกถ้าเคยลงทะเบียนคลาส/กิจกรรมนี้มาแล้ว ไม่ว่าจะรอบไหน'
                                  : ' — จะบล็อกเฉพาะตอนลงทะเบียนรอบ/วันเวลาเดียวกันซ้ำเท่านั้น ต่างรอบลงทะเบียนได้ปกติ'}
                              </Typography>
                            )}
                          </FormControl>
                        )}
                      </Box>
                      <Stack spacing={0.5}>
                        <IconButton size="small" disabled={idx === 0} onClick={() => moveField(idx, -1)}><UpIcon fontSize="small" /></IconButton>
                        <IconButton size="small" disabled={idx === currentPageFields.length - 1} onClick={() => moveField(idx, 1)}><DownIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => removeField(idx)}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mt: 3, mb: 1 }}>
                เพิ่มฟิลด์ในหน้านี้
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {(Object.keys(FIELD_TYPE_META) as FieldType[]).map(type => (
                  <Button
                    key={type}
                    size="small"
                    variant="outlined"
                    startIcon={FIELD_TYPE_META[type].icon}
                    onClick={() => addField(type)}
                    sx={{ textTransform: 'none', fontWeight: 700 }}
                  >
                    {FIELD_TYPE_META[type].label}
                  </Button>
                ))}
              </Stack>
            </Paper>

            <Button
              variant="contained" size="large" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              disabled={saving} onClick={handleSave}
            >
              บันทึกฟอร์ม
            </Button>
          </Grid>
        </Grid>
      </Box>
    );
  }

  // ─── List View ───────────────────────────────────────────────────────────
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>จัดการแบบฟอร์มลงทะเบียน</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={startCreate}>สร้างฟอร์มใหม่</Button>
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>ชื่อฟอร์ม</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>คำอธิบาย</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จำนวนคลาสที่ใช้</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {forms.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">
                <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีแบบฟอร์มลงทะเบียน</Typography>
              </TableCell></TableRow>
            )}
            {forms.map(form => (
              <TableRow key={form.id} hover>
                <TableCell sx={{ fontWeight: 700 }}>{form.name}</TableCell>
                <TableCell>{form.description || '-'}</TableCell>
                <TableCell>
                  <Chip label={form.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'} color={form.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell align="right">{form.course_count}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => startEdit(form.id)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => setItemToDelete({ id: form.id, name: form.name })}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบแบบฟอร์ม <strong>"{itemToDelete?.name}"</strong> ใช่หรือไม่? คลาสที่เคยใช้ฟอร์มนี้จะไม่มีฟอร์มลงทะเบียนอีกต่อไป</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RegistrationFormManagement;
