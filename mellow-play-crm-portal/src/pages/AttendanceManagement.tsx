import { API_URL } from '../config';
import TimeField24 from '../components/TimeField24';
import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccessTime as ClockIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Edit as EditIcon,
  AddCircleOutline as AddIcon,
} from '@mui/icons-material';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'normal' | 'late' | 'ot' | 'absent' | 'off';

interface DayAttendance {
  checkIn: string;
  checkOut: string;
  note: string;
}

interface AttendanceManagementProps {
  canApprove?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const WEEK_DAY_LABELS: Record<string, { full: string }> = {
  mon: { full: 'จันทร์'    },
  tue: { full: 'อังคาร'    },
  wed: { full: 'พุธ'       },
  thu: { full: 'พฤหัสบดี'  },
  fri: { full: 'ศุกร์'     },
  sat: { full: 'เสาร์'     },
  sun: { full: 'อาทิตย์'   },
};

// In a real app these values come from the logged-in user's CRM profile
const EMPLOYEE_SCHEDULE = {
  work_days: ['mon', 'tue', 'wed', 'thu', 'fri'] as string[],
  work_start_time: '09:00',
  work_end_time:   '18:00',
};

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }
> = {
  normal: { label: 'ปกติ',    color: 'success' },
  late:   { label: 'สาย',    color: 'warning' },
  ot:     { label: 'OT',     color: 'info'    },
  absent: { label: 'ขาดงาน', color: 'error'   },
  off:    { label: 'หยุด',   color: 'default' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const jsDay = d.getDay();
  d.setDate(d.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function computeDayResult(
  checkIn: string,
  checkOut: string,
  isWorkDay: boolean,
  workStart: string,
  workEnd: string,
): { status: AttendanceStatus; workedHours: number; otHours: number } {
  // Off day with no entry → just "off"
  if (!isWorkDay && !checkIn) return { status: 'off', workedHours: 0, otHours: 0 };

  // Off day with entry → all hours are OT
  if (!isWorkDay && checkIn) {
    const worked = checkOut ? (timeToMinutes(checkOut) - timeToMinutes(checkIn)) / 60 : 0;
    return { status: 'ot', workedHours: worked, otHours: worked };
  }

  // Working day — no check-in
  if (!checkIn) return { status: 'absent', workedHours: 0, otHours: 0 };

  const inMin  = timeToMinutes(checkIn);
  const outMin = checkOut ? timeToMinutes(checkOut) : 0;
  const endMin = timeToMinutes(workEnd);

  const workedHours = checkOut ? (outMin - inMin) / 60 : 0;
  const rawOT       = checkOut && outMin > endMin ? (outMin - endMin) / 60 : 0;
  const otHours     = Math.round(rawOT * 2) / 2; // round to nearest 0.5

  const isLate = inMin > timeToMinutes(workStart) + 5; // 5-min grace

  let status: AttendanceStatus;
  if (isLate)       status = 'late';
  else if (otHours) status = 'ot';
  else              status = 'normal';

  return { status, workedHours, otHours };
}

const API_BASE = `${API_URL}/api/v1/admin`;

// ─── Component ────────────────────────────────────────────────────────────────

const AttendanceManagement: React.FC<AttendanceManagementProps> = () => {
  const [weekStart, setWeekStart]           = useState(() => getWeekMonday(new Date()));
  const [attendanceData, setAttendanceData] = useState<Record<string, DayAttendance>>({});
  const [loading, setLoading]               = useState(true);
  const [successMsg, setSuccessMsg]         = useState('');

  const crmUserId: number | null = (() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || 'null')?.id ?? null; } catch { return null; }
  })();

  const selectedYear  = weekStart.getFullYear();
  const selectedMonth = weekStart.getMonth() + 1;

  // Edit dialog
  const [editDate, setEditDate]         = useState<string | null>(null);
  const [editIsOffDay, setEditIsOffDay] = useState(false);
  const [editForm, setEditForm]         = useState({ checkIn: '', checkOut: '', note: '' });

  const todayStr = toISODate(new Date());

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // ── API fetch ──────────────────────────────────────────────────────────────
  const fetchAttendance = async (year: number, month: number) => {
    if (!crmUserId) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/attendance`, {
        params: { userId: crmUserId, year, month },
      });
      const map: Record<string, DayAttendance> = {};
      for (const rec of res.data.records) {
        map[rec.date] = { checkIn: rec.check_in ?? '', checkOut: rec.check_out ?? '', note: rec.note ?? '' };
      }
      setAttendanceData(map);
    } catch (err) {
      console.error('fetchAttendance error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  // ── Week dates ───────────────────────────────────────────────────────────
  const weekDates = useMemo(() =>
    WEEK_DAY_KEYS.map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }), [weekStart]);

  const weekLabel = useMemo(() => {
    const fmt  = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    const year = weekDates[0].getFullYear() + 543;
    return `${fmt(weekDates[0])} – ${fmt(weekDates[6])} ${year}`;
  }, [weekDates]);

  const isCurrentWeek = useMemo(() =>
    toISODate(weekStart) === toISODate(getWeekMonday(new Date())),
  [weekStart]);

  // ── Week summary ─────────────────────────────────────────────────────────
  const weekSummary = useMemo(() => {
    let totalHours = 0, totalOT = 0, lateCount = 0, workDays = 0;
    weekDates.forEach((d, idx) => {
      const dateStr = toISODate(d);
      const isWork  = EMPLOYEE_SCHEDULE.work_days.includes(WEEK_DAY_KEYS[idx]);
      const data    = attendanceData[dateStr];
      if (!data?.checkIn) return;
      const { status, workedHours, otHours } = computeDayResult(
        data.checkIn, data.checkOut, isWork,
        EMPLOYEE_SCHEDULE.work_start_time, EMPLOYEE_SCHEDULE.work_end_time,
      );
      if (status !== 'off' && status !== 'absent') { totalHours += workedHours; totalOT += otHours; workDays++; }
      if (status === 'late') lateCount++;
    });
    return { totalHours, totalOT, lateCount, workDays };
  }, [weekDates, attendanceData]);

  // ── Edit dialog preview ──────────────────────────────────────────────────
  const editPreview = useMemo(() => {
    if (!editForm.checkIn || !editForm.checkOut) return null;
    if (editIsOffDay) {
      const worked = (timeToMinutes(editForm.checkOut) - timeToMinutes(editForm.checkIn)) / 60;
      return { workedHours: worked, otHours: worked, isLate: false };
    }
    const { workedHours, otHours, status } = computeDayResult(
      editForm.checkIn, editForm.checkOut, true,
      EMPLOYEE_SCHEDULE.work_start_time, EMPLOYEE_SCHEDULE.work_end_time,
    );
    return { workedHours, otHours, isLate: status === 'late' };
  }, [editForm.checkIn, editForm.checkOut, editIsOffDay]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const openEditDay = (dateStr: string, isOffDay: boolean) => {
    const existing = attendanceData[dateStr];
    setEditIsOffDay(isOffDay);
    setEditForm({
      checkIn:  existing?.checkIn  || (isOffDay ? '' : EMPLOYEE_SCHEDULE.work_start_time),
      checkOut: existing?.checkOut || (isOffDay ? '' : EMPLOYEE_SCHEDULE.work_end_time),
      note:     existing?.note     || '',
    });
    setEditDate(dateStr);
  };

  const handleSaveDay = async () => {
    if (!editDate || !crmUserId) return;
    try {
      await axios.post(`${API_BASE}/attendance`, {
        crmUserId,
        date: editDate,
        checkIn: editForm.checkIn,
        checkOut: editForm.checkOut,
        note: editForm.note,
      });
      await fetchAttendance(selectedYear, selectedMonth);
      setEditDate(null);
      showSuccess('บันทึกเวลาทำงานเรียบร้อย');
    } catch (err) {
      console.error('handleSaveDay error:', err);
    }
  };

  const handleClearDay = async () => {
    if (!editDate || !crmUserId) return;
    try {
      await axios.delete(`${API_BASE}/attendance`, {
        params: { userId: crmUserId, date: editDate },
      });
      await fetchAttendance(selectedYear, selectedMonth);
      setEditDate(null);
      showSuccess('ลบข้อมูลวันนั้นเรียบร้อย');
    } catch (err) {
      console.error('handleClearDay error:', err);
    }
  };

  // ── Day card ─────────────────────────────────────────────────────────────
  const renderDayCard = (date: Date, idx: number) => {
    const dateStr  = toISODate(date);
    const dayKey   = WEEK_DAY_KEYS[idx];
    const dayLabel = WEEK_DAY_LABELS[dayKey];
    const isWork   = EMPLOYEE_SCHEDULE.work_days.includes(dayKey);
    const isToday  = dateStr === todayStr;
    const isPast   = dateStr < todayStr;
    // All days (including off-days) can be edited if past or today
    const canEdit  = isPast || isToday;

    const data = attendanceData[dateStr];
    const { status, workedHours, otHours } = computeDayResult(
      data?.checkIn || '', data?.checkOut || '', isWork,
      EMPLOYEE_SCHEDULE.work_start_time, EMPLOYEE_SCHEDULE.work_end_time,
    );

    const hasData      = Boolean(data?.checkIn);
    const expectedH    = (timeToMinutes(EMPLOYEE_SCHEDULE.work_end_time) - timeToMinutes(EMPLOYEE_SCHEDULE.work_start_time)) / 60;
    const progressVal  = workedHours > 0 ? Math.min((workedHours / (isWork ? expectedH : workedHours)) * 100, 100) : 0;
    const statusCfg    = STATUS_CONFIG[status];

    const bgColor = isToday
      ? 'primary.50'
      : status === 'ot'
        ? 'info.50'
        : status === 'absent'
          ? 'error.50'
          : (!isWork && !hasData)
            ? 'grey.50'
            : 'background.paper';

    return (
      <Box key={dateStr} sx={{ flex: '1 0 0', minWidth: 118, maxWidth: 155 }}>
        <Paper
          sx={{
            p: 1.5,
            borderRadius: 3,
            height: '100%',
            border: '2px solid',
            borderColor: isToday ? 'primary.main' : status === 'absent' ? 'error.light' : !isWork && !hasData ? 'divider' : 'divider',
            borderStyle: !isWork && !hasData ? 'dashed' : 'solid',
            bgcolor: bgColor,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            cursor: canEdit ? 'pointer' : 'default',
            transition: 'box-shadow 0.15s',
            '&:hover': canEdit ? { boxShadow: 3 } : {},
          }}
          onClick={() => canEdit && openEditDay(dateStr, !isWork)}
        >
          {/* Header */}
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" fontWeight={800}
              color={isToday ? 'primary.main' : !isWork ? 'text.disabled' : 'text.secondary'}
              sx={{ display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.4 }}
            >
              {dayLabel.full}
            </Typography>
            <Typography variant="h6" fontWeight={800}
              color={isToday ? 'primary.main' : !isWork && !hasData ? 'text.disabled' : 'text.primary'}
              sx={{ lineHeight: 1.2 }}
            >
              {date.getDate()}
            </Typography>
            {isToday && (
              <Chip label="วันนี้" size="small" color="primary" sx={{ height: 16, fontSize: '0.58rem', mt: 0.2 }} />
            )}
          </Box>

          <Divider />

          {/* Content */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.6 }}>
            {hasData ? (
              <>
                {/* Off-day OT badge */}
                {!isWork && (
                  <Chip label="วันหยุด OT" size="small" color="info" variant="outlined"
                    sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700, alignSelf: 'center', mb: 0.25 }} />
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">เข้า</Typography>
                  <Typography variant="caption" fontWeight={700} color={status === 'late' ? 'warning.main' : 'success.main'}>
                    {data!.checkIn}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">ออก</Typography>
                  <Typography variant="caption" fontWeight={700} color={otHours > 0 ? 'info.main' : 'text.primary'}>
                    {data!.checkOut || '—'}
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate" value={progressVal}
                  color={!isWork ? 'info' : status === 'ot' ? 'info' : status === 'late' ? 'warning' : 'success'}
                  sx={{ borderRadius: 99, height: 4, my: 0.25 }}
                />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">{workedHours.toFixed(1)} ชม.</Typography>
                  {otHours > 0 && (
                    <Typography variant="caption" color="info.main" fontWeight={700}>+{otHours.toFixed(1)}h OT</Typography>
                  )}
                </Box>

                {/* Status + edit icon */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
                  <Chip label={statusCfg.label} color={statusCfg.color as any} size="small"
                    sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }} />
                  {canEdit && (
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditDay(dateStr, !isWork); }} sx={{ p: 0.3 }}>
                      <EditIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  )}
                </Box>
              </>
            ) : (
              /* No data */
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5, py: 1 }}>
                {!isWork ? (
                  <>
                    <Typography variant="caption" color="text.disabled" fontWeight={600}>หยุด</Typography>
                    {canEdit && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <AddIcon sx={{ fontSize: 12, color: 'info.light' }} />
                        <Typography variant="caption" color="info.light" sx={{ fontSize: '0.6rem' }}>เพิ่ม OT</Typography>
                      </Box>
                    )}
                  </>
                ) : isPast ? (
                  <Typography variant="caption" color="error.main" fontWeight={600} sx={{ textAlign: 'center' }}>
                    ยังไม่บันทึก
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>—</Typography>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ClockIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>บันทึกวันทำงาน</Typography>
          <Typography variant="body2" color="text.secondary">
            กดที่วันใดก็ได้เพื่อบันทึกเวลา — วันหยุดที่มีการทำงานจะนับเป็น OT อัตโนมัติ
          </Typography>
        </Box>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Week navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>
          <PrevIcon />
        </IconButton>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1, textAlign: 'center' }}>
          {weekLabel}
        </Typography>
        <IconButton size="small" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>
          <NextIcon />
        </IconButton>
        {!isCurrentWeek && (
          <Button size="small" variant="outlined" onClick={() => setWeekStart(getWeekMonday(new Date()))}
            sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
            สัปดาห์นี้
          </Button>
        )}
      </Box>

      {/* Day cards */}
      <Box sx={{
        display: 'flex', gap: 1, overflowX: 'auto', pb: 1,
        scrollSnapType: 'x mandatory',
        '& > *': { scrollSnapAlign: 'start' },
      }}>
        {weekDates.map((date, idx) => renderDayCard(date, idx))}
      </Box>

      {/* Week summary */}
      <Paper sx={{ p: 2, borderRadius: 3, mt: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ mb: 1.5 }}>
          สรุปสัปดาห์
        </Typography>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { value: weekSummary.workDays,              label: 'วันทำงาน',     color: 'text.primary'   },
            { value: weekSummary.totalHours.toFixed(1), label: 'ชั่วโมงทำงาน', color: 'text.primary'   },
            { value: weekSummary.totalOT.toFixed(1),    label: 'ชั่วโมง OT',   color: 'info.main'      },
            {
              value: weekSummary.lateCount,
              label: 'ครั้งที่สาย',
              color: weekSummary.lateCount > 0 ? 'warning.main' : 'text.primary',
            },
          ].map(({ value, label, color }) => (
            <Box key={label} sx={{ textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={800} color={color}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* ── Edit Day Dialog ────────────────────────────────────────────────── */}
      <Dialog open={editDate !== null} onClose={() => setEditDate(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
          บันทึกเวลาทำงาน
          {editDate && (
            <Typography variant="body2" color="text.secondary" fontWeight={400}>
              {new Date(editDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Typography>
          )}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {editIsOffDay && (
            <Alert severity="info" sx={{ mb: 2 }}>
              วันหยุด — ชั่วโมงทำงานทั้งหมดจะนับเป็น <strong>OT</strong>
            </Alert>
          )}

          <Box sx={{ mb: 2 }}>
            <TimeField24
              label="เวลาเข้างาน" fullWidth
              value={editForm.checkIn}
              onChange={(v) => setEditForm((p) => ({ ...p, checkIn: v }))}
            />
            {!editIsOffDay && (
              <Typography variant="caption" color="text.secondary">ค่าปกติ: {EMPLOYEE_SCHEDULE.work_start_time}</Typography>
            )}
          </Box>
          <Box sx={{ mb: 2 }}>
            <TimeField24
              label="เวลาออกงาน" fullWidth
              value={editForm.checkOut}
              onChange={(v) => setEditForm((p) => ({ ...p, checkOut: v }))}
            />
            {!editIsOffDay && (
              <Typography variant="caption" color="text.secondary">ค่าปกติ: {EMPLOYEE_SCHEDULE.work_end_time}</Typography>
            )}
          </Box>

          {editPreview && (
            <Alert severity={editPreview.otHours > 0 ? 'info' : 'success'} sx={{ mb: 2 }}>
              รวม {editPreview.workedHours.toFixed(1)} ชั่วโมง
              {editPreview.otHours > 0 && ` · OT ${editPreview.otHours.toFixed(1)} ชม.`}
              {editPreview.isLate && ' · มาสาย'}
            </Alert>
          )}

          <TextField
            label="หมายเหตุ (ถ้ามี)" fullWidth multiline rows={2}
            value={editForm.note}
            onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          {attendanceData[editDate ?? ''] && (
            <Button color="error" onClick={handleClearDay} sx={{ fontWeight: 700, mr: 'auto' }}>
              ลบข้อมูล
            </Button>
          )}
          <Button onClick={() => setEditDate(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSaveDay} sx={{ borderRadius: 3, fontWeight: 700 }}>
            บันทึก
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AttendanceManagement;
