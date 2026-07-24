import { API_URL } from '../config';
import { formatBirthDate } from '../utils/dateFormat';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Button, IconButton,
  ToggleButton, ToggleButtonGroup, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControl, InputLabel, Select,
  Grid, CircularProgress, Tooltip, Stack, Divider,
  RadioGroup, Radio, FormControlLabel, FormLabel, Alert, InputAdornment,
  Snackbar, Switch, Menu, Avatar, OutlinedInput, Checkbox, Pagination,
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
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Cake as CakeIcon,
  Phone as PhoneIcon,
  Info as InfoIcon,
  MenuBook as CourseIcon,
  Email as EmailIcon,
  Payments as PaymentsIcon,
  EventAvailable as BookedAtIcon,
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
  course_id: number;
  branch_id: number;
  scheduled_at: string;
  status: string;
  age_group: string;
  child_name: string;
  child_nickname?: string;
  child_birth_date?: string;
  parent_name?: string;
  parent_name_en?: string;
  parent_phone?: string;
  parent_email?: string;
  course_name: string;
  branch_name: string;
  paid_at?: string;
  payment_method?: string;
  payment_status?: string;
  original_price?: number;
  notes?: string;
  created_at?: string;
  slot_date?: string;
  slot_start_time?: string;
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
  // Booking.tsx actually sends status='pending_payment' (not 'pending') for
  // every real unpaid cash booking — this key was missing, so the raw code
  // string fell straight through getStatusInfo's fallback and showed up
  // unstyled/untranslated in the list instead of a proper Thai label.
  pending_payment:{ label: 'รอชำระเงิน',   color: 'warning', fgColor: '#e65100', bgColor: 'rgba(230,81,0,0.1)' },
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

// Bookings.created_at / Transactions.created_at (the source of paid_at for
// every real payment) are D1 `DEFAULT CURRENT_TIMESTAMP` values — UTC,
// stored as "YYYY-MM-DD HH:MM:SS" with no timezone marker. Parsing that
// directly with `new Date(...)` makes the browser read the raw UTC digits
// as if they were already local time, showing every paid/booked-at time
// 7 hours early for Bangkok staff. Appending Z (after swapping in the ISO
// separator) is what actually gets the correct local wall-clock time out.
const formatUtcDateTime = (raw: string | undefined): string => {
  if (!raw) return '-';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
};

const GROUP_OPTIONS: { key: string; label: string }[] = [
  { key: 'date',           label: 'วันที่เรียน' },
  { key: 'round',          label: 'รอบเวลา' },
  { key: 'course',         label: 'คลาส' },
  { key: 'branch',         label: 'สาขา' },
  { key: 'status',         label: 'สถานะ' },
  { key: 'age_group',      label: 'กลุ่มอายุ' },
  { key: 'payment_method', label: 'ช่องทางชำระ' },
];

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'scheduled_asc',  label: 'วันเรียน (เก่า → ใหม่)' },
  { key: 'scheduled_desc', label: 'วันเรียน (ใหม่ → เก่า)' },
  { key: 'created_desc',   label: 'วันที่จอง (ใหม่ → เก่า)' },
  { key: 'created_asc',    label: 'วันที่จอง (เก่า → ใหม่)' },
  { key: 'name_asc',       label: 'ชื่อเด็ก (ก → ฮ)' },
  { key: 'name_desc',      label: 'ชื่อเด็ก (ฮ → ก)' },
  { key: 'status',         label: 'สถานะ' },
];

const getGroupValue = (b: Booking, field: string): string => {
  switch (field) {
    case 'course': return b.course_name || 'ไม่ระบุคลาส';
    case 'branch': return b.branch_name || 'ไม่ระบุสาขา';
    case 'status': return getStatusInfo(b.status).label;
    case 'age_group': return b.age_group === 'little_junior' ? 'Little Junior' : b.age_group === 'junior' ? 'Junior' : 'ไม่ระบุ';
    case 'payment_method': return b.payment_method || 'ไม่ระบุช่องทาง';
    case 'round': {
      // slot_start_time is the actual calendar-slot round the booking was
      // made against; older/extra-class bookings without one fall back to
      // the time portion of scheduled_at so they still group sensibly.
      if (b.slot_start_time) return `รอบ ${b.slot_start_time.substring(0, 5)} น.`;
      const dt = new Date(b.scheduled_at);
      return isNaN(dt.getTime()) ? 'ไม่ระบุรอบ' : `รอบ ${dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
    }
    case 'date': {
      const dateStr = b.scheduled_at?.split('T')[0] || b.scheduled_at?.split(' ')[0] || '-';
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    default: return 'ไม่ระบุ';
  }
};

interface GroupNode { key: string; items: Booking[]; children?: GroupNode[]; }

// Recursive so any number of group-by conditions can be layered — pick
// course + date and you get one course-level group per date sub-group,
// not just a single flat dimension.
const buildGroups = (items: Booking[], fields: string[]): GroupNode[] => {
  if (fields.length === 0) return [{ key: '', items }];
  const [field, ...rest] = fields;
  const map = new Map<string, Booking[]>();
  for (const b of items) {
    const key = getGroupValue(b, field);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return Array.from(map.entries()).map(([key, groupItems]) => ({
    key,
    items: groupItems,
    children: rest.length > 0 ? buildGroups(groupItems, rest) : undefined,
  }));
};

const sortBookings = (items: Booking[], sortKey: string): Booking[] => {
  const arr = [...items];
  arr.sort((a, b) => {
    switch (sortKey) {
      case 'scheduled_asc': return (a.scheduled_at || '').localeCompare(b.scheduled_at || '');
      case 'scheduled_desc': return (b.scheduled_at || '').localeCompare(a.scheduled_at || '');
      case 'created_asc': return (a.created_at || '').localeCompare(b.created_at || '');
      case 'created_desc': return (b.created_at || '').localeCompare(a.created_at || '');
      case 'name_asc': return (a.child_nickname || a.child_name || '').localeCompare(b.child_nickname || b.child_name || '', 'th');
      case 'name_desc': return (b.child_nickname || b.child_name || '').localeCompare(a.child_nickname || a.child_name || '', 'th');
      case 'status': return (a.status || '').localeCompare(b.status || '');
      default: return 0;
    }
  });
  return arr;
};

// ─── Booking Detail Dialog ───────────────────────────────────────────────────

const BookingDetailDialog = ({ booking, course, onClose, onViewCourse }: {
  booking: Booking | null;
  course?: Course;
  onClose: () => void;
  onViewCourse: () => void;
}) => {
  if (!booking) return null;
  const si = getStatusInfo(booking.status);
  const dt = new Date(booking.scheduled_at);
  const hasValidDate = !isNaN(dt.getTime());
  return (
    <Dialog open={!!booking} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        รายละเอียดการจอง #{booking.id}
        <Chip label={si.label} size="small" sx={{ fontWeight: 700, bgcolor: si.bgColor, color: si.fgColor }} />
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>คลาส</Typography>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
              <Typography sx={{ fontWeight: 700 }}>{booking.course_name || '-'}</Typography>
              {course && (
                <Button size="small" startIcon={<CourseIcon sx={{ fontSize: 16 }} />} onClick={onViewCourse} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ดูรายละเอียดคลาส
                </Button>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">{booking.branch_name || '-'}</Typography>
          </Box>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>วันเวลาเรียน</Typography>
            <Typography sx={{ fontWeight: 700 }}>
              {hasValidDate
                ? `${dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} เวลา ${dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                : '-'}
            </Typography>
          </Box>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>เด็กผู้เรียน</Typography>
            <Typography sx={{ fontWeight: 700 }}>
              {booking.child_name || '-'}{booking.child_nickname && booking.child_nickname !== booking.child_name ? ` (${booking.child_nickname})` : ''}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
              <Typography variant="body2" color="text.secondary">{formatBirthDate(booking.child_birth_date)}</Typography>
              {booking.child_birth_date && (
                <Chip icon={<CakeIcon sx={{ fontSize: '12px !important' }} />} label={calculateAge(booking.child_birth_date)} size="small" sx={{ height: 20, fontSize: '11px', fontWeight: 700 }} />
              )}
            </Stack>
          </Box>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>ผู้ปกครอง</Typography>
            <Typography sx={{ fontWeight: 700 }}>{booking.parent_name || '-'}</Typography>
            {booking.parent_name_en && (
              <Typography variant="body2" color="text.secondary">{booking.parent_name_en}</Typography>
            )}
            <Stack direction="row" spacing={0.75} alignItems="center" mt={0.25}>
              <PhoneIcon sx={{ fontSize: 13 }} color="action" />
              <Typography variant="body2">{booking.parent_phone || '-'}</Typography>
            </Stack>
            {booking.parent_email && (
              <Stack direction="row" spacing={0.75} alignItems="center" mt={0.25}>
                <EmailIcon sx={{ fontSize: 13 }} color="action" />
                <Typography variant="body2">{booking.parent_email}</Typography>
              </Stack>
            )}
          </Box>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>การชำระเงิน</Typography>
            <Typography variant="body2">ราคา: {booking.original_price != null ? `${booking.original_price.toLocaleString()} บาท` : '-'}</Typography>
            <Typography variant="body2">ช่องทาง: {booking.payment_method || '-'}</Typography>
            <Typography variant="body2">ชำระเมื่อ: {formatUtcDateTime(booking.paid_at)}</Typography>
          </Box>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>ประวัติ</Typography>
            <Typography variant="body2">วันที่จอง: {formatUtcDateTime(booking.created_at)}</Typography>
          </Box>
          {booking.notes && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>หมายเหตุ</Typography>
                <Typography variant="body2">{booking.notes}</Typography>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 700 }}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Class Detail Dialog ─────────────────────────────────────────────────────

const ClassDetailDialog = ({ course, onClose }: { course: Course | null; onClose: () => void }) => (
  <Dialog open={!!course} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ fontWeight: 800 }}>รายละเอียดคลาส</DialogTitle>
    <DialogContent>
      {course && <CourseDetailPanel key={course.id} course={course} />}
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button onClick={onClose} sx={{ fontWeight: 700 }}>ปิด</Button>
    </DialogActions>
  </Dialog>
);

const ListView = ({ bookings, onReport, onCancel, onEdit, courses }: {
  bookings: Booking[];
  onReport: (b: Booking) => void;
  onCancel: (id: number) => void;
  onEdit: (b: Booking) => void;
  courses: Course[];
}) => {
  const [search, setSearch] = useState('');
  const [groupByFields, setGroupByFields] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState('scheduled_asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [manageMenu, setManageMenu] = useState<{ anchor: HTMLElement; booking: Booking } | null>(null);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [classDetailCourse, setClassDetailCourse] = useState<Course | null>(null);
  const closeManageMenu = () => setManageMenu(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return bookings;
    const q = search.toLowerCase();
    return bookings.filter(b =>
      b.child_name?.toLowerCase().includes(q) ||
      b.child_nickname?.toLowerCase().includes(q) ||
      b.parent_name?.toLowerCase().includes(q) ||
      b.parent_name_en?.toLowerCase().includes(q) ||
      b.parent_phone?.toLowerCase().includes(q) ||
      b.parent_email?.toLowerCase().includes(q) ||
      b.course_name?.toLowerCase().includes(q) ||
      b.branch_name?.toLowerCase().includes(q) ||
      String(b.id).includes(q)
    );
  }, [bookings, search]);

  const sorted = useMemo(() => sortBookings(filtered, sortKey), [filtered, sortKey]);

  // Reset back to page 1 whenever the result set or its order would change
  // out from under whatever page the user was looking at.
  useEffect(() => { setPage(1); }, [search, sortKey, groupByFields, bookings]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  // Grouping shows the FULL filtered/sorted set (pagination and grouping
  // don't compose cleanly — see the note rendered near the pagination
  // control below), pagination only applies to the flat, ungrouped view.
  const itemsToRender = groupByFields.length > 0 ? sorted : paginated;
  const grouped = useMemo(() => buildGroups(itemsToRender, groupByFields), [itemsToRender, groupByFields]);

  const courseMap = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);

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
      'ชื่อผู้ปกครอง (English)',
      'เบอร์โทรผู้ปกครอง',
      'อีเมลผู้ปกครอง',
      'สาขา',
      'สถานะ',
      'วันที่จอง',
      'วันที่รับชำระเงิน',
      'ช่องทางชำระเงิน'
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
        `"${b.parent_name_en || '-'}"`,
        `"${formatPhone(b.parent_phone)}"`,
        `"${b.parent_email || '-'}"`,
        `"${b.branch_name || ''}"`,
        `"${status}"`,
        `"${formatUtcDateTime(b.created_at)}"`,
        `"${formatUtcDateTime(b.paid_at)}"`,
        `"${b.payment_method || '-'}"`
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

  const renderBookingCard = (b: Booking) => {
    const si = getStatusInfo(b.status);
    const dt = new Date(b.scheduled_at);
    const hasValidDate = !isNaN(dt.getTime());
    const hasRealName = b.child_nickname && b.child_name && b.child_nickname !== b.child_name;
    return (
      <Paper
        key={b.id}
        variant="outlined"
        sx={{
          borderRadius: 3, borderColor: '#eef0f3', overflow: 'hidden',
          display: 'flex', alignItems: 'stretch',
          transition: 'box-shadow 0.15s, transform 0.15s',
          '&:hover': { boxShadow: '0 4px 16px 0 rgba(0,0,0,0.06)' },
        }}
      >
        {/* Status accent — the whole row's state at a glance */}
        <Box sx={{ width: 5, flexShrink: 0, bgcolor: si.fgColor }} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
            {/* Date block */}
            <Box sx={{
              flexShrink: 0, width: 64, textAlign: 'center', py: 0.75, borderRadius: 2,
              bgcolor: '#f8fafc', border: '1px solid #eef0f3',
            }}>
              <Typography sx={{ fontSize: '10px', fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', lineHeight: 1.2 }}>
                {hasValidDate ? dt.toLocaleDateString('th-TH', { month: 'short' }) : '-'}
              </Typography>
              <Typography sx={{ fontSize: '20px', fontWeight: 900, color: 'text.primary', lineHeight: 1.1 }}>
                {hasValidDate ? dt.getDate() : '?'}
              </Typography>
              <Typography sx={{ fontSize: '10.5px', fontWeight: 700, color: 'text.secondary' }}>
                {hasValidDate ? dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}
              </Typography>
            </Box>

            {/* Child + parent — nickname leads, but the real first+last name
                (and the parent's full name) stay visible right here instead
                of being hidden behind a click. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 220, flex: '1 1 220px' }}>
              <Avatar sx={{ width: 38, height: 38, bgcolor: 'rgba(116, 82, 214, 0.12)', color: 'rgb(116, 82, 214)', fontWeight: 800, fontSize: '15px' }}>
                {(b.child_nickname || b.child_name || '?').charAt(0)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography sx={{ fontWeight: 800, fontSize: '15px', color: 'text.primary' }} noWrap>
                    {b.child_nickname || b.child_name || '-'}
                  </Typography>
                  {b.child_birth_date && (
                    <Chip
                      icon={<CakeIcon sx={{ fontSize: '12px !important' }} />}
                      label={calculateAge(b.child_birth_date)}
                      size="small"
                      sx={{ height: 18, fontSize: '10px', fontWeight: 700, bgcolor: '#f1f5f9' }}
                    />
                  )}
                </Stack>
                {hasRealName && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 600 }} noWrap>
                    {b.child_name}
                  </Typography>
                )}
                {b.parent_name && (
                  <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.4, color: 'text.secondary', fontWeight: 600 }}>
                    <PhoneIcon sx={{ fontSize: 11 }} />
                    {b.parent_name}{b.parent_phone ? ` · ${b.parent_phone}` : ''}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Class + branch */}
            <Box sx={{ minWidth: 160, flex: '2 1 220px' }}>
              <Typography sx={{ fontWeight: 700, fontSize: '14px', color: 'text.primary' }} noWrap>
                {b.course_name || '-'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                #{b.id} · {b.branch_name || '-'}
              </Typography>
            </Box>

            {/* Status */}
            <Chip
              label={si.label}
              size="small"
              sx={{ fontWeight: 700, bgcolor: si.bgColor, color: si.fgColor, border: 'none', fontSize: '12px', px: 1, height: 26, flexShrink: 0 }}
            />

            {/* One manage button instead of 2-3 competing ones */}
            <IconButton
              size="small"
              onClick={(e) => setManageMenu({ anchor: e.currentTarget, booking: b })}
              sx={{ ml: 'auto', flexShrink: 0 }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Booked-at / paid-at — the two timestamps this list was missing */}
          {(b.created_at || b.paid_at) && (
            <Box sx={{ px: 2, pb: 1.5, mt: -0.5, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {b.created_at && (
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontWeight: 600 }}>
                  <BookedAtIcon sx={{ fontSize: 13 }} />
                  วันที่จอง {formatUtcDateTime(b.created_at)}
                </Typography>
              )}
              {b.paid_at && (
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#2e7d32', fontWeight: 700 }}>
                  <PaymentsIcon sx={{ fontSize: 13 }} />
                  ชำระ {formatUtcDateTime(b.paid_at)}{b.payment_method ? ` · ${b.payment_method}` : ''}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    );
  };

  const renderGroup = (node: GroupNode, depth: number): React.ReactNode => (
    <Box key={`${depth}-${node.key}`} sx={{ pl: depth * 2.5 }}>
      {node.key && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, mt: depth > 0 ? 2.5 : 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', fontSize: depth === 0 ? '15px' : '13.5px' }}>{node.key}</Typography>
          <Chip label={`${node.items.length} รายการ`} size="small" sx={{ fontWeight: 700, fontSize: '12px', bgcolor: '#eef1f5' }} />
        </Box>
      )}
      {node.children ? (
        <Stack spacing={2}>{node.children.map(child => renderGroup(child, depth + 1))}</Stack>
      ) : (
        <Stack spacing={1.25}>{node.items.map(renderBookingCard)}</Stack>
      )}
    </Box>
  );

  return (
    <Box>
      {/* Filter — search, multi-condition group-by, sort, and export live in
          one card so they read as a single filter component instead of
          stray floating controls. */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3, borderColor: '#eef0f3' }}>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField
            size="small"
            placeholder="ค้นหา ชื่อเด็ก, ชื่อเล่น, ผู้ปกครอง, เบอร์โทร, อีเมล, คลาส..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
            sx={{ flex: '1 1 220px', '& .MuiOutlinedInput-root': { borderRadius: 2, fontWeight: 600 } }}
          />
          <FormControl size="small" sx={{ minWidth: 220, flex: '1 1 220px' }}>
            <InputLabel sx={{ fontWeight: 700 }}>จัดกลุ่มตาม</InputLabel>
            <Select
              multiple
              value={groupByFields}
              onChange={e => setGroupByFields(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value as string[])}
              input={<OutlinedInput label="จัดกลุ่มตาม" />}
              renderValue={(selected) => (selected as string[]).length === 0
                ? 'ไม่จัดกลุ่ม'
                : (selected as string[]).map(k => GROUP_OPTIONS.find(g => g.key === k)?.label ?? k).join(' › ')}
              sx={{ borderRadius: 2, fontWeight: 700 }}
            >
              {GROUP_OPTIONS.map(opt => (
                <MenuItem key={opt.key} value={opt.key} sx={{ fontWeight: 700 }}>
                  <Checkbox checked={groupByFields.includes(opt.key)} size="small" sx={{ p: 0.5, mr: 0.5 }} />
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200, flex: '1 1 200px' }}>
            <InputLabel sx={{ fontWeight: 700 }}>เรียงลำดับ</InputLabel>
            <Select value={sortKey} onChange={e => setSortKey(e.target.value)} label="เรียงลำดับ" sx={{ borderRadius: 2, fontWeight: 700 }}>
              {SORT_OPTIONS.map(opt => <MenuItem key={opt.key} value={opt.key} sx={{ fontWeight: 700 }}>{opt.label}</MenuItem>)}
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
      </Paper>

      {/* List — a scannable card per booking instead of a dense table row.
          Each card leads with a big date block and a colored status
          accent (read the whole row's status at a glance without reading
          the pill text), and every action collapses into one "จัดการ"
          menu instead of 2-3 competing buttons. No horizontal scroll,
          no pinned column — everything a card needs just wraps. */}
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
        <>
          <Stack spacing={2.5}>
            {grouped.map(node => renderGroup(node, 0))}
          </Stack>

          {/* Pagination — only meaningful against the flat, ungrouped list;
              grouping shows every matching row across all groups instead
              (see the note below), so the two features don't compose. */}
          {groupByFields.length === 0 ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mt: 2.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                แสดง {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sorted.length)} จาก {sorted.length} รายการ
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 110 }}>
                  <Select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} sx={{ fontWeight: 700, borderRadius: 2 }}>
                    {[10, 25, 50, 100].map(n => <MenuItem key={n} value={n} sx={{ fontWeight: 700 }}>{n} / หน้า</MenuItem>)}
                  </Select>
                </FormControl>
                <Pagination count={pageCount} page={page} onChange={(_, p) => setPage(p)} color="primary" shape="rounded" size="small" />
              </Stack>
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontWeight: 600 }}>
              แสดงทั้งหมด {sorted.length} รายการ (การแบ่งหน้าใช้ไม่ได้ขณะจัดกลุ่ม)
            </Typography>
          )}
        </>
      )}

      {/* Manage menu — replaces the old row of 2-3 separate buttons */}
      <Menu anchorEl={manageMenu?.anchor} open={!!manageMenu} onClose={closeManageMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { if (manageMenu) setDetailBooking(manageMenu.booking); closeManageMenu(); }} sx={{ gap: 1.25, fontWeight: 600 }}>
          <InfoIcon fontSize="small" color="action" />
          ดูรายละเอียด
        </MenuItem>
        <MenuItem
          onClick={() => { const c = manageMenu ? courseMap.get(manageMenu.booking.course_id) : undefined; if (c) setClassDetailCourse(c); closeManageMenu(); }}
          disabled={!manageMenu || !courseMap.get(manageMenu.booking.course_id)}
          sx={{ gap: 1.25, fontWeight: 600 }}
        >
          <CourseIcon fontSize="small" color="action" />
          ดูรายละเอียดคลาส
        </MenuItem>
        <Divider />
        {manageMenu && ['completed', 'awaiting_report'].includes(manageMenu.booking.status) && (
          <MenuItem onClick={() => { onReport(manageMenu.booking); closeManageMenu(); }} sx={{ gap: 1.25, fontWeight: 600 }}>
            <ReportIcon fontSize="small" color={manageMenu.booking.status === 'awaiting_report' ? 'warning' : 'success'} />
            กรอกรายงาน
          </MenuItem>
        )}
        <MenuItem onClick={() => { if (manageMenu) onEdit(manageMenu.booking); closeManageMenu(); }} sx={{ gap: 1.25, fontWeight: 600 }}>
          <EditIcon fontSize="small" color="primary" />
          แก้ไข
        </MenuItem>
        {manageMenu && ['confirmed', 'confirmed_paid'].includes(manageMenu.booking.status) && (
          <MenuItem onClick={() => { onCancel(manageMenu.booking.id); closeManageMenu(); }} sx={{ gap: 1.25, fontWeight: 600, color: 'error.main' }}>
            <CancelIcon fontSize="small" color="error" />
            ยกเลิก
          </MenuItem>
        )}
      </Menu>

      <BookingDetailDialog
        booking={detailBooking}
        course={detailBooking ? courseMap.get(detailBooking.course_id) : undefined}
        onClose={() => setDetailBooking(null)}
        onViewCourse={() => {
          const c = detailBooking ? courseMap.get(detailBooking.course_id) : undefined;
          if (c) setClassDetailCourse(c);
        }}
      />
      <ClassDetailDialog course={classDetailCourse} onClose={() => setClassDetailCourse(null)} />
    </Box>
  );
};

// ─── Course Detail Panel ─────────────────────────────────────────────────────
// Shared between AddBookingDialog's course picker and the List view's "ดู
// รายละเอียดคลาส" action, so both surfaces show the exact same rich course
// card (thumbnail, code/category chips, duration/age, bilingual description).

const CourseDetailPanel = ({ course }: { course: Course }) => {
  const [descLang, setDescLang] = useState<'th' | 'en'>('th');
  const desc = descLang === 'en' ? (course.description_en || course.description) : (course.description || course.description_en);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Thumbnail + meta */}
      <Box sx={{ display: 'flex', gap: 1.5, p: 1.5 }}>
        {course.thumbnail_url ? (
          <Box
            component="img"
            src={course.thumbnail_url}
            alt={course.name}
            sx={{ width: 80, height: 80, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <Box sx={{
            width: 80, height: 80, borderRadius: 1.5, flexShrink: 0,
            bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 900 }}>
              {course.name.charAt(0)}
            </Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.25 }}>{course.name}</Typography>
          {course.name_en && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{course.name_en}</Typography>
          )}
          <Stack direction="row" spacing={0.75} flexWrap="wrap">
            {course.code && (
              <Chip label={course.code} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '10px', height: 20 }} />
            )}
            {course.category_name && (
              <Chip label={course.category_name} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: '10px', height: 20 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={2} mt={0.75}>
            {course.duration && (
              <Typography variant="caption" color="text.secondary">
                ⏱ {formatDuration(course.duration)}
              </Typography>
            )}
            {(course.age_min != null || course.age_max != null) && (
              <Typography variant="caption" color="text.secondary">
                👶 {course.age_min ?? '?'}–{course.age_max ?? '?'} ปี
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
};

// ─── Add Booking Dialog ──────────────────────────────────────────────────────

const AddBookingDialog = ({ open, onClose, branchId, branchName, onSuccess, courses }: {
  open: boolean;
  onClose: () => void;
  branchId: number | string;
  branchName: string;
  onSuccess: () => void;
  courses: Course[];
}) => {
  const [customerType, setCustomerType] = useState<'member' | 'guest'>('member');
  const [phone, setPhone] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [courseId, setCourseId] = useState('');
  const [bookingDate, setBookingDate] = useState(toISODate(new Date()));
  const [bookingTime, setBookingTime] = useState('09:00');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'confirmed_paid'>('confirmed_paid');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
              onChange={e => setCourseId(e.target.value)}
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
            return c ? <CourseDetailPanel key={c.id} course={c} /> : null;
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
  const [courses, setCourses] = useState<Course[]>([]);

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
    // Fetched once here (not just when AddBookingDialog opens) so the List
    // view's "ดูรายละเอียดคลาส" action has full course info (description,
    // thumbnail, age range) ready without an extra round trip per click.
    axios.get(`${API_BASE}/courses`).then(res => {
      if (res.data.success) setCourses(res.data.courses ?? []);
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
      pending: (counts['pending'] || 0) + (counts['pending_payment'] || 0),
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

  // Also the entry point for the List view's unified "แก้ไข" button (every
  // role, not just Super Admin) — defaults the status dropdown/toggle to
  // the booking's actual current status so opening this to just reschedule
  // a class time can't silently change its status as a side effect.
  const openForceStatus = (b: Booking) => {
    setForceStatusBooking(b);
    setForceStatusValue(b.status);
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
    // Real unpaid bookings are created with status='pending_payment' (see
    // Booking.tsx), not 'pending' — match both under the same filter tab.
    if (statusFilter === 'pending') return bookings.filter(b => b.status === 'pending' || b.status === 'pending_payment');
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
        <ListView bookings={filteredBookings} onReport={setReportBooking} onCancel={handleCancel} onEdit={openForceStatus} courses={courses} />
      ) : (
        <MonthView bookings={filteredBookings} date={currentDate} onReport={setReportBooking} />
      )}

      <AddBookingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        branchId={selectedBranchId !== 'all' ? selectedBranchId : ownBranchId}
        branchName={selectedBranchId !== 'all' ? branchName : ownBranchName}
        onSuccess={() => { setAddOpen(false); fetchBookings(); }}
        courses={courses}
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

      {/* Edit dialog — Super Admin gets full status control (error
          correction) + payment-time override + hard-delete; every other
          role gets just a reschedule field (change to a different
          class round/time) plus a simple "mark complete" toggle, replacing
          what used to be a separate one-click Complete button. */}
      <Dialog open={!!forceStatusBooking} onClose={() => { if (!forceStatusLoading) setForceStatusBooking(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{isSuperAdmin ? 'แก้ไขการจอง (Super Admin)' : 'แก้ไขการจอง'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {forceStatusBooking?.course_name} • {forceStatusBooking?.child_name}
          </Typography>
          {forceStatusError && <Alert severity="error" sx={{ mb: 2 }}>{forceStatusError}</Alert>}
          {isSuperAdmin ? (
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
          ) : (
            ['confirmed', 'confirmed_paid'].includes(forceStatusBooking?.status || '') && (
              <FormControlLabel
                sx={{ mb: 2, ml: 0 }}
                control={
                  <Switch
                    checked={forceStatusValue === 'awaiting_report'}
                    onChange={e => setForceStatusValue(e.target.checked ? 'awaiting_report' : (forceStatusBooking?.status || 'confirmed_paid'))}
                  />
                }
                label="ทำเครื่องหมายว่าเรียนเสร็จแล้ว (รอกรอกรายงาน)"
              />
            )
          )}
          <TextField
            label="วันที่และเวลาเรียน (เปลี่ยนรอบเรียนได้ที่นี่)"
            type="datetime-local"
            fullWidth
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            value={forceScheduledAt}
            onChange={e => setForceScheduledAt(e.target.value)}
          />
          {isSuperAdmin && (
            <TextField
              label="วันที่จ่ายเงิน (ถ้ามี)"
              type="datetime-local"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={forcePaidAt}
              onChange={e => setForcePaidAt(e.target.value)}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {isSuperAdmin && (
          <Button
            color="error"
            disabled={forceStatusLoading}
            onClick={() => { const b = forceStatusBooking; setForceStatusBooking(null); if (b) openDeleteBooking(b); }}
            sx={{ mr: 'auto' }}
          >
            ลบถาวร...
          </Button>
          )}
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
