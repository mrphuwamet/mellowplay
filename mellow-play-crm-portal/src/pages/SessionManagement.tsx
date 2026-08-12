import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import {
  Typography, Box, CircularProgress, Button, Chip, IconButton, Paper, Stack, Alert,
  TextField, Switch, FormControlLabel, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, ArrowBack as BackIcon,
  Save as SaveIcon, Link as LinkIcon, ArrowUpward as UpIcon, ArrowDownward as DownIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import SessionComparison, { SessionBundle, FormFields } from '../components/SessionComparison';

const API_BASE = `${API_URL}/api/v1/admin`;
const CONSUMER_APP_URL = (import.meta.env.VITE_CONSUMER_APP_URL as string) || 'https://mellowplay.co';

/**
 * Sessions — chain several forms behind one link.
 *
 * Rendered inside SurveyManagement's tabs rather than as its own route: a
 * session is a bundle of those same forms, and putting them on separate menu
 * entries made staff hop between screens to build one thing. Which tab is
 * showing is passed in as `view`; `onEditingChange` lets the host hide its
 * tabs while the session editor is open.
 */
const SessionManagement = ({
  view = 'list', onEditingChange,
}: {
  view?: 'list' | 'compare';
  onEditingChange?: (editing: boolean) => void;
}) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [requireUniqueName, setRequireUniqueName] = useState(true);
  const [pickedForms, setPickedForms] = useState<number[]>([]);

  const [compareA, setCompareA] = useState<number | ''>('');
  const [compareB, setCompareB] = useState<number | ''>('');
  const [comparing, setComparing] = useState(false);
  const [compareData, setCompareData] = useState<{ a: SessionBundle; b: SessionBundle; fields: FormFields } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/survey-sessions`),
      axios.get(`${API_BASE}/survey-forms`),
    ]).then(([sRes, fRes]) => {
      if (sRes.data.success) setSessions(sRes.data.sessions);
      if (fRes.data.success) setForms(fRes.data.forms);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    setName(''); setDescription(''); setSlug('');
    setIsActive(true); setRequireUniqueName(true); setPickedForms([]);
    setSaveError(null);
  };

  const openEditor = (editing: boolean) => { setIsEditing(editing); onEditingChange?.(editing); };

  const openCreate = () => { resetForm(); setEditId(null); openEditor(true); };

  const openEdit = async (id: number) => {
    resetForm();
    setEditId(id);
    openEditor(true);
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/survey-sessions/${id}`);
      if (res.data.success) {
        const s = res.data.session;
        setName(s.name || '');
        setDescription(s.description || '');
        setSlug(s.slug || '');
        setIsActive(!!s.is_active);
        setRequireUniqueName(!!s.require_unique_name);
        setPickedForms((s.forms || []).map((f: any) => f.form_id));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setSaveError('กรุณากรอกชื่อชุดแบบฟอร์ม'); return; }
    if (pickedForms.length === 0) { setSaveError('เลือกแบบฟอร์มอย่างน้อย 1 ชุด'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name, description, slug: slug.trim() || undefined, isActive, requireUniqueName,
        forms: pickedForms.map((formId, orderIndex) => ({ formId, orderIndex })),
      };
      if (editId) await axios.put(`${API_BASE}/survey-sessions/${editId}`, payload);
      else await axios.post(`${API_BASE}/survey-sessions`, payload);
      openEditor(false);
      fetchAll();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // A session that already has answers can't be deleted (the responses point
  // at it) — the server says so and the dialog shows why instead of failing
  // with nothing on screen.
  const handleDelete = async () => {
    if (!itemToDelete) return;
    setDeleteError(null);
    try {
      await axios.delete(`${API_BASE}/survey-sessions/${itemToDelete.id}`);
      setItemToDelete(null);
      fetchAll();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'ลบไม่สำเร็จ');
    }
  };

  const copyLink = (s: any) => {
    navigator.clipboard.writeText(`${CONSUMER_APP_URL}/session/${s.slug || s.id}`);
    setLinkCopied(true);
  };

  const moveForm = (index: number, dir: -1 | 1) => {
    const next = [...pickedForms];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPickedForms(next);
  };

  // Both sessions and every shared form's fields, since the per-question view
  // needs the option point values that only the admin form endpoint carries.
  const runCompare = async () => {
    if (compareA === '' || compareB === '' || compareA === compareB) return;
    setComparing(true);
    setCompareError(null);
    setCompareData(null);
    try {
      const [aRes, bRes] = await Promise.all([
        axios.get(`${API_BASE}/survey-sessions/${compareA}/submissions`),
        axios.get(`${API_BASE}/survey-sessions/${compareB}/submissions`),
      ]);
      if (!aRes.data.success || !bRes.data.success) throw new Error('ดึงข้อมูลไม่สำเร็จ');
      const a: SessionBundle = { session: aRes.data.session, submissions: aRes.data.submissions };
      const b: SessionBundle = { session: bRes.data.session, submissions: bRes.data.submissions };

      const bIds = new Set(b.session.forms.map(f => f.form_id));
      const shared = a.session.forms.filter(f => bIds.has(f.form_id)).map(f => f.form_id);
      const fieldsByForm: FormFields = {};
      await Promise.all(shared.map(async formId => {
        const res = await axios.get(`${API_BASE}/survey-forms/${formId}`);
        if (res.data.success) fieldsByForm[formId] = res.data.form.fields || [];
      }));

      setCompareData({ a, b, fields: fieldsByForm });
    } catch (err: any) {
      setCompareError(err.response?.data?.message || err.message || 'เปรียบเทียบไม่สำเร็จ');
    } finally {
      setComparing(false);
    }
  };

  if (loading && !isEditing) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;
  }

  if (isEditing) {
    const available = forms.filter(f => !pickedForms.includes(f.id));
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
          <IconButton onClick={() => openEditor(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>
            {editId ? 'แก้ไขชุดแบบฟอร์ม' : 'สร้างชุดแบบฟอร์ม'}
          </Typography>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>บันทึก</Button>
        </Stack>

        {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}

        <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Stack spacing={2}>
            <TextField fullWidth label="ชื่อชุดแบบฟอร์ม" value={name} onChange={e => setName(e.target.value)} />
            <TextField fullWidth label="คำอธิบาย (ไม่บังคับ)" value={description} onChange={e => setDescription(e.target.value)} multiline minRows={2} />
            <TextField
              fullWidth label="ลิงก์ (ไม่บังคับ)" value={slug}
              onChange={e => setSlug(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
              helperText={`${CONSUMER_APP_URL}/session/${slug || '(ใช้ id อัตโนมัติถ้าเว้นว่าง)'}`}
            />
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={3}>
              <FormControlLabel control={<Switch checked={isActive} onChange={e => setIsActive(e.target.checked)} />} label="เปิดใช้งาน" />
              <FormControlLabel control={<Switch checked={requireUniqueName} onChange={e => setRequireUniqueName(e.target.checked)} />} label="ห้ามชื่อซ้ำในชุดนี้" />
            </Stack>
            {requireUniqueName && (
              <Alert severity="info">
                ถ้ามีคนกรอกชื่อที่ทำชุดนี้ไปแล้ว ระบบจะไม่ให้ทำต่อตั้งแต่หน้าแรก · เทียบชื่อแบบไม่สนตัวพิมพ์และช่องว่างเกิน
              </Alert>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>แบบฟอร์มในชุด</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            ผู้ตอบจะเห็นเป็นแบบฟอร์มเดียวต่อเนื่องกัน ไม่เห็นรอยต่อและไม่เห็นชื่อแบบฟอร์มย่อย · ถามชื่อครั้งเดียวตอนเริ่ม
          </Typography>

          {pickedForms.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>ยังไม่ได้เลือกแบบฟอร์ม</Typography>
          ) : (
            <Stack spacing={1} sx={{ mb: 2 }}>
              {pickedForms.map((formId, i) => {
                const f = forms.find(x => x.id === formId);
                return (
                  <Paper key={formId} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Chip label={i + 1} size="small" sx={{ fontWeight: 800 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{f?.name || `#${formId}`}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {f?.has_answer_key ? 'มีคะแนน' : 'ไม่มีคะแนน'}{f?.is_active ? '' : ' · ปิดใช้งานอยู่ (จะถูกข้าม)'}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => moveForm(i, -1)} disabled={i === 0}><UpIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => moveForm(i, 1)} disabled={i === pickedForms.length - 1}><DownIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setPickedForms(pickedForms.filter(id => id !== formId))}><CloseIcon fontSize="small" /></IconButton>
                  </Paper>
                );
              })}
            </Stack>
          )}

          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>เพิ่มแบบฟอร์ม</InputLabel>
            <Select
              value="" label="เพิ่มแบบฟอร์ม"
              onChange={e => { if (e.target.value) setPickedForms([...pickedForms, Number(e.target.value)]); }}
            >
              {available.length === 0 && <MenuItem value="" disabled>ไม่มีแบบฟอร์มให้เลือกเพิ่ม</MenuItem>}
              {available.map(f => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      {view === 'list' && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>สร้างชุดใหม่</Button>
        </Stack>
      )}

      {view === 'list' && (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>ชื่อชุด</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>แบบฟอร์ม</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>คนตอบ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ชื่อซ้ำ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีชุดแบบฟอร์ม</Typography>
                </TableCell></TableRow>
              )}
              {sessions.map(s => (
                <TableRow key={s.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{s.name}</TableCell>
                  <TableCell>{s.form_count} ชุด</TableCell>
                  <TableCell>{s.respondent_count}</TableCell>
                  <TableCell>
                    <Chip size="small" label={s.require_unique_name ? 'ห้ามซ้ำ' : 'ซ้ำได้'}
                      variant={s.require_unique_name ? 'filled' : 'outlined'} />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={s.is_active ? 'เปิด' : 'ปิด'} color={s.is_active ? 'success' : 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => copyLink(s)} title="คัดลอกลิงก์"><LinkIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => openEdit(s.id)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setItemToDelete({ id: s.id, name: s.name })}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {view === 'compare' && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Session A</InputLabel>
                <Select value={compareA} label="Session A" onChange={e => setCompareA(Number(e.target.value))}>
                  {sessions.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Session B</InputLabel>
                <Select value={compareB} label="Session B" onChange={e => setCompareB(Number(e.target.value))}>
                  {sessions.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Button
                variant="contained" onClick={runCompare}
                disabled={comparing || compareA === '' || compareB === '' || compareA === compareB}
              >
                {comparing ? 'กำลังคำนวณ...' : 'เปรียบเทียบ'}
              </Button>
              {compareA !== '' && compareA === compareB && (
                <Typography variant="caption" color="error" sx={{ fontWeight: 700 }}>เลือกคนละ Session</Typography>
              )}
            </Stack>
          </Paper>

          {compareError && <Alert severity="error">{compareError}</Alert>}
          {compareData && <SessionComparison a={compareData.a} b={compareData.b} fields={compareData.fields} />}
        </Stack>
      )}

      <Dialog open={!!itemToDelete} onClose={() => { setItemToDelete(null); setDeleteError(null); }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ลบชุดแบบฟอร์ม</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            ลบ "{itemToDelete?.name}" ใช่ไหม — ลบเฉพาะการจัดกลุ่ม แบบฟอร์มไม่หาย
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            ชุดที่มีคำตอบเก็บไว้แล้วจะลบไม่ได้ ต้องปิดใช้งานแทน เพื่อไม่ให้คำตอบหลุดจากกลุ่ม
          </Typography>
          {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setItemToDelete(null); setDeleteError(null); }}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={linkCopied} autoHideDuration={2500} onClose={() => setLinkCopied(false)} message="คัดลอกลิงก์แล้ว" />
    </Box>
  );
};

export default SessionManagement;
