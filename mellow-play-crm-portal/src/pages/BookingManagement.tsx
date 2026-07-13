import { API_URL } from '../config';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Button, IconButton,
  ToggleButton, ToggleButtonGroup, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControl, InputLabel, Select,
  Grid, CircularProgress, Tooltip, Stack, Divider,
  RadioGroup, Radio, FormControlLabel, FormLabel, Alert, InputAdornment,
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
} from '@mui/icons-material';
import axios from 'axios';
import RecordMilestone from './RecordMilestone';

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
  confirmed:      { label: 'ยืนยัน',      color: 'primary', fgColor: '#1565c0', bgColor: 'rgba(21,101,192,0.1)' },
  confirmed_paid: { label: 'ชำระแล้ว',    color: 'info',    fgColor: '#0277bd', bgColor: 'rgba(2,119,189,0.1)' },
  pending:        { label: 'รอดำเนินการ', color: 'warning', fgColor: '#e65100', bgColor: 'rgba(230,81,0,0.1)' },
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
  { key: 'confirmed',     label: 'ยืนยัน' },
  { key: 'confirmed_paid',label: 'ชำระแล้ว' },
  { key: 'completed',     label: 'เสร็จสิ้น' },
  { key: 'cancelled',     label: 'ยกเลิก' },
];

// ─── BookingItem (row in list) ───────────────────────────────────────────────

const BookingItem = ({ booking, onReport, onComplete, onCancel }: {
  booking: Booking;
  onReport: (b: Booking) => void;
  onComplete: (id: number) => void;
  onCancel: (id: number) => void;
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
          <Tooltip title="เรียนเสร็จ — ตัดสต็อก">
            <IconButton size="small" color="success" onClick={() => onComplete(booking.id)}>
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
      {booking.status === 'completed' && (
        <Tooltip title="กรอกรายงาน">
          <IconButton size="small" color="success" onClick={() => onReport(booking)}>
            <ReportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

// ─── Day View ────────────────────────────────────────────────────────────────

const DayView = ({ bookings, date, onReport, onComplete, onCancel }: { bookings: Booking[]; date: Date; onReport: (b: Booking) => void; onComplete: (id: number) => void; onCancel: (id: number) => void }) => {
  const dayStr = toISODate(date);
  const dayBookings = bookings.filter(b => b.scheduled_at.startsWith(dayStr));
  if (dayBookings.length === 0) {
    return (
      <Paper sx={{ borderRadius: 3, p: 6, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Typography color="text.secondary">ไม่มีรายการจองในวันนี้</Typography>
      </Paper>
    );
  }
  return (
    <Paper sx={{ borderRadius: 3, p: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <Stack spacing={1}>
        {dayBookings.map(b => <BookingItem key={b.id} booking={b} onReport={onReport} onComplete={onComplete} onCancel={onCancel} />)}
      </Stack>
    </Paper>
  );
};

// ─── Week View ───────────────────────────────────────────────────────────────

const WeekView = ({ bookings, weekStart, onReport }: { bookings: Booking[]; weekStart: Date; onReport: (b: Booking) => void }) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = toISODate(new Date());

  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
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
                        onClick={() => b.status === 'completed' && onReport(b)}
                        sx={{
                          px: 0.75, py: 0.375, borderRadius: 1,
                          bgcolor: si.bgColor, color: si.fgColor,
                          fontSize: '11px', fontWeight: 700,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          cursor: b.status === 'completed' ? 'pointer' : 'default',
                          '&:hover': b.status === 'completed' ? { opacity: 0.8 } : {},
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
    <Paper sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
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
                            onClick={() => b.status === 'completed' && onReport(b)}
                            sx={{
                              px: 0.5, py: 0.125, borderRadius: 0.5,
                              bgcolor: si.bgColor, color: si.fgColor,
                              fontSize: '10px', fontWeight: 700,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              cursor: b.status === 'completed' ? 'pointer' : 'default',
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

const ListView = ({ bookings, onReport, onComplete, onCancel }: {
  bookings: Booking[];
  onReport: (b: Booking) => void;
  onComplete: (id: number) => void;
  onCancel: (id: number) => void;
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
      const childBdate = b.child_birth_date ? new Date(b.child_birth_date).toLocaleDateString('th-TH') : '-';
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
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <Typography color="text.secondary">ไม่พบรายการที่ตรงกับเงื่อนไข</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {Object.entries(grouped).map(([groupKey, items]) => (
            <Box key={groupKey}>
              {groupBy !== 'none' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '14px' }}>{groupKey}</Typography>
                  <Chip label={`${items.length} รายการ`} size="small" sx={{ fontWeight: 800, fontSize: '11px', bgcolor: 'slate.200' }} />
                </Box>
              )}
              <Paper sx={{ borderRadius: 4, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                {/* Table Header */}
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: '60px 130px 1.5fr 1fr 1fr 120px 110px',
                  bgcolor: '#f8fafc', px: 3, py: 2,
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  {['รหัส', 'วัน/เวลา', 'รายละเอียดเด็ก & ผู้ปกครอง', 'คลาสเรียน', 'สาขา', 'สถานะ', 'จัดการ'].map(h => (
                    <Typography key={h} variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '11px' }}>{h}</Typography>
                  ))}
                </Box>
                {items.map((b, idx) => {
                  const si = getStatusInfo(b.status);
                  const dt = new Date(b.scheduled_at);
                  const isActive = ['confirmed', 'confirmed_paid'].includes(b.status);
                  return (
                    <Box key={b.id} sx={{
                      display: 'grid',
                      gridTemplateColumns: '60px 130px 1.5fr 1fr 1fr 120px 110px',
                      px: 3, py: 2.25, alignItems: 'center',
                      borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      '&:hover': { bgcolor: '#f8fafc/50' },
                      transition: 'background-color 0.2s',
                    }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', fontSize: '13px' }}>
                        #{b.id}
                      </Typography>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '13px', color: 'slate.700' }}>
                          {isNaN(dt.getTime()) ? b.scheduled_at : dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          {isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                        </Typography>
                      </Box>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '14px' }}>
                            {b.child_name || '-'}
                          </Typography>
                          {b.child_nickname && (
                            <Chip 
                              label={b.child_nickname} 
                              size="small" 
                              sx={{ 
                                bgcolor: 'rgba(116, 82, 214, 0.08)', 
                                color: 'rgb(116, 82, 214)', 
                                fontWeight: 800, 
                                fontSize: '10px',
                                height: 18 
                              }} 
                            />
                          )}
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={0.5}>
                          {b.child_birth_date && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '11px' }}>
                              🎂 {new Date(b.child_birth_date).toLocaleDateString('th-TH')} ({calculateAge(b.child_birth_date)})
                            </Typography>
                          )}
                          {b.parent_name && (
                            <Typography variant="caption" sx={{ color: 'slate.500', fontWeight: 600, fontSize: '11px' }}>
                              • 👤 {b.parent_name} {b.parent_phone ? `(${b.parent_phone})` : ''}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13.5px', color: 'slate.800' }}>
                        {b.course_name || '-'}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.branch_name || '-'}
                      </Typography>
                      <Box>
                        <Chip
                          label={si.label}
                          size="small"
                          sx={{ fontWeight: 800, bgcolor: si.bgColor, color: si.fgColor, border: 'none', fontSize: '11px', px: 1 }}
                          variant="outlined"
                        />
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        {isActive && (
                          <>
                            <Tooltip title="เรียนเสร็จ">
                              <IconButton size="small" color="success" onClick={() => onComplete(b.id)}>
                                <CheckCircleIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="ยกเลิก">
                              <IconButton size="small" color="error" onClick={() => onCancel(b.id)}>
                                <CancelIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {b.status === 'completed' && (
                          <Tooltip title="กรอกรายงาน">
                            <IconButton size="small" color="success" onClick={() => onReport(b)}>
                              <ReportIcon sx={{ fontSize: 18 }} />
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
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'list'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [reportBooking, setReportBooking] = useState<Booking | null>(null);

  const userJson = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const branchId: number | string = currentUser?.selectedBranchId;
  const branchName: string = currentUser?.selectedBranchName ?? '';

  // ── date range & label based on view + currentDate ──────────────────────
  const { startDate, endDate, label } = useMemo(() => {
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
  }, [viewMode, currentDate]);

  // ── fetch ────────────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ branchId: String(branchId), startDate, endDate });
      const res = await axios.get(`${API_BASE}/bookings?${params}`);
      if (res.data.success) setBookings(res.data.bookings ?? []);
    } catch (e) {
      console.error('fetchBookings error', e);
    } finally {
      setLoading(false);
    }
  }, [branchId, startDate, endDate]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleComplete = async (bookingId: number) => {
    if (!confirm('ยืนยันว่าเรียนเสร็จสิ้น? ระบบจะตัดสต็อกวัสดุที่ใช้')) return;
    try {
      await axios.post(`${API_BASE}/bookings/${bookingId}/complete`);
      fetchBookings();
    } catch (e: any) { alert(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  const handleCancel = async (bookingId: number) => {
    if (!confirm('ยืนยันการยกเลิก? ระบบจะคืนสต็อกวัสดุที่จองไว้')) return;
    try {
      await axios.post(`${API_BASE}/bookings/${bookingId}/cancel`);
      fetchBookings();
    } catch (e: any) { alert(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  // ── filter ───────────────────────────────────────────────────────────────
  const filteredBookings = useMemo(
    () => statusFilter === 'all' ? bookings : bookings.filter(b => b.status === statusFilter),
    [bookings, statusFilter],
  );

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
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>รายการจองคลาสเรียน</Typography>
          {branchName && (
            <Typography variant="body2" color="text.secondary">สาขา {branchName}</Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
          sx={{ borderRadius: 3, fontWeight: 800 }}
        >
          เพิ่มการจอง
        </Button>
      </Box>

      {/* Toolbar */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
          spacing={1.5}
          flexWrap="wrap"
        >
          {/* Shortcuts */}
          <Stack direction="row" spacing={1} flexShrink={0}>
            <Button size="small" variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }}
              onClick={() => { setViewMode('day');   setCurrentDate(new Date()); }}>วันนี้</Button>
            <Button size="small" variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }}
              onClick={() => { setViewMode('week');  setCurrentDate(new Date()); }}>สัปดาห์นี้</Button>
            <Button size="small" variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }}
              onClick={() => { setViewMode('month'); setCurrentDate(new Date()); }}>เดือนนี้</Button>
          </Stack>

          {/* Navigator */}
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, justifyContent: 'center' }}>
            <IconButton size="small" onClick={() => navigate(-1)}><ChevronLeft /></IconButton>
            <Typography
              variant="body1"
              sx={{ fontWeight: 700, minWidth: { xs: 160, sm: 220 }, textAlign: 'center', px: 1, whiteSpace: 'nowrap' }}
            >
              {label}
            </Typography>
            <IconButton size="small" onClick={() => navigate(1)}><ChevronRight /></IconButton>
          </Stack>

          {/* View mode */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
            size="small"
            sx={{ flexShrink: 0 }}
          >
            <ToggleButton value="day"   sx={{ fontWeight: 700, px: 2 }}>วัน</ToggleButton>
            <ToggleButton value="week"  sx={{ fontWeight: 700, px: 2 }}>สัปดาห์</ToggleButton>
            <ToggleButton value="month" sx={{ fontWeight: 700, px: 2 }}>เดือน</ToggleButton>
            <ToggleButton value="list"  sx={{ fontWeight: 700, px: 2, display: 'flex', gap: 0.5 }}><ListIcon sx={{ fontSize: 16 }} />รายการ</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/* Status filter chips */}
        <Stack direction="row" spacing={0.75} mt={1.5} flexWrap="wrap" alignItems="center">
          {STATUS_FILTERS.map(({ key, label: slabel }) => {
            const active = statusFilter === key;
            const si = key !== 'all' ? getStatusInfo(key) : null;
            return (
              <Chip
                key={key}
                label={slabel}
                size="small"
                variant={active ? 'filled' : 'outlined'}
                onClick={() => setStatusFilter(key)}
                sx={{
                  fontWeight: 700, cursor: 'pointer',
                  ...(active && si
                    ? { bgcolor: si.bgColor, color: si.fgColor, borderColor: si.fgColor }
                    : {}),
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
        <DayView bookings={filteredBookings} date={currentDate} onReport={setReportBooking} onComplete={handleComplete} onCancel={handleCancel} />
      ) : viewMode === 'week' ? (
        <WeekView bookings={filteredBookings} weekStart={getWeekStart(currentDate)} onReport={setReportBooking} />
      ) : viewMode === 'list' ? (
        <ListView bookings={filteredBookings} onReport={setReportBooking} onComplete={handleComplete} onCancel={handleCancel} />
      ) : (
        <MonthView bookings={filteredBookings} date={currentDate} onReport={setReportBooking} />
      )}

      <AddBookingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        branchId={branchId}
        branchName={branchName}
        onSuccess={() => { setAddOpen(false); fetchBookings(); }}
      />
    </Box>
  );
};

export default BookingManagement;
