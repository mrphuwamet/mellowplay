import React, { useEffect, useMemo, useRef, useState } from 'react';
import TimeField24 from './TimeField24';
import {
  Box, Typography, Paper, Chip, Button, IconButton,
  ToggleButton, ToggleButtonGroup, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControl, InputLabel, Select,
  Stack, Divider, RadioGroup, Radio, FormControlLabel, FormLabel, Alert,
  InputAdornment, CircularProgress, Checkbox,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const toISODate = (d: Date): string => d.toISOString().split('T')[0];

const formatDuration = (d: string): string => {
  if (!d) return '-';
  const [h, m] = d.split(':').map(Number);
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return h === 1 ? '1 ชม.' : `${h} ชม.`;
  return `${m} นาที`;
};

export interface Course {
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
  calendar_id?: number;
  registration_form_id?: number | null;
}

interface TimeSlot { ruleId: number; label?: string | null; startTime: string; endTime: string; maxCapacity: number; booked: number; available: number; }
interface UpcomingSlotDate { date: string; slots: TimeSlot[]; isFull: boolean; }
interface Child { id: number; name: string; }
interface Member { id: number; phone: string; first_name: string; last_name: string; children: Child[]; }
interface FamilyRosterMember { id: number; name: string; nickname: string | null; relation?: string | null; display: string; }

interface RegFormField {
  id: number;
  field_key: string;
  type: string;
  label: string;
  required: number | boolean;
  options_json?: string | null;
  config_json?: string | null;
  page_index: number;
  field_index: number;
}
interface RegForm { id: number; name: string; description?: string; fields: RegFormField[]; }

// ─── Course Detail Panel ─────────────────────────────────────────────────────
// Shared by AddBookingDialog's course picker and BookingManagement's List
// view "ดูรายละเอียดคลาส" action, so both surfaces show the same rich card.

export const CourseDetailPanel = ({ course }: { course: Course }) => {
  const [descLang, setDescLang] = useState<'th' | 'en'>('th');
  const desc = descLang === 'en' ? (course.description_en || course.description) : (course.description || course.description_en);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', gap: 1.5, p: 1.5 }}>
        {course.thumbnail_url ? (
          <Box component="img" src={course.thumbnail_url} alt={course.name}
            sx={{ width: 80, height: 80, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <Box sx={{ width: 80, height: 80, borderRadius: 1.5, flexShrink: 0, bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 900 }}>{course.name.charAt(0)}</Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.25 }}>{course.name}</Typography>
          {course.name_en && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{course.name_en}</Typography>}
          <Stack direction="row" spacing={0.75} flexWrap="wrap">
            {course.code && <Chip label={course.code} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '10px', height: 20 }} />}
            {course.category_name && <Chip label={course.category_name} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: '10px', height: 20 }} />}
          </Stack>
          <Stack direction="row" spacing={2} mt={0.75}>
            {course.duration && <Typography variant="caption" color="text.secondary">⏱ {formatDuration(course.duration)}</Typography>}
            {(course.age_min != null || course.age_max != null) && <Typography variant="caption" color="text.secondary">👶 {course.age_min ?? '?'}–{course.age_max ?? '?'} ปี</Typography>}
          </Stack>
        </Box>
      </Box>
      {desc && (
        <>
          <Divider />
          <Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>รายละเอียด</Typography>
              <ToggleButtonGroup value={descLang} exclusive onChange={(_, v) => v && setDescLang(v)} size="small">
                <ToggleButton value="th" sx={{ py: 0, px: 1, fontSize: '10px', fontWeight: 700 }}>ไทย</ToggleButton>
                <ToggleButton value="en" sx={{ py: 0, px: 1, fontSize: '10px', fontWeight: 700 }}>ENG</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div"
              sx={{ display: 'block', lineHeight: 1.6, '& p': { m: 0, mb: 0.5 } }}
              dangerouslySetInnerHTML={{ __html: desc }} />
          </Box>
        </>
      )}
    </Paper>
  );
};

// ─── Registration form fields, rendered live during Add Booking ────────────
// One section per field, mirroring what the consumer app's own
// DynamicRegistrationForm renders at submit time — a family_member_picker
// with role 'child' drives childIds directly (same as the consumer app
// skipping its own separate child-selection step), 'adult' picks from the
// account holder + family roster, everything else is a plain answer.

const RegistrationFormFields = ({
  form, answers, onChange, familyRoster, mainAccountName, customerType,
  courseId, scheduledAt, selectedChildIds, onChildSelectionChange,
  invalidFieldKey, fieldRefs,
}: {
  form: RegForm;
  answers: Record<string, any>;
  onChange: (key: string, value: any) => void;
  familyRoster: FamilyRosterMember[];
  mainAccountName: string;
  customerType: 'member' | 'guest';
  courseId?: number;
  scheduledAt?: string;
  selectedChildIds: number[];
  onChildSelectionChange: (ids: number[]) => void;
  invalidFieldKey: string | null;
  fieldRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) => {
  const [teamCounts, setTeamCounts] = useState<Record<string, Record<string, number>>>({});
  const hasTeamSelect = form.fields.some(f => f.type === 'team_select');
  useEffect(() => {
    if (!hasTeamSelect || !courseId || !scheduledAt) { setTeamCounts({}); return; }
    axios.get(`${API_BASE}/registration-forms/${form.id}/team-availability`, { params: { courseId, scheduledAt } })
      .then(res => setTeamCounts(res.data.success ? res.data.counts : {}))
      .catch(() => setTeamCounts({}));
  }, [form.id, courseId, scheduledAt, hasTeamSelect]);

  const isChildPickerField = (f: RegFormField) => {
    if (f.type !== 'family_member_picker' || customerType === 'guest') return false;
    try { return JSON.parse(f.config_json || '{}').role === 'child'; } catch { return false; }
  };

  // Keeps the child-picker field's recorded answer in sync with
  // selectedChildIds — same rationale as the consumer app's matching effect.
  useEffect(() => {
    const namesText = selectedChildIds.map(id => {
      const m = familyRoster.find(r => r.id === id);
      return m ? (m.nickname || m.name) : '';
    }).filter(Boolean).join(', ');
    const realNamesText = selectedChildIds.map(id => {
      const m = familyRoster.find(r => r.id === id);
      return m ? m.name : '';
    }).filter(Boolean).join(', ');
    for (const f of form.fields) {
      if (isChildPickerField(f) && answers[f.field_key] !== namesText) {
        onChange(f.field_key, namesText);
        onChange(`${f.field_key}__realname`, realNamesText);
        onChange(`${f.field_key}__nickname`, namesText);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildIds, familyRoster, form.id]);

  const rosterFor = (role: string | undefined) => {
    const members = familyRoster.filter(m =>
      role === 'adult' ? !!(m.relation && m.relation !== 'child') : (!m.relation || m.relation === 'child')
    );
    if (role === 'adult' && mainAccountName) {
      return [{ id: -1, name: mainAccountName, nickname: null, display: mainAccountName } as FamilyRosterMember, ...members];
    }
    return members;
  };

  const fields = [...form.fields].sort((a, b) => (a.page_index - b.page_index) || (a.field_index - b.field_index));

  return (
    <Stack spacing={2}>
      {fields.map(field => {
        if (customerType === 'guest' && field.type === 'family_member_picker') return null;

        if (field.type === 'heading') {
          return <Typography key={field.field_key} variant="subtitle2" sx={{ fontWeight: 800, pt: 1 }}>{field.label}</Typography>;
        }

        const isInvalid = field.field_key === invalidFieldKey;
        const wrap = (el: React.ReactNode) => (
          <Box key={field.field_key} ref={(node: HTMLDivElement | null) => { fieldRefs.current[field.field_key] = node; }}
            sx={isInvalid ? { border: '1px solid', borderColor: 'error.main', borderRadius: 2, p: 1 } : undefined}>
            {el}
          </Box>
        );

        const value = answers[field.field_key];
        const requiredLabel = `${field.label}${field.required ? ' *' : ''}`;

        if (field.type === 'text') {
          return wrap(<TextField fullWidth size="small" label={requiredLabel} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} />);
        }
        if (field.type === 'textarea') {
          return wrap(<TextField fullWidth size="small" multiline minRows={2} label={requiredLabel} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} />);
        }
        if (field.type === 'number') {
          return wrap(<TextField fullWidth size="small" type="number" label={requiredLabel} value={value ?? ''} onChange={e => onChange(field.field_key, e.target.value)} />);
        }
        if (field.type === 'date') {
          return wrap(<TextField fullWidth size="small" type="date" label={requiredLabel} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} InputLabelProps={{ shrink: true }} />);
        }
        if (field.type === 'select' || field.type === 'radio') {
          const options: string[] = field.options_json ? JSON.parse(field.options_json) : [];
          return wrap(
            <FormControl fullWidth size="small">
              <InputLabel>{requiredLabel}</InputLabel>
              <Select label={requiredLabel} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)}>
                <MenuItem value=""><em>ไม่ระบุ</em></MenuItem>
                {options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
              </Select>
            </FormControl>
          );
        }
        if (field.type === 'checkbox') {
          const options: string[] = field.options_json ? JSON.parse(field.options_json) : [];
          const arr: string[] = Array.isArray(value) ? value : [];
          return wrap(
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>{requiredLabel}</Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {options.map(opt => {
                  const checked = arr.includes(opt);
                  return <Chip key={opt} label={opt} size="small" clickable color={checked ? 'primary' : 'default'}
                    onClick={() => onChange(field.field_key, checked ? arr.filter(o => o !== opt) : [...arr, opt])} />;
                })}
              </Stack>
            </Box>
          );
        }
        if (field.type === 'team_select') {
          const teamOptions: { label: string; capacity: number }[] = field.options_json ? JSON.parse(field.options_json) : [];
          const counts = teamCounts[field.field_key] || {};
          return wrap(
            <FormControl fullWidth size="small">
              <InputLabel>{requiredLabel}</InputLabel>
              <Select label={requiredLabel} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)}>
                <MenuItem value=""><em>ไม่ระบุ</em></MenuItem>
                {teamOptions.map(t => {
                  const used = counts[t.label] ?? 0;
                  const remaining = Math.max(0, t.capacity - used);
                  return <MenuItem key={t.label} value={t.label} disabled={remaining <= 0 && value !== t.label}>{t.label} (เหลือ {remaining}/{t.capacity})</MenuItem>;
                })}
              </Select>
            </FormControl>
          );
        }
        if (field.type === 'family_member_picker') {
          let config: any = {};
          try { config = field.config_json ? JSON.parse(field.config_json) : {}; } catch { /* ignore malformed config */ }
          const list = rosterFor(config.role);
          const isChildPicker = isChildPickerField(field);

          const handlePick = (m: FamilyRosterMember) => {
            if (!isChildPicker) {
              onChange(field.field_key, m.display);
              onChange(`${field.field_key}__realname`, m.name);
              onChange(`${field.field_key}__nickname`, m.nickname || m.name);
              return;
            }
            const next = selectedChildIds.includes(m.id) ? selectedChildIds.filter(id => id !== m.id) : [...selectedChildIds, m.id];
            onChildSelectionChange(next);
          };

          return wrap(
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>{requiredLabel}</Typography>
              {list.length === 0 ? (
                <Alert severity="warning" sx={{ py: 0.5 }}>ไม่พบสมาชิกในครอบครัวของบัญชีนี้</Alert>
              ) : (
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {list.map(m => {
                    const selected = isChildPicker ? selectedChildIds.includes(m.id) : value === m.display;
                    return (
                      <Chip key={m.id} label={m.display} clickable size="small" color={selected ? 'primary' : 'default'}
                        variant={selected ? 'filled' : 'outlined'} onClick={() => handlePick(m)} sx={{ fontWeight: 700 }} />
                    );
                  })}
                </Stack>
              )}
            </Box>
          );
        }
        return null;
      })}
    </Stack>
  );
};

// Whether the caller needs to answer this field before submitting — a
// child-role family_member_picker always needs at least one pick regardless
// of the CRM builder's own "required" toggle (it replaces the plain child
// selector below), same rule the consumer app applies to its own step.
const fieldNeedsAnswer = (f: RegFormField, answers: Record<string, any>, selectedChildIds: number[], customerType: 'member' | 'guest') => {
  if (f.type === 'heading') return false;
  if (f.type === 'family_member_picker' && customerType === 'guest') return false;
  let isChildPicker = false;
  if (f.type === 'family_member_picker') {
    try { isChildPicker = JSON.parse(f.config_json || '{}').role === 'child'; } catch { isChildPicker = false; }
  }
  if (isChildPicker) return selectedChildIds.length === 0;
  if (!f.required) return false;
  const v = answers[f.field_key];
  if (f.type === 'checkbox') return !Array.isArray(v) || v.length === 0;
  return v == null || String(v).trim() === '';
};

// ─── Add Booking Dialog ──────────────────────────────────────────────────────
// Shared by BookingManagement's List view and POSBookingView's branch POS —
// both used to have their own near-identical, much simpler copy (course +
// single child + paid/pending only, no registration-form fields at all).
// This one mirrors what a customer sees registering themselves: multi-child
// selection (directly, or via the course's own family_member_picker form
// field), every registration-form field type, promo code, and coupon
// payment — the backend's createBooking endpoint already supported all of
// this, it just never had a CRM UI to send it.

export const AddBookingDialog = ({ open, onClose, branchId, branchName, onSuccess, courses: coursesProp }: {
  open: boolean;
  onClose: () => void;
  branchId: number | string;
  branchName: string;
  onSuccess: () => void;
  courses?: Course[];
}) => {
  const [customerType, setCustomerType] = useState<'member' | 'guest'>('member');
  const [phone, setPhone] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([]);
  const [familyRoster, setFamilyRoster] = useState<FamilyRosterMember[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [coursesOwn, setCoursesOwn] = useState<Course[]>([]);
  const courses = coursesProp ?? coursesOwn;
  useEffect(() => {
    if (coursesProp || !open) return;
    axios.get(`${API_BASE}/courses`).then(res => { if (res.data.success) setCoursesOwn(res.data.courses ?? []); }).catch(() => {});
  }, [coursesProp, open]);

  const [courseId, setCourseId] = useState('');
  const [bookingDate, setBookingDate] = useState(toISODate(new Date()));
  const [bookingTime, setBookingTime] = useState('09:00');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'confirmed_paid'>('confirmed_paid');
  const [promoCode, setPromoCode] = useState('');
  const [useCoupon, setUseCoupon] = useState(false);
  const [couponTypeId, setCouponTypeId] = useState('');
  const [couponTypes, setCouponTypes] = useState<{ id: number; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [registrationForm, setRegistrationForm] = useState<RegForm | null>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>({});
  const [invalidFieldKey, setInvalidFieldKey] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [upcomingDates, setUpcomingDates] = useState<UpcomingSlotDate[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDateObj, setSelectedDateObj] = useState<UpcomingSlotDate | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const selectedCourse = courses.find(c => String(c.id) === courseId);
  const usesSlotPicker = !!selectedCourse?.calendar_id;
  const scheduledAt = usesSlotPicker
    ? (selectedDateObj && selectedSlot ? `${selectedDateObj.date} ${selectedSlot.startTime}:00` : undefined)
    : (bookingDate && bookingTime ? `${bookingDate} ${bookingTime}:00` : undefined);

  useEffect(() => {
    if (open) axios.get(`${API_BASE}/coupon-types`).then(res => { if (res.data.success) setCouponTypes(res.data.couponTypes ?? []); }).catch(() => {});
  }, [open]);

  useEffect(() => {
    setUpcomingDates([]);
    setSelectedDateObj(null);
    setSelectedSlot(null);
    if (!selectedCourse?.calendar_id) return;
    setSlotsLoading(true);
    axios.get(`${API_BASE}/calendar-slots/upcoming`, { params: { calendarId: selectedCourse.calendar_id, branchId } })
      .then(res => {
        if (res.data.success) {
          const formatted: UpcomingSlotDate[] = res.data.upcoming.map((ud: any) => ({ ...ud, isFull: ud.slots.every((s: TimeSlot) => s.available === 0) }));
          setUpcomingDates(formatted);
          setSelectedDateObj(formatted.find((d: UpcomingSlotDate) => !d.isFull) || formatted[0] || null);
        }
      }).catch(() => {}).finally(() => setSlotsLoading(false));
  }, [selectedCourse?.calendar_id, branchId]);

  // The course's own registration form — same one a real customer would
  // fill in at checkout — fetched fresh whenever the selected course changes.
  useEffect(() => {
    setRegistrationForm(null);
    setFormAnswers({});
    setInvalidFieldKey(null);
    if (!selectedCourse?.registration_form_id) return;
    axios.get(`${API_BASE}/registration-forms/${selectedCourse.registration_form_id}`)
      .then(res => { if (res.data.success && res.data.form?.is_active) setRegistrationForm(res.data.form); })
      .catch(() => {});
  }, [selectedCourse?.registration_form_id]);

  const hasChildPickerField = !!registrationForm?.fields.some(f => {
    if (f.type !== 'family_member_picker') return false;
    try { return JSON.parse(f.config_json || '{}').role === 'child'; } catch { return false; }
  });

  const reset = () => {
    setCustomerType('member');
    setPhone('');
    setMember(null);
    setMemberError('');
    setSelectedChildIds([]);
    setFamilyRoster([]);
    setGuestName('');
    setGuestPhone('');
    setCourseId('');
    setBookingDate(toISODate(new Date()));
    setBookingTime('09:00');
    setPaymentStatus('confirmed_paid');
    setPromoCode('');
    setUseCoupon(false);
    setCouponTypeId('');
    setUpcomingDates([]);
    setSelectedDateObj(null);
    setSelectedSlot(null);
    setRegistrationForm(null);
    setFormAnswers({});
    setInvalidFieldKey(null);
    setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const searchMember = async () => {
    if (!phone.trim()) return;
    setMemberLoading(true);
    setMemberError('');
    setMember(null);
    setFamilyRoster([]);
    setSelectedChildIds([]);
    try {
      const res = await axios.post(`${API_BASE}/pos/lookup-member`, { phone: phone.trim() });
      if (res.data.success) {
        setMember(res.data.member);
        if (res.data.member.children?.length > 0) setSelectedChildIds([res.data.member.children[0].id]);
        // Family roster (adults + CRM-added members, not just bookable HD
        // children) — needed for the form's own adult/child pickers above.
        axios.get(`${API_BASE}/users/${res.data.member.id}/family-roster`)
          .then(r => setFamilyRoster(r.data.success ? r.data.roster : []))
          .catch(() => setFamilyRoster([]));
      } else {
        setMemberError('ไม่พบสมาชิกที่ใช้เบอร์นี้');
      }
    } catch {
      setMemberError('ไม่พบสมาชิกที่ใช้เบอร์นี้');
    } finally {
      setMemberLoading(false);
    }
  };

  const runSlotRefetch = () => {
    if (!selectedCourse?.calendar_id) return;
    setSlotsLoading(true);
    axios.get(`${API_BASE}/calendar-slots/upcoming`, { params: { calendarId: selectedCourse.calendar_id, branchId } })
      .then(r => {
        if (r.data.success) {
          const formatted: UpcomingSlotDate[] = r.data.upcoming.map((ud: any) => ({ ...ud, isFull: ud.slots.every((s: TimeSlot) => s.available === 0) }));
          setUpcomingDates(formatted);
          setSelectedDateObj(formatted.find((d: UpcomingSlotDate) => d.date === selectedDateObj?.date) || formatted[0] || null);
        }
      }).catch(() => {}).finally(() => setSlotsLoading(false));
  };

  const handleSubmit = async () => {
    if (!courseId) { setError('กรุณาเลือกคลาส'); return; }
    if (usesSlotPicker) {
      if (!selectedDateObj || !selectedSlot) { setError('กรุณาเลือกวันและรอบเวลา'); return; }
    } else if (!bookingDate || !bookingTime) {
      setError('กรุณาระบุวันและเวลา'); return;
    }
    if (customerType === 'member' && selectedChildIds.length === 0) { setError('กรุณาเลือกเด็กอย่างน้อย 1 คน'); return; }
    if (customerType === 'member' && useCoupon && !couponTypeId) { setError('กรุณาเลือกประเภทคูปอง'); return; }

    if (registrationForm) {
      const firstInvalid = registrationForm.fields.find(f => fieldNeedsAnswer(f, formAnswers, selectedChildIds, customerType));
      if (firstInvalid) {
        setInvalidFieldKey(firstInvalid.field_key);
        fieldRefs.current[firstInvalid.field_key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setError('กรุณากรอกข้อมูลในฟอร์มลงทะเบียนให้ครบถ้วน');
        return;
      }
    }
    setInvalidFieldKey(null);

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/bookings`, {
        isGuest: customerType === 'guest',
        childIds: customerType === 'member' ? selectedChildIds : [0],
        courseId: parseInt(courseId),
        branchId: parseInt(String(branchId)),
        scheduledAt,
        ...(usesSlotPicker && {
          calendarId: selectedCourse!.calendar_id,
          slotDate: selectedDateObj!.date,
          slotStartTime: selectedSlot!.startTime,
        }),
        status: paymentStatus,
        paymentStatus,
        ...(customerType === 'member' && useCoupon && { paymentMethod: 'coupon', couponTypeId: parseInt(couponTypeId) }),
        ...(promoCode.trim() && { promoCode: promoCode.trim() }),
        ...(customerType === 'guest' && { guestName: guestName.trim(), guestPhone: guestPhone.trim() }),
        ...(registrationForm && { formId: registrationForm.id, formAnswers }),
      });
      if (res.data.success) { reset(); onSuccess(); }
      else if (res.data.error_code === 'SLOT_FULL') {
        // Someone else took the last seat between picking and submitting —
        // clear the stale selection and refetch so the picker reflects
        // reality instead of letting staff retry the same full slot.
        setSelectedSlot(null);
        setError(res.data.message ?? 'รอบเวลานี้เต็มแล้ว กรุณาเลือกรอบเวลาอื่น');
        runSlotRefetch();
      }
      else setError(res.data.message ?? 'เกิดข้อผิดพลาด');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 0 }}>เพิ่มการลงทะเบียน</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 2 }}>
          <FormControl>
            <FormLabel sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.85rem' }}>ประเภทลูกค้า</FormLabel>
            <RadioGroup row value={customerType} onChange={e => { setCustomerType(e.target.value as 'member' | 'guest'); setMember(null); setMemberError(''); setFamilyRoster([]); setSelectedChildIds([]); }}>
              <FormControlLabel value="member" control={<Radio size="small" />} label="สมาชิกในระบบ" />
              <FormControlLabel value="guest" control={<Radio size="small" />} label="ลูกค้าทั่วไป" />
            </RadioGroup>
          </FormControl>

          {customerType === 'member' && (
            <Box>
              <TextField
                label="ค้นหาด้วยเบอร์โทร" size="small" fullWidth value={phone}
                onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchMember()}
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
                  {/* Skipped once the course's own registration form has a
                      child-role family_member_picker — that field takes
                      over child selection entirely, same as the consumer
                      app skipping its own separate child step. */}
                  {!hasChildPickerField && (
                    (member.children?.length ?? 0) > 0 ? (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>เลือกเด็ก (เลือกได้หลายคน)</Typography>
                        <Stack direction="row" flexWrap="wrap" gap={0.75}>
                          {member.children.map(c => {
                            const selected = selectedChildIds.includes(c.id);
                            return (
                              <Chip key={c.id} label={c.name} clickable size="small" color={selected ? 'primary' : 'default'}
                                variant={selected ? 'filled' : 'outlined'}
                                onClick={() => setSelectedChildIds(selected ? selectedChildIds.filter(id => id !== c.id) : [...selectedChildIds, c.id])}
                                sx={{ fontWeight: 700 }} />
                            );
                          })}
                        </Stack>
                      </Box>
                    ) : (
                      <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>สมาชิกนี้ยังไม่มีข้อมูลเด็กในระบบ</Alert>
                    )
                  )}
                </Paper>
              )}
            </Box>
          )}

          {customerType === 'guest' && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5}>
                <TextField label="ชื่อลูกค้า" size="small" fullWidth placeholder="ไม่บังคับ" value={guestName} onChange={e => setGuestName(e.target.value)} />
                <TextField label="เบอร์โทร" size="small" fullWidth placeholder="ไม่บังคับ" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} />
              </Stack>
            </Stack>
          )}

          <Divider />

          <FormControl fullWidth size="small">
            <InputLabel>เลือกคลาส *</InputLabel>
            <Select value={courseId} onChange={e => setCourseId(e.target.value)} label="เลือกคลาส *">
              {courses.map(c => (
                <MenuItem key={c.id} value={String(c.id)}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.name}</Typography>
                    {c.name_en && <Typography variant="caption" color="text.secondary">{c.name_en}</Typography>}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {courseId && selectedCourse && <CourseDetailPanel key={selectedCourse.id} course={selectedCourse} />}

          {courseId && usesSlotPicker ? (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>เลือกวันและรอบเวลา *</Typography>
              {slotsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>
              ) : upcomingDates.length === 0 ? (
                <Alert severity="warning" sx={{ py: 0.5 }}>ไม่พบรอบเวลาที่เปิดให้ลงทะเบียนในคลาสนี้ช่วง 30 วันข้างหน้า</Alert>
              ) : (
                <>
                  <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
                    {upcomingDates.map(ud => {
                      const d = new Date(`${ud.date}T00:00:00`);
                      const isSelected = selectedDateObj?.date === ud.date;
                      return (
                        <Box key={ud.date} onClick={() => { if (!ud.isFull) { setSelectedDateObj(ud); setSelectedSlot(null); } }}
                          sx={{
                            flexShrink: 0, width: 56, py: 1, textAlign: 'center', borderRadius: 2, cursor: ud.isFull ? 'not-allowed' : 'pointer',
                            bgcolor: isSelected ? 'primary.main' : '#fafafa',
                            color: isSelected ? 'white' : ud.isFull ? 'text.disabled' : 'text.primary',
                            border: '1px solid', borderColor: isSelected ? 'primary.main' : '#eee',
                            opacity: ud.isFull ? 0.5 : 1,
                          }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', fontSize: '10px' }}>{THAI_DAYS[d.getDay()]}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 900 }}>{d.getDate()}</Typography>
                          <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '9px', display: 'block' }}>{THAI_MONTHS_SHORT[d.getMonth()]}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                  {selectedDateObj && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                      {selectedDateObj.slots.map(slot => {
                        const isSelected = selectedSlot?.startTime === slot.startTime;
                        const isFull = slot.available === 0;
                        return (
                          <Chip key={slot.startTime} label={`${slot.label ? `${slot.label} (${slot.startTime})` : slot.startTime} ${isFull ? '(เต็ม)' : `(ว่าง ${slot.available})`}`}
                            clickable={!isFull} disabled={isFull} color={isSelected ? 'primary' : 'default'}
                            variant={isSelected ? 'filled' : 'outlined'} onClick={() => setSelectedSlot(slot)} sx={{ fontWeight: 700 }} />
                        );
                      })}
                    </Box>
                  )}
                </>
              )}
            </Box>
          ) : courseId ? (
            <Stack direction="row" spacing={2}>
              <TextField label="วันที่ *" type="date" size="small" sx={{ flex: 1 }} value={bookingDate} onChange={e => setBookingDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <Box sx={{ flex: 1 }}><TimeField24 label="เวลา" required size="small" fullWidth value={bookingTime} onChange={setBookingTime} /></Box>
            </Stack>
          ) : null}

          {/* The course's own registration form — same fields a customer
              would see registering themselves. */}
          {registrationForm && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5 }}>{registrationForm.name}</Typography>
                <RegistrationFormFields
                  form={registrationForm}
                  answers={formAnswers}
                  onChange={(key, v) => setFormAnswers(prev => ({ ...prev, [key]: v }))}
                  familyRoster={familyRoster}
                  mainAccountName={member ? `${member.first_name} ${member.last_name}`.trim() : ''}
                  customerType={customerType}
                  courseId={selectedCourse?.id}
                  scheduledAt={scheduledAt}
                  selectedChildIds={selectedChildIds}
                  onChildSelectionChange={setSelectedChildIds}
                  invalidFieldKey={invalidFieldKey}
                  fieldRefs={fieldRefs}
                />
              </Box>
            </>
          )}

          <Divider />

          <FormControl>
            <FormLabel sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.85rem' }}>สถานะการชำระ</FormLabel>
            <RadioGroup row value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as 'pending' | 'confirmed_paid')}>
              <FormControlLabel value="confirmed_paid" control={<Radio size="small" />} label={<Typography variant="body2" sx={{ fontWeight: 700, color: '#0277bd' }}>ชำระแล้ว</Typography>} />
              <FormControlLabel value="pending" control={<Radio size="small" />} label={<Typography variant="body2" sx={{ fontWeight: 700, color: '#e65100' }}>รอชำระ</Typography>} />
            </RadioGroup>
          </FormControl>

          <TextField label="โค้ดโปรโมชั่น" size="small" fullWidth placeholder="ไม่บังคับ" value={promoCode} onChange={e => setPromoCode(e.target.value)} />

          {customerType === 'member' && (
            <Box>
              <FormControlLabel
                control={<Checkbox size="small" checked={useCoupon} onChange={e => setUseCoupon(e.target.checked)} />}
                label={<Typography variant="body2" sx={{ fontWeight: 700 }}>ชำระด้วยคูปอง</Typography>}
              />
              {useCoupon && (
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <InputLabel>ประเภทคูปอง</InputLabel>
                  <Select label="ประเภทคูปอง" value={couponTypeId} onChange={e => setCouponTypeId(e.target.value)}>
                    {couponTypes.map(ct => <MenuItem key={ct.id} value={String(ct.id)}>{ct.name}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </Box>
          )}

          <TextField label="สาขา" size="small" value={branchName || '-'} InputProps={{ readOnly: true }} />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ fontWeight: 800, borderRadius: 2 }}>
          {submitting ? <CircularProgress size={20} color="inherit" /> : 'บันทึกการลงทะเบียน'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
