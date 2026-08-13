import { API_URL } from '../config';
import CalendarPicker from '../components/CalendarPicker';
import TimeField24 from '../components/TimeField24';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputAdornment, InputLabel, MenuItem, Paper, Radio, RadioGroup,
  FormControlLabel, FormLabel, Select, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, Avatar, Snackbar,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight,
  Add as AddIcon, Search as SearchIcon,
  HistoryEdu as ReportIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  EventNote as ClassIcon,
  MiscellaneousServices as ServiceIcon,
  MoneyOff as VoidIcon,
  QueuePlayNext as QueueIcon,
  Payments as PayIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import RecordMilestone from './RecordMilestone';
import ConfirmDialog from '../components/ConfirmDialog';
import { AddBookingDialog } from '../components/AddBookingDialog';

const API_BASE = `${API_URL}/api/v1/admin`;

// ─── shared helpers ──────────────────────────────────────────────────────────

const THAI_MONTHS       = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_DAYS         = ['อา','จ','อ','พ','พฤ','ศ','ส'];

const toISODate    = (d: Date) => d.toISOString().split('T')[0];
const addDays      = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getWeekStart = (d: Date) => { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0,0,0,0); return r; };

// ─── Booking status meta ─────────────────────────────────────────────────────

const BOOKING_STATUS: Record<string, { label: string; fgColor: string; bgColor: string }> = {
  completed:      { label: 'เสร็จสิ้น',    fgColor: '#2e7d32', bgColor: 'rgba(46,125,50,0.1)'   },
  // 'confirmed' is a legacy status (older rows only) — consolidated into
  // confirmed_paid going forward, kept here only so old rows still render
  // with a proper style instead of falling back to the unstyled default.
  confirmed:      { label: 'ชำระแล้ว',     fgColor: '#0277bd', bgColor: 'rgba(2,119,189,0.1)'   },
  confirmed_paid: { label: 'ชำระแล้ว',     fgColor: '#0277bd', bgColor: 'rgba(2,119,189,0.1)'   },
  pending:        { label: 'รอดำเนินการ',  fgColor: '#e65100', bgColor: 'rgba(230,81,0,0.1)'    },
  cancelled:      { label: 'ยกเลิก',       fgColor: '#c62828', bgColor: 'rgba(198,40,40,0.1)'   },
};
const getBkSt = (s: string) => BOOKING_STATUS[s?.toLowerCase()] ?? { label: s??'-', fgColor:'#555', bgColor:'rgba(0,0,0,0.05)' };

const BOOKING_STATUS_OPTIONS = [
  { value: 'pending',        label: 'รอดำเนินการ' },
  { value: 'confirmed_paid', label: 'ชำระแล้ว'    },
  { value: 'completed',      label: 'เสร็จสิ้น'   },
  { value: 'cancelled',      label: 'ยกเลิก'      },
];

const QUEUE_STATUS: Record<string, { label: string; fgColor: string; bgColor: string }> = {
  waiting:    { label: 'รอ',             fgColor: '#92400e', bgColor: 'rgba(245,158,11,0.1)'  },
  in_service: { label: 'กำลังบริการ',   fgColor: '#1e40af', bgColor: 'rgba(59,130,246,0.1)'  },
  completed:  { label: 'เสร็จแล้ว',     fgColor: '#166534', bgColor: 'rgba(34,197,94,0.1)'   },
  cancelled:  { label: 'ยกเลิก',        fgColor: '#991b1b', bgColor: 'rgba(239,68,68,0.1)'   },
};
const getQSt = (s: string) => QUEUE_STATUS[s?.toLowerCase()] ?? { label: s??'-', fgColor:'#555', bgColor:'rgba(0,0,0,0.05)' };

const QUEUE_STATUS_OPTIONS = [
  { value: 'waiting',    label: 'รอ'             },
  { value: 'in_service', label: 'กำลังบริการ'   },
  { value: 'completed',  label: 'เสร็จแล้ว'     },
  { value: 'cancelled',  label: 'ยกเลิก'        },
];

const TX_TYPE_LABEL: Record<string, string> = {
  guest_sale:    'ขาย (Guest)',
  class_booking: 'จองคลาส',
  topup:         'เติมคูปอง',
  package_sale:  'ขายแพ็คเกจ',
  service_sale:  'ขายบริการ',
};

// ─── STATUS_FILTERS ──────────────────────────────────────────────────────────

const BOOKING_STATUS_FILTERS = [
  { key: 'all',            label: 'ทั้งหมด'     },
  { key: 'pending',        label: 'รอดำเนินการ' },
  { key: 'confirmed_paid', label: 'ชำระแล้ว'    },
  { key: 'completed',      label: 'เสร็จสิ้น'   },
  { key: 'cancelled',      label: 'ยกเลิก'      },
];

const QUEUE_STATUS_FILTERS = [
  { key: 'all',        label: 'ทั้งหมด'       },
  { key: 'waiting',    label: 'รอ'             },
  { key: 'in_service', label: 'กำลังบริการ'   },
  { key: 'completed',  label: 'เสร็จแล้ว'     },
  { key: 'cancelled',  label: 'ยกเลิก'        },
];

// ═══════════════════════════════════════════════════════════════════════════
// SHARED DIALOGS
// ═══════════════════════════════════════════════════════════════════════════

// ── Void Transaction Dialog ──────────────────────────────────────────────────

const VoidTxDialog = ({ open, tx, onClose, onSuccess }: {
  open: boolean; tx: any; onClose: ()=>void; onSuccess: ()=>void;
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (!open) { setReason(''); setErr(''); } }, [open]);

  const handleVoid = async () => {
    if (!reason.trim()) { setErr('กรุณาระบุเหตุผล'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/transactions/${tx.id}/void`, { reason: reason.trim() });
      onSuccess();
      onClose();
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  if (!tx) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx:{ borderRadius:3 } }}>
      <DialogTitle sx={{ fontWeight:800, color:'error.main' }}>Void Transaction</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb:2 }}>
          {TX_TYPE_LABEL[tx.type]??tx.type} · ฿{Number(tx.amount||0).toLocaleString()} · {new Date(tx.created_at).toLocaleString('th-TH')}
        </Typography>
        <TextField
          label="เหตุผลที่ Void *" fullWidth multiline rows={3}
          value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="เช่น ลูกค้าขอยกเลิก, บันทึกผิด ฯลฯ"
        />
        {err && <Alert severity="error" sx={{ mt:1 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px:3, pb:2 }}>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button variant="contained" color="error" onClick={handleVoid} disabled={loading} sx={{ fontWeight:800 }}>
          {loading ? <CircularProgress size={18} color="inherit"/> : 'Void'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Booking Detail Dialog (status edit + transactions) ────────────────────────

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',        label: 'เงินสด'      },
  { value: 'transfer',    label: 'โอนเงิน'     },
  { value: 'credit_card', label: 'บัตรเครดิต'  },
  { value: 'later',       label: 'ค้างชำระ'    },
];

const BookingDetailDialog = ({ open, booking, onClose, onRefresh }: {
  open: boolean; booking: any; onClose: ()=>void; onRefresh: ()=>void;
}) => {
  const navigate = useNavigate();
  const [status, setStatus]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [txList, setTxList]         = useState<any[]>([]);
  const [txLoading, setTxLoading]   = useState(false);
  const [voidTx, setVoidTx]         = useState<any>(null);

  const loadTx = () => {
    if (!booking) return;
    setTxLoading(true);
    axios.get(`${API_BASE}/bookings/${booking.id}/transactions`)
      .then(r => setTxList(r.data.transactions ?? []))
      .catch(() => setTxList([]))
      .finally(() => setTxLoading(false));
  };

  useEffect(() => {
    if (!open || !booking) return;
    setStatus(booking.status ?? '');
    loadTx();
  }, [open, booking]);

  const handleSaveStatus = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/bookings/${booking.id}/status`, { status });
      onRefresh();
      onClose();
    } finally { setSaving(false); }
  };

  const handleGoToPOS = () => {
    sessionStorage.setItem('pos_pending_booking', JSON.stringify({
      bookingId:   booking.id,
      courseId:    booking.course_id,
      courseName:  booking.course_name,
      price:       booking.original_price ?? 0,
      childName:   booking.child_name,
      scheduledAt: booking.scheduled_at,
    }));
    onClose();
    navigate('/pos');
  };

  if (!booking) return null;
  const si = getBkSt(booking.status);
  const time = new Date(booking.scheduled_at).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
  const date = new Date(booking.scheduled_at).toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' });

  const activeTx   = txList.filter(t => !t.is_voided);
  const hasPaidTx  = activeTx.some(t => t.payment_method !== 'later');
  const hasLaterTx = activeTx.some(t => t.payment_method === 'later');
  const showPayBtn = !hasPaidTx;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx:{ borderRadius:3 } }}>
        <DialogTitle sx={{ fontWeight:800, pb:0 }}>รายละเอียดการจอง #{booking.id}</DialogTitle>
        <DialogContent sx={{ pt:2 }}>
          <Stack spacing={2.5}>
            {/* Info */}
            <Box sx={{ p:2, bgcolor:'grey.50', borderRadius:2 }}>
              <Typography fontWeight={800}>{booking.course_name}</Typography>
              <Typography variant="body2" color="text.secondary">{booking.child_name}</Typography>
              <Typography variant="body2" color="text.secondary">{date} เวลา {time} น.</Typography>
              <Stack direction="row" spacing={1} sx={{ mt:1 }} flexWrap="wrap">
                <Chip label={si.label} size="small" sx={{ fontWeight:700, bgcolor:si.bgColor, color:si.fgColor }} />
                {hasPaidTx  && <Chip label="ชำระแล้ว" size="small" color="success" sx={{ fontWeight:700 }} />}
                {hasLaterTx && !hasPaidTx && <Chip label="ค้างชำระ" size="small" color="warning" sx={{ fontWeight:700 }} />}
              </Stack>
            </Box>

            {/* Status edit */}
            <Box>
              <Typography variant="body2" fontWeight={700} sx={{ mb:1 }}>เปลี่ยนสถานะ</Typography>
              <FormControl fullWidth size="small">
                <InputLabel>สถานะ</InputLabel>
                <Select value={status} label="สถานะ" onChange={e=>setStatus(e.target.value)}>
                  {BOOKING_STATUS_OPTIONS.map(o=>(
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="contained" size="small" sx={{ mt:1, fontWeight:700 }} disabled={saving||status===booking.status} onClick={handleSaveStatus}>
                {saving ? <CircularProgress size={16} color="inherit"/> : 'บันทึกสถานะ'}
              </Button>
            </Box>

            <Divider />

            {/* Transactions */}
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb:1 }}>
                <Typography variant="body2" fontWeight={700}>การชำระเงิน</Typography>
              </Stack>

              {txLoading ? <CircularProgress size={20} /> : (
                <Stack spacing={1}>
                  {txList.map(tx => (
                    <Paper key={tx.id} variant="outlined" sx={{ p:1.5, borderRadius:2, opacity: tx.is_voided ? 0.45 : 1 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" fontWeight={700}>
                              ฿{Number(tx.amount||0).toLocaleString()}
                            </Typography>
                            <Chip
                              label={PAYMENT_METHOD_OPTIONS.find(p=>p.value===tx.payment_method)?.label ?? tx.payment_method}
                              size="small"
                              color={tx.payment_method==='later' ? 'warning' : 'success'}
                              sx={{ fontWeight:700, fontSize:'10px' }}
                            />
                            {tx.is_voided && <Chip label="VOID" size="small" color="error" sx={{ fontWeight:800, fontSize:'10px' }} />}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(tx.created_at).toLocaleString('th-TH')}
                          </Typography>
                          {tx.is_voided && (
                            <Typography variant="caption" color="error.main" sx={{ display:'block' }}>
                              เหตุผล: {tx.void_reason}
                            </Typography>
                          )}
                        </Box>
                        {!tx.is_voided && tx.payment_method !== 'later' && (
                          <Tooltip title="Void Transaction">
                            <IconButton size="small" color="error" onClick={()=>setVoidTx(tx)}>
                              <VoidIcon fontSize="small"/>
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Paper>
                  ))}

                  {/* Go-to-POS button when no paid transaction */}
                  {!txLoading && showPayBtn && (
                    <Paper variant="outlined" sx={{ p:2, borderRadius:2, borderStyle:'dashed', borderColor:'success.main', bgcolor:'rgba(34,197,94,0.04)' }}>
                      <Typography variant="body2" fontWeight={700} color="success.dark" sx={{ mb:0.5 }}>
                        {hasLaterTx ? 'ยังมียอดค้างชำระ' : 'ยังไม่ได้ชำระเงิน'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display:'block', mb:1.5 }}>
                        ฿{Number(booking.original_price ?? 0).toLocaleString()} · {booking.course_name}
                      </Typography>
                      <Button
                        variant="contained" color="success" startIcon={<PayIcon/>}
                        onClick={handleGoToPOS}
                        sx={{ fontWeight:800, borderRadius:2 }}
                      >
                        ชำระที่หน้า POS
                      </Button>
                    </Paper>
                  )}
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2 }}>
          <Button onClick={onClose} sx={{ fontWeight:700 }}>ปิด</Button>
        </DialogActions>
      </Dialog>

      <VoidTxDialog
        open={!!voidTx} tx={voidTx}
        onClose={()=>setVoidTx(null)}
        onSuccess={()=>{ setVoidTx(null); loadTx(); onRefresh(); }}
      />
    </>
  );
};

// ── Queue Item Detail Dialog ──────────────────────────────────────────────────

const QueueDetailDialog = ({ open, item, staffList, services, onClose, onRefresh }: {
  open: boolean; item: any; staffList: any[]; services: any[];
  onClose: ()=>void; onRefresh: ()=>void;
}) => {
  const [status,       setStatus]       = useState('');
  const [staffId,      setStaffId]      = useState('');
  const [notes,        setNotes]        = useState('');
  const [slotTime,     setSlotTime]     = useState('');
  const [serviceId,    setServiceId]    = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone,setCustomerPhone]= useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setStatus(item.status ?? 'waiting');
    setStaffId(item.staff_id ? String(item.staff_id) : '');
    setNotes(item.notes ?? '');
    setSlotTime(item.slot_time ?? '');
    setServiceId(item.service_id ? String(item.service_id) : '');
    setCustomerName(item.customer_name ?? '');
    setCustomerPhone(item.customer_phone ?? '');
  }, [open, item]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const svc = services.find(s=>String(s.id)===serviceId);
      await axios.patch(`${API_BASE}/queue/${item.id}`, {
        status,
        staffId:      staffId ? parseInt(staffId) : null,
        notes:        notes || null,
        slotTime:     slotTime || null,
        serviceId:    serviceId ? parseInt(serviceId) : null,
        serviceName:  svc?.name ?? null,
        customerName: customerName || null,
        customerPhone:customerPhone || null,
      });
      onRefresh();
      onClose();
    } finally { setSaving(false); }
  };

  if (!item) return null;
  const si = getQSt(item.status);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx:{ borderRadius:3 } }}>
      <DialogTitle sx={{ fontWeight:800, pb:0 }}>
        แก้ไขคิว #{item.queue_number}
        <Chip label={si.label} size="small" sx={{ ml:1.5, fontWeight:700, bgcolor:si.bgColor, color:si.fgColor }} />
      </DialogTitle>
      <DialogContent sx={{ pt:2 }}>
        <Stack spacing={2}>
          {/* Status */}
          <FormControl fullWidth size="small">
            <InputLabel>สถานะ</InputLabel>
            <Select value={status} label="สถานะ" onChange={e=>setStatus(e.target.value)}>
              {QUEUE_STATUS_OPTIONS.map(o=><MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={2}>
            <TextField label="ชื่อลูกค้า" size="small" fullWidth value={customerName} onChange={e=>setCustomerName(e.target.value)} />
            <TextField label="เบอร์โทร"   size="small" fullWidth value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} />
          </Stack>

          <Stack direction="row" spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>บริการ</InputLabel>
              <Select value={serviceId} label="บริการ" onChange={e=>setServiceId(e.target.value)}>
                <MenuItem value="">— ไม่ระบุ —</MenuItem>
                {services.map(s=><MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TimeField24 label="เวลานัด" size="small" fullWidth value={slotTime} onChange={setSlotTime} />
          </Stack>

          <FormControl fullWidth size="small">
            <InputLabel>พนักงาน</InputLabel>
            <Select value={staffId} label="พนักงาน" onChange={e=>setStaffId(e.target.value)}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {staffList.map(s=><MenuItem key={s.id} value={String(s.id)}>{s.full_name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField label="หมายเหตุ" size="small" multiline rows={2} fullWidth value={notes} onChange={e=>setNotes(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px:3, pb:2 }}>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ fontWeight:800 }}>
          {saving ? <CircularProgress size={18} color="inherit"/> : 'บันทึก'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// CLASS BOOKINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

interface Booking {
  id: number; child_id: number; branch_id: number;
  scheduled_at: string; status: string; age_group: string;
  child_name: string; course_name: string; branch_name: string;
}

// ── Booking row ──────────────────────────────────────────────────────────────

const BookingRow = ({ booking, onDetail, onComplete, onCancel, onReport }: {
  booking: Booking;
  onDetail: (b: Booking) => void;
  onComplete: (id: number) => void;
  onCancel:   (id: number) => void;
  onReport:   (b: Booking) => void;
}) => {
  const si      = getBkSt(booking.status);
  const time    = new Date(booking.scheduled_at).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
  const isActive= ['confirmed','confirmed_paid'].includes(booking.status);
  return (
    <Box sx={{ display:'flex', alignItems:'center', gap:2, p:1.5, borderRadius:2, border:'1px solid #f0f0f0', bgcolor:'white', '&:hover':{bgcolor:'#fafafa'} }}>
      <Typography variant="body2" sx={{ fontWeight:700, minWidth:52, color:'text.secondary', flexShrink:0 }}>{time} น.</Typography>
      <Box sx={{ flex:1, minWidth:0 }}>
        <Typography variant="body2" sx={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{booking.course_name}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{booking.child_name}</Typography>
      </Box>
      <Chip label={si.label} size="small" sx={{ fontWeight:700, flexShrink:0, bgcolor:si.bgColor, color:si.fgColor, border:'none' }} variant="outlined" />
      <Tooltip title="แก้ไข / ดู Transaction">
        <IconButton size="small" onClick={()=>onDetail(booking)}><EditIcon fontSize="small"/></IconButton>
      </Tooltip>
      {isActive && (
        <>
          <Tooltip title="เรียนเสร็จ"><IconButton size="small" color="success" onClick={()=>onComplete(booking.id)}><CheckCircleIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="ยกเลิก"><IconButton size="small" color="error" onClick={()=>onCancel(booking.id)}><CancelIcon fontSize="small"/></IconButton></Tooltip>
        </>
      )}
      {booking.status==='completed' && (
        <Tooltip title="กรอกรายงาน"><IconButton size="small" color="success" onClick={()=>onReport(booking)}><ReportIcon fontSize="small"/></IconButton></Tooltip>
      )}
    </Box>
  );
};

// ── Day view ─────────────────────────────────────────────────────────────────

const DayView = ({ bookings, date, onDetail, onComplete, onCancel, onReport }: {
  bookings: Booking[]; date: Date;
  onDetail:(b:Booking)=>void; onComplete:(id:number)=>void; onCancel:(id:number)=>void; onReport:(b:Booking)=>void;
}) => {
  const day = bookings.filter(b => b.scheduled_at.startsWith(toISODate(date)));
  if (day.length===0)
    return <Paper sx={{ borderRadius:3, p:6, textAlign:'center' }}><Typography color="text.secondary">ไม่มีรายการจองในวันนี้</Typography></Paper>;
  return <Paper sx={{ borderRadius:3, p:2 }}><Stack spacing={1}>{day.map(b=><BookingRow key={b.id} booking={b} onDetail={onDetail} onComplete={onComplete} onCancel={onCancel} onReport={onReport}/>)}</Stack></Paper>;
};

// ── Week view ─────────────────────────────────────────────────────────────────

const WeekView = ({ bookings, weekStart, onDetail, onReport }: {
  bookings: Booking[]; weekStart: Date;
  onDetail:(b:Booking)=>void; onReport:(b:Booking)=>void;
}) => {
  const days     = Array.from({ length:7 }, (_,i) => addDays(weekStart,i));
  const todayStr = toISODate(new Date());
  return (
    <Paper sx={{ borderRadius:3, overflow:'hidden' }}>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #eee' }}>
        {days.map((day,i) => {
          const isToday = toISODate(day)===todayStr;
          return (
            <Box key={i} sx={{ p:1.5, textAlign:'center', borderRight:i<6?'1px solid #eee':'none', bgcolor:isToday?'primary.main':'#fafafa', color:isToday?'white':'text.primary' }}>
              <Typography variant="caption" sx={{ fontWeight:700, display:'block' }}>{THAI_DAYS[day.getDay()]}</Typography>
              <Typography variant="body2" sx={{ fontWeight:900 }}>{day.getDate()}</Typography>
              <Typography variant="caption" sx={{ opacity:0.7, fontSize:'10px' }}>{THAI_MONTHS_SHORT[day.getMonth()]}</Typography>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {days.map((day,i) => {
          const dayStr = toISODate(day);
          return (
            <Box key={i} sx={{ borderRight:i<6?'1px solid #eee':'none', minHeight:180, p:0.75 }}>
              <Stack spacing={0.5}>
                {bookings.filter(b=>b.scheduled_at.startsWith(dayStr)).map(b => {
                  const si  = getBkSt(b.status);
                  const time= new Date(b.scheduled_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
                  return (
                    <Tooltip key={b.id} title={`${time} น. · ${b.course_name} · ${b.child_name}`}>
                      <Box onClick={()=>b.status==='completed'?onReport(b):onDetail(b)}
                        sx={{ px:0.75, py:0.375, borderRadius:1, bgcolor:si.bgColor, color:si.fgColor, fontSize:'11px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', '&:hover':{opacity:0.8} }}>
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

// ── Month view ────────────────────────────────────────────────────────────────

const MonthView = ({ bookings, date, onDetail, onReport }: {
  bookings: Booking[]; date: Date;
  onDetail:(b:Booking)=>void; onReport:(b:Booking)=>void;
}) => {
  const year=date.getFullYear(), month=date.getMonth();
  const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate();
  const todayStr=toISODate(new Date());
  const cells:(number|null)[]=[...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while(cells.length%7!==0) cells.push(null);
  return (
    <Paper sx={{ borderRadius:3, overflow:'hidden' }}>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', bgcolor:'#fafafa', borderBottom:'1px solid #eee' }}>
        {THAI_DAYS.map((d,i)=><Box key={d} sx={{ p:1.25, textAlign:'center', borderRight:i<6?'1px solid #eee':'none' }}><Typography variant="caption" sx={{ fontWeight:900, color:d==='อา'?'error.main':'text.secondary' }}>{d}</Typography></Box>)}
      </Box>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {cells.map((day,idx)=>{
          const dateStr=day?toISODate(new Date(year,month,day)):'';
          const isToday=dateStr===todayStr;
          const dayBk=day?bookings.filter(b=>b.scheduled_at.startsWith(dateStr)):[];
          return (
            <Box key={idx} sx={{ minHeight:100, p:0.75, borderRight:idx%7<6?'1px solid #eee':'none', borderBottom:'1px solid #eee', bgcolor:day?'white':'#fafafa' }}>
              {day&&(
                <>
                  <Box sx={{ width:22, height:22, borderRadius:'50%', mb:0.5, bgcolor:isToday?'primary.main':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Typography variant="caption" sx={{ fontWeight:800, color:isToday?'white':'text.primary', lineHeight:1 }}>{day}</Typography>
                  </Box>
                  <Stack spacing={0.25}>
                    {dayBk.slice(0,2).map(b=>{
                      const si=getBkSt(b.status);
                      return (
                        <Tooltip key={b.id} title={`${b.course_name} · ${b.child_name}`}>
                          <Box onClick={()=>b.status==='completed'?onReport(b):onDetail(b)}
                            sx={{ px:0.5, py:0.125, borderRadius:0.5, bgcolor:si.bgColor, color:si.fgColor, fontSize:'10px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                            {b.course_name}
                          </Box>
                        </Tooltip>
                      );
                    })}
                    {dayBk.length>2&&<Typography variant="caption" sx={{ fontSize:'10px', color:'text.secondary', fontWeight:700, pl:0.5 }}>+{dayBk.length-2} รายการ</Typography>}
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

// ── Class Bookings Tab ────────────────────────────────────────────────────────

const ClassBookingsTab = ({ branchId, branchName }: { branchId:number|string; branchName:string }) => {
  const [viewMode, setViewMode]   = useState<'day'|'week'|'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [loading, setLoading]     = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen]     = useState(false);
  const [detailBooking, setDetailBooking] = useState<Booking|null>(null);
  const [reportBooking, setReportBooking] = useState<Booking|null>(null);

  const { startDate, endDate, label } = useMemo(() => {
    if (viewMode==='day') {
      const d=toISODate(currentDate);
      return { startDate:d, endDate:d, label:currentDate.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) };
    }
    if (viewMode==='week') {
      const ws=getWeekStart(currentDate), we=addDays(ws,6);
      const lbl=ws.getMonth()===we.getMonth()
        ?`${ws.getDate()} – ${we.getDate()} ${THAI_MONTHS_SHORT[we.getMonth()]} ${we.getFullYear()+543}`
        :`${ws.getDate()} ${THAI_MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${THAI_MONTHS_SHORT[we.getMonth()]} ${we.getFullYear()+543}`;
      return { startDate:toISODate(ws), endDate:toISODate(we), label:lbl };
    }
    const start=new Date(currentDate.getFullYear(),currentDate.getMonth(),1);
    const end  =new Date(currentDate.getFullYear(),currentDate.getMonth()+1,0);
    return { startDate:toISODate(start), endDate:toISODate(end), label:`${THAI_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()+543}` };
  }, [viewMode, currentDate]);

  const fetchBookings = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/bookings?branchId=${branchId}&startDate=${startDate}&endDate=${endDate}`);
      if (res.data.success) setBookings(res.data.bookings??[]);
    } finally { setLoading(false); }
  }, [branchId, startDate, endDate]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const [confirmAction, setConfirmAction] = useState<{ type: 'complete' | 'cancel'; bookingId: number } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const handleComplete = (id: number) => setConfirmAction({ type: 'complete', bookingId: id });
  const handleCancel = (id: number) => setConfirmAction({ type: 'cancel', bookingId: id });

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      const path = confirmAction.type === 'complete' ? 'complete' : 'cancel';
      await axios.post(`${API_BASE}/bookings/${confirmAction.bookingId}/${path}`);
      setConfirmAction(null);
      fetchBookings();
    } catch (e: any) {
      setActionError(e.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setConfirmLoading(false);
    }
  };

  const nav = (dir:number) => setCurrentDate(prev=>{
    const d=new Date(prev);
    if (viewMode==='day')  d.setDate(d.getDate()+dir);
    else if (viewMode==='week') d.setDate(d.getDate()+dir*7);
    else d.setMonth(d.getMonth()+dir);
    return d;
  });

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return bookings;
    // 'confirmed' is a legacy alias for 'confirmed_paid' — match both so old rows aren't hidden.
    if (statusFilter === 'confirmed_paid') return bookings.filter(b => b.status === 'confirmed_paid' || b.status === 'confirmed');
    return bookings.filter(b => b.status === statusFilter);
  }, [bookings, statusFilter]);

  if (reportBooking) {
    return <RecordMilestone booking={reportBooking} onClose={()=>setReportBooking(null)} onSuccess={()=>{ setReportBooking(null); fetchBookings(); }}/>;
  }

  return (
    <Box>
      <Box sx={{ display:'flex', justifyContent:'flex-end', mb:2 }}>
        <Button variant="contained" startIcon={<AddIcon/>} onClick={()=>setAddOpen(true)} sx={{ borderRadius:3, fontWeight:800 }}>เพิ่มการจอง</Button>
      </Box>

      <Paper sx={{ p:2, mb:2, borderRadius:3 }}>
        <Stack direction={{ xs:'column', sm:'row' }} alignItems={{ sm:'center' }} justifyContent="space-between" spacing={1.5} flexWrap="wrap">
          <Stack direction="row" spacing={1} flexShrink={0}>
            <Button size="small" variant="outlined" sx={{ borderRadius:2, fontWeight:700 }} onClick={()=>{ setViewMode('day');   setCurrentDate(new Date()); }}>วันนี้</Button>
            <Button size="small" variant="outlined" sx={{ borderRadius:2, fontWeight:700 }} onClick={()=>{ setViewMode('week');  setCurrentDate(new Date()); }}>สัปดาห์นี้</Button>
            <Button size="small" variant="outlined" sx={{ borderRadius:2, fontWeight:700 }} onClick={()=>{ setViewMode('month'); setCurrentDate(new Date()); }}>เดือนนี้</Button>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex:1, justifyContent:'center' }}>
            <IconButton size="small" onClick={()=>nav(-1)}><ChevronLeft/></IconButton>
            <Typography variant="body1" sx={{ fontWeight:700, minWidth:{ xs:160, sm:220 }, textAlign:'center', px:1, whiteSpace:'nowrap' }}>{label}</Typography>
            <IconButton size="small" onClick={()=>nav(1)}><ChevronRight/></IconButton>
          </Stack>
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_,v)=>v&&setViewMode(v)} size="small" sx={{ flexShrink:0 }}>
            <ToggleButton value="day"   sx={{ fontWeight:700, px:2 }}>วัน</ToggleButton>
            <ToggleButton value="week"  sx={{ fontWeight:700, px:2 }}>สัปดาห์</ToggleButton>
            <ToggleButton value="month" sx={{ fontWeight:700, px:2 }}>เดือน</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" spacing={0.75} mt={1.5} flexWrap="wrap" alignItems="center">
          {BOOKING_STATUS_FILTERS.map(({ key, label:sl }) => {
            const active = statusFilter===key;
            const si     = key!=='all' ? getBkSt(key) : null;
            return (
              <Chip key={key} label={sl} size="small" variant={active?'filled':'outlined'} onClick={()=>setStatusFilter(key)}
                sx={{ fontWeight:700, cursor:'pointer', ...(active&&si?{ bgcolor:si.bgColor, color:si.fgColor, borderColor:si.fgColor }:{}) }}/>
            );
          })}
          <Typography variant="caption" color="text.secondary" sx={{ ml:0.5 }}>{filtered.length} รายการ</Typography>
        </Stack>
      </Paper>

      {loading
        ? <Box sx={{ display:'flex', justifyContent:'center', py:10 }}><CircularProgress/></Box>
        : viewMode==='day'  ? <DayView   bookings={filtered} date={currentDate} onDetail={setDetailBooking} onComplete={handleComplete} onCancel={handleCancel} onReport={setReportBooking}/>
        : viewMode==='week' ? <WeekView  bookings={filtered} weekStart={getWeekStart(currentDate)} onDetail={setDetailBooking} onReport={setReportBooking}/>
        :                     <MonthView bookings={filtered} date={currentDate} onDetail={setDetailBooking} onReport={setReportBooking}/>}

      <AddBookingDialog open={addOpen} onClose={()=>setAddOpen(false)} branchId={branchId} branchName={branchName} onSuccess={()=>{ setAddOpen(false); fetchBookings(); }}/>
      <BookingDetailDialog open={!!detailBooking} booking={detailBooking} onClose={()=>setDetailBooking(null)} onRefresh={fetchBookings}/>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'complete' ? 'ยืนยันว่าเรียนเสร็จสิ้น?' : 'ยืนยันการยกเลิกการจอง?'}
        description={
          confirmAction?.type === 'complete'
            ? 'ระบบจะตัดสต็อกวัสดุที่ใช้ในคลาสนี้'
            : 'ระบบจะคืนสต็อกวัสดุที่จองไว้สำหรับรายการนี้'
        }
        confirmLabel={confirmAction?.type === 'complete' ? 'ยืนยันเรียนเสร็จ' : 'ยืนยันยกเลิก'}
        confirmColor={confirmAction?.type === 'complete' ? 'success' : 'error'}
        icon={confirmAction?.type === 'complete' ? <CheckCircleIcon sx={{ fontSize: 30 }} /> : <CancelIcon sx={{ fontSize: 30 }} />}
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
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE QUEUE TAB  (calendar view)
// ═══════════════════════════════════════════════════════════════════════════

const QueueRow = ({ item, onDetail }: { item: any; onDetail:(i:any)=>void }) => {
  const si = getQSt(item.status);
  return (
    <Box sx={{ display:'flex', alignItems:'center', gap:2, p:1.5, borderRadius:2, border:'1px solid #f0f0f0', bgcolor:'white', '&:hover':{bgcolor:'#fafafa'} }}>
      <Chip label={`#${item.queue_number}`} size="small" variant="outlined" sx={{ fontWeight:800, flexShrink:0, minWidth:36 }}/>
      {item.slot_time && <Typography variant="body2" sx={{ fontWeight:700, minWidth:48, color:'text.secondary', flexShrink:0 }}>{item.slot_time.slice(0,5)} น.</Typography>}
      <Box sx={{ flex:1, minWidth:0 }}>
        <Typography variant="body2" sx={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.customer_name??'ลูกค้า'}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {item.service_name??item.service_name_ref??'ไม่ระบุบริการ'} {item.staff_name?`· ${item.staff_name}`:''}
        </Typography>
      </Box>
      <Chip label={si.label} size="small" sx={{ fontWeight:700, flexShrink:0, bgcolor:si.bgColor, color:si.fgColor, border:'none' }} variant="outlined"/>
      <Tooltip title="แก้ไข"><IconButton size="small" onClick={()=>onDetail(item)}><EditIcon fontSize="small"/></IconButton></Tooltip>
    </Box>
  );
};

const QueueDayView = ({ items, date, onDetail }: { items:any[]; date:Date; onDetail:(i:any)=>void }) => {
  const day = items.filter(i => i.slot_date===toISODate(date));
  if (day.length===0) return <Paper sx={{ borderRadius:3, p:6, textAlign:'center' }}><Typography color="text.secondary">ไม่มีคิวในวันนี้</Typography></Paper>;
  return <Paper sx={{ borderRadius:3, p:2 }}><Stack spacing={1}>{day.map(i=><QueueRow key={i.id} item={i} onDetail={onDetail}/>)}</Stack></Paper>;
};

const QueueWeekView = ({ items, weekStart, onDetail }: { items:any[]; weekStart:Date; onDetail:(i:any)=>void }) => {
  const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
  const todayStr=toISODate(new Date());
  return (
    <Paper sx={{ borderRadius:3, overflow:'hidden' }}>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #eee' }}>
        {days.map((day,i)=>{
          const isToday=toISODate(day)===todayStr;
          return <Box key={i} sx={{ p:1.5, textAlign:'center', borderRight:i<6?'1px solid #eee':'none', bgcolor:isToday?'primary.main':'#fafafa', color:isToday?'white':'text.primary' }}>
            <Typography variant="caption" sx={{ fontWeight:700, display:'block' }}>{THAI_DAYS[day.getDay()]}</Typography>
            <Typography variant="body2" sx={{ fontWeight:900 }}>{day.getDate()}</Typography>
            <Typography variant="caption" sx={{ opacity:0.7, fontSize:'10px' }}>{THAI_MONTHS_SHORT[day.getMonth()]}</Typography>
          </Box>;
        })}
      </Box>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {days.map((day,i)=>{
          const dayStr=toISODate(day);
          const dayItems=items.filter(it=>it.slot_date===dayStr);
          return <Box key={i} sx={{ borderRight:i<6?'1px solid #eee':'none', minHeight:180, p:0.75 }}>
            <Stack spacing={0.5}>
              {dayItems.map(it=>{
                const si=getQSt(it.status);
                return <Tooltip key={it.id} title={`#${it.queue_number} ${it.customer_name??''} · ${it.service_name??it.service_name_ref??''}`}>
                  <Box onClick={()=>onDetail(it)} sx={{ px:0.75, py:0.375, borderRadius:1, bgcolor:si.bgColor, color:si.fgColor, fontSize:'11px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', '&:hover':{opacity:0.8} }}>
                    {it.slot_time?it.slot_time.slice(0,5)+' ':''}{it.customer_name??'ลูกค้า'}
                  </Box>
                </Tooltip>;
              })}
            </Stack>
          </Box>;
        })}
      </Box>
    </Paper>
  );
};

const QueueMonthView = ({ items, date, onDetail }: { items:any[]; date:Date; onDetail:(i:any)=>void }) => {
  const year=date.getFullYear(), month=date.getMonth();
  const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate();
  const todayStr=toISODate(new Date());
  const cells:(number|null)[]=[...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while(cells.length%7!==0) cells.push(null);
  return (
    <Paper sx={{ borderRadius:3, overflow:'hidden' }}>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', bgcolor:'#fafafa', borderBottom:'1px solid #eee' }}>
        {THAI_DAYS.map((d,i)=><Box key={d} sx={{ p:1.25, textAlign:'center', borderRight:i<6?'1px solid #eee':'none' }}><Typography variant="caption" sx={{ fontWeight:900, color:d==='อา'?'error.main':'text.secondary' }}>{d}</Typography></Box>)}
      </Box>
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {cells.map((day,idx)=>{
          const dateStr=day?toISODate(new Date(year,month,day)):'';
          const isToday=dateStr===todayStr;
          const dayItems=day?items.filter(it=>it.slot_date===dateStr):[];
          return <Box key={idx} sx={{ minHeight:100, p:0.75, borderRight:idx%7<6?'1px solid #eee':'none', borderBottom:'1px solid #eee', bgcolor:day?'white':'#fafafa' }}>
            {day&&<>
              <Box sx={{ width:22, height:22, borderRadius:'50%', mb:0.5, bgcolor:isToday?'primary.main':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Typography variant="caption" sx={{ fontWeight:800, color:isToday?'white':'text.primary', lineHeight:1 }}>{day}</Typography>
              </Box>
              <Stack spacing={0.25}>
                {dayItems.slice(0,2).map(it=>{
                  const si=getQSt(it.status);
                  return <Tooltip key={it.id} title={`${it.customer_name??''} · ${it.service_name??''}`}>
                    <Box onClick={()=>onDetail(it)} sx={{ px:0.5, py:0.125, borderRadius:0.5, bgcolor:si.bgColor, color:si.fgColor, fontSize:'10px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                      {it.customer_name??'ลูกค้า'}
                    </Box>
                  </Tooltip>;
                })}
                {dayItems.length>2&&<Typography variant="caption" sx={{ fontSize:'10px', color:'text.secondary', fontWeight:700, pl:0.5 }}>+{dayItems.length-2} คิว</Typography>}
              </Stack>
            </>}
          </Box>;
        })}
      </Box>
    </Paper>
  );
};

const AddQueueDialog = ({ open, onClose, calendars, staffList, services, selectedCalendarId, selectedDate, onSuccess }: {
  open:boolean; onClose:()=>void; calendars:any[]; staffList:any[]; services:any[];
  selectedCalendarId:string; selectedDate:string; onSuccess:()=>void;
}) => {
  const [form, setForm] = useState({ customerName:'', customerPhone:'', serviceId:'', slotTime:'', staffId:'', notes:'' });

  useEffect(() => { if (!open) setForm({ customerName:'', customerPhone:'', serviceId:'', slotTime:'', staffId:'', notes:'' }); }, [open]);

  const handleSubmit = async () => {
    if (!form.customerName.trim() || !selectedCalendarId) return;
    const svc = services.find(s=>s.id===parseInt(form.serviceId));
    await axios.post(`${API_BASE}/queue`, {
      calendarId: parseInt(selectedCalendarId),
      slotDate: selectedDate,
      slotTime: form.slotTime||null,
      serviceId: form.serviceId?parseInt(form.serviceId):null,
      serviceName: svc?.name??null,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone||null,
      staffId: form.staffId?parseInt(form.staffId):null,
      notes: form.notes||null,
    });
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{sx:{borderRadius:3}}}>
      <DialogTitle sx={{fontWeight:800}}>เพิ่มคิวบริการ</DialogTitle>
      <Divider/>
      <DialogContent sx={{pt:2}}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField label="ชื่อลูกค้า *" size="small" fullWidth value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))}/>
            <TextField label="เบอร์โทร" size="small" fullWidth value={form.customerPhone} onChange={e=>setForm(f=>({...f,customerPhone:e.target.value}))}/>
          </Stack>
          <FormControl fullWidth size="small">
            <InputLabel>บริการ</InputLabel>
            <Select value={form.serviceId} label="บริการ" onChange={e=>setForm(f=>({...f,serviceId:e.target.value}))}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {services.map(s=><MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Stack direction="row" spacing={2}>
            <TimeField24 label="เวลานัด" size="small" fullWidth value={form.slotTime} onChange={(v)=>setForm(f=>({...f,slotTime:v}))} />
            <FormControl fullWidth size="small">
              <InputLabel>พนักงาน</InputLabel>
              <Select value={form.staffId} label="พนักงาน" onChange={e=>setForm(f=>({...f,staffId:e.target.value}))}>
                <MenuItem value="">— ไม่ระบุ —</MenuItem>
                {staffList.map(s=><MenuItem key={s.id} value={String(s.id)}>{s.full_name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <TextField label="หมายเหตุ" size="small" multiline rows={2} fullWidth value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
        </Stack>
      </DialogContent>
      <DialogActions sx={{px:3,pb:2}}>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button variant="contained" onClick={handleSubmit} sx={{fontWeight:800,borderRadius:2}}>เพิ่มคิว</Button>
      </DialogActions>
    </Dialog>
  );
};

const ServiceQueueTab = () => {
  const [viewMode, setViewMode]   = useState<'day'|'week'|'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendars, setCalendars] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [services, setServices]   = useState<any[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [items, setItems]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen]     = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const show = (msg:string) => { setSuccessMsg(msg); setTimeout(()=>setSuccessMsg(''),3000); };

  const { startDate, endDate, label, selectedDate } = useMemo(() => {
    if (viewMode==='day') {
      const d=toISODate(currentDate);
      return { startDate:d, endDate:d, selectedDate:d, label:currentDate.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) };
    }
    if (viewMode==='week') {
      const ws=getWeekStart(currentDate), we=addDays(ws,6);
      const lbl=ws.getMonth()===we.getMonth()
        ?`${ws.getDate()} – ${we.getDate()} ${THAI_MONTHS_SHORT[we.getMonth()]} ${we.getFullYear()+543}`
        :`${ws.getDate()} ${THAI_MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${THAI_MONTHS_SHORT[we.getMonth()]} ${we.getFullYear()+543}`;
      return { startDate:toISODate(ws), endDate:toISODate(we), selectedDate:toISODate(currentDate), label:lbl };
    }
    const start=new Date(currentDate.getFullYear(),currentDate.getMonth(),1);
    const end  =new Date(currentDate.getFullYear(),currentDate.getMonth()+1,0);
    return { startDate:toISODate(start), endDate:toISODate(end), selectedDate:toISODate(currentDate), label:`${THAI_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()+543}` };
  }, [viewMode, currentDate]);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/calendars`).then(r=>{
        // Every calendar — see ClassBooking, same reasoning.
        const svc=r.data.calendars??[];
        setCalendars(svc);
        if(svc.length>0) setSelectedCalendarId(String(svc[0].id));
      }),
      axios.get(`${API_BASE}/crm-users`).then(r=>setStaffList(r.data.users??[])),
      axios.get(`${API_BASE}/services`).then(r=>setServices(r.data.services??[])),
    ]);
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!selectedCalendarId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/queue?calendarId=${selectedCalendarId}&startDate=${startDate}&endDate=${endDate}`);
      setItems(res.data.items??[]);
    } finally { setLoading(false); }
  }, [selectedCalendarId, startDate, endDate]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const nav = (dir:number) => setCurrentDate(prev=>{
    const d=new Date(prev);
    if (viewMode==='day')  d.setDate(d.getDate()+dir);
    else if (viewMode==='week') d.setDate(d.getDate()+dir*7);
    else d.setMonth(d.getMonth()+dir);
    return d;
  });

  const filtered = useMemo(
    () => statusFilter==='all' ? items : items.filter(i=>i.status===statusFilter),
    [items, statusFilter],
  );

  return (
    <Box>
      {/* Controls */}
      <Paper sx={{ p:2, mb:2, borderRadius:3 }}>
        <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'center' }} justifyContent="space-between" flexWrap="wrap">
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth:180 }}>
              <InputLabel>ปฏิทินบริการ</InputLabel>
              <CalendarPicker calendars={calendars} value={selectedCalendarId} onChange={setSelectedCalendarId} label="ปฏิทินบริการ" />
            </FormControl>
          </Stack>
          <Button variant="contained" startIcon={<AddIcon/>} onClick={()=>setAddOpen(true)} sx={{ borderRadius:3, fontWeight:800, whiteSpace:'nowrap' }}>เพิ่มคิว</Button>
        </Stack>
      </Paper>

      {/* Nav toolbar */}
      <Paper sx={{ p:2, mb:2, borderRadius:3 }}>
        <Stack direction={{ xs:'column', sm:'row' }} alignItems={{ sm:'center' }} justifyContent="space-between" spacing={1.5} flexWrap="wrap">
          <Stack direction="row" spacing={1} flexShrink={0}>
            <Button size="small" variant="outlined" sx={{ borderRadius:2, fontWeight:700 }} onClick={()=>{ setViewMode('day');   setCurrentDate(new Date()); }}>วันนี้</Button>
            <Button size="small" variant="outlined" sx={{ borderRadius:2, fontWeight:700 }} onClick={()=>{ setViewMode('week');  setCurrentDate(new Date()); }}>สัปดาห์นี้</Button>
            <Button size="small" variant="outlined" sx={{ borderRadius:2, fontWeight:700 }} onClick={()=>{ setViewMode('month'); setCurrentDate(new Date()); }}>เดือนนี้</Button>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex:1, justifyContent:'center' }}>
            <IconButton size="small" onClick={()=>nav(-1)}><ChevronLeft/></IconButton>
            <Typography variant="body1" sx={{ fontWeight:700, minWidth:{ xs:160, sm:220 }, textAlign:'center', px:1, whiteSpace:'nowrap' }}>{label}</Typography>
            <IconButton size="small" onClick={()=>nav(1)}><ChevronRight/></IconButton>
          </Stack>
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_,v)=>v&&setViewMode(v)} size="small" sx={{ flexShrink:0 }}>
            <ToggleButton value="day"   sx={{ fontWeight:700, px:2 }}>วัน</ToggleButton>
            <ToggleButton value="week"  sx={{ fontWeight:700, px:2 }}>สัปดาห์</ToggleButton>
            <ToggleButton value="month" sx={{ fontWeight:700, px:2 }}>เดือน</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction="row" spacing={0.75} mt={1.5} flexWrap="wrap" alignItems="center">
          {QUEUE_STATUS_FILTERS.map(({ key, label:sl }) => {
            const active=statusFilter===key;
            const si=key!=='all'?getQSt(key):null;
            return <Chip key={key} label={sl} size="small" variant={active?'filled':'outlined'} onClick={()=>setStatusFilter(key)} sx={{ fontWeight:700, cursor:'pointer', ...(active&&si?{ bgcolor:si.bgColor, color:si.fgColor, borderColor:si.fgColor }:{}) }}/>;
          })}
          <Typography variant="caption" color="text.secondary" sx={{ ml:0.5 }}>{filtered.length} รายการ</Typography>
        </Stack>
      </Paper>

      {successMsg && <Alert severity="success" sx={{ mb:2 }}>{successMsg}</Alert>}

      {loading
        ? <Box sx={{ display:'flex', justifyContent:'center', py:10 }}><CircularProgress/></Box>
        : viewMode==='day'  ? <QueueDayView   items={filtered} date={currentDate} onDetail={setDetailItem}/>
        : viewMode==='week' ? <QueueWeekView  items={filtered} weekStart={getWeekStart(currentDate)} onDetail={setDetailItem}/>
        :                     <QueueMonthView items={filtered} date={currentDate} onDetail={setDetailItem}/>}

      <AddQueueDialog
        open={addOpen} onClose={()=>setAddOpen(false)}
        calendars={calendars} staffList={staffList} services={services}
        selectedCalendarId={selectedCalendarId} selectedDate={selectedDate}
        onSuccess={()=>{ fetchQueue(); show('เพิ่มคิวสำเร็จ'); }}
      />

      <QueueDetailDialog
        open={!!detailItem} item={detailItem}
        staffList={staffList} services={services}
        onClose={()=>setDetailItem(null)}
        onRefresh={()=>{ fetchQueue(); show('อัปเดตสำเร็จ'); }}
      />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

const POSBookingView: React.FC = () => {
  const [tab, setTab] = useState(0);

  const userJson    = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const branchId    = currentUser?.selectedBranchId;
  const branchName  = currentUser?.selectedBranchName ?? '';

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', gap:1.5, mb:3 }}>
        <QueueIcon sx={{ fontSize:32, color:'primary.main' }}/>
        <Box>
          <Typography variant="h5" fontWeight={800}>ข้อมูลการจอง</Typography>
          <Typography variant="body2" color="text.secondary">คลาสเรียนและคิวบริการ</Typography>
        </Box>
      </Box>

      <Paper sx={{ borderRadius:3, overflow:'hidden', mb:3 }}>
        <Tabs value={tab} onChange={(_,v)=>setTab(v)} sx={{ borderBottom:'1px solid', borderColor:'divider', px:2 }}>
          <Tab icon={<ClassIcon fontSize="small"/>}   iconPosition="start" label="คลาสเรียน"  sx={{ fontWeight:700, minHeight:48 }}/>
          <Tab icon={<ServiceIcon fontSize="small"/>} iconPosition="start" label="คิวบริการ"  sx={{ fontWeight:700, minHeight:48 }}/>
        </Tabs>
      </Paper>

      {tab===0 && <ClassBookingsTab branchId={branchId} branchName={branchName}/>}
      {tab===1 && <ServiceQueueTab/>}
    </Box>
  );
};

export default POSBookingView;
