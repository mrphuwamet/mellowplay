import { API_URL } from '../config';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { Sms as SmsIcon, Visibility as ViewIcon, Person as ProfileIcon } from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

const BUILTIN_SMS_VARIABLES: { key: string; label: string }[] = [
  { key: 'child_name', label: 'ชื่อเด็ก (อัตโนมัติ)' },
  { key: 'child_real_name', label: 'ชื่อจริงเด็ก' },
  { key: 'child_nickname', label: 'ชื่อเล่นเด็ก' },
  { key: 'parent_name', label: 'ชื่อผู้ปกครอง (อัตโนมัติ)' },
  { key: 'parent_real_name', label: 'ชื่อจริงผู้ปกครอง' },
  { key: 'parent_nickname', label: 'ชื่อเล่นผู้ปกครอง' },
  { key: 'course_name', label: 'ชื่อคอร์ส/กิจกรรม' },
  { key: 'branch_name', label: 'สาขา' },
  { key: 'scheduled_at', label: 'วันเวลานัดหมาย' },
];

const THAI_MONTHS_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Mirrors smsTemplateService.ts's formatThaiDateTime on the backend — kept
// in sync manually since this is a separate frontend app.
function formatThaiDateTime(raw: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(raw || '');
  if (!match) return raw || '';
  const [, y, m, d, hh, mm] = match;
  const buddhistYear = parseInt(y, 10) + 543;
  const monthAbbr = THAI_MONTHS_ABBR[parseInt(m, 10) - 1] || m;
  return `วันที่ ${parseInt(d, 10)} ${monthAbbr} ${buddhistYear} เวลา ${hh}:${mm}น.`;
}

// Mirrors smsTemplateService.ts's renderSmsTemplate — used for the client-
// side Preview dialogs so a preview doesn't need its own backend round-trip.
function renderSmsTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}

// Same name-variable shape as smsTemplateService.ts's buildNameVariables.
function buildNameVariables(row: Partial<ReminderCandidate>): Record<string, string> {
  return {
    child_name: row.child_name ?? '',
    child_real_name: row.child_real_name ?? '',
    child_nickname: row.child_nickname || row.child_real_name || '',
    parent_name: row.parent_name ?? '',
    parent_real_name: row.parent_real_name ?? '',
    parent_nickname: row.parent_nickname || row.parent_real_name || '',
  };
}

interface CourseOption {
  id: number;
  name: string;
  registration_form_id?: number | null;
  sms_reminder_template?: string | null;
}

interface ReminderCandidate {
  booking_id: number;
  course_id: number;
  scheduled_at: string;
  status: string;
  child_name: string;
  child_real_name?: string;
  child_nickname?: string;
  parent_name: string;
  parent_real_name?: string;
  parent_nickname?: string;
  parent_user_id?: number;
  phone: string;
  course_name: string;
  branch_name: string | null;
}

interface SendResult { sent: number; failed: number; results: { bookingId: number; ok: boolean; detail?: string }[] }

const SmsNotifications: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    axios.get(`${API_BASE}/courses`).then(res => { if (res.data.success) setCourses(res.data.courses); });
    axios.get(`${API_BASE}/branches`).then(res => { if (res.data.success) setBranches(res.data.branches); });
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <SmsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>ส่ง SMS แจ้งเตือน</Typography>
          <Typography variant="body2" color="text.secondary">แจ้งเตือนล่วงหน้าแบบเลือกเอง ดูสมาชิกที่ยังไม่สมัคร และส่ง Confirm ย้อนหลัง</Typography>
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="ส่งแจ้งเตือนล่วงหน้า" />
          <Tab label="สมาชิกที่ยังไม่สมัคร" />
          <Tab label="ส่ง Confirm ย้อนหลัง" />
        </Tabs>
      </Box>

      {tab === 0 && <ReminderTab courses={courses} branches={branches} />}
      {tab === 1 && <NonRegisteredTab courses={courses} />}
      {tab === 2 && <ResendTab courses={courses} />}
    </Box>
  );
};

// Shared filter + recipient table used by both the reminder and resend tabs
// — same shape, different candidate endpoint and action button.
function RecipientTable({
  rows, selected, onToggle, onToggleAll,
}: {
  rows: ReminderCandidate[];
  selected: Set<number>;
  onToggle: (bookingId: number) => void;
  onToggleAll: () => void;
}) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                indeterminate={selected.size > 0 && selected.size < rows.length}
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={onToggleAll}
              />
            </TableCell>
            <TableCell>เด็ก</TableCell>
            <TableCell>ผู้ปกครอง</TableCell>
            <TableCell>เบอร์โทร</TableCell>
            <TableCell>คอร์ส/กิจกรรม</TableCell>
            <TableCell>สาขา</TableCell>
            <TableCell>วันเวลา</TableCell>
            <TableCell align="right">&nbsp;</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.booking_id} hover selected={selected.has(row.booking_id)}>
              <TableCell padding="checkbox">
                <Checkbox checked={selected.has(row.booking_id)} onChange={() => onToggle(row.booking_id)} />
              </TableCell>
              <TableCell>{row.child_name}</TableCell>
              <TableCell>{row.parent_name}</TableCell>
              <TableCell>{row.phone}</TableCell>
              <TableCell>{row.course_name}</TableCell>
              <TableCell>{row.branch_name || '-'}</TableCell>
              <TableCell>{formatThaiDateTime(row.scheduled_at)}</TableCell>
              <TableCell align="right">
                <Tooltip title="ดูรายละเอียดการจอง">
                  <IconButton size="small" onClick={() => window.open(`/crm/bookings?bookingId=${row.booking_id}`, '_blank')}>
                    <ViewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {row.parent_user_id && (
                  <Tooltip title="ดูโปรไฟล์ผู้ปกครอง">
                    <IconButton size="small" onClick={() => window.open(`/crm/parents?openUserId=${row.parent_user_id}`, '_blank')}>
                      <ProfileIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>ไม่พบข้อมูล — ลองค้นหาด้วยตัวกรองด้านบน</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Renders the template against real recipient data if one is given
// (sourceLabel describes whose data was used), or generic sample data as a
// fallback — e.g. before anything is selected yet, or in the course editor
// where there's no specific booking to preview against. Any {{form_field}}
// token with no matching sample value is left as-is, same as a real send.
function PreviewDialog({
  open, onClose, template, variables, sourceLabel,
}: { open: boolean; onClose: () => void; template: string; variables: Record<string, string>; sourceLabel: string }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Preview ข้อความ SMS</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>{sourceLabel}</Typography>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.50', whiteSpace: 'pre-wrap', fontSize: 14 }}>
          {template.trim() ? renderSmsTemplate(template, variables) : <Typography color="text.disabled">(ยังไม่ได้กรอกข้อความ)</Typography>}
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}

const SAMPLE_PREVIEW_VARIABLES: Record<string, string> = {
  child_name: 'น้องเอ๋', child_real_name: 'ธนกร ตัวอย่าง', child_nickname: 'น้องเอ๋',
  parent_name: 'สมชาย ตัวอย่าง', parent_real_name: 'สมชาย ตัวอย่าง', parent_nickname: 'พี่หนึ่ง',
  course_name: 'คลาสตัวอย่าง', branch_name: 'สาขาตัวอย่าง',
  scheduled_at: formatThaiDateTime('2026-09-02 16:00'),
};

function ResultDialog({ result, onClose }: { result: SendResult | null; onClose: () => void }) {
  if (!result) return null;
  const failedRows = result.results.filter(r => !r.ok);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>ผลการส่ง SMS</DialogTitle>
      <DialogContent>
        <Alert severity={result.failed === 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
          ส่งสำเร็จ {result.sent} รายการ {result.failed > 0 && `— ล้มเหลว ${result.failed} รายการ`}
        </Alert>
        {failedRows.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>รายการที่ล้มเหลว</Typography>
            {failedRows.map(r => (
              <Typography key={r.bookingId} variant="body2" color="text.secondary">
                Booking #{r.bookingId}: {r.detail || 'ไม่ทราบสาเหตุ'}
              </Typography>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}

// Click-to-insert variable chips, shared by the compose box in the reminder
// tab — inserts at wherever the cursor last was, not always at the end.
function VariableChips({
  formFields, onInsert,
}: { formFields: { field_key: string; label: string }[]; onInsert: (token: string) => void }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
      {BUILTIN_SMS_VARIABLES.map(v => (
        <Chip key={v.key} size="small" label={v.label} onClick={() => onInsert(v.key)} />
      ))}
      {formFields.map(f => (
        <Chip key={f.field_key} size="small" variant="outlined" label={f.label} onClick={() => onInsert(f.field_key)} />
      ))}
    </Stack>
  );
}

const STATUS_OPTIONS = [
  { key: '', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอดำเนินการ' },
  { key: 'confirmed', label: 'ยืนยันแล้ว' },
  { key: 'confirmed_paid', label: 'ชำระแล้ว' },
  { key: 'awaiting_report', label: 'รอกรอกรายงาน' },
  { key: 'completed', label: 'เสร็จสิ้น' },
];

function ReminderTab({ courses, branches }: { courses: CourseOption[]; branches: { id: number; name: string }[] }) {
  const [courseId, setCourseId] = useState<number>(0);
  const [branchId, setBranchId] = useState<number>(0);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<ReminderCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');
  const [formFields, setFormFields] = useState<{ field_key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const selectedCourse = useMemo(() => courses.find(c => c.id === courseId), [courses, courseId]);

  useEffect(() => {
    if (!selectedCourse?.registration_form_id) { setFormFields([]); return; }
    axios.get(`${API_BASE}/registration-forms/${selectedCourse.registration_form_id}`).then(res => {
      const fields = res.data?.success ? (res.data.form?.fields || []) : [];
      setFormFields(fields.filter((f: any) => f.type !== 'heading').map((f: any) => ({ field_key: f.field_key, label: f.label })));
    }).catch(() => setFormFields([]));
    // Prefill the compose box from that course's default reminder template
    // only when it's still empty — don't clobber an admin's in-progress edit.
    setMessage(prev => prev || selectedCourse.sms_reminder_template || '');
  }, [selectedCourse]);

  const search = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (courseId) params.courseId = String(courseId);
      if (branchId) params.branchId = String(branchId);
      if (status) params.status = status;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await axios.get(`${API_BASE}/sms/reminder-candidates`, { params });
      setRows(res.data.success ? res.data.bookings : []);
      setSelected(new Set());
    } finally { setLoading(false); }
  };

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.booking_id)));

  const insertVariable = (fieldKey: string) => {
    const token = `{{${fieldKey}}}`;
    const el = messageRef.current;
    const start = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? message.length;
    setMessage(message.slice(0, start) + token + message.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };

  const send = async () => {
    if (selected.size === 0 || !message.trim()) return;
    setSending(true);
    try {
      const res = await axios.post(`${API_BASE}/sms/send-reminder`, { bookingIds: Array.from(selected), message });
      if (res.data.success) setResult(res.data);
    } finally { setSending(false); }
  };

  // Prefer a real selected recipient's actual data so the preview matches
  // what will really be sent; fall back to the first search result, then to
  // generic sample data when nothing has been searched/selected yet.
  const previewSource = rows.find(r => selected.has(r.booking_id)) || rows[0];
  const previewVariables = previewSource
    ? { ...buildNameVariables(previewSource), course_name: previewSource.course_name, branch_name: previewSource.branch_name || '', scheduled_at: formatThaiDateTime(previewSource.scheduled_at) }
    : SAMPLE_PREVIEW_VARIABLES;
  const previewSourceLabel = previewSource
    ? `ตัวอย่างจากข้อมูลจริง: ${previewSource.child_name} (${previewSource.parent_name})`
    : 'ยังไม่มีรายชื่อให้ใช้ — แสดงด้วยข้อมูลตัวอย่าง';

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>คอร์ส/กิจกรรม/บริการ</InputLabel>
              <Select value={courseId} label="คอร์ส/กิจกรรม/บริการ" onChange={e => setCourseId(Number(e.target.value))}>
                <MenuItem value={0}>ทั้งหมด</MenuItem>
                {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>สาขา</InputLabel>
              <Select value={branchId} label="สาขา" onChange={e => setBranchId(Number(e.target.value))}>
                <MenuItem value={0}>ทั้งหมด</MenuItem>
                {branches.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>สถานะ</InputLabel>
              <Select value={status} label="สถานะ" onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField label="ตั้งแต่วันที่" type="date" fullWidth size="small" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField label="ถึงวันที่" type="date" fullWidth size="small" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button fullWidth variant="contained" onClick={search} disabled={loading} sx={{ borderRadius: 2, height: '100%' }}>
              {loading ? <CircularProgress size={20} /> : 'ค้นหา'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <RecipientTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />

      <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }}>
        <TextField
          label="ข้อความ SMS"
          fullWidth
          multiline
          rows={4}
          size="small"
          value={message}
          onChange={e => setMessage(e.target.value)}
          inputRef={messageRef}
          placeholder="เช่น สวัสดีคุณ {{parent_name}} อีก 2 วันจะถึงกำหนด {{course_name}} ของ {{child_name}} แล้วนะคะ"
        />
        <VariableChips formFields={formFields} onInsert={insertVariable} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button variant="outlined" disabled={!message.trim()} onClick={() => setPreviewOpen(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Preview
          </Button>
          <Button variant="contained" disabled={selected.size === 0 || !message.trim() || sending} onClick={send} sx={{ borderRadius: 2, fontWeight: 700 }}>
            {sending ? <CircularProgress size={20} /> : `ส่ง SMS (${selected.size} รายการ)`}
          </Button>
        </Box>
      </Paper>

      <ResultDialog result={result} onClose={() => setResult(null)} />
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} template={message} variables={previewVariables} sourceLabel={previewSourceLabel} />
    </Box>
  );
}

function NonRegisteredTab({ courses }: { courses: CourseOption[] }) {
  const [courseId, setCourseId] = useState<number>(0);
  const [rows, setRows] = useState<{ user_id: number; name: string; phone: string; member_since: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/sms/non-registered-members`, { params: { courseId } });
      setRows(res.data.success ? res.data.members : []);
      setSearched(true);
    } finally { setLoading(false); }
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={8}>
            <FormControl fullWidth size="small">
              <InputLabel>คอร์ส/กิจกรรม/บริการ</InputLabel>
              <Select value={courseId} label="คอร์ส/กิจกรรม/บริการ" onChange={e => setCourseId(Number(e.target.value))}>
                <MenuItem value={0} disabled>เลือกกิจกรรม</MenuItem>
                {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button fullWidth variant="contained" onClick={search} disabled={!courseId || loading} sx={{ borderRadius: 2, height: '100%' }}>
              {loading ? <CircularProgress size={20} /> : 'ค้นหา'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>ชื่อ</TableCell>
              <TableCell>เบอร์โทร</TableCell>
              <TableCell>วันที่เป็นสมาชิก</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.user_id} hover>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.phone}</TableCell>
                <TableCell>{r.member_since}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {searched ? 'ไม่มีสมาชิกที่ยังไม่สมัครกิจกรรมนี้' : 'เลือกกิจกรรมแล้วกดค้นหา'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function ResendTab({ courses }: { courses: CourseOption[] }) {
  const [courseId, setCourseId] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<ReminderCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendCount, setResendCount] = useState<number | null>(null);

  const search = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (courseId) params.courseId = String(courseId);
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await axios.get(`${API_BASE}/sms/unsent-confirmations`, { params });
      setRows(res.data.success ? res.data.bookings : []);
      setSelected(new Set());
    } finally { setLoading(false); }
  };

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.booking_id)));

  const resend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await axios.post(`${API_BASE}/sms/resend-confirmation`, { bookingIds: Array.from(selected) });
      if (res.data.success) {
        setResendCount(selected.size);
        await search();
      }
    } finally { setSending(false); }
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={5}>
            <FormControl fullWidth size="small">
              <InputLabel>คอร์ส/กิจกรรม/บริการ</InputLabel>
              <Select value={courseId} label="คอร์ส/กิจกรรม/บริการ" onChange={e => setCourseId(Number(e.target.value))}>
                <MenuItem value={0}>ทั้งหมด (ที่เปิดใช้ SMS)</MenuItem>
                {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField label="ตั้งแต่วันที่" type="date" fullWidth size="small" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField label="ถึงวันที่" type="date" fullWidth size="small" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Button fullWidth variant="contained" onClick={search} disabled={loading} sx={{ borderRadius: 2, height: '100%' }}>
              {loading ? <CircularProgress size={20} /> : 'ค้นหา'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {resendCount != null && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setResendCount(null)}>
          ส่ง Confirm ย้อนหลังให้ {resendCount} รายการแล้ว
        </Alert>
      )}

      <RecipientTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button variant="contained" disabled={selected.size === 0 || sending} onClick={resend} sx={{ borderRadius: 2, fontWeight: 700 }}>
          {sending ? <CircularProgress size={20} /> : `ส่ง Confirm ใหม่ (${selected.size} รายการ)`}
        </Button>
      </Box>
    </Box>
  );
}

export default SmsNotifications;
