import { API_URL } from '../config';
import CalendarPicker from '../components/CalendarPicker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputLabel, MenuItem, Paper, Select, TextField, Typography,
} from '@mui/material';
import {
  EventNote as BookingIcon, ChevronLeft, ChevronRight,
  CheckCircle as ConfirmedIcon, ArrowForward as NextIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DAY_SHORT   = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

const ClassBooking: React.FC = () => {
  const today = new Date();
  const [step, setStep] = useState<'select-course' | 'select-slot'>('select-course');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10));

  // Data
  const [calendars, setCalendars] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [filterCatId, setFilterCatId] = useState('');

  // Booking dialog
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookForm, setBookForm] = useState({ customerName: '', customerPhone: '', teachingStaffId: '', paymentStatus: 'prepaid', notes: '' });
  const [memberLoading, setMemberLoading] = useState(false);
  const [foundMember, setFoundMember] = useState<any>(null);

  const show = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/calendars`).then(r => {
        // Every calendar, not just type === 'class'. The type field is gone;
        // it only ever hid options that were selectable elsewhere anyway.
        const cls = r.data.calendars ?? [];
        setCalendars(cls);
        if (cls.length > 0) setSelectedCalendarId(String(cls[0].id));
      }),
      axios.get(`${API_BASE}/courses`).then(r => setCourses(r.data.courses ?? [])),
      axios.get(`${API_BASE}/categories`).then(r => setCategories(r.data.categories ?? [])),
      axios.get(`${API_BASE}/crm-users`).then(r => setStaffList(r.data.users ?? [])),
    ]);
  }, []);

  useEffect(() => {
    if (selectedCalendarId && selectedDate && step === 'select-slot') fetchSlots();
  }, [selectedCalendarId, selectedDate, step, selectedCourse]);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const dur = selectedCourse?.duration ?? '';
      const res = await axios.get(`${API_BASE}/calendar-slots/available?calendarId=${selectedCalendarId}&date=${selectedDate}&courseDuration=${dur}`);
      setSlots(res.data.slots ?? []);
    } finally { setLoading(false); }
  };

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = getDaysInMonth(year, month);
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const selectDay = (day: number) => {
    setSelectedDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const handleSelectCourse = (course: any) => {
    setSelectedCourse(course);
    setStep('select-slot');
  };

  const openBooking = (slot: any) => {
    if (slot.available <= 0) return;
    setSelectedSlot(slot);
    setBookForm({ customerName: '', customerPhone: '', teachingStaffId: '', paymentStatus: 'prepaid', notes: '' });
    setFoundMember(null);
    setBookDialogOpen(true);
  };

  const lookupMember = async () => {
    if (!bookForm.customerPhone) return;
    setMemberLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/pos/lookup-member`, { phone: bookForm.customerPhone });
      if (res.data.success) {
        setFoundMember(res.data.member);
        setBookForm(f => ({ ...f, customerName: `${res.data.member.first_name} ${res.data.member.last_name}` }));
      }
    } catch { setFoundMember(null); }
    finally { setMemberLoading(false); }
  };

  const confirmBooking = async () => {
    if (!selectedSlot || !selectedCourse) return;
    await axios.post(`${API_BASE}/pos/process-sale`, {
      userId: foundMember?.id ?? null,
      childId: null,
      branchId: 1,
      date: selectedDate,
      startTime: selectedSlot.startTime,
      courseId: selectedCourse.id,
      ageGroup: 'junior',
      isGuest: !foundMember,
      paymentMethod: bookForm.paymentStatus === 'prepaid' ? 'cash' : 'later',
      teachingStaffId: bookForm.teachingStaffId ? parseInt(bookForm.teachingStaffId) : null,
      calendarId: parseInt(selectedCalendarId),
      notes: bookForm.notes,
    });
    setBookDialogOpen(false);
    await fetchSlots();
    show('จองคลาสสำเร็จ');
  };

  const filteredCourses = useMemo(() =>
    filterCatId ? courses.filter(c => String(c.category_id) === filterCatId) : courses,
    [courses, filterCatId]
  );


  // ── Step 1: Select Course ────────────────────────────────────────────────
  const CourseSelector = () => (
    <Box>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>เลือกคลาสเรียน</Typography>

      {/* Category filter */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label="ทั้งหมด" onClick={() => setFilterCatId('')}
          color={filterCatId === '' ? 'primary' : 'default'} sx={{ fontWeight: 700 }} />
        {categories.map(cat => (
          <Chip key={cat.id} label={cat.name} onClick={() => setFilterCatId(String(cat.id))}
            color={filterCatId === String(cat.id) ? 'primary' : 'default'} sx={{ fontWeight: 700 }} />
        ))}
      </Box>

      <Grid container spacing={2}>
        {filteredCourses.map(course => (
          <Grid item xs={12} sm={6} md={4} key={course.id}>
            <Paper variant="outlined" onClick={() => handleSelectCourse(course)}
              sx={{ p: 2, borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50', transform: 'translateY(-2px)', boxShadow: 2 } }}>
              <Typography variant="body1" fontWeight={800} sx={{ mb: 0.5 }}>{course.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {categories.find(c => c.id === course.category_id)?.name ?? ''}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {course.duration && (
                  <Chip label={`${course.duration} ชม.`} size="small" variant="outlined" sx={{ fontSize: '10px' }} />
                )}
                {course.age_min != null && (
                  <Chip label={`${course.age_min}–${course.age_max} ปี`} size="small" variant="outlined" sx={{ fontSize: '10px' }} />
                )}
                <Chip label={`฿${(course.original_price ?? 0).toLocaleString()}`} size="small" color="primary" sx={{ fontWeight: 700, fontSize: '10px' }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button size="small" variant="contained" endIcon={<NextIcon />} sx={{ borderRadius: 2, fontWeight: 700, fontSize: '11px' }}>
                  เลือกคลาสนี้
                </Button>
              </Box>
            </Paper>
          </Grid>
        ))}
        {filteredCourses.length === 0 && (
          <Grid item xs={12}>
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>ไม่มีคลาสเรียน</Typography>
          </Grid>
        )}
      </Grid>
    </Box>
  );

  // ── Step 2: Select Slot ──────────────────────────────────────────────────
  const SlotSelector = () => (
    <Grid container spacing={3}>
      {/* Left: Calendar */}
      <Grid item xs={12} md={5}>
        <Paper sx={{ borderRadius: 3, p: 2 }}>
          {/* Month nav */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <IconButton onClick={prevMonth}><ChevronLeft /></IconButton>
            <Typography fontWeight={800}>{THAI_MONTHS[month]} {year + 543}</Typography>
            <IconButton onClick={nextMonth}><ChevronRight /></IconButton>
          </Box>
          <Grid container>
            {DAY_SHORT.map(d => (
              <Grid item key={d} xs={12 / 7}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textAlign: 'center', display: 'block', pb: 0.5 }}>{d}</Typography>
              </Grid>
            ))}
          </Grid>
          <Grid container>
            {calendarDays.map((day, i) => {
              if (!day) return <Grid item key={`e-${i}`} xs={12 / 7} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === today.toISOString().slice(0, 10);
              return (
                <Grid item key={day} xs={12 / 7}>
                  <Box onClick={() => selectDay(day)} sx={{
                    height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 2, cursor: 'pointer', mx: 0.3, my: 0.2,
                    bgcolor: isSelected ? 'primary.main' : isToday ? 'primary.50' : 'transparent',
                    color: isSelected ? 'white' : 'text.primary',
                    fontWeight: isSelected || isToday ? 800 : 400, fontSize: '0.85rem',
                    '&:hover': { bgcolor: isSelected ? 'primary.dark' : 'grey.100' },
                  }}>{day}</Box>
                </Grid>
              );
            })}
          </Grid>
          {/* Calendar selector */}
          <Box sx={{ mt: 2 }}>
            <CalendarPicker calendars={calendars} value={selectedCalendarId} onChange={setSelectedCalendarId} />
          </Box>
        </Paper>
      </Grid>

      {/* Right: Slots */}
      <Grid item xs={12} md={7}>
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography fontWeight={700}>
              Slot วันที่ {selectedDate} {loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
            </Typography>
          </Box>
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {slots.map((slot, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography fontWeight={800}>{slot.label ? `${slot.label} (${slot.startTime}–${slot.endTime})` : `${slot.startTime} – ${slot.endTime}`}</Typography>
                  <Chip label={`ว่าง ${slot.available}/${slot.maxCapacity}`} size="small"
                    color={slot.available > 0 ? 'success' : 'error'} sx={{ fontWeight: 700, mt: 0.5 }} />
                </Box>
                <Button variant="contained" size="small" disabled={slot.available <= 0}
                  onClick={() => openBooking(slot)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  จอง
                </Button>
              </Paper>
            ))}
            {slots.length === 0 && !loading && (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                ไม่มี Slot ในวันนี้
              </Typography>
            )}
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BookingIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จองคลาสเรียน</Typography>
            <Typography variant="body2" color="text.secondary">
              {step === 'select-course' ? 'เลือกคลาสที่ต้องการจอง' : `คลาส: ${selectedCourse?.name}`}
            </Typography>
          </Box>
        </Box>
        {step === 'select-slot' && (
          <Button variant="outlined" onClick={() => { setStep('select-course'); setSelectedCourse(null); }} sx={{ borderRadius: 3, fontWeight: 700 }}>
            ← เปลี่ยนคลาส
          </Button>
        )}
      </Box>

      {/* Selected course badge */}
      {step === 'select-slot' && selectedCourse && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 3, border: '2px solid', borderColor: 'primary.main', bgcolor: 'primary.50', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography fontWeight={800} color="primary.main">{selectedCourse.name}</Typography>
          {selectedCourse.duration && <Chip label={`ระยะเวลา: ${selectedCourse.duration} ชม.`} size="small" color="primary" />}
          {selectedCourse.age_min != null && <Chip label={`อายุ ${selectedCourse.age_min}–${selectedCourse.age_max} ปี`} size="small" variant="outlined" />}
          <Chip label={`฿${(selectedCourse.original_price ?? 0).toLocaleString()}`} size="small" color="success" sx={{ fontWeight: 700 }} />
        </Paper>
      )}

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {step === 'select-course' ? <CourseSelector /> : <SlotSelector />}

      {/* Booking Dialog */}
      <Dialog open={bookDialogOpen} onClose={() => setBookDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>
          จอง: {selectedCourse?.name}
          <Typography variant="body2" color="text.secondary">
            {selectedDate} {selectedSlot?.label ? `${selectedSlot.label} (${selectedSlot?.startTime}–${selectedSlot?.endTime})` : `เวลา ${selectedSlot?.startTime} – ${selectedSlot?.endTime}`}
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="เบอร์โทรสมาชิก" fullWidth size="small" value={bookForm.customerPhone}
              onChange={(e) => setBookForm(f => ({ ...f, customerPhone: e.target.value }))} />
            <Button variant="outlined" onClick={lookupMember} disabled={memberLoading} sx={{ whiteSpace: 'nowrap', borderRadius: 2 }}>
              {memberLoading ? <CircularProgress size={16} /> : 'ค้นหา'}
            </Button>
          </Box>
          {foundMember && (
            <Alert severity="success" icon={<ConfirmedIcon />}>
              พบสมาชิก: <strong>{foundMember.first_name} {foundMember.last_name}</strong>
            </Alert>
          )}
          <TextField label="ชื่อลูกค้า" fullWidth value={bookForm.customerName}
            onChange={(e) => setBookForm(f => ({ ...f, customerName: e.target.value }))} />
          <FormControl fullWidth>
            <InputLabel>ครู / Facilitator</InputLabel>
            <Select value={bookForm.teachingStaffId} label="ครู / Facilitator"
              onChange={(e) => setBookForm(f => ({ ...f, teachingStaffId: e.target.value }))}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {staffList.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.full_name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>การชำระเงิน</InputLabel>
            <Select value={bookForm.paymentStatus} label="การชำระเงิน"
              onChange={(e) => setBookForm(f => ({ ...f, paymentStatus: e.target.value }))}>
              <MenuItem value="prepaid">ชำระล่วงหน้า (Pre-paid)</MenuItem>
              <MenuItem value="pending_payment">เรียนก่อน ค้างชำระ</MenuItem>
            </Select>
          </FormControl>
          <TextField label="หมายเหตุ" fullWidth multiline rows={2} value={bookForm.notes}
            onChange={(e) => setBookForm(f => ({ ...f, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBookDialogOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={confirmBooking} sx={{ borderRadius: 3, fontWeight: 700 }}>ยืนยันจอง</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ClassBooking;
