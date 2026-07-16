import { API_URL } from '../config';
import { formatBirthDate } from '../utils/dateFormat';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Button, IconButton,
  ToggleButton, ToggleButtonGroup, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControl, InputLabel, Select,
  Grid, CircularProgress, Tooltip, Stack, Divider,
  RadioGroup, Radio, FormControlLabel, FormLabel, Alert, InputAdornment,
  Snackbar,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight,
  Add as AddIcon,
  Search as SearchIcon,
  HistoryEdu as ReportIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Download as DownloadIcon,
  ViewList as ListIcon,
  EventBusy as EventBusyIcon,
  AdminPanelSettings as ForceStatusIcon,
} from '@mui/icons-material';
import axios from 'axios';
import RecordMilestone from './RecordMilestone';
import ConfirmDialog from '../components/ConfirmDialog';

const API_BASE = `${API_URL}/api/v1/admin`;

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส'];

interface Booking {
  id: number;
  child_id: number;
  branch_id: number;
  scheduled_at: string;
  status: string;
  age_group: string;
  child_name: string;
  child_nickname?: string;
  child_birth_date?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  course_name: string;
  branch_name: string;
}

interface Course {
  id: number;
  name: string;
  name_en: string;
  code: string;
  description: string;
  description_en: string;
  age_min: number;
  age_max: number;
  duration: string;
  thumbnail_url: string;
  category_name: string;
}

interface Child {
  id: number;
  name: string;
  birth_date: string;
  little_junior_balance: number;
  junior_balance: number;
}

interface Member {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  children: Child[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

const toISODate = (d: Date): string => d.toISOString().split('T')[0];

const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date: Date, n: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const STATUS_META: Record<string, { label: string; color: string; fgColor: string; bgColor: string }> = {
  completed:      { label: 'เสร็จสิ้น',   color: 'success', fgColor: '#2e7d32', bgColor: 'rgba(46,125,50,0.1)' },
  // 'confirmed' is a legacy status (older rows only) — consolidated into
  // confirmed_paid going forward, kept here only so old rows still render
  // with a proper style instead of falling back to the unstyled default.
  confirmed:      { label: 'ชำระแล้ว',    color: 'info',    fgColor: '#0277bd', bgColor: 'rgba(2,119,189,0.1)' },
  confirmed_paid: { label: 'ชำระแล้ว',    color: 'info',    fgColor: '#0277bd', bgColor: 'rgba(2,119,189,0.1)' },
  pending:        { label: 'รอดำเนินการ', color: 'warning', fgColor: '#e65100', bgColor: 'rgba(230,81,0,0.1)' },
  awaiting_report:{ label: 'รอกรอกรายงาน', color: 'warning', fgColor: '#b45309', bgColor: 'rgba(180,83,9,0.1)' },
  cancelled:      { label: 'ยกเลิก',      color: 'error',   fgColor: '#c62828', bgColor: 'rgba(198,40,40,0.1)' },
};

const getStatusInfo = (status: string) =>
  STATUS_META[status?.toLowerCase()] ?? { label: status ?? '-', color: 'default', fgColor: '#555', bgColor: 'rgba(0,0,0,0.05)' };

const formatDuration = (d: string): string => {
  if (!d) return '-';
  const [h, m] = d.split(':').map(Number);
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return h === 1 ? '1 ชม.' : `${h} ชม.`;
  return `${m} นาที`;
};

const STATUS_FILTERS = [
  { key: 'all',           label: 'ทั้งหมด' },
  { key: 'pending',       label: 'รอดำเนินการ' },
  { key: 'confirmed_paid',label: 'ชำระแล้ว' },
  { key: 'awaiting_report', label: 'รอกรอกรายงาน' },
  { key: 'completed',     label: 'เสร็จสิ้น' },
  { key: 'cancelled',     label: 'ยกเลิก' },
];

// ─── BookingItem (row in list) ───────────────────────────────────────────────

const BookingItem = ({ booking, onReport, onComplete, onCancel, isSuperAdmin, onForceStatus }: {
  booking: Booking;
  onReport: (b: Booking) => void;
  onComplete: (b: Booking) => void;
  onCancel: (id: number) => void;
  isSuperAdmin?: boolean;
  onForceStatus?: (b: Booking) => void;
}) => {
  const si = getStatusInfo(booking.status);
  const time = new Date(booking.scheduled_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const isActive = ['confirmed', 'confirmed_paid'].includes(booking.status);
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2, p: 1.5,
      borderRadius: 2, border: '1px solid #f0f0f0', bgcolor: 'white',
      '&:hover': { bgcolor: '#fafafa' },
    }}>
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 52, color: 'text.secondary', flexShrink: 0 }}>
        {time} น.
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {booking.course_name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {booking.child_name}
        </Typography>
      </Box>
      <Chip label={si.label} size="small" sx={{ fontWeight: 700, flexShrink: 0, bgcolor: si.bgColor, color: si.fgColor, border: 'none' }} variant="outlined" />
      {isActive && (
        <>
          <Tooltip title="เรียนเสร็จ — กรอกรายงานเพื่อยืนยัน">
            <IconButton size="small" color="success" onClick={() => onComplete(booking)}>
              <CheckCircleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="ยกเลิก — คืนสต็อก">
            <IconButton size="small" color="error" onClick={() => onCancel(booking.id)}>
              <CancelIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}
      {['completed', 'awaiting_report'].includes(booking.status) && (
        <Tooltip title={booking.status === 'awaiting_report' ? 'กรอกรายงาน (ค้างอยู่)' : 'แก้ไขรายงาน'}>
          <IconButton size="small" color={booking.status === 'awaiting_report' ? 'warning' : 'success'} onClick={() => onReport(booking)}>
            <ReportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isSuperAdmin && onForceStatus && (
        <Tooltip title="แก้ไขสถานะ (Super Admin)">
          <IconButton size="small" color="warning" onClick={() => onForceStatus(booking)}>
            <ForceStatusIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

// ─── Day View ────────────────────────────────────────────────────────────────

const DayView = ({ bookings, date, onReport, onComplete, onCancel, isSuperAdmin, onForceStatus }: { bookings: Booking[]; date: Date; onReport: (b: Booking) => void; onComplete: (b: Booking) => void; onCancel: (id: number) => void; isSuperAdmin: boolean; onForceStatus: (b: Booking) => void }) => {
  const dayStr = toISODate(date);
  const dayBookings = bookings.filter(b => b.scheduled_at.startsWith(dayStr));
  if (dayBookings.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 6, textAlign: 'center', borderColor: '#eef0f3' }}>
        <Typography color="text.secondary">ไม่มีรายการจองในวันนี้</Typography>
      </Paper>
    );
  }
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 2, borderColor: '#eef0f3' }}>
      <Stack spacing={1}>
        {dayBookings.map(b => <BookingItem key={b.id} booking={b} onReport={onReport} onComplete={onComplete} onCancel={onCancel} isSuperAdmin={isSuperAdmin} onForceStatus={onForceStatus} />)}
      </Stack>
    </Paper>
  );
};

// ─── Week View ───────────────────────────────────────────────────────────────

const WeekView = ({ bookings, weekStart, onReport }: { bookings: Booking[]; weekStart: Date; onReport: (b: Booking) => void }) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = toISODate(new Date());

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', borderColor: '#eef0f3' }}>
      {/* Header */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #eee' }}>
        {days.map((day, i) => {
          const isToday = toISODate(day) === todayStr;
          return (
            <Box key={i} sx={{
              p: 1.5, textAlign: 'center',
              borderRight: i < 6 ? '1px solid #eee' : 'none',
              bgcolor: isToday ? 'primary.main' : '#fafafa',
              color: isToday ? 'white' : 'text.primary',
            }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{THAI_DAYS[day.getDay()]}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 900 }}>{day.getDate()}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '10px' }}>{THAI_MONTHS_SHORT[day.getMonth()]}</Typography>
            </Box>
          );
        })}
      </Box>
      {/* Day columns */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((day, i) => {
          const dayStr = toISODate(day);
          const dayBookings = bookings.filter(b => b.scheduled_at.startsWith(dayStr));
          return (
            <Box key={i} sx={{ borderRight: i < 6 ? '1px solid #eee' : 'none', minHeight: 180, p: 0.75 }}>
              <Stack spacing={0.5}>
                {dayBookings.map(b => {
                  const si = getStatusInfo(b.status);
                  const time = new Date(b.scheduled_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <Tooltip key={b.id} title={`${time} น. · ${b.course_name} · ${b.child_name}`}>
                      <Box
                        onClick={() => ['completed','awaiting_report'].includes(b.status) && onReport(b)}
                        sx={{
                          px: 0.75, py: 0.375, borderRadius: 1,
                          bgcolor: si.bgColor, color: si.fgColor,
                          fontSize: '11px', fontWeight: 700,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          cursor: ['completed','awaiting_report'].includes(b.status) ? 'pointer' : 'default',
                          '&:hover': ['completed','awaiting_report'].includes(b.status) ? { opacity: 0.8 } : {},
                        }}
                      >
                        {time} {b.course_name}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

// ─── Month View ──────────────────────────────────────────────────────────────

const MonthView = ({ bookings, date, onReport }: { bookings: Booking[]; date: Date; onReport: (b: Booking) => void }) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toISODate(new Date());

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', borderColor: '#eef0f3' }}>
      {/* Day name header */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', bgcolor: '#fafafa', borderBottom: '1px solid #eee' }}>
        {THAI_DAYS.map((d, i) => (
          <Box key={d} sx={{ p: 1.25, textAlign: 'center', borderRight: i < 6 ? '1px solid #eee' : 'none' }}>
            <Typography variant="caption" sx={{ fontWeight: 900, color: d === 'อา' ? 'error.main' : 'text.secondary' }}>{d}</Typography>
          </Box>
        ))}
      </Box>
      {/* Calendar grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((day, idx) => {
          const dateStr = day ? toISODate(new Date(year, month, day)) : '';
          const isToday = dateStr === todayStr;
          const dayBookings = day ? bookings.filter(b => b.scheduled_at.startsWith(dateStr)) : [];
          return (
            <Box key={idx} sx={{
              minHeight: 100, p: 0.75,
              borderRight: idx % 7 < 6 ? '1px solid #eee' : 'none',
              borderBottom: '1px solid #eee',
              bgcolor: day ? 'white' : '#fafafa',
            }}>
              {day && (
                <>
                  <Box sx={{
                    width: 22, height: 22, borderRadius: '50%', mb: 0.5,
                    bgcolor: isToday ? 'primary.main' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: isToday ? 'white' : 'text.primary', lineHeight: 1 }}>
                      {day}
                    </Typography>
                  </Box>
                  <Stack spacing={0.25}>
                    {dayBookings.slice(0, 2).map(b => {
                      const si = getStatusInfo(b.status);
                      return (
                        <Tooltip key={b.id} title={`${b.course_name} · ${b.child_name}`}>
                          <Box
                            onClick={() => ['completed','awaiting_report'].includes(b.status) && onReport(b)}
                            sx={{
                              px: 0.5, py: 0.125, borderRadius: 0.5,
                              bgcolor: si.bgColor, color: si.fgColor,
                              fontSize: '10px', fontWeight: 700,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              cursor: ['completed','awaiting_report'].includes(b.status) ? 'pointer' : 'default',
                            }}
                          >
                            {b.course_name}
                          </Box>
                        </Tooltip>
                      );
                    })}
                    {dayBookings.length > 2 && (
                      <Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 700, pl: 0.5 }}>
                        +{dayBookings.length - 2} รายการ
                      </Typography>
                    )}
                  </Stack>
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

// ─── List View ───────────────────────────────────────────────────────────────

const calculateAge = (birthDateStr: string | undefined) => {
  if (!birthDateStr) return '-';
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return '-';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? `${age} ปี` : '0 ปี';
};

const ListView = ({ bookings, onReport, onComplete, onCancel, isSuperAdmin, onForceStatus }: {
  bookings: Booking[];
  onReport: (b: Booking) => void;
  onComplete: (b: Booking) => void;
  onCancel: (id: number) => void;
  isSuperAdmin: boolean;
  onForceStatus: (b: Booking) => void;
}) => {
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'course' | 'date'>('none');

  const filtered = useMemo(() => {
    if (!search.trim()) return bookings;
    const q = search.toLowerCase();
    return bookings.filter(b =>
      b.child_name?.toLowerCase().includes(q) ||
      b.child_nickname?.toLowerCase().includes(q) ||
      b.parent_name?.toLowerCase().includes(q) ||
      b.parent_phone?.toLowerCase().includes(q) ||
      b.course_name?.toLowerCase().includes(q) ||
      b.branch_name?.toLowerCase().includes(q) ||
      String(b.id).includes(q)
    );
  }, [bookings, search]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return { 'ทั้งหมด': filtered };
    if (groupBy === 'course') {
      return filtered.reduce((acc: Record<string, Booking[]>, b) => {
        const key = b.course_name || 'ไม่ระบุ';
        if (!acc[key]) acc[key] = [];
        acc[key].push(b);
        return acc;
      }, {});
    }
    // group by date
    return filtered.reduce((acc: Record<string, Booking[]>, b) => {
      const dateStr = b.scheduled_at?.split('T')[0] || b.scheduled_at?.split(' ')[0] || '-';
      const d = new Date(dateStr);
      const key = isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    }, {});
  }, [filtered, groupBy]);

  const exportCSV = () => {
    const formatPhone = (phoneStr: string | undefined) => {
      if (!phoneStr) return '-';
      const clean = phoneStr.replace(/[-\s]/g, '');
      if (clean.length === 10) {
        return `${clean.slice(0, 3)}-${clean.slice(3)}`;
      }
      return phoneStr;
    };

    const headers = [
      'รหัสจอง', 
      'วันที่', 
      'เวลา', 
      'คลาส', 
      'ชื่อเด็ก', 
      'ชื่อเล่นเด็ก', 
      'วันเกิดเด็ก', 
      'อายุจริง', 
      'ชื่อผู้ปกครอง', 
      'เบอร์โทรผู้ปกครอง', 
      'อีเมลผู้ปกครอง', 
      'สาขา', 
      'สถานะ'
    ];
    const rows = filtered.map(b => {
      const dt = new Date(b.scheduled_at);
      const date = isNaN(dt.getTime()) ? b.scheduled_at : dt.toLocaleDateString('th-TH');
      const time = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const status = getStatusInfo(b.status).label;
      const childBdate = formatBirthDate(b.child_birth_date);
      const actualAge = calculateAge(b.child_birth_date);
      return [
        b.id,
        `"${date}"`,
        `"${time}"`,
        `"${b.course_name || ''}"`,
        `"${b.child_name || ''}"`,
        `"${b.child_nickname || '-'}"`,
        `"${childBdate}"`,
        `"${actualAge}"`,
        `"${b.parent_name || '-'}"`,
        `"${formatPhone(b.parent_phone)}"`,
        `"${b.parent_email || '-'}"`,
        `"${b.branch_name || ''}"`,
        `"${status}"`
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      {/* Search & Controls */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={2} alignItems={{ sm: 'center' }}>
        <TextField
          size="small"
          placeholder="ค้นหา ชื่อเด็ก, ชื่อเล่น, ผู้ปกครอง, เบอร์โทร, คลาส..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2, fontWeight: 600 } }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ fontWeight: 700 }}>จัดกลุ่มตาม</InputLabel>
          <Select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as any)}
            label="จัดกลุ่มตาม"
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            <MenuItem value="none" sx={{ fontWeight: 700 }}>ไม่จัดกลุ่ม</MenuItem>
            <MenuItem value="course" sx={{ fontWeight: 700 }}>ตามคลาส</MenuItem>
            <MenuItem value="date" sx={{ fontWeight: 700 }}>ตามวันที่</MenuItem>
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={exportCSV}
          disabled={filtered.length === 0}
          sx={{ borderRadius: 2, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Export CSV ({filtered.length})
        </Button>
      </Stack>

      {/* List */}
      {filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderColor: '#eef0f3' }}>
          <EventBusyIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {bookings.length === 0 ? 'ไม่มีรายการจองในช่วงเวลานี้' : 'ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {bookings.length === 0
              ? 'ลองขยายช่วงวันที่ "จาก–ถึง" ด้านบน หรือตรวจสอบว่าเลือกสาขาถูกต้องแล้ว'
              : 'ลองปรับคำค้นหาหรือตัวกรองสถานะดูใหม่อีกครั้ง'}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {Object.entries(grouped).map(([groupKey, items]) => (
            <Box key={groupKey}>
              {groupBy !== 'none' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '15px' }}>{groupKey}</Typography>
                  <Chip label={`${items.length} รายการ`} size="small" sx={{ fontWeight: 700, fontSize: '12px', bgcolor: 'slate.200' }} />
                </Box>
              )}
              <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', borderColor: '#eef0f3' }}>
                {/* Table Header */}
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: '60px 130px 1.5fr 1fr 1fr 120px 130px',
                  bgcolor: '#f8fafc', px: 3, py: 2,
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  {['รหัส', 'วัน/เวลา', 'รายละเอียดเด็ก & ผู้ปกครอง', 'คลาสเรียน', 'สาขา', 'สถานะ', 'จัดการ'].map(h => (
                    <Typography key={h} variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '12px' }}>{h}</Typography>
                  ))}
                </Box>
                {items.map((b, idx) => {
                  const si = getStatusInfo(b.status);
                  const dt = new Date(b.scheduled_at);
                  const isActive = ['confirmed', 'confirmed_paid'].includes(b.status);
                  return (
                    <Box key={b.id} sx={{
                      display: 'grid',
                      gridTemplateColumns: '60px 130px 1.5fr 1fr 1fr 120px 130px',
                      px: 3, py: 2.5, alignItems: 'center',
                      borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      '&:hover': { bgcolor: '#f8fafc/50' },
                      transition: 'background-color 0.2s',
                    }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '14px' }}>
                        #{b.id}
                      </Typography>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '14px', color: 'slate.700' }}>
                          {isNaN(dt.getTime()) ? b.scheduled_at : dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '12.5px' }}>
                          {isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                        </Typography>
                      </Box>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '15px' }}>
                            {b.child_name || '-'}
                          </Typography>
                          {b.child_nickname && (
                            <Chip
                              label={b.child_nickname}
                              size="small"
                              sx={{
                                bgcolor: 'rgba(116, 82, 214, 0.08)',
                                color: 'rgb(116, 82, 214)',
                                fontWeight: 700,
                                fontSize: '11px',
                                height: 20
                              }}
                            />
                          )}
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={0.5}>
                          {b.child_birth_date && (
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '12.5px' }}>
                              🎂 {formatBirthDate(b.child_birth_date)} ({calculateAge(b.child_birth_date)})
                            </Typography>
                          )}
                          {b.parent_name && (
                            <Typography variant="body2" sx={{ color: 'slate.500', fontWeight: 500, fontSize: '12.5px' }}>
                              • 👤 {b.parent_name} {b.parent_phone ? `(${b.parent_phone})` : ''}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14.5px', color: 'slate.800' }}>
                        {b.course_name || '-'}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.branch_name || '-'}
                      </Typography>
                      <Box>
                        <Chip
                          label={si.label}
                          size="small"
                          sx={{ fontWeight: 700, bgcolor: si.bgColor, color: si.fgColor, border: 'none', fontSize: '12px', px: 1, height: 26 }}
                          variant="outlined"
                        />
                      </Box>
                      <Stack direction="row" spacing={0.25}>
                        {isActive && (
                          <>
                            <Tooltip title="เรียนเสร็จ">
                              <IconButton color="success" onClick={() => onComplete(b)}>
                                <CheckCircleIcon sx={{ fontSize: 22 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="ยกเลิก">
                              <IconButton color="error" onClick={() => onCancel(b.id)}>
                                <CancelIcon sx={{ fontSize: 22 }} />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {['completed', 'awaiting_report'].includes(b.status) && (
                          <Tooltip title={b.status === 'awaiting_report' ? 'กรอกรายงาน (ค้างอยู่)' : 'แก้ไขรายงาน'}>
                            <IconButton color={b.status === 'awaiting_report' ? 'warning' : 'success'} onClick={() => onReport(b)}>
                              <ReportIcon sx={{ fontSize: 22 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isSuperAdmin && (
                          <Tooltip title="แก้ไขสถานะ (Super Admin)">
                            <IconButton color="warning" onClick={() => onForceStatus(b)}>
                              <ForceStatusIcon sx={{ fontSize: 22 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Paper>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
};

// ─── Add Booking Dialog ──────────────────────────────────────────────────────

const AddBookingDialog = ({ open, onClose, branchId, branchName, onSuccess }: {
  open: boolean;
  onClose: () => void;
  branchId: number | string;
  branchName: string;
  onSuccess: () => void;
}) => {
  const [customerType, setCustomerType] = useState<'member' | 'guest'>('member');
  const [phone, setPhone] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [bookingDate, setBookingDate] = useState(toISODate(new Date()));
  const [bookingTime, setBookingTime] = useState('09:00');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'confirmed_paid'>('confirmed_paid');
  const [descLang, setDescLang] = useState<'th' | 'en'>('th');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    axios.get(`${API_BASE}/courses`).then(res => {
      if (res.data.success) setCourses(res.data.courses ?? []);
    }).catch(() => {});
  }, [open]);

  const reset = () => {
    setCustomerType('member');
    setPhone('');
    setMember(null);
    setMemberError('');
    setSelectedChildId('');
    setGuestName('');
    setGuestPhone('');
    setCourseId('');
    setBookingDate(toISODate(new Date()));
    setBookingTime('09:00');
    setPaymentStatus('confirmed_paid');
    setDescLang('th');
    setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const searchMember = async () => {
    if (!phone.trim()) return;
    setMemberLoading(true);
    setMemberError('');
    setMember(null);
    try {
      const res = await axios.post(`${API_BASE}/pos/lookup-member`, { phone: phone.trim() });
      if (res.data.success) {
        setMember(res.data.member);
        if (res.data.member.children?.length > 0) setSelectedChildId(String(res.data.member.children[0].id));
      } else {
        setMemberError('ไม่พบสมาชิกที่ใช้เบอร์นี้');
      }
    } catch {
      setMemberError('ไม่พบสมาชิกที่ใช้เบอร์นี้');
    } finally {
      setMemberLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!courseId) { setError('กรุณาเลือกคลาส'); return; }
    if (!bookingDate || !bookingTime) { setError('กรุณาระบุวันและเวลา'); return; }
    if (customerType === 'member' && !selectedChildId) { setError('กรุณาเลือกเด็กจากผลการค้นหา'); return; }

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/bookings`, {
        isGuest: customerType === 'guest',
        childId: customerType === 'member' ? parseInt(selectedChildId) : 0,
        courseId: parseInt(courseId),
        branchId: parseInt(String(branchId)),
        scheduledAt: `${bookingDate} ${bookingTime}:00`,
        status: paymentStatus,
        ...(customerType === 'guest' && { guestName: guestName.trim(), guestPhone: guestPhone.trim() }),
      });
      if (res.data.success) { reset(); onSuccess(); }
      else setError(res.data.message ?? 'เกิดข้อผิดพลาด');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 0 }}>เพิ่มการจองคลาส</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 2 }}>
          {/* Customer type */}
          <FormControl>
            <FormLabel sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.85rem' }}>ประเภทลูกค้า</FormLabel>
            <RadioGroup
              row
              value={customerType}
              onChange={e => { setCustomerType(e.target.value as 'member' | 'guest'); setMember(null); setMemberError(''); }}
            >
              <FormControlLabel value="member" control={<Radio size="small" />} label="สมาชิกในระบบ" />
              <FormControlLabel value="guest"  control={<Radio size="small" />} label="ลูกค้าทั่วไป" />
            </RadioGroup>
          </FormControl>

          {/* Member lookup */}
          {customerType === 'member' && (
            <Box>
              <TextField
                label="ค้นหาด้วยเบอร์โทร"
                size="small"
                fullWidth
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchMember()}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={searchMember} disabled={memberLoading} size="small">
                        {memberLoading ? <CircularProgress size={16} /> : <SearchIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {memberError && <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>{memberError}</Alert>}
              {member && (
                <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{member.first_name} {member.last_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{member.phone}</Typography>
                  {(member.children?.length ?? 0) > 0 ? (
                    <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                      <InputLabel>เลือกเด็ก</InputLabel>
                      <Select value={selectedChildId} onChange={e => setSelectedChildId(e.target.value)} label="เลือกเด็ก">
                        {member.children.map(c => (
                          <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>สมาชิกนี้ยังไม่มีข้อมูลเด็กในระบบ</Alert>
                  )}
                </Paper>
              )}
            </Box>
          )}

          {/* Walk-in info */}
          {customerType === 'guest' && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="ชื่อลูกค้า"
                  size="small"
                  fullWidth
                  placeholder="ไม่บังคับ"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                />
                <TextField
                  label="เบอร์โทร"
                  size="small"
                  fullWidth
                  placeholder="ไม่บังคับ"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                />
              </Stack>
            </Stack>
          )}

          <Divider />

          {/* Payment status */}
          <FormControl>
            <FormLabel sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.85rem' }}>สถานะการชำระ</FormLabel>
            <RadioGroup
              row
              value={paymentStatus}
              onChange={e => setPaymentStatus(e.target.value as 'pending' | 'confirmed_paid')}
            >
              <FormControlLabel
                value="confirmed_paid"
                control={<Radio size="small" />}
                label={<Typography variant="body2" sx={{ fontWeight: 700, color: '#0277bd' }}>ชำระแล้ว</Typography>}
              />
              <FormControlLabel
                value="pending"
                control={<Radio size="small" />}
                label={<Typography variant="body2" sx={{ fontWeight: 700, color: '#e65100' }}>รอชำระ</Typography>}
              />
            </RadioGroup>
          </FormControl>

          {/* Course selector */}
          <FormControl fullWidth size="small">
            <InputLabel>เลือกคลาส *</InputLabel>
            <Select
              value={courseId}
              onChange={e => { setCourseId(e.target.value); setDescLang('th'); }}
              label="เลือกคลาส *"
            >
              {courses.map(c => (
                <MenuItem key={c.id} value={String(c.id)}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.name}</Typography>
                    {c.name_en && (
                      <Typography variant="caption" color="text.secondary">{c.name_en}</Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Course detail panel */}
          {courseId && (() => {
            const c = courses.find(x => String(x.id) === courseId);
            if (!c) return null;
            const desc = descLang === 'en' ? (c.description_en || c.description) : (c.description || c.description_en);
            return (
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                {/* Thumbnail + meta */}
                <Box sx={{ display: 'flex', gap: 1.5, p: 1.5 }}>
                  {c.thumbnail_url ? (
                    <Box
                      component="img"
                      src={c.thumbnail_url}
                      alt={c.name}
                      sx={{ width: 80, height: 80, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <Box sx={{
                      width: 80, height: 80, borderRadius: 1.5, flexShrink: 0,
                      bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 900 }}>
                        {c.name.charAt(0)}
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.25 }}>{c.name}</Typography>
                    {c.name_en && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{c.name_en}</Typography>
                    )}
                    <Stack direction="row" spacing={0.75} flexWrap="wrap">
                      {c.code && (
                        <Chip label={c.code} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '10px', height: 20 }} />
                      )}
                      {c.category_name && (
                        <Chip label={c.category_name} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: '10px', height: 20 }} />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={2} mt={0.75}>
                      {c.duration && (
                        <Typography variant="caption" color="text.secondary">
                          ⏱ {formatDuration(c.duration)}
                        </Typography>
                      )}
                      {(c.age_min != null || c.age_max != null) && (
                        <Typography variant="caption" color="text.secondary">
                          👶 {c.age_min ?? '?'}–{c.age_max ?? '?'} ปี
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </Box>
                {/* Description */}
                {desc && (
                  <>
                    <Divider />
                    <Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>รายละเอียด</Typography>
                        <ToggleButtonGroup
                          value={descLang}
                          exclusive
                          onChange={(_, v) => v && setDescLang(v)}
                          size="small"
                        >
                          <ToggleButton value="th" sx={{ py: 0, px: 1, fontSize: '10px', fontWeight: 700 }}>ไทย</ToggleButton>
                          <ToggleButton value="en" sx={{ py: 0, px: 1, fontSize: '10px', fontWeight: 700 }}>ENG</ToggleButton>
                        </ToggleButtonGroup>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
                        {desc}
                      </Typography>
                    </Box>
                  </>
                )}
              </Paper>
            );
          })()}

          {/* Date + Time */}
          <Stack direction="row" spacing={2}>
            <TextField
              label="วันที่ *" type="date" size="small" sx={{ flex: 1 }}
              value={bookingDate} onChange={e => setBookingDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="เวลา *" type="time" size="small" sx={{ flex: 1 }}
              value={bookingTime} onChange={e => setBookingTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          {/* Branch (display only) */}
          <TextField
            label="สาขา" size="small" value={branchName || '-'}
            InputProps={{ readOnly: true }}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ fontWeight: 800, borderRadius: 2 }}>
          {submitting ? <CircularProgress size={20} color="inherit" /> : 'บันทึกการจอง'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const BookingManagement = () => {
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'list'>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [reportBooking, setReportBooking] = useState<Booking | null>(null);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  const userJson = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const ownBranchId: number | string = currentUser?.selectedBranchId;
  const ownBranchName: string = currentUser?.selectedBranchName ?? '';

  // Super admins default to "every branch" so nothing is ever hidden behind
  // branch scoping by surprise; regular staff stay scoped to their own branch.
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperAdmin ? 'all' : String(ownBranchId ?? ''),
  );

  useEffect(() => {
    axios.get(`${API_BASE}/branches`).then(res => {
      if (res.data.success) setBranches(res.data.branches ?? []);
    }).catch(() => {});
  }, []);

  const branchName = selectedBranchId === 'all'
    ? 'ทุกสาขา'
    : branches.find(b => String(b.id) === selectedBranchId)?.name ?? ownBranchName;

  // List view uses its own user-adjustable date range instead of being tied
  // to calendar navigation, so it's always obvious what window is in effect.
  const [listFrom, setListFrom] = useState(toISODate(new Date()));
  const [listTo, setListTo] = useState(toISODate(addDays(new Date(), 90)));

  // ── date range & label based on view + currentDate ──────────────────────
  const { startDate, endDate, label } = useMemo(() => {
    if (viewMode === 'list') {
      return { startDate: listFrom, endDate: listTo, label: '' };
    }
    if (viewMode === 'day') {
      const d = toISODate(currentDate);
      return {
        startDate: d,
        endDate: d,
        label: currentDate.toLocaleDateString('th-TH', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }),
      };
    }
    if (viewMode === 'week') {
      const ws = getWeekStart(currentDate);
      const we = addDays(ws, 6);
      const lbl = ws.getMonth() === we.getMonth()
        ? `${ws.getDate()} – ${we.getDate()} ${THAI_MONTHS_SHORT[we.getMonth()]} ${we.getFullYear() + 543}`
        : `${ws.getDate()} ${THAI_MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${THAI_MONTHS_SHORT[we.getMonth()]} ${we.getFullYear() + 543}`;
      return { startDate: toISODate(ws), endDate: toISODate(we), label: lbl };
    }
    // month
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return {
      startDate: toISODate(start),
      endDate: toISODate(end),
      label: `${THAI_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear() + 543}`,
    };
  }, [viewMode, currentDate, listFrom, listTo]);

  // ── fetch ────────────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    if (!selectedBranchId) {
      setFetchError('ยังไม่ได้เลือกสาขา กรุณาเลือกสาขาก่อนใช้งาน');
      return;
    }
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams({ branchId: selectedBranchId, startDate, endDate });
      const res = await axios.get(`${API_BASE}/bookings?${params}`);
      if (res.data.success) setBookings(res.data.bookings ?? []);
      else setFetchError(res.data.message || 'ไม่สามารถโหลดรายการจองได้');
    } catch (e: any) {
      console.error('fetchBookings error', e);
      setFetchError(e?.response?.data?.message || 'เกิดข้อผิดพลาดในการโหลดรายการจอง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, startDate, endDate]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── quick stats (based on the full fetched range, not the status filter) ──
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookings) counts[b.status] = (counts[b.status] || 0) + 1;
    return {
      total: bookings.length,
      confirmed: (counts['confirmed'] || 0) + (counts['confirmed_paid'] || 0),
      pending: counts['pending'] || 0,
      completed: counts['completed'] || 0,
      cancelled: counts['cancelled'] || 0,
    };
  }, [bookings]);

  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel'; bookingId: number } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // "เรียนเสร็จ" no longer completes the booking immediately — it flags the
  // class as attended (awaiting_report) and opens the report form; the
  // booking only becomes 'completed' (stock deducted) once the report is
  // actually submitted, in RecordMilestone's onSuccess below.
  const handleComplete = async (booking: Booking) => {
    try {
      await axios.patch(`${API_BASE}/bookings/${booking.id}/status`, { status: 'awaiting_report' });
      setReportBooking({ ...booking, status: 'awaiting_report' });
      fetchBookings();
    } catch (e: any) {
      setActionError(e.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };
  const handleCancel = (bookingId: number) => setConfirmAction({ type: 'cancel', bookingId });

  // ── Super Admin force-status patch (error correction) ────────────────────
  const [forceStatusBooking, setForceStatusBooking] = useState<Booking | null>(null);
  const [forceStatusValue, setForceStatusValue] = useState<string>('confirmed_paid');
  const [forceScheduledAt, setForceScheduledAt] = useState('');
  const [forcePaidAt, setForcePaidAt] = useState('');
  const [forceStatusLoading, setForceStatusLoading] = useState(false);
  const [forceStatusError, setForceStatusError] = useState('');
  const [forceStatusSuccess, setForceStatusSuccess] = useState(false);

  // Super Admin hard-delete — requires typing "ยืนยัน" verbatim before the
  // delete button enables at all, since this permanently removes the row
  // (unlike Cancel, which just sets status='cancelled' and keeps history).
  const DELETE_CONFIRM_WORD = 'ยืนยัน';
  const [deleteBookingTarget, setDeleteBookingTarget] = useState<Booking | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // <input type="datetime-local"> requires "YYYY-MM-DDTHH:MM" — stored dates
  // use a space separator ("YYYY-MM-DD HH:MM:SS"), so convert both ways.
  const toDatetimeLocalValue = (raw?: string) => raw ? raw.replace(' ', 'T').slice(0, 16) : '';
  const fromDatetimeLocalValue = (val: string) => val ? val.replace('T', ' ') : '';

  const openForceStatus = (b: Booking) => {
    setForceStatusBooking(b);
    setForceStatusValue(b.status === 'pending' ? 'pending' : 'confirmed_paid');
    setForceScheduledAt(toDatetimeLocalValue(b.scheduled_at));
    setForcePaidAt('');
    setForceStatusError('');
  };

  const submitForceStatus = async () => {
    if (!forceStatusBooking) return;
    setForceStatusLoading(true);
    setForceStatusError('');
    try {
      await axios.patch(`${API_BASE}/bookings/${forceStatusBooking.id}/status`, {
        status: forceStatusValue,
        scheduledAt: forceScheduledAt ? fromDatetimeLocalValue(forceScheduledAt) : undefined,
        paidAt: forcePaidAt ? fromDatetimeLocalValue(forcePaidAt) : undefined,
      });
      setForceStatusBooking(null);
      setForceStatusSuccess(true);
      // If the current status tab no longer matches the new status, the
      // booking would silently vanish from the filtered list with no
      // feedback — reset to "all" so the admin can actually see the result.
      if (statusFilter !== 'all' && statusFilter !== forceStatusValue) {
        setStatusFilter('all');
      }
      fetchBookings();
    } catch (e: any) {
      setForceStatusError(e.response?.data?.message || 'เกิดข้อผิดพลาด ไม่สามารถบันทึกได้');
    } finally {
      setForceStatusLoading(false);
    }
  };

  const openDeleteBooking = (b: Booking) => {
    setDeleteBookingTarget(b);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const submitDeleteBooking = async () => {
    if (!deleteBookingTarget || deleteConfirmText !== DELETE_CONFIRM_WORD) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await axios.delete(`${API_BASE}/bookings/${deleteBookingTarget.id}`);
      setDeleteBookingTarget(null);
      fetchBookings();
    } catch (e: any) {
      setDeleteError(e.response?.data?.message || 'เกิดข้อผิดพลาด ไม่สามารถลบได้');
    } finally {
      setDeleteLoading(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      await axios.post(`${API_BASE}/bookings/${confirmAction.bookingId}/cancel`);
      setConfirmAction(null);
      fetchBookings();
    } catch (e: any) {
      setActionError(e.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── filter ───────────────────────────────────────────────────────────────
  const filteredBookings = useMemo(() => {
    if (statusFilter === 'all') return bookings;
    // 'confirmed' is a legacy alias for 'confirmed_paid' — match both so old rows aren't hidden.
    if (statusFilter === 'confirmed_paid') return bookings.filter(b => b.status === 'confirmed_paid' || b.status === 'confirmed');
    return bookings.filter(b => b.status === statusFilter);
  }, [bookings, statusFilter]);

  // ── navigation ───────────────────────────────────────────────────────────
  const navigate = (dir: number) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'day')   d.setDate(d.getDate() + dir);
      else if (viewMode === 'week')  d.setDate(d.getDate() + dir * 7);
      else                           d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  // ── record milestone pass-through ────────────────────────────────────────
  if (reportBooking) {
    return (
      <RecordMilestone
        booking={reportBooking}
        onClose={() => setReportBooking(null)}
        onSuccess={() => { setReportBooking(null); fetchBookings(); }}
      />
    );
  }

  return (
    <Box>
      {/* Page header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5} mb={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>รายการจองคลาสเรียน</Typography>
          {isSuperAdmin ? (
            <FormControl size="small" variant="standard" sx={{ mt: 0.5, minWidth: 160 }}>
              <Select
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(e.target.value)}
                disableUnderline
                sx={{ fontWeight: 600, fontSize: '0.875rem', color: 'text.secondary' }}
              >
                <MenuItem value="all" sx={{ fontWeight: 600 }}>ทุกสาขา</MenuItem>
                {branches.map(b => (
                  <MenuItem key={b.id} value={String(b.id)} sx={{ fontWeight: 600 }}>{b.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            ownBranchName && <Typography variant="body2" color="text.secondary">สาขา {ownBranchName}</Typography>
          )}
        </Box>
        <Button
          variant="contained"
          disableElevation
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
          sx={{ borderRadius: 2.5, fontWeight: 700, px: 2.5 }}
        >
          เพิ่มการจอง
        </Button>
      </Stack>

      {fetchError && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2.5 }} onClose={() => setFetchError('')}>
          {fetchError}
        </Alert>
      )}

      {/* Quick stats */}
      {!fetchError && (
        <Stack direction="row" spacing={1.25} mb={2.5} flexWrap="wrap" useFlexGap>
          {[
            { label: 'ทั้งหมด', value: stats.total, fg: '#334155' },
            { label: 'ยืนยัน/ชำระแล้ว', value: stats.confirmed, fg: '#1565c0' },
            { label: 'รอดำเนินการ', value: stats.pending, fg: '#e65100' },
            { label: 'เสร็จสิ้น', value: stats.completed, fg: '#2e7d32' },
            { label: 'ยกเลิก', value: stats.cancelled, fg: '#c62828' },
          ].map(s => (
            <Box key={s.label} sx={{
              flex: '1 1 140px', minWidth: 128, p: 1.5, borderRadius: 2.5,
              bgcolor: 'white', border: '1px solid #eef0f3', borderLeft: `3px solid ${s.fg}`,
            }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: s.fg, lineHeight: 1.2 }}>{s.value}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>{s.label}</Typography>
            </Box>
          ))}
        </Stack>
      )}

      {/* Toolbar */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 3, borderColor: '#eef0f3' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
          spacing={1.5}
          flexWrap="wrap"
        >
          {/* View mode */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
            size="small"
            sx={{ flexShrink: 0, '& .MuiToggleButton-root': { border: 'none', borderRadius: 2, mx: 0.25 } }}
          >
            <ToggleButton value="list"  sx={{ fontWeight: 600, px: 2, display: 'flex', gap: 0.5 }}><ListIcon sx={{ fontSize: 16 }} />รายการ</ToggleButton>
            <ToggleButton value="day"   sx={{ fontWeight: 600, px: 2 }}>วัน</ToggleButton>
            <ToggleButton value="week"  sx={{ fontWeight: 600, px: 2 }}>สัปดาห์</ToggleButton>
            <ToggleButton value="month" sx={{ fontWeight: 600, px: 2 }}>เดือน</ToggleButton>
          </ToggleButtonGroup>

          {/* List mode: adjustable date range. Calendar modes: navigator. */}
          {viewMode === 'list' ? (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, justifyContent: { xs: 'flex-start', sm: 'center' } }}>
              <TextField
                type="date" size="small" label="จาก" value={listFrom}
                onChange={e => setListFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Typography variant="body2" color="text.secondary">–</Typography>
              <TextField
                type="date" size="small" label="ถึง" value={listTo}
                onChange={e => setListTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Stack>
          ) : (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, justifyContent: 'center' }}>
              <IconButton size="small" onClick={() => navigate(-1)}><ChevronLeft /></IconButton>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, minWidth: { xs: 160, sm: 220 }, textAlign: 'center', px: 1, whiteSpace: 'nowrap' }}
              >
                {label}
              </Typography>
              <IconButton size="small" onClick={() => navigate(1)}><ChevronRight /></IconButton>
              <Button size="small" onClick={() => setCurrentDate(new Date())} sx={{ fontWeight: 600, ml: 0.5, borderRadius: 2 }}>
                วันนี้
              </Button>
            </Stack>
          )}
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {/* Status filter chips — always colored so status is legible at a glance */}
        <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center" useFlexGap>
          {STATUS_FILTERS.map(({ key, label: slabel }) => {
            const active = statusFilter === key;
            const si = key !== 'all' ? getStatusInfo(key) : null;
            const fg = si?.fgColor ?? '#475569';
            return (
              <Chip
                key={key}
                label={slabel}
                size="small"
                onClick={() => setStatusFilter(key)}
                sx={{
                  fontWeight: 600, cursor: 'pointer', border: '1px solid',
                  borderColor: active ? fg : `${fg}33`,
                  bgcolor: active ? `${fg}1a` : 'transparent',
                  color: fg,
                }}
              />
            );
          })}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            {filteredBookings.length} รายการ
          </Typography>
        </Stack>
      </Paper>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : viewMode === 'day' ? (
        <DayView bookings={filteredBookings} date={currentDate} onReport={setReportBooking} onComplete={handleComplete} onCancel={handleCancel} isSuperAdmin={isSuperAdmin} onForceStatus={openForceStatus} />
      ) : viewMode === 'week' ? (
        <WeekView bookings={filteredBookings} weekStart={getWeekStart(currentDate)} onReport={setReportBooking} />
      ) : viewMode === 'list' ? (
        <ListView bookings={filteredBookings} onReport={setReportBooking} onComplete={handleComplete} onCancel={handleCancel} isSuperAdmin={isSuperAdmin} onForceStatus={openForceStatus} />
      ) : (
        <MonthView bookings={filteredBookings} date={currentDate} onReport={setReportBooking} />
      )}

      <AddBookingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        branchId={selectedBranchId !== 'all' ? selectedBranchId : ownBranchId}
        branchName={selectedBranchId !== 'all' ? branchName : ownBranchName}
        onSuccess={() => { setAddOpen(false); fetchBookings(); }}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title="ยืนยันการยกเลิกการจอง?"
        description="ระบบจะคืนสต็อกวัสดุที่จองไว้สำหรับรายการนี้"
        confirmLabel="ยืนยันยกเลิก"
        confirmColor="error"
        icon={<CancelIcon sx={{ fontSize: 30 }} />}
        loading={confirmLoading}
        onConfirm={executeConfirmedAction}
        onClose={() => { if (!confirmLoading) setConfirmAction(null); }}
      />

      <Snackbar
        open={!!actionError}
        autoHideDuration={4000}
        onClose={() => setActionError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError('')} sx={{ borderRadius: 2, fontWeight: 600 }}>
          {actionError}
        </Alert>
      </Snackbar>

      <Snackbar
        open={forceStatusSuccess}
        autoHideDuration={3500}
        onClose={() => setForceStatusSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setForceStatusSuccess(false)} sx={{ borderRadius: 2, fontWeight: 600 }}>
          แก้ไขสถานะการจองเรียบร้อยแล้ว
        </Alert>
      </Snackbar>

      {/* Super Admin: force-patch booking status for error correction */}
      <Dialog open={!!forceStatusBooking} onClose={() => { if (!forceStatusLoading) setForceStatusBooking(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>แก้ไขสถานะการจอง (Super Admin)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {forceStatusBooking?.course_name} • {forceStatusBooking?.child_name}
          </Typography>
          {forceStatusError && <Alert severity="error" sx={{ mb: 2 }}>{forceStatusError}</Alert>}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>สถานะ</InputLabel>
            <Select
              label="สถานะ"
              value={forceStatusValue}
              onChange={e => setForceStatusValue(e.target.value)}
            >
              <MenuItem value="pending_payment">รอจ่ายเงิน (pending_payment)</MenuItem>
              <MenuItem value="pending">รอจ่ายเงิน (pending)</MenuItem>
              <MenuItem value="confirmed">ยืนยันแล้ว (confirmed)</MenuItem>
              <MenuItem value="confirmed_paid">จ่ายเงินแล้ว (confirmed_paid)</MenuItem>
              <MenuItem value="awaiting_report">รอรายงานผล (awaiting_report)</MenuItem>
              <MenuItem value="completed">จบคลาสแล้ว (completed)</MenuItem>
              <MenuItem value="cancelled">ยกเลิกแล้ว (cancelled)</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="วันที่จอง (แก้ไขได้ถ้าจำเป็น)"
            type="datetime-local"
            fullWidth
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            value={forceScheduledAt}
            onChange={e => setForceScheduledAt(e.target.value)}
          />
          <TextField
            label="วันที่จ่ายเงิน (ถ้ามี)"
            type="datetime-local"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={forcePaidAt}
            onChange={e => setForcePaidAt(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            color="error"
            disabled={forceStatusLoading}
            onClick={() => { const b = forceStatusBooking; setForceStatusBooking(null); if (b) openDeleteBooking(b); }}
            sx={{ mr: 'auto' }}
          >
            ลบถาวร...
          </Button>
          <Button onClick={() => setForceStatusBooking(null)} disabled={forceStatusLoading}>ยกเลิก</Button>
          <Button variant="contained" color="warning" onClick={submitForceStatus} disabled={forceStatusLoading}>
            {forceStatusLoading ? <CircularProgress size={18} /> : 'บันทึก'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Super Admin: permanent hard-delete, gated behind typing the
          confirm word verbatim — this removes the row entirely (unlike
          Cancel, which keeps it as status='cancelled' for history/reporting). */}
      <Dialog open={!!deleteBookingTarget} onClose={() => { if (!deleteLoading) setDeleteBookingTarget(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบการจองถาวร (Super Admin)</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            การลบนี้ถาวรและกู้คืนไม่ได้ — ข้อมูลการจอง #{deleteBookingTarget?.id} ({deleteBookingTarget?.course_name} • {deleteBookingTarget?.child_name}) จะหายไปทั้งหมด
            ถ้าต้องการแค่ยกเลิกการจองแต่เก็บประวัติไว้ ให้ใช้ปุ่ม "ยกเลิก" แทน
          </Alert>
          {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}
          <TextField
            label={`พิมพ์ "${DELETE_CONFIRM_WORD}" เพื่อยืนยัน`}
            fullWidth
            autoFocus
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteBookingTarget(null)} disabled={deleteLoading}>ยกเลิก</Button>
          <Button
            variant="contained"
            color="error"
            onClick={submitDeleteBooking}
            disabled={deleteLoading || deleteConfirmText !== DELETE_CONFIRM_WORD}
          >
            {deleteLoading ? <CircularProgress size={18} /> : 'ลบถาวร'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BookingManagement;
