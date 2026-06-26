import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputLabel, MenuItem, Paper, Select, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon, Add as AddIcon, Edit as EditIcon,
  Delete as DeleteIcon, Schedule as SlotIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

const DAY_NAMES = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const COLORS = ['#7c3aed','#0284c7','#059669','#d97706','#dc2626','#db2777','#0d9488'];

interface Calendar { id: number; name: string; description: string; color: string; type: string; is_active: number; }
interface SlotRule { id: number; calendar_id: number; day_of_week: number | null; specific_date: string | null; start_time: string; end_time: string; max_capacity: number; valid_from: string; valid_until: string | null; is_active: number; }

const CalendarManagement: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [rules, setRules] = useState<SlotRule[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState<Calendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  // Calendar dialog
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [calEditId, setCalEditId] = useState<number | null>(null);
  const [calForm, setCalForm] = useState({ name: '', description: '', color: '#7c3aed', type: 'class', isActive: true });

  // Slot rule dialog
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleEditId, setRuleEditId] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState({ dayOfWeek: '' as string | number, specificDate: '', startTime: '', endTime: '', maxCapacity: 4, validFrom: '', validUntil: '' });
  const [ruleMode, setRuleMode] = useState<'recurring' | 'specific'>('recurring');

  const show = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const fetchCalendars = async () => {
    const res = await axios.get(`${API_BASE}/calendars`);
    setCalendars(res.data.calendars ?? []);
  };

  const fetchRules = async (calendarId: number) => {
    const res = await axios.get(`${API_BASE}/calendar-slot-rules?calendarId=${calendarId}`);
    setRules(res.data.rules ?? []);
  };

  useEffect(() => {
    setLoading(true);
    fetchCalendars().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCalendar) fetchRules(selectedCalendar.id);
  }, [selectedCalendar]);

  // Calendar CRUD
  const openCreateCal = () => { setCalEditId(null); setCalForm({ name: '', description: '', color: '#7c3aed', type: 'class', isActive: true }); setCalDialogOpen(true); };
  const openEditCal = (c: Calendar) => { setCalEditId(c.id); setCalForm({ name: c.name, description: c.description ?? '', color: c.color, type: c.type, isActive: !!c.is_active }); setCalDialogOpen(true); };
  const saveCal = async () => {
    if (!calForm.name.trim()) return;
    if (calEditId !== null) await axios.put(`${API_BASE}/calendars/${calEditId}`, calForm);
    else await axios.post(`${API_BASE}/calendars`, calForm);
    setCalDialogOpen(false);
    await fetchCalendars();
    show(calEditId !== null ? 'แก้ไขปฏิทินสำเร็จ' : 'เพิ่มปฏิทินสำเร็จ');
  };
  const deleteCal = async (id: number) => {
    if (!confirm('ลบปฏิทินนี้?')) return;
    await axios.delete(`${API_BASE}/calendars/${id}`);
    if (selectedCalendar?.id === id) setSelectedCalendar(null);
    await fetchCalendars();
    show('ลบปฏิทินสำเร็จ');
  };

  // Slot rule CRUD
  const openCreateRule = () => {
    setRuleEditId(null);
    setRuleMode('recurring');
    setRuleForm({ dayOfWeek: 1, specificDate: '', startTime: '09:00', endTime: '10:00', maxCapacity: 4, validFrom: new Date().toISOString().slice(0, 10), validUntil: '' });
    setRuleDialogOpen(true);
  };
  const openEditRule = (r: SlotRule) => {
    setRuleEditId(r.id);
    setRuleMode(r.day_of_week !== null ? 'recurring' : 'specific');
    setRuleForm({ dayOfWeek: r.day_of_week ?? 1, specificDate: r.specific_date ?? '', startTime: r.start_time, endTime: r.end_time, maxCapacity: r.max_capacity, validFrom: r.valid_from, validUntil: r.valid_until ?? '' });
    setRuleDialogOpen(true);
  };
  const saveRule = async () => {
    if (!selectedCalendar || !ruleForm.startTime || !ruleForm.endTime || !ruleForm.validFrom) return;
    const payload = {
      calendarId: selectedCalendar.id,
      dayOfWeek: ruleMode === 'recurring' ? ruleForm.dayOfWeek : null,
      specificDate: ruleMode === 'specific' ? ruleForm.specificDate : null,
      startTime: ruleForm.startTime,
      endTime: ruleForm.endTime,
      maxCapacity: ruleForm.maxCapacity,
      validFrom: ruleForm.validFrom,
      validUntil: ruleForm.validUntil || null,
      isActive: true,
    };
    if (ruleEditId !== null) await axios.put(`${API_BASE}/calendar-slot-rules/${ruleEditId}`, payload);
    else await axios.post(`${API_BASE}/calendar-slot-rules`, payload);
    setRuleDialogOpen(false);
    await fetchRules(selectedCalendar.id);
    show(ruleEditId !== null ? 'แก้ไข slot สำเร็จ' : 'เพิ่ม slot สำเร็จ');
  };
  const deleteRule = async (id: number) => {
    if (!confirm('ลบ slot rule นี้?')) return;
    await axios.delete(`${API_BASE}/calendar-slot-rules/${id}`);
    if (selectedCalendar) await fetchRules(selectedCalendar.id);
    show('ลบ slot สำเร็จ');
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CalendarIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จัดการปฏิทิน</Typography>
            <Typography variant="body2" color="text.secondary">สร้างปฏิทินและ Slot เวลาสำหรับคลาสเรียนและบริการ</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateCal} sx={{ borderRadius: 3, fontWeight: 700 }}>
          สร้างปฏิทินใหม่
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      <Grid container spacing={3}>
        {/* Left: Calendar list */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography fontWeight={700}>ปฏิทินทั้งหมด</Typography>
            </Box>
            {calendars.map((cal) => (
              <Box
                key={cal.id}
                onClick={() => { setSelectedCalendar(cal); setTab(1); }}
                sx={{
                  p: 2, cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider',
                  bgcolor: selectedCalendar?.id === cal.id ? 'primary.50' : 'transparent',
                  '&:hover': { bgcolor: 'grey.50' },
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: cal.color, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{cal.name}</Typography>
                    <Chip label={cal.type === 'class' ? 'คลาสเรียน' : cal.type === 'service' ? 'บริการ' : 'อื่นๆ'} size="small" sx={{ fontSize: '10px', height: 18, mt: 0.3 }} />
                  </Box>
                </Box>
                <Box>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditCal(cal); }}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); deleteCal(cal.id); }}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
              </Box>
            ))}
            {calendars.length === 0 && <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>ยังไม่มีปฏิทิน</Box>}
          </Paper>
        </Grid>

        {/* Right: Slot rules */}
        <Grid item xs={12} md={8}>
          {selectedCalendar ? (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: selectedCalendar.color }} />
                  <Typography fontWeight={700}>{selectedCalendar.name} — Slot Rules</Typography>
                </Box>
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreateRule} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  เพิ่ม Slot
                </Button>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 700 }}>วัน/วันที่</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>เวลา</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">รับได้สูงสุด</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ใช้งานตั้งแต่</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ถึง</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>
                          {r.day_of_week !== null ? (
                            <Chip label={DAY_NAMES[r.day_of_week]} size="small" color="primary" sx={{ fontWeight: 700 }} />
                          ) : (
                            <Typography variant="body2">{r.specific_date}</Typography>
                          )}
                        </TableCell>
                        <TableCell>{r.start_time} – {r.end_time}</TableCell>
                        <TableCell align="center">{r.max_capacity} คน</TableCell>
                        <TableCell>{r.valid_from}</TableCell>
                        <TableCell>{r.valid_until ?? '—'}</TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => openEditRule(r)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => deleteRule(r.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && (
                      <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มี Slot — กด "เพิ่ม Slot" เพื่อเริ่มต้น</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ) : (
            <Paper sx={{ borderRadius: 3, p: 6, textAlign: 'center' }}>
              <SlotIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">เลือกปฏิทินทางซ้ายเพื่อดู Slot Rules</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Calendar Dialog */}
      <Dialog open={calDialogOpen} onClose={() => setCalDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{calEditId ? 'แก้ไขปฏิทิน' : 'สร้างปฏิทินใหม่'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="ชื่อปฏิทิน" fullWidth value={calForm.name} onChange={(e) => setCalForm(f => ({ ...f, name: e.target.value }))} />
          <TextField label="คำอธิบาย" fullWidth multiline rows={2} value={calForm.description} onChange={(e) => setCalForm(f => ({ ...f, description: e.target.value }))} />
          <FormControl fullWidth>
            <InputLabel>ประเภท</InputLabel>
            <Select value={calForm.type} label="ประเภท" onChange={(e) => setCalForm(f => ({ ...f, type: e.target.value }))}>
              <MenuItem value="class">คลาสเรียน</MenuItem>
              <MenuItem value="service">บริการ</MenuItem>
              <MenuItem value="other">อื่นๆ</MenuItem>
            </Select>
          </FormControl>
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>สี</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <Box key={c} onClick={() => setCalForm(f => ({ ...f, color: c }))}
                  sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer', border: calForm.color === c ? '3px solid #000' : '2px solid transparent' }} />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCalDialogOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveCal} disabled={!calForm.name.trim()} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      {/* Slot Rule Dialog */}
      <Dialog open={ruleDialogOpen} onClose={() => setRuleDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{ruleEditId ? 'แก้ไข Slot' : 'เพิ่ม Slot ใหม่'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Tabs value={ruleMode} onChange={(_, v) => setRuleMode(v)} sx={{ mb: 1 }}>
            <Tab label="วันประจำสัปดาห์" value="recurring" />
            <Tab label="วันที่ระบุ" value="specific" />
          </Tabs>
          {ruleMode === 'recurring' ? (
            <FormControl fullWidth>
              <InputLabel>วัน</InputLabel>
              <Select value={ruleForm.dayOfWeek} label="วัน" onChange={(e) => setRuleForm(f => ({ ...f, dayOfWeek: e.target.value as number }))}>
                {DAY_NAMES.map((d, i) => <MenuItem key={i} value={i}>{d}</MenuItem>)}
              </Select>
            </FormControl>
          ) : (
            <TextField label="วันที่" type="date" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.specificDate} onChange={(e) => setRuleForm(f => ({ ...f, specificDate: e.target.value }))} />
          )}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="เวลาเริ่ม" type="time" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.startTime} onChange={(e) => setRuleForm(f => ({ ...f, startTime: e.target.value }))} />
            <TextField label="เวลาสิ้นสุด" type="time" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.endTime} onChange={(e) => setRuleForm(f => ({ ...f, endTime: e.target.value }))} />
          </Box>
          <TextField label="รับได้สูงสุด (คน)" type="number" fullWidth inputProps={{ min: 1 }} value={ruleForm.maxCapacity} onChange={(e) => setRuleForm(f => ({ ...f, maxCapacity: parseInt(e.target.value) || 1 }))} />
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="ใช้งานตั้งแต่" type="date" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.validFrom} onChange={(e) => setRuleForm(f => ({ ...f, validFrom: e.target.value }))} />
            <TextField label="ถึงวันที่ (ว่าง = ไม่จำกัด)" type="date" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.validUntil} onChange={(e) => setRuleForm(f => ({ ...f, validUntil: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRuleDialogOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveRule} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CalendarManagement;
