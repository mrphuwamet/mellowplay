import { API_URL } from '../config';
import TimeField24 from '../components/TimeField24';
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputLabel, MenuItem, Paper, Select, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, Tabs, TextField, Typography,
  Checkbox, FormControlLabel, Stack,
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
interface SlotRule { id: number; calendar_id: number; day_of_week: number | null; specific_date: string | null; start_time: string; end_time: string; max_capacity: number; invite_capacity: number; valid_from: string; valid_until: string | null; is_active: number; label: string | null; }

// Slot-rule columns that can be sorted from the header.
const RULE_COLUMNS: { key: string; label: string; align?: 'center' }[] = [
  { key: 'day', label: 'วัน/วันที่' },
  { key: 'time', label: 'เวลา' },
  { key: 'capacity', label: 'รับได้สูงสุด', align: 'center' },
  { key: 'from', label: 'ใช้งานตั้งแต่' },
  { key: 'until', label: 'ถึง' },
];

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
  const [ruleForm, setRuleForm] = useState<{
    dayOfWeek: number[]; specificDates: string[]; timeRanges: { start: string; end: string }[];
    maxCapacity: number; inviteCapacity: number; validFrom: string; validUntil: string; autoSplit: boolean; splitInterval: number; label: string;
  }>({
    dayOfWeek: [], specificDates: [''], timeRanges: [{ start: '', end: '' }],
    maxCapacity: 4, inviteCapacity: 0, validFrom: '', validUntil: '', autoSplit: false, splitInterval: 30, label: ''
  });
  const [ruleMode, setRuleMode] = useState<'recurring' | 'specific'>('recurring');
  
  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; onConfirm: () => void }>({ open: false, title: '', onConfirm: () => {} });

  // Right section tabs
  const [rightTab, setRightTab] = useState(0);

  // Holidays
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ date: '', description: '' });

  // Day labels — a note pinned to one date, shown beside it in the app.
  const [dayLabels, setDayLabels] = useState<any[]>([]);
  const [dayLabelForm, setDayLabelForm] = useState({ date: '', label: '' });

  // Rules arrive in insert order, which is why the same date appeared above
  // and below a later one. Sorted by date then start time by default —
  // reading a schedule out of order is the thing this table is for.
  const [ruleSort, setRuleSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'day', dir: 'asc' });

  const sortedRules = React.useMemo(() => {
    const value = (r: SlotRule): string | number => {
      switch (ruleSort.key) {
        // A recurring rule has no date; day_of_week orders it inside the week,
        // and the prefix keeps the two kinds from interleaving arbitrarily.
        case 'day': return r.specific_date ? `2:${r.specific_date} ${r.start_time}` : `1:${String(r.day_of_week ?? 0).padStart(2, '0')} ${r.start_time}`;
        case 'time': return `${r.start_time} ${r.end_time}`;
        case 'capacity': return (r.max_capacity ?? 0) + (r.invite_capacity ?? 0);
        case 'from': return r.valid_from ?? '';
        // Open-ended rules sort last ascending rather than first, since 'no
        // end date' is the furthest-away end date, not the nearest.
        case 'until': return r.valid_until ?? '9999-12-31';
        default: return '';
      }
    };
    const dir = ruleSort.dir === 'asc' ? 1 : -1;
    return [...rules].sort((a, b) => {
      const av = value(a), bv = value(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rules, ruleSort]);

  const show = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const fetchCalendars = async () => {
    const res = await axios.get(`${API_BASE}/calendars`);
    setCalendars(res.data.calendars ?? []);
  };

  const fetchRules = async (calendarId: number) => {
    const res = await axios.get(`${API_BASE}/calendar-slot-rules?calendarId=${calendarId}`);
    setRules(res.data.rules ?? []);
  };

  const fetchDayLabels = async (calendarId: number) => {
    const res = await axios.get(`${API_BASE}/calendar-day-labels?calendarId=${calendarId}`);
    setDayLabels(res.data.dayLabels ?? []);
  };

  // Saving an existing date edits it rather than failing — the server upserts,
  // so the form doubles as the edit form and there is no second dialog.
  const saveDayLabel = async () => {
    if (!selectedCalendar || !dayLabelForm.date || !dayLabelForm.label.trim()) return;
    await axios.post(`${API_BASE}/calendar-day-labels`, {
      calendarId: selectedCalendar.id,
      specificDate: dayLabelForm.date,
      label: dayLabelForm.label.trim(),
    });
    setDayLabelForm({ date: '', label: '' });
    await fetchDayLabels(selectedCalendar.id);
    show('บันทึกป้ายกำกับวันสำเร็จ');
  };

  const deleteDayLabel = (id: number) => {
    setConfirmDialog({
      open: true,
      title: 'ลบป้ายกำกับวันนี้ใช่หรือไม่?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        await axios.delete(`${API_BASE}/calendar-day-labels/${id}`);
        if (selectedCalendar) await fetchDayLabels(selectedCalendar.id);
        show('ลบป้ายกำกับสำเร็จ');
      },
    });
  };

  const fetchHolidays = async (calendarId: number) => {
    const res = await axios.get(`${API_BASE}/calendar-holidays?calendarId=${calendarId}`);
    setHolidays(res.data.holidays ?? []);
  };

  useEffect(() => {
    setLoading(true);
    fetchCalendars().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCalendar) {
      fetchRules(selectedCalendar.id);
      fetchHolidays(selectedCalendar.id);
      fetchDayLabels(selectedCalendar.id);
    }
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
  const deleteCal = (id: number) => {
    setConfirmDialog({
      open: true,
      title: 'คุณต้องการลบปฏิทินนี้ใช่หรือไม่?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        await axios.delete(`${API_BASE}/calendars/${id}`);
        if (selectedCalendar?.id === id) setSelectedCalendar(null);
        await fetchCalendars();
        show('ลบปฏิทินสำเร็จ');
      }
    });
  };

  // Slot rule CRUD
  const openCreateRule = () => {
    setRuleEditId(null);
    setRuleMode('recurring');
    setRuleForm({ dayOfWeek: [1], specificDates: [new Date().toISOString().slice(0, 10)], timeRanges: [{ start: '09:00', end: '10:00' }], maxCapacity: 4, inviteCapacity: 0, validFrom: new Date().toISOString().slice(0, 10), validUntil: '', autoSplit: false, splitInterval: 30, label: '' });
    setRuleDialogOpen(true);
  };
  const openEditRule = (r: SlotRule) => {
    setRuleEditId(r.id);
    setRuleMode(r.day_of_week !== null ? 'recurring' : 'specific');
    setRuleForm({ dayOfWeek: r.day_of_week !== null ? [r.day_of_week] : [], specificDates: [r.specific_date ?? ''], timeRanges: [{ start: r.start_time, end: r.end_time }], maxCapacity: r.max_capacity, inviteCapacity: r.invite_capacity || 0, validFrom: r.valid_from, validUntil: r.valid_until ?? '', autoSplit: false, splitInterval: 30, label: r.label ?? '' });
    setRuleDialogOpen(true);
  };
  const generateSplitSlots = (start: string, end: string, intervalMin: number) => {
    const parseTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };
    
    let current = parseTime(start);
    const endMin = parseTime(end);
    const slots = [];
    
    while (current + intervalMin <= endMin) {
      slots.push({
        start: formatTime(current),
        end: formatTime(current + intervalMin)
      });
      current += intervalMin;
    }
    return slots.length > 0 ? slots : [{ start, end }];
  };

  const saveRule = async () => {
    if (!selectedCalendar || ruleForm.timeRanges.some(r => !r.start || !r.end)) return;
    if (ruleMode === 'recurring' && !ruleForm.validFrom) return;
    if (ruleMode === 'specific' && !ruleForm.specificDates.some(d => d)) return;

    // Each time range creates its own set of slots — auto-split (if on)
    // applies within every range independently, not just the first one.
    const times = ruleForm.timeRanges.flatMap(range =>
      (ruleForm.autoSplit && ruleEditId === null)
        ? generateSplitSlots(range.start, range.end, ruleForm.splitInterval)
        : [{ start: range.start, end: range.end }]
    );

    const payloads: any[] = [];
    const daysToSave = ruleMode === 'recurring' ? (ruleForm.dayOfWeek.length > 0 ? ruleForm.dayOfWeek : [null]) : [null];
    const datesToSave = ruleMode === 'specific' ? (ruleForm.specificDates.filter(d => d) || [null]) : [null];
    
    for (const dow of daysToSave) {
      for (const d of datesToSave) {
        for (const t of times) {
          payloads.push({
            calendarId: selectedCalendar.id,
            dayOfWeek: ruleMode === 'recurring' ? dow : null,
            specificDate: ruleMode === 'specific' ? d : null,
            startTime: t.start,
            endTime: t.end,
            maxCapacity: ruleForm.maxCapacity,
            inviteCapacity: ruleForm.inviteCapacity,
            validFrom: ruleMode === 'recurring' ? ruleForm.validFrom : d,
            validUntil: ruleMode === 'recurring' ? (ruleForm.validUntil || null) : d,
            isActive: true,
            label: ruleForm.label.trim() || null,
          });
        }
      }
    }

    if (ruleEditId !== null) {
      await axios.put(`${API_BASE}/calendar-slot-rules/${ruleEditId}`, payloads[0]);
    } else {
      await Promise.all(payloads.map(p => axios.post(`${API_BASE}/calendar-slot-rules`, p)));
    }
    
    setRuleDialogOpen(false);
    await fetchRules(selectedCalendar.id);
    show(ruleEditId !== null ? 'แก้ไข slot สำเร็จ' : `เพิ่ม slot สำเร็จ (${payloads.length} ช่วงเวลา)`);
  };
  const deleteRule = (id: number) => {
    setConfirmDialog({
      open: true,
      title: 'คุณต้องการลบ Slot นี้ใช่หรือไม่?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        await axios.delete(`${API_BASE}/calendar-slot-rules/${id}`);
        if (selectedCalendar) await fetchRules(selectedCalendar.id);
        show('ลบ slot สำเร็จ');
      }
    });
  };

  const openCreateHoliday = () => {
    setHolidayForm({ date: '', description: '' });
    setHolidayDialogOpen(true);
  };

  const saveHoliday = async () => {
    if (!selectedCalendar || !holidayForm.date) return;
    
    await axios.post(`${API_BASE}/calendar-holidays`, {
      calendarId: selectedCalendar.id,
      date: holidayForm.date,
      description: holidayForm.description
    });
    
    setHolidayDialogOpen(false);
    await fetchHolidays(selectedCalendar.id);
    show('เพิ่มวันหยุดสำเร็จ');
  };

  const deleteHoliday = (id: number) => {
    setConfirmDialog({
      open: true,
      title: 'คุณต้องการลบวันหยุดนี้ใช่หรือไม่?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        await axios.delete(`${API_BASE}/calendar-holidays/${id}`);
        if (selectedCalendar) await fetchHolidays(selectedCalendar.id);
        show('ลบวันหยุดสำเร็จ');
      }
    });
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
                  <Typography fontWeight={700}>{selectedCalendar.name}</Typography>
                </Box>
                <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} sx={{ minHeight: 'auto', '& .MuiTab-root': { py: 0.5, minHeight: 'auto' } }}>
                  <Tab label="Slot Rules" />
                  <Tab label="วันหยุด (Holidays)" />
                  <Tab label="ป้ายกำกับวัน" />
                </Tabs>
              </Box>
              
              {rightTab === 2 ? (
                <Box>
                  <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                      <TextField
                        size="small" type="date" label="วันที่" InputLabelProps={{ shrink: true }}
                        value={dayLabelForm.date}
                        onChange={(e) => setDayLabelForm(f => ({ ...f, date: e.target.value }))}
                      />
                      <TextField
                        size="small" label="ข้อความบนป้าย" sx={{ minWidth: 240, flex: 1 }}
                        placeholder="เช่น วันเปิดรับรอบพิเศษ"
                        value={dayLabelForm.label}
                        onChange={(e) => setDayLabelForm(f => ({ ...f, label: e.target.value }))}
                      />
                      <Button
                        size="medium" variant="contained" startIcon={<AddIcon />} onClick={saveDayLabel}
                        disabled={!dayLabelForm.date || !dayLabelForm.label.trim()}
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        บันทึกป้าย
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      ป้ายจะขึ้นข้างวันที่ในตารางรอบฝั่งลูกค้า · หนึ่งวันมีได้หนึ่งป้าย บันทึกวันเดิมซ้ำคือการแก้ไข ·
                      สีของป้ายใช้สีของปฏิทินนี้ เปลี่ยนได้ที่ปุ่มแก้ไขปฏิทินทางซ้าย
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 700, width: 150 }}>วันที่</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>ป้ายกำกับ</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dayLabels.map((d) => (
                          <TableRow key={d.id} hover>
                            <TableCell><Typography variant="body2" fontWeight={700}>{d.specific_date}</Typography></TableCell>
                            <TableCell>
                              {/* Shown exactly as the app renders it, so what
                                  staff pick here is what a parent sees. */}
                              <Box component="span" sx={{
                                display: 'inline-flex', px: 1, py: 0.25, borderRadius: 1.5, fontWeight: 800, fontSize: 13,
                                bgcolor: `${selectedCalendar.color}22`, color: selectedCalendar.color,
                              }}>
                                {d.label}
                              </Box>
                            </TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => setDayLabelForm({ date: d.specific_date, label: d.label })}><EditIcon fontSize="small" /></IconButton>
                              <IconButton size="small" color="error" onClick={() => deleteDayLabel(d.id)}><DeleteIcon fontSize="small" /></IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        {dayLabels.length === 0 && (
                          <TableRow><TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีป้ายกำกับวันในปฏิทินนี้</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ) : rightTab === 0 ? (
                <Box>
                  <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreateRule} sx={{ borderRadius: 2, fontWeight: 700 }}>
                      เพิ่ม Slot
                    </Button>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          {RULE_COLUMNS.map(col => (
                            <TableCell key={col.key} sx={{ fontWeight: 700 }} align={col.align}>
                              <TableSortLabel
                                active={ruleSort.key === col.key}
                                direction={ruleSort.key === col.key ? ruleSort.dir : 'asc'}
                                onClick={() => setRuleSort(prev =>
                                  prev.key === col.key && prev.dir === 'asc'
                                    ? { key: col.key, dir: 'desc' }
                                    : { key: col.key, dir: 'asc' })}
                              >
                                {col.label}
                              </TableSortLabel>
                            </TableCell>
                          ))}
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sortedRules.map((r) => (
                          <TableRow key={r.id} hover>
                            <TableCell>
                              {r.day_of_week !== null ? (
                                <Chip label={DAY_NAMES[r.day_of_week]} size="small" color="primary" sx={{ fontWeight: 700 }} />
                              ) : (
                                <Typography variant="body2">{r.specific_date}</Typography>
                              )}
                            </TableCell>
                            <TableCell>{r.label ? `${r.label} (${r.start_time}–${r.end_time})` : `${r.start_time} – ${r.end_time}`}</TableCell>
                            <TableCell align="center">
                              {r.max_capacity} คน
                              {!!r.invite_capacity && (
                                <Chip label={`+${r.invite_capacity} เชิญ`} size="small" sx={{ ml: 0.75, height: 18, fontSize: '10px', fontWeight: 700, bgcolor: 'rgba(124,58,237,0.12)', color: '#7c3aed' }} />
                              )}
                            </TableCell>
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
                </Box>
              ) : (
                <Box>
                  <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreateHoliday} sx={{ borderRadius: 2, fontWeight: 700 }}>
                      เพิ่มวันหยุด
                    </Button>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 700, width: 150 }}>วันที่</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {holidays.map((h) => (
                          <TableRow key={h.id} hover>
                            <TableCell><Typography variant="body2" fontWeight={700}>{h.date}</Typography></TableCell>
                            <TableCell>{h.description || '—'}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" color="error" onClick={() => deleteHoliday(h.id)}><DeleteIcon fontSize="small" /></IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        {holidays.length === 0 && (
                          <TableRow><TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>ไม่มีวันหยุดสำหรับปฏิทินนี้</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
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
          {/* The "ประเภท" selector used to live here. It only ever narrowed which
              calendars the class-booking and POS screens would offer, and
              those now offer all of them — so the field asked staff to make a
              decision that no longer changes anything. calForm.type is still
              carried so the stored value is preserved on edit rather than
              being wiped by a save. */}
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
              <Select 
                multiple 
                value={ruleForm.dayOfWeek} 
                label="วัน" 
                onChange={(e) => setRuleForm(f => ({ ...f, dayOfWeek: (typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : e.target.value) as number[] }))}
                renderValue={(selected) => (selected as number[]).map(s => DAY_NAMES[s]).join(', ')}
              >
                {DAY_NAMES.map((d, i) => (
                  <MenuItem key={i} value={i}>
                    <Checkbox checked={ruleForm.dayOfWeek.includes(i)} />
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {ruleForm.specificDates.map((d, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                  <TextField label={`วันที่ ${i+1}`} type="date" fullWidth InputLabelProps={{ shrink: true }} value={d} onChange={(e) => {
                    const newDates = [...ruleForm.specificDates];
                    newDates[i] = e.target.value;
                    setRuleForm(f => ({ ...f, specificDates: newDates }));
                  }} />
                  {ruleEditId === null && ruleForm.specificDates.length > 1 && (
                    <IconButton color="error" onClick={() => setRuleForm(f => ({ ...f, specificDates: f.specificDates.filter((_, idx) => idx !== i) }))}>
                      <DeleteIcon />
                    </IconButton>
                  )}
                </Box>
              ))}
              {ruleEditId === null && (
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setRuleForm(f => ({ ...f, specificDates: [...f.specificDates, ''] }))}>
                  เพิ่มวันที่
                </Button>
              )}
            </Box>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {ruleForm.timeRanges.map((range, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                <TimeField24 label="เวลาเริ่ม" fullWidth value={range.start} onChange={(v) => {
                  const next = [...ruleForm.timeRanges];
                  next[i] = { ...next[i], start: v };
                  setRuleForm(f => ({ ...f, timeRanges: next }));
                }} />
                <TimeField24 label="เวลาสิ้นสุด" fullWidth value={range.end} onChange={(v) => {
                  const next = [...ruleForm.timeRanges];
                  next[i] = { ...next[i], end: v };
                  setRuleForm(f => ({ ...f, timeRanges: next }));
                }} />
                {ruleEditId === null && ruleForm.timeRanges.length > 1 && (
                  <IconButton color="error" onClick={() => setRuleForm(f => ({ ...f, timeRanges: f.timeRanges.filter((_, idx) => idx !== i) }))}>
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            ))}
            {ruleEditId === null && (
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setRuleForm(f => ({ ...f, timeRanges: [...f.timeRanges, { start: '', end: '' }] }))}>
                เพิ่มช่วงเวลา
              </Button>
            )}
          </Box>
          {ruleEditId === null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, bgcolor: 'grey.50', p: 1.5, borderRadius: 2 }}>
              <FormControlLabel
                control={<Checkbox checked={ruleForm.autoSplit} onChange={(e) => setRuleForm(f => ({ ...f, autoSplit: e.target.checked }))} />}
                label={<Typography variant="body2" fontWeight={700}>แบ่งช่วงเวลาอัตโนมัติ (Auto-split)</Typography>}
              />
              {ruleForm.autoSplit && (
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>แบ่งทุกๆ</InputLabel>
                  <Select label="แบ่งทุกๆ" value={ruleForm.splitInterval} onChange={(e) => setRuleForm(f => ({ ...f, splitInterval: e.target.value as number }))}>
                    <MenuItem value={30}>30 นาที</MenuItem>
                    <MenuItem value={60}>1 ชั่วโมง</MenuItem>
                    <MenuItem value={90}>1 ชั่วโมง 30 นาที</MenuItem>
                    <MenuItem value={120}>2 ชั่วโมง</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Box>
          )}
          <TextField
            label="ชื่อรอบ (ไม่บังคับ)" fullWidth
            helperText="ถ้าไม่กรอก จะแสดงแค่เวลา เช่น กรอก 'รอบเช้า' จะแสดงเป็น รอบเช้า (09:00-10:00)"
            value={ruleForm.label}
            onChange={(e) => setRuleForm(f => ({ ...f, label: e.target.value }))}
          />
          <TextField
            label="รับได้สูงสุด (คน) ต่อ Slot" type="number" fullWidth inputProps={{ min: 0 }}
            helperText="ใส่ 0 ได้ — รอบจะยังแสดงอยู่แต่ขึ้นว่าเต็มเสมอ"
            value={ruleForm.maxCapacity}
            onChange={(e) => setRuleForm(f => ({ ...f, maxCapacity: Math.max(0, parseInt(e.target.value) || 0) }))}
          />
          <TextField
            label="ที่นั่งสำรองสำหรับลิงก์เชิญพิเศษ" type="number" fullWidth inputProps={{ min: 0 }}
            helperText="ที่นั่งส่วนเกินนี้จะไม่โชว์ให้คนทั่วไปเห็นเลย จองได้เฉพาะผ่านลิงก์เชิญ (ตั้งค่าลิงก์ได้ที่หน้าจัดการคลาส)"
            value={ruleForm.inviteCapacity}
            onChange={(e) => setRuleForm(f => ({ ...f, inviteCapacity: Math.max(0, parseInt(e.target.value) || 0) }))}
          />
          {ruleMode === 'recurring' && (
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField label="ใช้งานตั้งแต่" type="date" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.validFrom} onChange={(e) => setRuleForm(f => ({ ...f, validFrom: e.target.value }))} />
              <TextField label="ถึงวันที่ (ว่าง = ไม่จำกัด)" type="date" fullWidth InputLabelProps={{ shrink: true }} value={ruleForm.validUntil} onChange={(e) => setRuleForm(f => ({ ...f, validUntil: e.target.value }))} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRuleDialogOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveRule} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
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
      {/* Holiday Dialog */}
      <Dialog open={holidayDialogOpen} onClose={() => setHolidayDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>เพิ่มวันหยุด</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField 
            label="วันที่หยุด" 
            type="date" 
            fullWidth 
            InputLabelProps={{ shrink: true }} 
            value={holidayForm.date} 
            onChange={(e) => setHolidayForm(f => ({ ...f, date: e.target.value }))} 
          />
          <TextField 
            label="หมายเหตุ (ถ้ามี)" 
            fullWidth 
            value={holidayForm.description} 
            onChange={(e) => setHolidayForm(f => ({ ...f, description: e.target.value }))} 
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setHolidayDialogOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveHoliday} disabled={!holidayForm.date} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CalendarManagement;
