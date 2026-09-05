import { API_URL } from '../config';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, Grid, IconButton, InputAdornment, InputLabel, ListSubheader, MenuItem, Paper, Select, Stack, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { NotificationsActive as NotifyIcon, Visibility as ViewIcon, Person as ProfileIcon, Search as SearchIcon } from '@mui/icons-material';
import axios from 'axios';
import SmsPreviewBubble from '../components/SmsPreviewBubble';
import SmsTemplateEditor from '../components/SmsTemplateEditor';
import RichTextEditor from '../components/RichTextEditor';

const API_BASE = `${API_URL}/api/v1/admin`;

const BUILTIN_SMS_VARIABLES: { key: string; label: string; tagLabel: string }[] = [
  { key: 'child_name', label: 'ชื่อเด็ก (จากฟอร์ม หากมี หรือข้อมูลบัญชี)', tagLabel: 'ชื่อเด็ก' },
  { key: 'child_real_name', label: 'ชื่อจริงเด็ก', tagLabel: 'ชื่อจริงเด็ก' },
  { key: 'child_nickname', label: 'ชื่อเล่นเด็ก', tagLabel: 'ชื่อเล่นเด็ก' },
  { key: 'parent_name', label: 'ชื่อผู้ปกครอง (จากฟอร์มถ้ามี ไม่งั้นใช้บัญชี)', tagLabel: 'ชื่อผู้ปกครอง' },
  { key: 'parent_real_name', label: 'ชื่อจริงผู้ปกครอง', tagLabel: 'ชื่อจริงผู้ปกครอง' },
  { key: 'parent_nickname', label: 'ชื่อเล่นผู้ปกครอง', tagLabel: 'ชื่อเล่นผู้ปกครอง' },
  { key: 'course_name', label: 'ชื่อคอร์ส/กิจกรรม', tagLabel: 'ชื่อคอร์ส/กิจกรรม' },
  { key: 'branch_name', label: 'สาขา', tagLabel: 'สาขา' },
  { key: 'location', label: 'สถานที่จัดกิจกรรม (ถ้าไม่ได้กรอกจะใช้ที่อยู่สาขา)', tagLabel: 'สถานที่' },
  { key: 'location_link', label: 'ลิงก์แผนที่สถานที่', tagLabel: 'ลิงก์แผนที่' },
  { key: 'scheduled_at', label: 'วันเวลานัดหมาย', tagLabel: 'วันเวลานัดหมาย' },
];

// A family_member_picker field's plain answer is just one display string
// (nickname-preferred) — the consumer app also records `${field_key}
// __realname`/`__nickname` siblings alongside it (see
// DynamicRegistrationForm.tsx), so offer those as two extra selectable
// variables right next to the field's own chip.
function expandFamilyMemberPickerFields(fields: any[]): { field_key: string; label: string }[] {
  const expanded: { field_key: string; label: string }[] = [];
  for (const f of fields) {
    if (f.type === 'heading') continue;
    expanded.push({ field_key: f.field_key, label: f.label });
    if (f.type === 'family_member_picker') {
      expanded.push({ field_key: `${f.field_key}__realname`, label: `${f.label} (ชื่อจริง)` });
      expanded.push({ field_key: `${f.field_key}__nickname`, label: `${f.label} (ชื่อเล่น)` });
    }
  }
  return expanded;
}

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
  slot_date?: string | null;
  slot_start_time?: string | null;
  /** 1 when someone has been ticked in at the door. */
  checked_in?: number;
  /** When a reminder last actually went out, on either channel. Null = never. */
  last_reminder_at?: string | null;
  /** The check-in steps already ticked, by the name they had at the time. */
  checkin_done_labels?: string | null;
  status: string;
  child_name: string;
  child_real_name?: string;
  child_nickname?: string;
  parent_name: string;
  parent_real_name?: string;
  parent_nickname?: string;
  parent_user_id?: number;
  phone: string;
  parent_email?: string | null;
  course_name: string;
  branch_name: string | null;
}

interface SendResult { sent: number; failed: number; results: { bookingId: number; ok: boolean; detail?: string }[] }

interface RoundOption {
  slot_date: string | null;
  slot_start_time: string | null;
  booking_count: number;
  arrived_count: number;
}

/** Same wording as the tournament screen, so one round reads one way. */
const roundLabel = (date: string | null, time: string | null) =>
  date ? `${date}${time ? ` · ${String(time).slice(0, 5)}` : ''}` : 'ไม่ระบุรอบ';

/** One string for a round, matching what the API splits on its side. */
const roundKey = (r: RoundOption) => `${r.slot_date ?? ''}|${r.slot_start_time ?? ''}`;

/**
 * The rounds of the chosen course, reloaded whenever it changes.
 *
 * The selection is cleared with it, deliberately: a round key from the previous
 * course matches no booking at all, and an empty list reads as "nobody is
 * registered" rather than "you are still filtering by last week's session".
 */
function useCourseRounds(courseId: number) {
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [round, setRound] = useState('');
  useEffect(() => {
    setRound('');
    if (!courseId) { setRounds([]); return; }
    axios.get(`${API_BASE}/sms/rounds`, { params: { courseId } })
      .then(res => setRounds(res.data?.success ? res.data.rounds : []))
      .catch(() => setRounds([]));
  }, [courseId]);
  return { rounds, round, setRound };
}

/**
 * Pick one session to send to.
 *
 * A date range cannot say "the 10:00 group" when two rounds share a day, and
 * that is the normal case for an event — which is why this exists beside the
 * dates rather than instead of them. Disabled until a course is chosen, since
 * rounds only mean anything within one.
 */
function RoundSelect({ courseId, rounds, round, setRound }: {
  courseId: number; rounds: RoundOption[]; round: string; setRound: (v: string) => void;
}) {
  return (
    <FormControl fullWidth size="small" disabled={!courseId}>
      <InputLabel>รอบ</InputLabel>
      <Select value={round} label="รอบ" onChange={e => setRound(String(e.target.value))}>
        <MenuItem value="">{courseId ? 'ทุกรอบ' : 'เลือกคอร์สก่อน'}</MenuItem>
        {rounds.map(r => (
          <MenuItem key={roundKey(r)} value={roundKey(r)}>
            {roundLabel(r.slot_date, r.slot_start_time)} · {r.booking_count} คน
            {r.arrived_count > 0 ? ` (มาแล้ว ${r.arrived_count})` : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

interface CheckinAction { id: number; label: string; sort_order?: number }

/**
 * The check-in steps the chosen course defines.
 *
 * Most courses have one ("เช็คอิน") and the filter stays a plain arrived / not
 * arrived. Some have several — report in, then collect a keepsake — and there
 * the difference matters: on a live round 21 of 24 had reported in and not one
 * had done the second step, which the coarse filter cannot see at all.
 */
function useCheckinActions(courseId: number) {
  const [actions, setActions] = useState<CheckinAction[]>([]);
  useEffect(() => {
    if (!courseId) { setActions([]); return; }
    axios.get(`${API_BASE}/courses/${courseId}/checkin-actions`)
      .then(res => setActions(res.data?.success ? (res.data.actions || []) : []))
      .catch(() => setActions([]));
  }, [courseId]);
  return actions;
}

/**
 * Everyone, only those who have not arrived, or only those who have.
 *
 * "ยังไม่มา" is the reason this is here — chasing the people who are late while
 * the session is running. It reads the same tick the check-in screen writes, so
 * the two screens never disagree about who is in the room.
 */
function AttendanceSelect({ value, onChange, actions }: {
  value: string; onChange: (v: string) => void; actions: CheckinAction[];
}) {
  // One step is just "checked in" under another name, and offering both the
  // coarse pair and a single identical step would be two ways to say one thing.
  const showSteps = actions.length > 1;
  return (
    <FormControl fullWidth size="small">
      <InputLabel>การมา / ขั้นตอน</InputLabel>
      <Select value={value} label="การมา / ขั้นตอน" onChange={e => onChange(String(e.target.value))}>
        <MenuItem value="">ทั้งหมด</MenuItem>
        <MenuItem value="out">ยังไม่มา (ยังไม่เช็คอินเลย)</MenuItem>
        <MenuItem value="in">มาแล้ว</MenuItem>
        {showSteps && <ListSubheader sx={{ fontWeight: 800 }}>ยังไม่ได้ทำขั้นตอน</ListSubheader>}
        {showSteps && actions.map(a => (
          <MenuItem key={`todo-${a.id}`} value={`todo:${a.id}`}>ยังไม่ได้ {a.label}</MenuItem>
        ))}
        {showSteps && <ListSubheader sx={{ fontWeight: 800 }}>ทำขั้นตอนแล้ว</ListSubheader>}
        {showSteps && actions.map(a => (
          <MenuItem key={`done-${a.id}`} value={`done:${a.id}`}>{a.label} แล้ว</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

/**
 * Everyone, only those never reminded, or only those already reminded.
 *
 * The reason this tab needed it: send to a hundred people, come back an hour
 * later, and the list looks exactly the same. There was no way to tell who had
 * already been told, so the safe move was to skip the send — or to send twice.
 *
 * A send counts only when it actually left, on either channel: a failed attempt
 * is not a reminder, and an email-only course has no SMS log by design.
 */
function RemindedSelect({ value, onChange }: { value: '' | 'yes' | 'no'; onChange: (v: '' | 'yes' | 'no') => void }) {
  return (
    <FormControl fullWidth size="small">
      <InputLabel>การแจ้งเตือน</InputLabel>
      <Select value={value} label="การแจ้งเตือน" onChange={e => onChange(e.target.value as '' | 'yes' | 'no')}>
        <MenuItem value="">ทั้งหมด</MenuItem>
        <MenuItem value="no">ยังไม่ได้ส่ง</MenuItem>
        <MenuItem value="yes">ส่งแล้ว</MenuItem>
      </Select>
    </FormControl>
  );
}

// Client-side instant filter + pagination, shared by all 3 tabs — search
// resets to page 1 so a query never lands on a now-out-of-range page.
function useFilteredPage<T>(rows: T[], searchFields: (row: T) => Array<string | null | undefined>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => searchFields(r).some(f => (f || '').toLowerCase().includes(q)));
  }, [rows, query]);
  useEffect(() => { setPage(0); }, [query, rows.length]);
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  return { query, setQuery, page, setPage, rowsPerPage, setRowsPerPage, filtered, paged };
}

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
        <NotifyIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>การแจ้งเตือน</Typography>
          <Typography variant="body2" color="text.secondary">ส่ง SMS และอีเมลแจ้งเตือนล่วงหน้าแบบเลือกเอง ดูสมาชิกที่ยังไม่สมัคร และส่ง Confirm ย้อนหลัง</Typography>
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
  // "Select all" only ever acts on the rows actually shown (this page) —
  // selections on other pages are untouched, so the checked/indeterminate
  // state must count against this page's rows, not the global selected size.
  const selectedOnPage = rows.filter(r => selected.has(r.booking_id)).length;
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                indeterminate={selectedOnPage > 0 && selectedOnPage < rows.length}
                checked={rows.length > 0 && selectedOnPage === rows.length}
                onChange={onToggleAll}
              />
            </TableCell>
            <TableCell>เด็ก</TableCell>
            <TableCell>ผู้ปกครอง</TableCell>
            <TableCell>ช่องทางติดต่อ</TableCell>
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
              {/* Both channels, because a row can be reachable by one and not
                  the other and the send result would otherwise be a surprise. */}
              <TableCell>
                <Typography variant="body2">{row.phone || <Box component="span" sx={{ color: 'text.disabled' }}>ไม่มีเบอร์</Box>}</Typography>
                <Typography variant="caption" color={row.parent_email ? 'text.secondary' : 'text.disabled'}>
                  {row.parent_email || 'ไม่มีอีเมล'}
                </Typography>
              </TableCell>
              <TableCell>{row.course_name}</TableCell>
              <TableCell>{row.branch_name || '-'}</TableCell>
              <TableCell>
                {formatThaiDateTime(row.scheduled_at)}
                {/* Whether they are in the room. Shown on every row, not only
                    when filtered, because a list of people to chase is only
                    trustworthy if you can see the fact it was built on. */}
                <Chip
                  size="small"
                  label={row.checked_in ? 'มาแล้ว' : 'ยังไม่มา'}
                  color={row.checked_in ? 'success' : 'default'}
                  variant={row.checked_in ? 'filled' : 'outlined'}
                  sx={{ ml: 0.75, height: 18, fontSize: 10, fontWeight: 700 }}
                />
                {/* Which steps are ticked, not just whether any are. A row
                    reading "รายงานตัว" alone is someone in the building who has
                    not finished — invisible under a plain arrived / not flag. */}
                {row.checkin_done_labels && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                    {row.checkin_done_labels}
                  </Typography>
                )}
                {/* When they were last told. Shown with the date rather than a
                    bare tick, because "already reminded" three weeks ago and
                    "already reminded" this morning call for opposite decisions. */}
                <Typography
                  variant="caption"
                  sx={{ display: 'block', color: row.last_reminder_at ? 'text.secondary' : 'text.disabled' }}
                >
                  {row.last_reminder_at ? `แจ้งเตือนแล้ว ${formatThaiDateTime(row.last_reminder_at)}` : 'ยังไม่ได้แจ้งเตือน'}
                </Typography>
              </TableCell>
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
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Preview ข้อความ SMS</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, textAlign: 'center' }}>{sourceLabel}</Typography>
        <SmsPreviewBubble message={renderSmsTemplate(template, variables)} />
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

const STATUS_OPTIONS = [
  { key: '', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอดำเนินการ' },
  { key: 'confirmed', label: 'ยืนยันแล้ว' },
  { key: 'confirmed_paid', label: 'ชำระแล้ว' },
  { key: 'awaiting_report', label: 'รอกรอกรายงาน' },
  { key: 'completed', label: 'เสร็จสิ้น' },
  // Marked absent by staff. Its own group because chasing someone already
  // written off is a different decision from chasing someone merely late.
  { key: 'no_show', label: 'ไม่มา (ทำเครื่องหมายแล้ว)' },
];

/** Today in the staff's own timezone — toISOString would hand back UTC. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ReminderTab({ courses, branches }: { courses: CourseOption[]; branches: { id: number; name: string }[] }) {
  const [courseId, setCourseId] = useState<number>(0);
  const [branchId, setBranchId] = useState<number>(0);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { rounds, round, setRound } = useCourseRounds(courseId);
  const [attendance, setAttendance] = useState('');
  const checkinActions = useCheckinActions(courseId);
  const [reminded, setReminded] = useState<'' | 'yes' | 'no'>('');
  const [rows, setRows] = useState<ReminderCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');
  // One policy rather than two switches, so "email, and SMS only if they have
  // no email" is sayable — the combination staff actually want, and one that
  // two independent checkboxes cannot express. Same vocabulary as the
  // per-course confirmation setting.
  const [mode, setMode] = useState<'sms_only' | 'email_only' | 'both' | 'email_first' | 'sms_first'>('sms_only');
  const useSms = mode !== 'email_only';
  const useEmail = mode !== 'sms_only';
  const [emailSubject, setEmailSubject] = useState('แจ้งเตือน {{course_name}}');
  const [emailBody, setEmailBody] = useState('');
  const [formFields, setFormFields] = useState<{ field_key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selectedCourse = useMemo(() => courses.find(c => c.id === courseId), [courses, courseId]);

  useEffect(() => {
    if (!selectedCourse?.registration_form_id) { setFormFields([]); return; }
    axios.get(`${API_BASE}/registration-forms/${selectedCourse.registration_form_id}`).then(res => {
      const fields = res.data?.success ? (res.data.form?.fields || []) : [];
      setFormFields(expandFamilyMemberPickerFields(fields));
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
      if (round) params.round = round;
      if (attendance) params.attendance = attendance;
      if (reminded) params.reminded = reminded;
      const res = await axios.get(`${API_BASE}/sms/reminder-candidates`, { params });
      setRows(res.data.success ? res.data.bookings : []);
      setSelected(new Set());
    } finally { setLoading(false); }
  };

  const filteredPage = useFilteredPage(rows, r => [r.child_name, r.child_real_name, r.parent_name, r.parent_real_name, r.phone, r.course_name, r.branch_name]);

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Only ever acts on the current page's rows — see RecipientTable's comment.
  const toggleAll = () => setSelected(prev => {
    const pageIds = filteredPage.paged.map(r => r.booking_id);
    const allSelected = pageIds.every(id => prev.has(id));
    const next = new Set(prev);
    pageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
    return next;
  });

  const canSend = selected.size > 0
    && (!useSms || message.trim().length > 0)
    && (!useEmail || emailBody.trim().length > 0);
  const sendLabel = mode === 'sms_only' ? 'ส่ง SMS' : mode === 'email_only' ? 'ส่งอีเมล' : 'ส่งแจ้งเตือน';

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await axios.post(`${API_BASE}/sms/send-reminder`, {
        bookingIds: Array.from(selected), message, mode, emailSubject, emailBody,
      });
      if (res.data.success) setResult(res.data);
    } finally { setSending(false); }
  };

  // Prefer a real selected recipient's actual data so the preview matches
  // what will really be sent; fall back to the first search result, then to
  // generic sample data when nothing has been searched/selected yet. Form
  // fields never have a real answer available here (getReminderCandidates
  // doesn't return submission answers), so every {{field_key}} always gets
  // a "(ตัวอย่าง) label" placeholder — otherwise it would leak into the
  // preview as a raw unrendered token even when real recipient data is used.
  const formFieldSamples = Object.fromEntries(formFields.map(f => [f.field_key, `(ตัวอย่าง) ${f.label}`]));
  const previewSource = rows.find(r => selected.has(r.booking_id)) || rows[0];
  const previewVariables = previewSource
    ? { ...formFieldSamples, ...buildNameVariables(previewSource), course_name: previewSource.course_name, branch_name: previewSource.branch_name || '', scheduled_at: formatThaiDateTime(previewSource.scheduled_at) }
    : { ...formFieldSamples, ...SAMPLE_PREVIEW_VARIABLES };
  const previewSourceLabel = previewSource
    ? `ตัวอย่างจากข้อมูลจริง: ${previewSource.child_name} (${previewSource.parent_name})`
    : 'ยังไม่มีรายชื่อให้ใช้ — แสดงด้วยข้อมูลตัวอย่าง';

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          {/* Who: the course, the session, and the two facts that decide whether
              this person still needs telling. Kept on the first line because
              they are the filters actually reached for; the branch, status and
              date range below narrow an already-sensible list. */}
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>คอร์ส/กิจกรรม/บริการ</InputLabel>
              <Select value={courseId} label="คอร์ส/กิจกรรม/บริการ" onChange={e => setCourseId(Number(e.target.value))}>
                <MenuItem value={0}>ทั้งหมด</MenuItem>
                {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <RoundSelect courseId={courseId} rounds={rounds} round={round} setRound={setRound} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <RemindedSelect value={reminded} onChange={setReminded} />
          </Grid>

          <Grid item xs={12} sm={3}>
            <AttendanceSelect value={attendance} onChange={setAttendance} actions={checkinActions} />
          </Grid>
          <Grid item xs={12} sm={3}>
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
          <Grid item xs={12} sm={3}>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                onClick={() => { const t = todayIso(); setDateFrom(t); setDateTo(t); }}
                sx={{ borderRadius: 2, py: 1, whiteSpace: 'nowrap' }}
              >
                วันนี้
              </Button>
              <Button fullWidth variant="contained" onClick={search} disabled={loading} sx={{ borderRadius: 2, py: 1 }}>
                {loading ? <CircularProgress size={20} /> : 'ค้นหา'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <TextField
        size="small"
        fullWidth
        placeholder="ค้นหาชื่อเด็ก/ผู้ปกครอง เบอร์โทร คอร์ส หรือสาขา"
        value={filteredPage.query}
        onChange={e => filteredPage.setQuery(e.target.value)}
        sx={{ mb: 1.5 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />
      <RecipientTable rows={filteredPage.paged} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
      <TablePagination
        component="div"
        count={filteredPage.filtered.length}
        page={filteredPage.page}
        onPageChange={(_, p) => filteredPage.setPage(p)}
        rowsPerPage={filteredPage.rowsPerPage}
        onRowsPerPageChange={e => { filteredPage.setRowsPerPage(parseInt(e.target.value, 10)); filteredPage.setPage(0); }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="แถวต่อหน้า"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} จาก ${count}`}
      />

      <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }}>
        {/* Which channels this send uses. Both can be on: a family with only an
            email still gets reached, and the result dialog says per row which
            channel was missing. */}
        <FormControl size="small" fullWidth sx={{ mb: 2, maxWidth: 420 }}>
          <InputLabel>ช่องทางการส่ง</InputLabel>
          <Select label="ช่องทางการส่ง" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
            <MenuItem value="sms_only">SMS เท่านั้น</MenuItem>
            <MenuItem value="email_only">อีเมลเท่านั้น</MenuItem>
            <MenuItem value="email_first">อีเมลก่อน ถ้าส่งไม่ได้จึงส่ง SMS</MenuItem>
            <MenuItem value="sms_first">SMS ก่อน ถ้าส่งไม่ได้จึงส่งอีเมล</MenuItem>
            <MenuItem value="both">ส่งทั้ง SMS และอีเมล</MenuItem>
          </Select>
        </FormControl>

        {(mode === 'email_first' || mode === 'sms_first') && (
          <Alert severity="info" sx={{ mb: 2 }}>
            ช่องทางสำรองจะถูกใช้เมื่อผู้รับไม่มีช่องทางแรก หรือส่งช่องทางแรกไม่สำเร็จ ·
            ต้องเขียนข้อความไว้ทั้งสองแบบ
          </Alert>
        )}

        {useSms && (
          <>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>ข้อความ SMS</Typography>
            <SmsTemplateEditor
              value={message}
              onChange={setMessage}
              placeholder="เช่น สวัสดีคุณ [ชื่อผู้ปกครอง] อีก 2 วันจะถึงกำหนด [ชื่อคอร์ส/กิจกรรม] ของ [ชื่อเด็ก] แล้วนะคะ"
              builtins={BUILTIN_SMS_VARIABLES}
              formFields={formFields.map(f => ({ key: f.field_key, label: f.label }))}
            />
          </>
        )}

        {useEmail && (
          <Box sx={{ mt: useSms ? 3 : 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>อีเมล</Typography>
            <TextField
              fullWidth size="small" label="หัวเรื่อง" sx={{ mb: 1.5 }}
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              placeholder="เช่น แจ้งเตือน {{course_name}} วัน {{scheduled_at}}"
            />
            {/* Same editor as everywhere else, and the same frame around it on
                send — the theme from ตั้งค่าระบบ wraps this body too. */}
            <RichTextEditor
              value={emailBody}
              onChange={setEmailBody}
              uploadFolder="reminder-email"
              placeholder="เช่น สวัสดีค่ะคุณ {{parent_name}} พรุ่งนี้เจอกันที่ {{location}} นะคะ"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5 }}>
              กดเพื่อแทรกตัวแปรลงท้ายเนื้อหาอีเมล
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {BUILTIN_SMS_VARIABLES.map(v => (
                <Chip
                  key={v.key} size="small" label={v.tagLabel} sx={{ fontWeight: 700 }}
                  onClick={() => setEmailBody(prev => `${prev}{{${v.key}}}`)}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button variant="outlined" disabled={!useSms || !message.trim()} onClick={() => setPreviewOpen(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Preview SMS
          </Button>
          <Button variant="contained" disabled={!canSend || sending} onClick={send} sx={{ borderRadius: 2, fontWeight: 700 }}>
            {sending ? <CircularProgress size={20} /> : `${sendLabel} (${selected.size} รายการ)`}
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
  const filteredPage = useFilteredPage(rows, r => [r.name, r.phone]);

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

      <TextField
        size="small"
        fullWidth
        placeholder="ค้นหาชื่อหรือเบอร์โทร"
        value={filteredPage.query}
        onChange={e => filteredPage.setQuery(e.target.value)}
        sx={{ mb: 1.5 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>ชื่อ</TableCell>
              <TableCell>ช่องทางติดต่อ</TableCell>
              <TableCell>วันที่เป็นสมาชิก</TableCell>
              <TableCell align="right">&nbsp;</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPage.paged.map(r => (
              <TableRow key={r.user_id} hover>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.phone}</TableCell>
                <TableCell>{r.member_since}</TableCell>
                <TableCell align="right">
                  <Tooltip title="ดูโปรไฟล์">
                    <IconButton size="small" onClick={() => window.open(`/crm/parents?openUserId=${r.user_id}`, '_blank')}>
                      <ProfileIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {filteredPage.paged.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {searched ? 'ไม่มีสมาชิกที่ยังไม่สมัครกิจกรรมนี้' : 'เลือกกิจกรรมแล้วกดค้นหา'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={filteredPage.filtered.length}
        page={filteredPage.page}
        onPageChange={(_, p) => filteredPage.setPage(p)}
        rowsPerPage={filteredPage.rowsPerPage}
        onRowsPerPageChange={e => { filteredPage.setRowsPerPage(parseInt(e.target.value, 10)); filteredPage.setPage(0); }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="แถวต่อหน้า"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} จาก ${count}`}
      />
    </Box>
  );
}

function ResendTab({ courses }: { courses: CourseOption[] }) {
  const [courseId, setCourseId] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // A round, but no attendance filter: these are confirmations that never went
  // out, and whether someone turned up says nothing about that.
  const { rounds, round, setRound } = useCourseRounds(courseId);
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
      if (round) params.round = round;
      const res = await axios.get(`${API_BASE}/sms/unsent-confirmations`, { params });
      setRows(res.data.success ? res.data.bookings : []);
      setSelected(new Set());
    } finally { setLoading(false); }
  };

  const filteredPage = useFilteredPage(rows, r => [r.child_name, r.child_real_name, r.parent_name, r.parent_real_name, r.phone, r.course_name, r.branch_name]);

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Only ever acts on the current page's rows — see RecipientTable's comment.
  const toggleAll = () => setSelected(prev => {
    const pageIds = filteredPage.paged.map(r => r.booking_id);
    const allSelected = pageIds.every(id => prev.has(id));
    const next = new Set(prev);
    pageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
    return next;
  });

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
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>คอร์ส/กิจกรรม/บริการ</InputLabel>
              <Select value={courseId} label="คอร์ส/กิจกรรม/บริการ" onChange={e => setCourseId(Number(e.target.value))}>
                <MenuItem value={0}>ทั้งหมด (ที่เปิดใช้แจ้งเตือน)</MenuItem>
                {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <RoundSelect courseId={courseId} rounds={rounds} round={round} setRound={setRound} />
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

      <TextField
        size="small"
        fullWidth
        placeholder="ค้นหาชื่อเด็ก/ผู้ปกครอง เบอร์โทร คอร์ส หรือสาขา"
        value={filteredPage.query}
        onChange={e => filteredPage.setQuery(e.target.value)}
        sx={{ mb: 1.5 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />
      <RecipientTable rows={filteredPage.paged} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
      <TablePagination
        component="div"
        count={filteredPage.filtered.length}
        page={filteredPage.page}
        onPageChange={(_, p) => filteredPage.setPage(p)}
        rowsPerPage={filteredPage.rowsPerPage}
        onRowsPerPageChange={e => { filteredPage.setRowsPerPage(parseInt(e.target.value, 10)); filteredPage.setPage(0); }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="แถวต่อหน้า"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} จาก ${count}`}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button variant="contained" disabled={selected.size === 0 || sending} onClick={resend} sx={{ borderRadius: 2, fontWeight: 700 }}>
          {sending ? <CircularProgress size={20} /> : `ส่ง Confirm ใหม่ (${selected.size} รายการ)`}
        </Button>
      </Box>
    </Box>
  );
}

export default SmsNotifications;
