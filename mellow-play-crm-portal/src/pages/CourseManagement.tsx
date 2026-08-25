import { API_URL, CONSUMER_APP_URL } from '../config';
import { copyText } from '../utils/clipboard';
import { getCourseDetailUrl } from '../utils/courseLinks';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SkillsLibraryManagement from './SkillsLibraryManagement';
import mellowPlayLogo from '../assets/logo.svg';
import CourseMaterialsTab from '../components/CourseMaterialsTab';
import {
  Typography, Box, CircularProgress,
  Grid, Button, Chip,
  TextField, MenuItem, Select, FormControl, InputLabel, InputAdornment, FormHelperText,
  IconButton, Paper, Stack, Alert, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, ListItemButton, ListItemIcon, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TableSortLabel,
  ToggleButton, ToggleButtonGroup, Switch, FormControlLabel,
  Tab, Tabs, Rating, Avatar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Category as CategoryIcon,
  Delete as DeleteIcon,
  ArrowBack as BackIcon,
  Save as SaveIcon,
  CloudUpload as UploadIcon,
  Image as ImageIcon,
  Movie as VideoIcon,
  Close as ClearIcon,
  Close as CloseIcon,
  PlayCircle as PlayIcon,
  MenuBook as GuideIcon,
  Visibility as PreviewIcon,
  OpenInFull as ExpandIcon,
  ChildCare as AgeIcon,
  AttachMoney as PriceIcon,
  AccessTime as DurationIcon,
  AutoAwesome as SkillsIcon,
  Percent as PercentIcon,
  Sms as SmsIcon,
  Visibility as VisibleIcon,
  VisibilityOff as HiddenIcon,
  People as SalesIcon,
  School as TeacherIcon,
  AutoStories as SkillsLibIcon,
  AspectRatio as CropIcon,
  CheckCircle as SavedIcon,
  Translate as TranslateIcon,
  ContentCopy as CopyLinkIcon,
  Star as CoverIcon,
  EventSeat as CapacityIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { renderSkillIcon, type SkillItem, type SkillType } from '../utils/skillsLibrary';
import FocalPointPicker from '../components/FocalPointPicker';
import CourseViewPreview from '../components/CourseViewPreview';
import CourseNotificationsTab from '../components/CourseNotificationsTab';
import RichTextEditor from '../components/RichTextEditor';

// Converts rich HTML content into paragraph-separated plain text before
// sending to the translate API, which only understands plain text.
const stripHtmlForTranslate = (html: string) => {
  const withBreaks = html.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  const div = document.createElement('div');
  div.innerHTML = withBreaks;
  return (div.textContent || '').split(/\n+/).map(l => l.trim()).filter(Boolean).join('\n');
};

interface ImageViewDef {
  key: string;
  label: string;
  labelEn: string;
  ratioW: number;
  ratioH: number;
  recommendedWidth: number;
  recommendedHeight: number;
  usageNote: string;
}

interface CourseImageView {
  imageUrl: string;
  focalX: number;
  focalY: number;
  zoom: number;
}

const API_BASE = `${API_URL}/api/v1/admin`;

// Fixed variables every SMS template can use regardless of which
// registration form (if any) the course has — matches the keys
// smsNotificationService.ts substitutes on the backend. Name variables come
// in pairs (real name vs nickname) so a template can pick either explicitly;
// the plain child_name/parent_name default to nickname-if-set.
const BUILTIN_SMS_VARIABLES: { key: string; label: string; tagLabel: string }[] = [
  { key: 'child_name', label: 'ชื่อเด็ก (จากฟอร์ม หากมี หรือข้อมูลบัญชี)', tagLabel: 'ชื่อเด็ก' },
  { key: 'child_real_name', label: 'ชื่อจริงเด็ก', tagLabel: 'ชื่อจริงเด็ก' },
  { key: 'child_nickname', label: 'ชื่อเล่นเด็ก', tagLabel: 'ชื่อเล่นเด็ก' },
  { key: 'parent_name', label: 'ชื่อผู้ปกครอง (จากฟอร์ม หากมี หรือข้อมูลบัญชี)', tagLabel: 'ชื่อผู้ปกครอง' },
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

interface Course {
  id: number;
  code: string;
  /** Set by the server on every save — see migration 0085. */
  updated_at?: string;
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  category_id: number;
  category_name: string;
  age_min?: number;
  age_max?: number;
  duration?: string;
  original_price?: number;
  premium_price?: number;
  coupon_count?: number;
  coupon_requirements_json?: string;
  achievement_skills_json?: string;
  metrics_json?: string;
  short_description?: string;
  branch_ids?: string;
  thumbnail_url?: string;
  detail_poster_url?: string;
  images_json?: string;
  video_url?: string;
  teacher_guide_url?: string;
  is_recommended?: boolean;
  is_extraclass?: boolean;
  is_event?: boolean;
  is_service?: boolean;
  allow_repeat?: boolean;
  registration_form_id?: number | null;
  registration_close_at?: string | null;
  stamps_on_completion?: number;
  stamp_expiry_months?: number;
  // Legacy fields — used for migration only
  is_little_junior_enabled?: boolean;
  is_junior_enabled?: boolean;
  original_price_little_junior?: number;
  premium_price_little_junior?: number;
  achievement_skills_little_junior_json?: string;
  metrics_little_junior_json?: string;
  calendar_id?: number;
  location_link?: string;
}

interface Category {
  id: number;
  name: string;
  color?: string;
  description?: string;
  image_url?: string;
  type?: 'class' | 'event' | 'service';
}

const AGE_PRESETS = [
  { label: '3 – 5 ปี', min: 3, max: 5 },
  { label: '6 – 8 ปี', min: 6, max: 8 },
];



interface CouponRequirement {
  typeId: string;
  label: string;
  count: number;
}

const formatDuration = (duration?: string) => {
  if (!duration) return '-';
  const [h, m] = duration.split(':');
  const hours = parseInt(h) || 0;
  const mins = parseInt(m) || 0;
  if (hours > 0 && mins > 0) return `${hours} ชม. ${mins} น.`;
  if (hours > 0) return `${hours} ชม.`;
  return `${mins} น.`;
};

const formatAgeRange = (min?: number, max?: number) => {
  if (min == null || max == null) return null;
  return `${min} – ${max} ปี`;
};

// Course "type" — same four-way split the consumer app uses (regular class
// / extra class / event / service), surfaced here so staff can tell them
// apart and filter by it directly in the manage table instead of opening
// each row. Service used to just be a category-name regex match riding on
// the regular class pool — now a real flag like the other three.
const TYPE_META: Record<'event' | 'extra' | 'service' | 'regular', { key: string; label: string; color: string }> = {
  event:   { key: 'event',   label: 'กิจกรรม (Event)',   color: '#7452d6' },
  extra:   { key: 'extra',   label: 'คลาสพิเศษ',          color: '#f7aa16' },
  service: { key: 'service', label: 'บริการ (Service)',   color: '#2273d9' },
  regular: { key: 'regular', label: 'คลาสทั่วไป',          color: '#21a45b' },
};
const getCourseType = (course: { is_event?: boolean; is_extraclass?: boolean; is_service?: boolean }): keyof typeof TYPE_META =>
  course.is_event ? 'event' : course.is_extraclass ? 'extra' : course.is_service ? 'service' : 'regular';

// Bilingual tag input with Modal
const SkillTagInput = ({ label, values, onChange, color = 'primary', onOpenPicker, libraryItems }: {
  label: string;
  values: { th: string; en: string }[];
  onChange: (v: { th: string; en: string }[]) => void;
  color?: 'primary' | 'secondary';
  onOpenPicker: () => void;
  libraryItems: SkillItem[];
}) => {
  const accentColor = color === 'primary' ? '#7c3aed' : '#0284c7';
  const bgColor     = color === 'primary' ? '#f5f3ff' : '#eff6ff';

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ color: accentColor }}>
          {label}
        </Typography>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onOpenPicker}
          sx={{ borderRadius: 2, fontWeight: 700, borderColor: accentColor, color: accentColor,
            '&:hover': { borderColor: accentColor, bgcolor: bgColor } }}>
          เลือกจากคลัง
        </Button>
      </Box>

      {/* Tags — selection always comes from the Skills Library picker below,
          so names/icons stay consistent with what RecordMilestone shows. */}
      {values.length === 0
        ? <Typography variant="caption" color="text.disabled">ยังไม่มีรายการ — กด "เลือกจากคลัง"</Typography>
        : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {values.map((v, i) => {
              const found = libraryItems.find(item => item.name === v.th);
              const displayLabel = v.th && v.en ? `${v.th} (${v.en})` : (v.th || v.en);
              return (
                <Chip
                  key={i}
                  icon={found ? renderSkillIcon(found.icon, { sx: { fontSize: '18px !important', color: `${accentColor} !important` } }) : undefined}
                  label={displayLabel}
                  onDelete={() => onChange(values.filter((_, j) => j !== i))}
                  sx={{
                    bgcolor: bgColor, color: accentColor, fontWeight: 700, borderRadius: 2,
                    border: '1px solid', borderColor: `${accentColor}30`,
                    '& .MuiChip-deleteIcon': { color: accentColor, opacity: 0.5, '&:hover': { opacity: 1 } },
                  }}
                />
              );
            })}
          </Box>
        )}
    </Box>
  );
};

// Columns that can be sorted and filtered from the header. `type` is only
// rendered on the class page, matching the row markup below.
// width is fixed per column so the table can scroll sideways without the
// browser redistributing space every time a filter changes the longest cell.
const SORTABLE_COLUMNS: { key: string; label: string; width: number }[] = [
  { key: 'id', label: 'ID', width: 70 },
  { key: 'code', label: 'รหัสคลาส', width: 130 },
  { key: 'name', label: 'ชื่อคลาส', width: 280 },
  { key: 'type', label: 'ประเภท', width: 120 },
  { key: 'category', label: 'หมวดหมู่', width: 150 },
  { key: 'age', label: 'ช่วงอายุ', width: 110 },
  { key: 'price', label: 'ราคาปกติ', width: 110 },
  { key: 'duration', label: 'ระยะเวลา', width: 110 },
  { key: 'seats', label: 'ยอดสมัคร', width: 130 },
  { key: 'updated', label: 'วันที่อัปเดต', width: 150 },
];

const ACTIONS_COLUMN_WIDTH = 210;

const formatUpdatedAt = (raw?: string | null): string => {
  if (!raw) return '';
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

const SectionLabel = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
  </Box>
);

// courseType splits this same component into three distinct CRM pages
// sharing one implementation — "class" (/crm/courses) manages everything
// except Events/Services, "event" (/crm/events) shows only Events, "service"
// (/crm/course-services) shows only Services. All three are still just rows
// in the same Courses table (see is_event/is_service) — this is a
// CRM-presentation split only, not a database split, so all the
// booking/capacity/payment machinery keyed on Courses/Bookings stays
// untouched. Named "course-services" (not "/crm/services") because that
// route is already taken by the unrelated shop-services feature.
// <input type="datetime-local"> requires "YYYY-MM-DDTHH:MM" — stored dates
// use a space separator ("YYYY-MM-DD HH:MM:SS"), so convert both ways.
const toDatetimeLocalValue = (raw?: string) => raw ? raw.replace(' ', 'T').slice(0, 16) : '';
const fromDatetimeLocalValue = (val: string) => val ? val.replace('T', ' ') : '';

const CourseManagement = ({ courseType = 'class' }: { courseType?: 'class' | 'event' | 'service' }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageTab, setPageTab] = useState(0);
  const currentUserRole = (() => { try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role; } catch { return ''; } })();
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [couponTypes, setCouponTypes] = useState<any[]>([]);
  const [registrationForms, setRegistrationForms] = useState<any[]>([]);
  const [smsFormFields, setSmsFormFields] = useState<{ field_key: string; label: string }[]>([]);
  // Which group of the edit form is showing. Reset to 0 whenever a different
  // course is opened, so a staff member doesn't land on Pricing for a course
  // they just clicked into.
  const [editTab, setEditTab] = useState(0);
  const [visibilityBusyId, setVisibilityBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Stamp artwork and the participation medal. Held apart from formData
  // because they are saved through their own endpoint — the course
  // insert/update already carries ~60 parameters and does not need two more.
  const [stampDesigns, setStampDesigns] = useState<any[]>([]);
  const [rewardSettings, setRewardSettings] = useState<{ design_id: number | null; participation_badge_tier: number | null; certificate_auto: string | null }>({
    design_id: null, participation_badge_tier: null, certificate_auto: null,
  });
  const [rewardRounds, setRewardRounds] = useState<any[]>([]);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryFormDialogOpen, setCategoryFormDialogOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [descExpandModal, setDescExpandModal] = useState<{ open: boolean; lang: 'th' | 'en'; field: 'description' | 'shortDescription' } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [courseReviews, setCourseReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [translatingField, setTranslatingField] = useState<'name' | 'shortDescription' | 'description' | null>(null);

  const translateField = async (field: 'name' | 'shortDescription' | 'description') => {
    const sourceText = field === 'description' ? stripHtmlForTranslate(formData.description) : formData[field];
    if (!sourceText.trim()) return;
    setTranslatingField(field);
    try {
      const res = await axios.post(`${API_BASE}/translate`, { text: sourceText, from: 'th', to: 'en' });
      if (res.data.success) {
        if (field === 'description') {
          // Rich content is translated as plain text (draft only), then
          // wrapped back into paragraphs — original formatting isn't
          // preserved, the admin can re-format the English version if needed.
          const html = String(res.data.translatedText)
            .split(/\n+/).map((l: string) => l.trim()).filter(Boolean)
            .map((l: string) => `<p>${l}</p>`).join('');
          setFormData(f => ({ ...f, descriptionEn: html || res.data.translatedText }));
        } else {
          const enField = `${field}En` as 'nameEn' | 'shortDescriptionEn';
          setFormData(f => ({ ...f, [enField]: res.data.translatedText }));
        }
      } else {
        setSaveError(res.data.message || 'แปลภาษาไม่สำเร็จ');
      }
    } catch (e: any) {
      setSaveError(e.response?.data?.message || 'แปลภาษาไม่สำเร็จ');
    } finally {
      setTranslatingField(null);
    }
  };

  const [formData, setFormData] = useState({
    id: 0,
    code: '',
    name: '',
    nameEn: '',
    description: '',
    descriptionEn: '',
    shortDescription: '',
    shortDescriptionEn: '',
    location: '',
    locationLink: '',
    branchIds: [] as string[],
    categoryId: 0,
    calendarId: 0,
    ageMin: 3,
    ageMax: 9,
    duration: '01:00',
    originalPrice: '',
    premiumPrice: '',
    couponRequirements: [] as CouponRequirement[],
    skills: [] as { th: string; en: string }[],
    metrics: [] as { th: string; en: string }[],
    thumbnailUrl: '',
    detailPosterUrl: '',
    images: [] as string[],
    videoUrl: '',
    teacherGuideUrl: '',
    salesCommissionType: 'percent' as 'percent' | 'fixed',
    salesCommissionValue: '',
    teacherCommissionType: 'percent' as 'percent' | 'fixed',
    teacherCommissionValue: '',
    isRecommended: false,
    isExtraclass: false,
    isEvent: false,
    isService: false,
    allowRepeat: true,
    registrationFormId: 0,
    registrationCloseAt: '',
    stampsOnCompletion: 0,
    stampExpiryMonths: 12,
    checkinActions: [] as string[],
    confirmationChannelMode: 'off',
    smsSuccessEnabled: false,
    smsSuccessTemplate: '',
    smsReminderTemplate: '',
    emailSuccessEnabled: false,
    emailSuccessSubject: '',
    emailSuccessTemplate: '',
  });

  const [categoryFormData, setCategoryFormData] = useState<{ name: string; description: string; color: string; imageUrl: string; imagePosition: string; type: 'class' | 'event' | 'service' }>({ name: '', description: '', color: '#7452d6', imageUrl: '', imagePosition: '50% 50%', type: courseType });
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [categoryImagePreview, setCategoryImagePreview] = useState('');
  const [categoryImageUploading, setCategoryImageUploading] = useState(false);
  const [categoryImagePos, setCategoryImagePos] = useState({ x: 50, y: 50 });
  const [isDraggingCatImg, setIsDraggingCatImg] = useState(false);
  const catImgDragRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const catImgPosRef = useRef({ x: 50, y: 50 });
  const categoryImageRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number | string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNeedsForce, setDeleteNeedsForce] = useState(false);
  const [deleteType, setDeleteType] = useState<'course' | 'category'>('course');
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null);

  // Chips offered by the SMS template editor below — re-fetched whenever
  // the assigned registration form changes while the dialog is open, so
  // switching forms updates the available {{field_key}} chips immediately
  // without needing to save the course first.
  useEffect(() => {
    if (!isEditing || !formData.registrationFormId) {
      setSmsFormFields([]);
      return;
    }
    axios.get(`${API_BASE}/registration-forms/${formData.registrationFormId}`)
      .then(res => {
        const fields = res.data?.success ? (res.data.form?.fields || []) : [];
        setSmsFormFields(expandFamilyMemberPickerFields(fields));
      })
      .catch(() => setSmsFormFields([]));
  }, [isEditing, formData.registrationFormId]);

  // "ดูความจุคงเหลือ" — staff couldn't otherwise see remaining seats/team
  // spots without going through the Add Booking flow's slot picker; pulls
  // the same two endpoints the consumer app's booking wizard reads from.
  // Team capacity resets per round (see registrationFormRepository), so it's
  // fetched once per upcoming round, keyed by "date time" (the scheduledAt
  // shape the backend expects), not once for the whole course.
  const [capacityDialogCourse, setCapacityDialogCourse] = useState<Course | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacitySlots, setCapacitySlots] = useState<{ date: string; slots: any[] }[] | null>(null);
  const [capacityFormName, setCapacityFormName] = useState<string | null>(null);
  const [capacityTeamByRound, setCapacityTeamByRound] = useState<Record<string, { label: string; teams: { label: string; capacity: number; remaining: number }[] }[]>>({});

  const openCapacityDialog = async (course: Course) => {
    setCapacityDialogCourse(course);
    setCapacityLoading(true);
    setCapacitySlots(null);
    setCapacityFormName(null);
    setCapacityTeamByRound({});
    try {
      const [slotsRes, formRes] = await Promise.all([
        course.calendar_id
          ? axios.get(`${API_BASE}/calendar-slots/upcoming?calendarId=${course.calendar_id}`).catch(() => null)
          : Promise.resolve(null),
        course.registration_form_id
          ? axios.get(`${API_BASE}/registration-forms/${course.registration_form_id}`).catch(() => null)
          : Promise.resolve(null),
      ]);

      const upcoming: { date: string; slots: any[] }[] = slotsRes?.data?.success ? slotsRes.data.upcoming : [];
      setCapacitySlots(upcoming);

      const form = formRes?.data?.success ? formRes.data.form : null;
      const teamFields = (form?.fields || []).filter((f: any) => f.type === 'team_select');
      if (form && teamFields.length > 0) {
        setCapacityFormName(form.name);
        const teamOptionsByField = teamFields.map((f: any) => {
          let teamOptions: { label: string; capacity: number }[] = [];
          try { teamOptions = f.options_json ? JSON.parse(f.options_json) : []; } catch { /* malformed shouldn't block the rest */ }
          return { fieldKey: f.field_key, label: f.label, teamOptions };
        });

        const byRound: Record<string, { label: string; teams: { label: string; capacity: number; remaining: number }[] }[]> = {};
        await Promise.all(upcoming.flatMap(day => day.slots.map(async (s: any) => {
          const roundKey = `${day.date} ${s.startTime}`;
          const availRes = await axios.get(
            `${API_BASE}/registration-forms/${course.registration_form_id}/team-availability?courseId=${course.id}&scheduledAt=${encodeURIComponent(roundKey)}`
          ).catch(() => null);
          const counts = availRes?.data?.success ? availRes.data.counts : {};
          byRound[roundKey] = teamOptionsByField.map(f => ({
            label: f.label,
            teams: f.teamOptions.map(t => ({
              label: t.label, capacity: t.capacity,
              remaining: Math.max(0, t.capacity - (counts[f.fieldKey]?.[t.label] || 0)),
            })),
          }));
        })));
        setCapacityTeamByRound(byRound);
      }
    } finally {
      setCapacityLoading(false);
    }
  };

  // Invite-link management for a single round (course + calendar_slot_rule)
  // — the reserved invite_capacity itself is set per-rule in
  // CalendarManagement; this is just where staff generate/revoke the
  // PIN-protected links that unlock it, since this dialog already knows
  // which round (ruleId) belongs to which course.
  const [inviteLinksRound, setInviteLinksRound] = useState<{ courseId: number; ruleId: number; dateLabel: string } | null>(null);
  const [inviteLinks, setInviteLinks] = useState<any[]>([]);
  const [inviteLinksLoading, setInviteLinksLoading] = useState(false);
  const [newInviteLabel, setNewInviteLabel] = useState('');
  const [newInvitePin, setNewInvitePin] = useState('');
  const [newInviteExpiresAt, setNewInviteExpiresAt] = useState('');
  const [newInviteError, setNewInviteError] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);

  const fetchInviteLinks = async (ruleId: number) => {
    setInviteLinksLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/invite-access-links?calendarSlotRuleId=${ruleId}`);
      setInviteLinks(res.data.success ? res.data.links : []);
    } finally {
      setInviteLinksLoading(false);
    }
  };

  const openInviteLinksDialog = (courseId: number, ruleId: number, dateLabel: string) => {
    setInviteLinksRound({ courseId, ruleId, dateLabel });
    setNewInviteLabel(''); setNewInvitePin(''); setNewInviteExpiresAt(''); setNewInviteError('');
    fetchInviteLinks(ruleId);
  };

  const createInviteLink = async () => {
    if (!inviteLinksRound) return;
    // A password is optional now, so an empty box is a valid choice rather
    // than an error to fix.
    if (newInvitePin && !/^\d{4,8}$/.test(newInvitePin)) { setNewInviteError('ถ้าตั้งรหัสผ่าน ต้องเป็นตัวเลข 4-8 หลัก'); return; }
    setNewInviteError('');
    try {
      await axios.post(`${API_BASE}/invite-access-links`, {
        label: newInviteLabel.trim() || null,
        pin: newInvitePin || null,
        courseId: inviteLinksRound.courseId,
        calendarSlotRuleId: inviteLinksRound.ruleId,
        expiresAt: newInviteExpiresAt || null,
      });
      setNewInviteLabel(''); setNewInvitePin(''); setNewInviteExpiresAt('');
      await fetchInviteLinks(inviteLinksRound.ruleId);
    } catch (err: any) {
      setNewInviteError(err.response?.data?.message || 'สร้างลิงก์ไม่สำเร็จ');
    }
  };

  const revokeInviteLink = async (id: number) => {
    if (!inviteLinksRound) return;
    await axios.post(`${API_BASE}/invite-access-links/${id}/revoke`);
    await fetchInviteLinks(inviteLinksRound.ruleId);
  };

  const inviteShortUrl = (link: any) => (link.short_code ? `${CONSUMER_APP_URL}/i/${link.short_code}` : null);
  const inviteFullUrl = (link: any) => `${CONSUMER_APP_URL}/invite/${link.token}`;

  const copyInviteLink = (link: any, which: 'short' | 'full' = 'short') => {
    const url = which === 'short' ? (inviteShortUrl(link) || inviteFullUrl(link)) : inviteFullUrl(link);
    void copyText(url);
    setCopiedInviteId(link.id);
    setTimeout(() => setCopiedInviteId(prev => (prev === link.id ? null : prev)), 1500);
  };

  const copyCourseLink = (course: any) => {
    void copyText(getCourseDetailUrl(course)).then(() => {
      setCopiedLinkId(course.id);
      setTimeout(() => setCopiedLinkId(prev => (prev === course.id ? null : prev)), 1500);
    }).catch(() => {});
  };

  type TagField = 'skills' | 'metrics';
  const [libraryItems, setLibraryItems] = useState<SkillItem[]>([]);
  const [pickerState, setPickerState] = useState<{ open: boolean; field: TagField | null; type: SkillType | null }>({ open: false, field: null, type: null });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filters, setFilters] = useState({ search: '', category: '', type: '' });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const guideInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const [videoUploading, setVideoUploading] = useState(false);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [guideUploading, setGuideUploading] = useState(false);
  const [posterUploading, setPosterUploading] = useState(false);

  // ── Display Views (per-view curated image + focal point) ─────────────────
  const [imageViewDefs, setImageViewDefs] = useState<ImageViewDef[]>([]);
  const [posterViewDef, setPosterViewDef] = useState<ImageViewDef | null>(null);
  const [courseImageViews, setCourseImageViews] = useState<Record<string, CourseImageView>>({});
  // Poster gallery: every uploaded image gets its own focal point + zoom, keyed
  // by image URL, edited one-at-a-time via a modal (see posterModalImage).
  const [imageFocals, setImageFocals] = useState<Record<string, { focalX: number; focalY: number; zoom: number }>>({});
  const [posterModalImage, setPosterModalImage] = useState<string | null>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaModalTab, setMediaModalTab] = useState<'media' | 'video' | 'views' | 'poster'>('media');

  // Thumbnail + gallery images are shown merged as one gallery in the UI —
  // the first image in the merged list is auto-designated as thumbnailUrl,
  // keeping the underlying data model (and every place that falls back to
  // thumbnail_url elsewhere in the system) unchanged.
  const mergedImages = [formData.thumbnailUrl, ...formData.images].filter(Boolean);

  const addGalleryImages = (urls: string[]) => {
    if (urls.length === 0) return;
    setFormData(f => {
      if (!f.thumbnailUrl) {
        const [first, ...rest] = urls;
        return { ...f, thumbnailUrl: first, images: [...f.images, ...rest] };
      }
      return { ...f, images: [...f.images, ...urls] };
    });
  };

  const removeGalleryImage = (url: string) => {
    setFormData(f => {
      if (f.thumbnailUrl === url) {
        const [newThumb, ...rest] = f.images;
        return { ...f, thumbnailUrl: newThumb || '', images: rest };
      }
      return { ...f, images: f.images.filter(img => img !== url) };
    });

    // Framing is stored against the image URL, so deleting the picture has to
    // take its per-view assignment and its poster focal with it. Leaving them
    // behind is what made a deleted banner keep showing: the row still named a
    // file that is still sitting in R2.
    setCourseImageViews(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key]?.imageUrl === url) delete next[key];
      }
      return next;
    });
    setImageFocals(prev => {
      const { [url]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const [dragImageIndex, setDragImageIndex] = useState<number | null>(null);

  const reorderGalleryImages = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const reordered = [...mergedImages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const [newThumb, ...rest] = reordered;
    setFormData(f => ({ ...f, thumbnailUrl: newThumb || '', images: rest }));
  };

  // Drag-to-reorder is the only way to change the cover today, and it's
  // easy to miss — this is the same move (to index 0) as a one-click action,
  // for staff who just want a specific uploaded photo to be the cover
  // without dragging it across the whole gallery.
  const setAsCoverImage = (url: string) => {
    const index = mergedImages.indexOf(url);
    if (index > 0) reorderGalleryImages(index, 0);
  };

  useEffect(() => {
    axios.get(`${API_URL}/api/v1/image-views`).then(res => {
      if (res.data.success) {
        setImageViewDefs(res.data.views ?? []);
        setPosterViewDef(res.data.poster ?? null);
      }
    }).catch(() => {});
  }, []);

  const loadCourseImageViews = useCallback(async (courseId: number) => {
    if (!courseId) return;
    try {
      const res = await axios.get(`${API_BASE}/courses/${courseId}/image-views`);
      if (res.data.success) {
        const map: Record<string, CourseImageView> = {};
        for (const v of res.data.views as any[]) {
          map[v.view_key] = { imageUrl: v.image_url, focalX: v.focal_x, focalY: v.focal_y, zoom: v.zoom ?? 1 };
        }
        setCourseImageViews(map);
      }
    } catch (e) { console.error('Failed to load course image views', e); }
  }, []);

  const loadCourseImageFocals = useCallback(async (courseId: number) => {
    if (!courseId) return;
    try {
      const res = await axios.get(`${API_BASE}/courses/${courseId}/image-focals`);
      if (res.data.success) {
        const map: Record<string, { focalX: number; focalY: number; zoom: number }> = {};
        for (const f of res.data.focals as any[]) {
          map[f.image_url] = { focalX: f.focal_x, focalY: f.focal_y, zoom: f.zoom ?? 1 };
        }
        setImageFocals(map);
      }
    } catch (e) { console.error('Failed to load course image focals', e); }
  }, []);

  // An assignment only counts while its image is still in the gallery. Without
  // this check a view stayed pinned to a photo that had been replaced or
  // deleted, so the form kept showing — and kept saving — the old picture.
  const getViewImageUrl = (viewKey: string) => {
    const assigned = courseImageViews[viewKey]?.imageUrl;
    if (assigned && mergedImages.includes(assigned)) return assigned;
    return formData.thumbnailUrl || '';
  };
  const getViewFocal = (viewKey: string) => ({
    x: courseImageViews[viewKey]?.focalX ?? 50,
    y: courseImageViews[viewKey]?.focalY ?? 50,
    zoom: courseImageViews[viewKey]?.zoom ?? 1,
  });

  const setViewImage = (viewKey: string, imageUrl: string) => {
    setCourseImageViews(prev => ({
      ...prev,
      [viewKey]: { imageUrl, focalX: prev[viewKey]?.focalX ?? 50, focalY: prev[viewKey]?.focalY ?? 50, zoom: prev[viewKey]?.zoom ?? 1 },
    }));
  };

  const setViewFocal = (viewKey: string, focalX: number, focalY: number) => {
    setCourseImageViews(prev => ({
      ...prev,
      [viewKey]: { imageUrl: prev[viewKey]?.imageUrl || formData.thumbnailUrl, focalX, focalY, zoom: prev[viewKey]?.zoom ?? 1 },
    }));
  };

  const setViewZoom = (viewKey: string, zoom: number) => {
    setCourseImageViews(prev => ({
      ...prev,
      [viewKey]: { imageUrl: prev[viewKey]?.imageUrl || formData.thumbnailUrl, focalX: prev[viewKey]?.focalX ?? 50, focalY: prev[viewKey]?.focalY ?? 50, zoom },
    }));
  };

  // COALESCE equivalent for the client: courses created before migration 0074
  // have is_visible undefined and are visible.
  const isCourseVisible = (course: any) => course.is_visible !== 0;

  // Optimistic, because the whole point is a one-click toggle — waiting for a
  // round-trip before the icon changes makes it feel broken. Reverted on failure.
  const toggleCourseVisibility = async (course: any) => {
    const next = !isCourseVisible(course);
    setVisibilityBusyId(course.id);
    setCourses(prev => prev.map(c => (c.id === course.id ? { ...c, is_visible: next ? 1 : 0 } : c)));
    try {
      await axios.patch(`${API_BASE}/courses/${course.id}/visibility`, { isVisible: next });
    } catch {
      setCourses(prev => prev.map(c => (c.id === course.id ? { ...c, is_visible: next ? 0 : 1 } : c)));
      setSaveError('เปลี่ยนสถานะการแสดงคลาสไม่สำเร็จ');
    } finally {
      setVisibilityBusyId(null);
    }
  };

  // Shown on the Notifications tab label so an unconfigured course is visible
  // without opening the tab — the whole point of moving these behind one.
  const notifyChannelCount = (formData.smsSuccessEnabled ? 1 : 0) + (formData.emailSuccessEnabled ? 1 : 0);

  // Most courses use one image everywhere and only need it framed once. Doing
  // that meant repeating the same pick-image-then-drag-then-zoom three times,
  // once per ratio, which is the bulk of the work in this tab.
  const applyViewToAll = (sourceKey: string) => {
    const source = courseImageViews[sourceKey];
    const imageUrl = source?.imageUrl || formData.thumbnailUrl;
    if (!imageUrl) return;
    setCourseImageViews(prev => {
      const next = { ...prev };
      for (const def of imageViewDefs) {
        next[def.key] = {
          imageUrl,
          focalX: source?.focalX ?? 50,
          focalY: source?.focalY ?? 50,
          zoom: source?.zoom ?? 1,
        };
      }
      return next;
    });
  };

  const resetViewFraming = (viewKey: string) => {
    setCourseImageViews(prev => ({
      ...prev,
      [viewKey]: {
        imageUrl: prev[viewKey]?.imageUrl || formData.thumbnailUrl,
        focalX: 50, focalY: 50, zoom: 1,
      },
    }));
  };

  const getImageFocal = (imageUrl: string) => ({
    x: imageFocals[imageUrl]?.focalX ?? 50,
    y: imageFocals[imageUrl]?.focalY ?? 50,
    zoom: imageFocals[imageUrl]?.zoom ?? 1,
  });

  const setImageFocal = (imageUrl: string, focalX: number, focalY: number) => {
    setImageFocals(prev => ({ ...prev, [imageUrl]: { focalX, focalY, zoom: prev[imageUrl]?.zoom ?? 1 } }));
  };

  const setImageZoom = (imageUrl: string, zoom: number) => {
    setImageFocals(prev => ({ ...prev, [imageUrl]: { focalX: prev[imageUrl]?.focalX ?? 50, focalY: prev[imageUrl]?.focalY ?? 50, zoom } }));
  };

  // Persists both the curated per-view assignments and the poster per-image
  // focals — called from handleSubmit once the course itself has a valid id,
  // so there is a single "save class" action instead of a separate button.
  const saveImageViewsAndFocals = async (courseId: number) => {
    const views = imageViewDefs.map(def => ({
      viewKey: def.key,
      imageUrl: getViewImageUrl(def.key),
      focalX: getViewFocal(def.key).x,
      focalY: getViewFocal(def.key).y,
      zoom: getViewFocal(def.key).zoom,
    })).filter(v => !!v.imageUrl);

    const galleryImages = [formData.thumbnailUrl, ...formData.images].filter(Boolean);
    const focals = galleryImages.map(img => ({
      imageUrl: img,
      focalX: getImageFocal(img).x,
      focalY: getImageFocal(img).y,
      zoom: getImageFocal(img).zoom,
    }));

    // Always sent, including when empty. These endpoints replace the stored
    // set, so skipping the call on an empty list is exactly the case that has
    // to reach the server: deleting the last image left the old rows behind
    // and the banner kept rendering a picture that was no longer there.
    await Promise.all([
      axios.put(`${API_BASE}/courses/${courseId}/image-views`, { views }),
      axios.put(`${API_BASE}/courses/${courseId}/image-focals`, { focals }),
    ]);
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      const res = await axios.post(`${API_BASE}/upload`, fd);
      console.log('Upload success response:', res.data);
      return res.data.success ? res.data.url : null;
    } catch (err) {
      console.error('Upload failed error:', err);
      return null;
    }
  };
  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      return url;
    }
    return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const refreshLibrary = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/skills-library`);
      if (res.data.success) setLibraryItems(res.data.skills);
    } catch (e) { console.error('Failed to fetch skills library', e); }
  }, []);

  useEffect(() => {
    refreshLibrary();
    const handler = () => refreshLibrary();
    window.addEventListener('skills-library-updated', handler);
    return () => window.removeEventListener('skills-library-updated', handler);
  }, [refreshLibrary]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [coursesRes, catsRes, calRes, branchesRes, couponsRes, formsRes] = await Promise.all([
        axios.get(`${API_BASE}/courses?includeHidden=1`),
        axios.get(`${API_BASE}/categories`),
        axios.get(`${API_BASE}/calendars`),
        axios.get(`${API_BASE}/branches`),
        axios.get(`${API_BASE}/coupon-types`),
        axios.get(`${API_BASE}/registration-forms`),
      ]);
      if (coursesRes.data.success) setCourses(coursesRes.data.courses || []);
      if (catsRes.data.success) setCategories(catsRes.data.categories || []);
      if (calRes.data.success) setCalendars(calRes.data.calendars || []);
      if (branchesRes.data.success) setBranches(branchesRes.data.branches || []);
      if (couponsRes.data.success) setCouponTypes(couponsRes.data.couponTypes || []);
      if (formsRes.data.success) setRegistrationForms(formsRes.data.forms || []);
    } catch (e) { console.error('Failed to fetch data', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // Deep-link from the Dashboard's class table (?edit=<courseId>) — open
  // that course's edit dialog once its data has loaded, then drop the param
  // so refreshing/closing doesn't reopen it.
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || courses.length === 0) return;
    const course = courses.find(c => c.id === parseInt(editId));
    if (course) handleEditOpen(course);
    setSearchParams({}, { replace: true });
  }, [courses, searchParams]);

  useEffect(() => {
    if (!editCourse?.id) { setCourseReviews([]); return; }
    setReviewsLoading(true);
    axios.get(`${API_URL}/api/v1/courses/${editCourse.id}/reviews`)
      .then(res => { if (res.data.success) setCourseReviews(res.data.reviews); })
      .catch(e => console.error('Failed to fetch course reviews', e))
      .finally(() => setReviewsLoading(false));
  }, [editCourse?.id]);

  // One definition of "what this column contains", shared by the header filter
  // and the sort. Two separate definitions would eventually disagree, and a
  // column that sorts by one thing while filtering on another is worse than
  // neither.
  // Seats belong to a calendar, and the capacity endpoint is the one place
  // that knows how to add them up (see BookingCapacityRepository) — reusing it
  // keeps this column and the booking dashboard from ever disagreeing. Courses
  // sharing a calendar therefore show that calendar's totals, which is the
  // truth: they share the seats.
  const [capacityByCourse, setCapacityByCourse] = useState<Record<number, { booked: number; seats: number }>>({});

  useEffect(() => {
    axios.get(`${API_BASE}/analytics/booking-capacity`, { params: { days: 90 } })
      .then(res => {
        if (!res.data.success) return;
        const map: Record<number, { booked: number; seats: number }> = {};
        for (const cal of res.data.calendars ?? []) {
          for (const course of cal.courses ?? []) map[course.id] = { booked: cal.booked, seats: cal.seats };
        }
        setCapacityByCourse(map);
      })
      .catch(() => { /* the column just shows a dash — it is not worth failing the page over */ });
  }, []);


  const columnText = React.useCallback((course: any, key: string): string => {
    switch (key) {
      case 'id': return String(course.id ?? '');
      case 'code': return course.code || '';
      case 'name': return course.name || '';
      case 'type': return TYPE_META[getCourseType(course)]?.label || '';
      case 'category': return categories.find(c => c.id === course.category_id)?.name || '';
      case 'age': return formatAgeRange(course.age_min, course.age_max);
      case 'price': return course.original_price != null ? String(course.original_price) : '';
      case 'duration': return course.duration != null ? String(course.duration) : '';
      case 'seats': {
        const cap = capacityByCourse[course.id];
        return cap ? `${cap.booked}/${cap.seats}` : '';
      }
      case 'updated': return formatUpdatedAt(course.updated_at);
      default: return '';
    }
  }, [categories, capacityByCourse]);

  // Numeric columns sort by value, not by their printed text — otherwise 1000
  // lands before 900.
  const columnSortValue = React.useCallback((course: any, key: string): string | number => {
    switch (key) {
      // ID and the seat counts are numbers; sorting them as text puts 10
      // before 2, which is what made "sort by ID" look like it did nothing —
      // that column was also the class CODE, which is blank on every event.
      case 'id': return course.id ?? 0;
      case 'age': return course.age_min ?? 0;
      case 'price': return course.original_price ?? 0;
      case 'duration': return course.duration ?? 0;
      case 'seats': return capacityByCourse[course.id]?.booked ?? -1;
      case 'updated': return course.updated_at ? Date.parse(course.updated_at.replace(' ', 'T') + 'Z') || 0 : 0;
      default: return columnText(course, key).toLowerCase();
    }
  }, [columnText, capacityByCourse]);

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const filteredCourses = React.useMemo(() => {
    const matchesColumnFilters = (course: any) =>
      Object.entries(colFilters).every(([key, needle]) => {
        if (!needle) return true;
        return columnText(course, key).toLowerCase().includes(needle.toLowerCase());
      });

    const rows = courses.filter(course => {
      // Events and Services each live entirely on their own page now
      // (/crm/events, /crm/course-services) — the class page never shows
      // either, each dedicated page shows only its own type.
      if (courseType === 'class' ? (course.is_event || course.is_service) : getCourseType(course) !== courseType) return false;

      const q = filters.search.toLowerCase();
      const matchesSearch = !q ||
        course.name.toLowerCase().includes(q) ||
        (course.code && course.code.toLowerCase().includes(q)) ||
        course.id.toString().includes(q);
      const matchesCat = !filters.category || course.category_id === parseInt(filters.category);
      const matchesType = courseType !== 'class' || !filters.type || getCourseType(course) === filters.type;
      return matchesSearch && matchesCat && matchesType && matchesColumnFilters(course);
    });

    if (!sort) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = columnSortValue(a, sort.key);
      const bv = columnSortValue(b, sort.key);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      // localeCompare with 'th' so Thai names order the way staff expect
      // rather than by code point.
      return String(av).localeCompare(String(bv), 'th') * dir;
    });
  }, [courses, filters, courseType, colFilters, sort, columnText, columnSortValue]);

  // Day names for the per-round stamp list, Sunday first as JS numbers them.
  const DAY_LABELS: Record<number, string> = {
    0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์',
  };

  // A round's override is saved the moment it is picked: the rounds already
  // exist in the calendar, so there is nothing to create alongside the course.
  const setRoundDesign = async (ruleId: number, designId: number | null) => {
    setRewardRounds(rs => rs.map(r => r.id === ruleId ? { ...r, design_id: designId } : r));
    try {
      await axios.put(`${API_BASE}/stamp-design-bindings`, { scope: 'slot_rule', ref_id: ruleId, design_id: designId });
    } catch (e) {
      console.error('Failed to bind round stamp design', e);
    }
  };

  const handleEditOpen = async (course: Course | null = null) => {
    setSaveError(null);
    setPageTab(0);
    setCourseImageViews({});
    setImageFocals({});
    setPosterModalImage(null);
    // The design library is needed by both branches; the item's own settings
    // only exist once it does.
    axios.get(`${API_BASE}/stamp-designs`)
      .then(({ data }) => { if (data.success) setStampDesigns(data.designs); })
      .catch(() => setStampDesigns([]));
    setRewardSettings({ design_id: null, participation_badge_tier: null, certificate_auto: null });
    setRewardRounds([]);

    if (course) {
      loadCourseImageViews(course.id);
      loadCourseImageFocals(course.id);
      axios.get(`${API_BASE}/courses/${course.id}/reward-settings`)
        .then(({ data }) => {
          if (!data.success) return;
          setRewardSettings({
            design_id: data.design_id ?? null,
            participation_badge_tier: data.participation_badge_tier ?? null,
            certificate_auto: data.certificate_auto ?? null,
          });
          setRewardRounds(data.rounds || []);
        })
        .catch(() => { /* leave the defaults */ });
      let reqs: CouponRequirement[] = [];
      try {
        const { data } = await axios.get(`${API_BASE}/courses/${course.id}/coupons`);
        if (data.success && data.courseCoupons && data.courseCoupons.length > 0) {
          reqs = data.courseCoupons.map((cc: any) => ({
            typeId: cc.id.toString(),
            label: cc.name,
            count: cc.quantity_required
          }));
        } else {
          // fallback to old json
          reqs = course.coupon_requirements_json
            ? JSON.parse(course.coupon_requirements_json)
            : course.coupon_count
              ? [{ typeId: couponTypes[0]?.id?.toString() || '1', label: couponTypes[0]?.name || 'Coupon', count: course.coupon_count }]
              : [];
        }
      } catch (e) {
        console.error('Failed to fetch course coupons', e);
      }

      let skills = [];
      try { skills = course.achievement_skills_json ? JSON.parse(course.achievement_skills_json) : []; } catch (e) { }
      let metrics = [];
      try { metrics = course.metrics_json ? JSON.parse(course.metrics_json) : []; } catch (e) { }

      let checkinActions: string[] = [];
      try {
        const actionsRes = await axios.get(`${API_BASE}/courses/${course.id}/checkin-actions`);
        if (actionsRes.data.success) checkinActions = actionsRes.data.actions.map((a: any) => a.label);
      } catch (e) {
        console.error('Failed to fetch checkin actions', e);
      }

      setEditCourse(course);
      setFormData({
        id: course.id,
        code: course.code,
        name: course.name,
        nameEn: course.name_en || '',
        description: course.description || '',
        descriptionEn: course.description_en || '',
        shortDescription: course.short_description || '',
        shortDescriptionEn: (course as any).short_description_en || '',
        location: (course as any).location || '',
        locationLink: (course as any).location_link || '',
        branchIds: course.branch_ids ? JSON.parse(course.branch_ids) : [],
        categoryId: course.category_id,
        calendarId: course.calendar_id || 0,
        ageMin: course.age_min || 3,
        ageMax: course.age_max || 9,
        duration: course.duration || '01:00',
        originalPrice: course.original_price?.toString() || '',
        premiumPrice: course.premium_price?.toString() || '',
        couponRequirements: reqs,
        skills,
        metrics,
        thumbnailUrl: course.thumbnail_url || '',
        detailPosterUrl: (course as any).detail_poster_url || '',
        images: course.images_json ? JSON.parse(course.images_json) : [],
        videoUrl: course.video_url || '',
        teacherGuideUrl: course.teacher_guide_url || '',
        salesCommissionType: (course as any).sales_commission_type || 'percent',
        salesCommissionValue: (course as any).sales_commission_value != null ? String((course as any).sales_commission_value) : '',
        teacherCommissionType: (course as any).teacher_commission_type || 'percent',
        teacherCommissionValue: (course as any).teacher_commission_value != null ? String((course as any).teacher_commission_value) : '',
        isRecommended: !!course.is_recommended,
        isExtraclass: !!course.is_extraclass,
        isEvent: !!course.is_event,
        isService: !!course.is_service,
        allowRepeat: course.allow_repeat === undefined || course.allow_repeat === null ? true : !!course.allow_repeat,
        registrationFormId: course.registration_form_id || 0,
        registrationCloseAt: toDatetimeLocalValue(course.registration_close_at || undefined),
        stampsOnCompletion: course.stamps_on_completion ?? 0,
        stampExpiryMonths: course.stamp_expiry_months ?? 12,
        checkinActions,
        confirmationChannelMode: (course as any).confirmation_channel_mode || 'off',
        smsSuccessEnabled: !!(course as any).sms_success_enabled,
        smsSuccessTemplate: (course as any).sms_success_template || '',
        smsReminderTemplate: (course as any).sms_reminder_template || '',
        emailSuccessEnabled: !!(course as any).email_success_enabled,
        emailSuccessSubject: (course as any).email_success_subject || '',
        emailSuccessTemplate: (course as any).email_success_template || '',
      });
    } else {
      setEditCourse(null);
      const defaultScope = courseType;
      setFormData({
        id: 0, code: '', name: '', nameEn: '', description: '', descriptionEn: '', shortDescription: '', shortDescriptionEn: '', location: '', locationLink: '', branchIds: [],
        categoryId: categories.find(c => (c.type || 'class') === defaultScope)?.id || 0, calendarId: 0, ageMin: 3, ageMax: 9,
        duration: '01:00', originalPrice: '', premiumPrice: '', couponRequirements: [],
        skills: [] as { th: string; en: string }[], metrics: [] as { th: string; en: string }[], thumbnailUrl: '', detailPosterUrl: '', images: [], videoUrl: '', teacherGuideUrl: '',
        salesCommissionType: 'percent', salesCommissionValue: '',
        teacherCommissionType: 'percent', teacherCommissionValue: '',
        isRecommended: false,
        isExtraclass: false,
        isEvent: courseType === 'event',
        isService: courseType === 'service',
        // Events require 1 booking per child (no duplicates) — default
        // "allow repeat" off for new Events; staff can flip it back on
        // manually afterward if a specific event genuinely needs it.
        allowRepeat: courseType !== 'event',
        registrationFormId: 0,
        registrationCloseAt: '',
        stampsOnCompletion: 0,
        stampExpiryMonths: 12,
        checkinActions: [],
        confirmationChannelMode: 'off',
        smsSuccessEnabled: false,
        smsSuccessTemplate: '',
        smsReminderTemplate: '',
        emailSuccessEnabled: false,
        emailSuccessSubject: '',
        emailSuccessTemplate: '',
      });
    }
    setEditTab(0);
    setIsEditing(true);
  };

  // Staff-defined check-in actions (เช็คอิน, รับของที่ระลึก, ...) shown to
  // whoever scans an attendee's QR at the event — scoped per course, same
  // as the registration form, so different events can ask for different
  // things. Saved as a whole array on course save (see handleSubmit), not
  // incrementally, matching how coupon requirements/skills already work.
  const addCheckinAction = () => setFormData(f => ({ ...f, checkinActions: [...f.checkinActions, ''] }));
  const updateCheckinAction = (index: number, label: string) =>
    setFormData(f => ({ ...f, checkinActions: f.checkinActions.map((a, i) => i === index ? label : a) }));
  const removeCheckinAction = (index: number) =>
    setFormData(f => ({ ...f, checkinActions: f.checkinActions.filter((_, i) => i !== index) }));


  const addCouponRequirement = () => {
    if (couponTypes.length === 0) return;
    setFormData({
      ...formData,
      couponRequirements: [...formData.couponRequirements, { typeId: couponTypes[0].id.toString(), label: couponTypes[0].name, count: 1 }],
    });
  };

  const removeCouponRequirement = (idx: number) => setFormData({
    ...formData,
    couponRequirements: formData.couponRequirements.filter((_, i) => i !== idx),
  });

  const updateCouponRequirement = (idx: number, field: 'typeId' | 'count', value: string | number) => {
    const reqs = formData.couponRequirements.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'typeId') {
        const type = couponTypes.find(t => t.id.toString() === value.toString());
        return { ...r, typeId: value as string, label: type?.name ?? String(value) };
      }
      return { ...r, count: Math.max(1, Number(value)) };
    });
    setFormData({ ...formData, couponRequirements: reqs });
  };

  const handleSubmit = async () => {
    setSaveError(null);
    if (!formData.name.trim()) { setSaveError('กรุณากรอกชื่อคลาสเรียน'); return; }
    if (!formData.categoryId) { setSaveError('กรุณาเลือกหมวดหมู่'); return; }
    try {
      const payload = {
        code:              formData.code,
        name:              formData.name,
        nameEn:            formData.nameEn,
        description:       formData.description,
        descriptionEn:     formData.descriptionEn,
        shortDescription:  formData.shortDescription,
        shortDescriptionEn: formData.shortDescriptionEn,
        location:          formData.location,
        location_link:     formData.locationLink,
        branchIds:         JSON.stringify(formData.branchIds),
        categoryId:        formData.categoryId,
        calendarId:        formData.calendarId || null,
        ageMin:            formData.ageMin,
        ageMax:            formData.ageMax,
        duration:          formData.duration,
        originalPrice:          parseFloat(formData.originalPrice) || 0,
        premiumPrice:           parseFloat(formData.premiumPrice)  || 0,
        couponCount:            formData.couponRequirements.reduce((s, r) => s + r.count, 0) || 0,
        couponRequirementsJson: JSON.stringify(formData.couponRequirements),
        achievementSkillsJson:  JSON.stringify(formData.skills),
        metricsJson:           JSON.stringify(formData.metrics),
        thumbnailUrl:      formData.thumbnailUrl,
        detailPosterUrl:   formData.detailPosterUrl,
        imagesJson:        JSON.stringify(formData.images),
        videoUrl:          formData.videoUrl,
        teacherGuideUrl:   formData.teacherGuideUrl,
        salesCommissionType:    formData.salesCommissionValue ? formData.salesCommissionType : null,
        salesCommissionValue:   formData.salesCommissionValue ? parseFloat(formData.salesCommissionValue) : null,
        teacherCommissionType:  formData.teacherCommissionValue ? formData.teacherCommissionType : null,
        teacherCommissionValue: formData.teacherCommissionValue ? parseFloat(formData.teacherCommissionValue) : null,
        isRecommended:          formData.isRecommended,
        isExtraclass:           formData.isExtraclass,
        isEvent:                formData.isEvent,
        isService:              formData.isService,
        allowRepeat:            formData.allowRepeat,
        registrationFormId:     formData.registrationFormId || null,
        registrationCloseAt:    fromDatetimeLocalValue(formData.registrationCloseAt) || null,
        stampsOnCompletion:     formData.stampsOnCompletion,
        stampExpiryMonths:      formData.stampExpiryMonths,
        confirmationChannelMode: formData.confirmationChannelMode,
        smsSuccessEnabled:      formData.smsSuccessEnabled,
        smsSuccessTemplate:     formData.smsSuccessTemplate || null,
        smsReminderTemplate:    formData.smsReminderTemplate || null,
        emailSuccessEnabled:    formData.emailSuccessEnabled,
        emailSuccessSubject:    formData.emailSuccessSubject || null,
        emailSuccessTemplate:   formData.emailSuccessTemplate || null,
      };
      let courseId = editCourse?.id;
      if (editCourse) {
        await axios.put(`${API_BASE}/courses/${editCourse.id}`, payload);
      } else {
        const res = await axios.post(`${API_BASE}/courses`, payload);
        courseId = res.data.id;
      }
      
      if (courseId) {
        await axios.put(`${API_BASE}/courses/${courseId}/coupons`, {
          coupons: formData.couponRequirements.map(req => ({
             coupon_type_id: parseInt(req.typeId),
             quantity_required: req.count
          }))
        });
        await saveImageViewsAndFocals(courseId);
        await axios.put(`${API_BASE}/courses/${courseId}/checkin-actions`, {
          actions: formData.checkinActions.filter(label => label.trim()).map(label => ({ label: label.trim() })),
        });
        await axios.put(`${API_BASE}/courses/${courseId}/reward-settings`, rewardSettings);
      }

      setIsEditing(false);
      fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setSaveError(msg || 'ไม่สามารถบันทึกข้อมูลคลาสเรียนได้ กรุณาลองใหม่');
    }
  };

  // A failed delete used to go to console.error alone: the dialog closed
  // nothing, the class stayed on screen, and staff were left to conclude the
  // button was broken. Whatever the server says now reaches the person who
  // pressed it.
  const confirmDelete = async (force = false) => {
    if (!itemToDelete) return;
    setDeleteError(null);
    setDeleteNeedsForce(false);
    try {
      if (deleteType === 'course') {
        await axios.delete(`${API_BASE}/courses/${itemToDelete.id}${force ? '?force=true' : ''}`);
      } else {
        await axios.delete(`${API_BASE}/categories/${itemToDelete.id}`);
      }
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchData();
    } catch (e: any) {
      const data = e?.response?.data;
      // 409 + requiresForce means the class has real attendance behind it —
      // the server is asking whether to destroy that too, not refusing.
      setDeleteNeedsForce(!!data?.requiresForce);
      setDeleteError(data?.message || 'ลบไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleCategoryImageUpload = async (file: File) => {
    setCategoryImageUploading(true);
    setCategoryImagePreview(URL.createObjectURL(file));
    const resetPos = { x: 50, y: 50 };
    setCategoryImagePos(resetPos);
    catImgPosRef.current = resetPos;
    setCategoryFormData(p => ({ ...p, imagePosition: '50% 50%' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'categories');
      const res = await axios.post(`${API_BASE}/upload`, fd);
      if (res.data.success) {
        setCategoryFormData(prev => ({ ...prev, imageUrl: res.data.url }));
      } else {
        setCategoryError('อัปโหลดรูปไม่สำเร็จ');
      }
    } catch {
      setCategoryError('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setCategoryImageUploading(false);
    }
  };

  const handleCategorySubmit = async () => {
    if (!categoryFormData.name.trim()) return;
    setCategoryError(null);
    setCategorySubmitting(true);
    try {
      if (editCategory) await axios.put(`${API_BASE}/categories/${editCategory.id}`, categoryFormData);
      else await axios.post(`${API_BASE}/categories`, categoryFormData);
      setCategoryFormData({ name: '', description: '', color: '#7452d6', imageUrl: '', imagePosition: '50% 50%', type: courseType });
      setCategoryImagePreview('');
      setCategoryImagePos({ x: 50, y: 50 });
      catImgPosRef.current = { x: 50, y: 50 };
      setEditCategory(null);
      setCategoryFormDialogOpen(false);
      fetchData();
    } catch (e: any) {
      setCategoryError(e.response?.data?.message || e.message || 'เกิดข้อผิดพลาด ไม่สามารถบันทึกได้');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const togglePickerItem = (item: SkillItem) => {
    if (!pickerState.field) return;
    const field = pickerState.field;
    const current = formData[field];
    const exists = current.some(s => s.th === item.name);
    setFormData({
      ...formData,
      [field]: exists
        ? current.filter(s => s.th !== item.name)
        : [...current, { th: item.name, en: item.name_en || '' }],
    });
  };

  // Derived state
  const selectedPreset = AGE_PRESETS.find(p => p.min === formData.ageMin && p.max === formData.ageMax);
  const durationHour = formData.duration.split(':')[0] || '01';
  const durationMinute = formData.duration.split(':')[1] || '00';

  // Class/Event/Service categories are separate pools — which one applies
  // depends on the COURSE's own type, matching whichever dedicated page
  // it's edited from.
  const categoryScope: 'class' | 'event' | 'service' = formData.isEvent ? 'event' : formData.isService ? 'service' : 'class';
  const categoriesForCourse = categories.filter(c => (c.type || 'class') === categoryScope);
  // The category tab/list itself is scoped by page the same way — each of
  // the three pages manages only its own category pool.
  const categoriesForPage = categories.filter(c => (c.type || 'class') === courseType);
  // Labels that vary per page — three pages, one shared implementation.
  const pageLabels = {
    class:   { title: 'จัดการคลาสเรียน', add: 'เพิ่มคลาส', tab: 'รายการคลาส', editTitle: 'แก้ไขคลาสเรียน', createTitle: 'สร้างคลาสเรียนใหม่', empty: 'ไม่พบข้อมูลคลาสเรียน' },
    event:   { title: 'จัดการกิจกรรม (Event)', add: 'เพิ่มกิจกรรม', tab: 'รายการกิจกรรม', editTitle: 'แก้ไขกิจกรรม', createTitle: 'สร้างกิจกรรมใหม่', empty: 'ไม่พบข้อมูลกิจกรรม' },
    service: { title: 'จัดการบริการ (Service)', add: 'เพิ่มบริการ', tab: 'รายการบริการ', editTitle: 'แก้ไขบริการ', createTitle: 'สร้างบริการใหม่', empty: 'ไม่พบข้อมูลบริการ' },
  }[courseType];

  if (loading && !isEditing) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  // ─── Edit Form ───────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <Box sx={{ pb: 12 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {editCourse ? pageLabels.editTitle : pageLabels.createTitle}
            </Typography>
            {editCourse && <Typography variant="body2" color="text.secondary">{editCourse.name}</Typography>}
          </Box>
        </Box>

        {saveError && <Alert severity="error" onClose={() => setSaveError(null)} sx={{ mb: 3 }}>{saveError}</Alert>}

        <Grid container spacing={3}>
          {/* Single full-width column now — the media/guide summary boxes
              that used to live in a separate right sidebar are folded into
              Basic Info below instead, so the whole form uses the full width. */}
          <Grid item xs={12}>

            {/* The edit form was one ~1,000-line scroll of six stacked sections,
                which made anything below the fold hard to find and left nowhere
                obvious to put the email template. Grouped into tabs instead.
                Notifications is its own tab because SMS and email are two
                channels for the same event and have to be seen together.

                "รูปภาพและสื่อ" is not a separate tab yet: the media summary,
                poster and teacher-guide boxes are Grid items nested inside Basic
                Info (see the comment above), so pulling them out is a separate
                move rather than a regrouping. */}
            <Tabs
              value={editTab}
              onChange={(_, v) => setEditTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Tab label="ข้อมูลพื้นฐาน" sx={{ textTransform: 'none', fontWeight: 700 }} />
              <Tab label="ราคาและคูปอง" sx={{ textTransform: 'none', fontWeight: 700 }} />
              <Tab
                label={notifyChannelCount === 0 ? 'การแจ้งเตือน (ปิดอยู่)' : `การแจ้งเตือน (${notifyChannelCount})`}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              />
              {courseType === 'class' && <Tab label="ทักษะและตัวชี้วัด" sx={{ textTransform: 'none', fontWeight: 700 }} />}
            </Tabs>

            {editTab === 0 && (<>
            {/* Basic Info */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<CategoryIcon />} title="ข้อมูลพื้นฐาน" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>หมวดหมู่ *</InputLabel>
                    <Select value={formData.categoryId} label="หมวดหมู่ *" onChange={e => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                      {categoriesForCourse.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="รหัสวิชา (Subject Code)" fullWidth value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>สาขา (Branches)</InputLabel>
                    <Select
                      multiple
                      value={formData.branchIds}
                      label="สาขา (Branches)"
                      onChange={e => setFormData({ ...formData, branchIds: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
                      renderValue={(selected) => selected.map(id => branches.find(b => b.id.toString() === id)?.name).filter(Boolean).join(', ')}
                    >
                      {branches.map(b => <MenuItem key={b.id} value={b.id.toString()}>{b.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>ปฏิทิน (Calendar)</InputLabel>
                    <Select value={formData.calendarId} label="ปฏิทิน (Calendar)" onChange={e => setFormData({ ...formData, calendarId: Number(e.target.value) })}>
                      <MenuItem value={0}><em>(ไม่ผูกกับปฏิทิน)</em></MenuItem>
                      {calendars.map(cal => <MenuItem key={cal.id} value={cal.id}>{cal.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField label="🇹🇭 ชื่อคลาส (ภาษาไทย) *" fullWidth value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ position: 'relative' }}>
                    <TextField label="🇬🇧 Class Name (English)" fullWidth value={formData.nameEn} onChange={e => setFormData({ ...formData, nameEn: e.target.value })} />
                    <Tooltip title="แปลจากภาษาไทยอัตโนมัติ">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => translateField('name')}
                          disabled={translatingField === 'name' || !formData.name.trim()}
                          sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}
                        >
                          {translatingField === 'name' ? <CircularProgress size={16} /> : <TranslateIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <FormControlLabel
                      control={<Switch checked={formData.isRecommended} onChange={e => setFormData({ ...formData, isRecommended: e.target.checked })} />}
                      label="คลาสแนะนำ"
                    />
                    {/* Type toggles are fixed by which page you're on
                        (/crm/courses vs /crm/events vs /crm/course-services)
                        — showing them here would just let staff accidentally
                        create a course under the wrong page's type. */}
                    {courseType === 'class' && (
                      <FormControlLabel
                        control={<Switch checked={formData.isExtraclass} onChange={e => setFormData({ ...formData, isExtraclass: e.target.checked })} color="secondary" />}
                        label="คลาสพิเศษ"
                      />
                    )}
                    <FormControlLabel
                      control={<Switch checked={formData.allowRepeat} onChange={e => setFormData({ ...formData, allowRepeat: e.target.checked })} />}
                      label="อนุญาตให้เข้าร่วมซ้ำ"
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>แบบฟอร์มลงทะเบียน</InputLabel>
                    <Select
                      value={formData.registrationFormId || 0}
                      label="แบบฟอร์มลงทะเบียน"
                      onChange={e => setFormData({ ...formData, registrationFormId: Number(e.target.value) })}
                    >
                      <MenuItem value={0}>ไม่ใช้ฟอร์มเพิ่มเติม</MenuItem>
                      {registrationForms.map(f => (
                        <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="วันปิดรับลงทะเบียน (ถ้ามี)"
                    type="datetime-local"
                    fullWidth
                    size="small"
                    value={formData.registrationCloseAt}
                    onChange={e => setFormData({ ...formData, registrationCloseAt: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    helperText="เมื่อถึงวันเวลานี้ ปุ่มจองจะถูกซ่อน แต่ยังแสดงในรายการตามปกติ"
                  />
                </Grid>

                {/* Custom check-in actions — a simple staff-defined text list
                    (เช็คอิน, รับของที่ระลึก, ...) shown to whoever scans this
                    course's attendees at /crm/checkin-scanner. No types/
                    options needed, unlike the registration form builder —
                    each one is just a thing to tick off. */}
                <Grid item xs={12}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                    รายการเช็คอิน (สำหรับหน้าสแกน QR)
                  </Typography>
                  <Stack spacing={1}>
                    {formData.checkinActions.map((action, index) => (
                      <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="เช่น เช็คอิน, รับของที่ระลึก"
                          value={action}
                          onChange={e => updateCheckinAction(index, e.target.value)}
                        />
                        <IconButton size="small" onClick={() => removeCheckinAction(index)} sx={{ color: 'error.main' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                    <Button size="small" startIcon={<AddIcon />} onClick={addCheckinAction} sx={{ alignSelf: 'flex-start', borderRadius: 2 }}>
                      เพิ่มรายการเช็คอิน
                    </Button>
                  </Stack>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    label="แต้มที่ได้รับเมื่อเข้าร่วม"
                    type="number"
                    fullWidth
                    inputProps={{ min: 0 }}
                    value={formData.stampsOnCompletion}
                    onChange={e => setFormData({ ...formData, stampsOnCompletion: Math.max(0, parseInt(e.target.value) || 0) })}
                    helperText="แต้มไว้แลกของรางวัล (คนละส่วนกับดวงแสตมป์สะสม ซึ่งได้ 1 ดวงต่อการมา 1 ครั้ง)"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="ระยะเวลาหมดอายุแต้ม (เดือน)"
                    type="number"
                    fullWidth
                    inputProps={{ min: 1 }}
                    value={formData.stampExpiryMonths}
                    onChange={e => setFormData({ ...formData, stampExpiryMonths: Math.max(1, parseInt(e.target.value) || 12) })}
                    helperText="วันหมดอายุจริงจะปัดขึ้นเป็นสิ้นเดือน 6 หรือสิ้นปี · ดวงแสตมป์ไม่มีวันหมดอายุ"
                  />
                </Grid>

                {/* Which stamp this item gives, and whether turning up earns a
                    medal. Saved through its own endpoint on submit, so the
                    ~60-parameter course update is left alone. */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>ดีไซน์แสตมป์ของกิจกรรมนี้</InputLabel>
                    <Select
                      label="ดีไซน์แสตมป์ของกิจกรรมนี้"
                      value={rewardSettings.design_id ?? ''}
                      onChange={e => setRewardSettings(s => ({ ...s, design_id: e.target.value === '' ? null : Number(e.target.value) }))}
                    >
                      <MenuItem value="">ใช้รูปตามลำดับดวง (แบบเดิม)</MenuItem>
                      {stampDesigns.filter((d: any) => d.is_active).map((d: any) => (
                        <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>เข้าร่วมแล้วได้เหรียญ</InputLabel>
                    <Select
                      label="เข้าร่วมแล้วได้เหรียญ"
                      value={rewardSettings.participation_badge_tier ?? ''}
                      onChange={e => setRewardSettings(s => ({ ...s, participation_badge_tier: e.target.value === '' ? null : Number(e.target.value) }))}
                    >
                      <MenuItem value="">ไม่ให้อัตโนมัติ (มอบเองหลังแข่ง)</MenuItem>
                      <MenuItem value={3}>อันดับ 3 — ผู้เข้าร่วมทุกคน</MenuItem>
                      <MenuItem value={2}>อันดับ 2</MenuItem>
                      <MenuItem value={1}>อันดับ 1</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* When this item prints certificates by itself. Off by default,
                    because a certificate carries a child's name and a date —
                    it should be issued when someone means to, not as a side
                    effect of an item being created. */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>ออกเกียรติบัตรอัตโนมัติ</InputLabel>
                    <Select
                      label="ออกเกียรติบัตรอัตโนมัติ"
                      value={rewardSettings.certificate_auto ?? ''}
                      onChange={e => setRewardSettings(s => ({ ...s, certificate_auto: e.target.value === '' ? null : String(e.target.value) }))}
                    >
                      <MenuItem value="">ไม่ออกอัตโนมัติ (กดออกเองจากรายการลงทะเบียน)</MenuItem>
                      <MenuItem value="checkin">เมื่อเช็คอินหน้างาน — สำหรับงานวันเดียว</MenuItem>
                      <MenuItem value="completion">เมื่อกดจบคลาส — สำหรับคลาสที่เรียนจบเป็นรอบ</MenuItem>
                    </Select>
                    <FormHelperText>
                      ออกให้ใบเดียวต่อการจอง กดซ้ำหรือเช็คอินซ้ำก็ไม่ออกเพิ่ม · ถ้าเลือก “เมื่อเช็คอิน” แล้วยกเลิกการเช็คอินทั้งหมด ใบที่ออกจากประตูจะถูกเพิกถอนให้
                    </FormHelperText>
                  </FormControl>
                </Grid>

                {rewardRounds.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                      แสตมป์รายรอบ (ถ้าไม่ตั้ง จะใช้ดีไซน์ของกิจกรรมด้านบน)
                    </Typography>
                    <Stack spacing={1}>
                      {rewardRounds.map((r: any) => (
                        <Box key={r.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ minWidth: 190 }}>
                            {r.specific_date ? r.specific_date : `ทุก${DAY_LABELS[r.day_of_week] || ''}`} · {String(r.start_time).slice(0, 5)}
                          </Typography>
                          <FormControl size="small" sx={{ minWidth: 240 }}>
                            <Select
                              value={r.design_id ?? ''}
                              onChange={e => setRoundDesign(r.id, e.target.value === '' ? null : Number(e.target.value))}
                              displayEmpty
                            >
                              <MenuItem value="">ตามกิจกรรม</MenuItem>
                              {stampDesigns.filter((d: any) => d.is_active).map((d: any) => (
                                <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                      ))}
                    </Stack>
                  </Grid>
                )}

                {/* Media + Teacher Guide — moved here from a separate right
                    sidebar column to reclaim horizontal width; the full
                    media editor still lives in the modal opened below. */}
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>สื่อประกอบคลาส</Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ width: 56, height: 56, borderRadius: 2, overflow: 'hidden', bgcolor: '#f1f5f9', flexShrink: 0, border: '1px solid #eee' }}>
                      {formData.thumbnailUrl ? (
                        <img src={getImageUrl(formData.thumbnailUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      ) : (
                        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImageIcon color="disabled" fontSize="small" />
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {mergedImages.length > 0 ? `รูปภาพ ${mergedImages.length} รูป` : 'ยังไม่มีรูปภาพ'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {formData.videoUrl ? 'มีวิดีโอ' : 'ยังไม่มีวิดีโอ'}
                      </Typography>
                    </Box>
                  </Box>

                  {/* The same image is shown at three different aspect ratios
                      around the apps, and which part survives the crop is set
                      per ratio in the media editor's "มุมมองการแสดงผล" tab. That
                      tab used to be invisible from here: this summary said only
                      how many images there were, so there was no way to tell
                      that per-ratio framing existed, let alone whether it had
                      been set. These miniatures render with the same
                      object-position/scale the editor uses, so what is shown
                      here is the real crop, and each one opens the editor on
                      that tab. */}
                  {imageViewDefs.length > 0 && (
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                        การครอปตามขนาดที่แสดงผล
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1.5 }}>
                        {imageViewDefs.map(def => {
                          const focal = getViewFocal(def.key);
                          return (
                            <CourseViewPreview
                              key={def.key}
                              imageUrl={getImageUrl(getViewImageUrl(def.key))}
                              ratioW={def.ratioW}
                              ratioH={def.ratioH}
                              focalX={focal.x}
                              focalY={focal.y}
                              zoom={focal.zoom}
                              label={def.label}
                              isFallback={!courseImageViews[def.key]}
                              onClick={() => { setMediaModalTab('views'); setMediaModalOpen(true); }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      fullWidth variant="outlined" size="small" startIcon={<ImageIcon />}
                      onClick={() => { setMediaModalTab('media'); setMediaModalOpen(true); }}
                    >
                      รูปภาพและวิดีโอ
                    </Button>
                    <Button
                      fullWidth variant="outlined" size="small" startIcon={<CropIcon />}
                      onClick={() => { setMediaModalTab('views'); setMediaModalOpen(true); }}
                    >
                      ตั้งค่าการครอป
                    </Button>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  {/* Separate upload from the Cover image above — this is a
                      portrait-ratio image shown only on the class detail
                      page (desktop: above the Register button; mobile:
                      before the full description). Not the same thing as
                      the "แกลเลอรีโปสเตอร์" tab in the media modal (that's a
                      multi-image gallery with per-image focal points that
                      replaces the Cover banner). */}
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                    โปสเตอร์ (แสดงแยกในหน้ารายละเอียดคลาส อัตราส่วนแนวตั้ง)
                  </Typography>
                  {formData.detailPosterUrl ? (
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Box sx={{ width: 56, height: 74, borderRadius: 2, overflow: 'hidden', bgcolor: '#f1f5f9', flexShrink: 0, border: '1px solid #eee' }}>
                        <img src={getImageUrl(formData.detailPosterUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', gap: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => posterInputRef.current?.click()} disabled={posterUploading}>
                          {posterUploading ? <CircularProgress size={16} /> : 'เปลี่ยนรูป'}
                        </Button>
                        <IconButton size="small" color="error" onClick={() => setFormData(f => ({ ...f, detailPosterUrl: '' }))}><ClearIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  ) : (
                    <Box
                      onClick={() => posterInputRef.current?.click()}
                      sx={{ py: 2.5, border: '2px dashed #e2e8f0', borderRadius: 2, textAlign: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc', borderColor: 'primary.main' } }}
                    >
                      {posterUploading ? <CircularProgress size={22} sx={{ mb: 0.5 }} /> : <ImageIcon color="disabled" sx={{ fontSize: 22, mb: 0.5 }} />}
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>อัปโหลดโปสเตอร์</Typography>
                      <Typography variant="caption" color="text.secondary">คลิกเพื่อเลือกไฟล์</Typography>
                    </Box>
                  )}
                  <input type="file" hidden accept="image/*" ref={posterInputRef} onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPosterUploading(true);
                    const url = await uploadFile(file, 'posters');
                    if (url) setFormData(f => ({ ...f, detailPosterUrl: url }));
                    setPosterUploading(false);
                    e.target.value = '';
                  }} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>คู่มือการสอน</Typography>
                  {formData.teacherGuideUrl ? (
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GuideIcon fontSize="small" color="action" />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>มีไฟล์คู่มือแล้ว</Typography>
                      </Box>
                      <Box>
                        <IconButton size="small" color="primary" onClick={() => window.open(formData.teacherGuideUrl, '_blank')}><PreviewIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => setFormData({ ...formData, teacherGuideUrl: '' })}><ClearIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  ) : (
                    <Box
                      onClick={() => guideInputRef.current?.click()}
                      sx={{ py: 2.5, border: '2px dashed #e2e8f0', borderRadius: 2, textAlign: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc', borderColor: 'primary.main' } }}
                    >
                      <UploadIcon color="disabled" sx={{ fontSize: 22, mb: 0.5 }} />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>อัปโหลดคู่มือ PDF</Typography>
                      <Typography variant="caption" color="text.secondary">คลิกเพื่อเลือกไฟล์</Typography>
                    </Box>
                  )}
                  <input type="file" hidden accept="application/pdf" ref={guideInputRef} onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setGuideUploading(true);
                    const url = await uploadFile(file, 'guides');
                    if (url) setFormData(f => ({ ...f, teacherGuideUrl: url }));
                    setGuideUploading(false);
                    e.target.value = '';
                  }} />
                </Grid>
              </Grid>
            </Paper>

            {/* Age Range */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<AgeIcon />} title="ช่วงอายุผู้เรียน" />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {AGE_PRESETS.map(p => {
                  const active = formData.ageMin === p.min && formData.ageMax === p.max;
                  return (
                    <Chip
                      key={p.label}
                      label={p.label}
                      onClick={() => setFormData({ ...formData, ageMin: p.min, ageMax: p.max })}
                      color={active ? 'primary' : 'default'}
                      variant={active ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 700, borderRadius: 2 }}
                    />
                  );
                })}
                <Chip
                  label="กำหนดเอง"
                  onClick={() => setFormData({ ...formData, ageMin: 0, ageMax: 0 })}
                  color={!selectedPreset ? 'primary' : 'default'}
                  variant={!selectedPreset ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700, borderRadius: 2 }}
                />
              </Box>
              {!selectedPreset ? (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    label="อายุต่ำสุด (ปี)" type="number" size="small"
                    value={formData.ageMin}
                    onChange={e => setFormData({ ...formData, ageMin: parseFloat(e.target.value) || 0 })}
                    inputProps={{ min: 0, max: 20, step: 0.5 }}
                    sx={{ width: 160 }}
                  />
                  <Typography sx={{ fontWeight: 800, color: 'text.secondary' }}>–</Typography>
                  <TextField
                    label="อายุสูงสุด (ปี)" type="number" size="small"
                    value={formData.ageMax}
                    onChange={e => setFormData({ ...formData, ageMax: parseFloat(e.target.value) || 0 })}
                    inputProps={{ min: 0, max: 20, step: 0.5 }}
                    sx={{ width: 160 }}
                  />
                </Box>
              ) : (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, bgcolor: 'primary.50', px: 2, py: 0.75, borderRadius: 2, border: '1px solid', borderColor: 'primary.100' }}>
                  <AgeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {formData.ageMin} – {formData.ageMax} ปี
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* Description + Duration */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<DurationIcon />} title="รายละเอียดและระยะเวลา" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ position: 'relative' }}>
                    <TextField label="🇹🇭 รายละเอียดอย่างย่อ (ภาษาไทย) - แสดงบนการ์ด" multiline rows={3} fullWidth value={formData.shortDescription} onChange={e => setFormData({ ...formData, shortDescription: e.target.value })} />
                    <Tooltip title="ขยาย">
                      <IconButton size="small" onClick={() => setDescExpandModal({ open: true, lang: 'th', field: 'shortDescription' })} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}>
                        <ExpandIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ position: 'relative' }}>
                    <TextField label="🇬🇧 รายละเอียดอย่างย่อ (ภาษาอังกฤษ) - แสดงบนการ์ด" multiline rows={3} fullWidth value={formData.shortDescriptionEn} onChange={e => setFormData({ ...formData, shortDescriptionEn: e.target.value })} />
                    <Tooltip title="แปลจากภาษาไทยอัตโนมัติ">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => translateField('shortDescription')}
                          disabled={translatingField === 'shortDescription' || !formData.shortDescription.trim()}
                          sx={{ position: 'absolute', top: 6, right: 40, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}
                        >
                          {translatingField === 'shortDescription' ? <CircularProgress size={16} /> : <TranslateIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setDescExpandModal({ open: true, lang: 'en', field: 'shortDescription' })} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}>
                        <ExpandIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                    🇹🇭 รายละเอียด (ภาษาไทย)
                  </Typography>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(html) => setFormData({ ...formData, description: html })}
                    placeholder="กรอกรายละเอียดคลาส..."
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>🇬🇧 Description (English)</Typography>
                    <Tooltip title="แปลจากภาษาไทยอัตโนมัติ (ฉบับร่าง)">
                      <span>
                        <Button
                          size="small"
                          startIcon={translatingField === 'description' ? <CircularProgress size={14} /> : <TranslateIcon sx={{ fontSize: 16 }} />}
                          onClick={() => translateField('description')}
                          disabled={translatingField === 'description' || !formData.description.trim()}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          แปลอัตโนมัติ
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                  <RichTextEditor
                    value={formData.descriptionEn}
                    onChange={(html) => setFormData({ ...formData, descriptionEn: html })}
                    placeholder="Write class description..."
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>ระยะเวลาเรียน</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                    {[{ label: '30 นาที', value: '00:30' }, { label: '60 นาที', value: '01:00' }].map(p => (
                      <Chip
                        key={p.value}
                        label={p.label}
                        onClick={() => setFormData({ ...formData, duration: p.value })}
                        color={formData.duration === p.value ? 'primary' : 'default'}
                        variant={formData.duration === p.value ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700, borderRadius: 2 }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <FormControl sx={{ width: 110 }}>
                      <InputLabel>ชั่วโมง</InputLabel>
                      <Select value={durationHour} label="ชั่วโมง" onChange={e => setFormData({ ...formData, duration: `${e.target.value}:${durationMinute}` })}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <MenuItem key={i} value={`0${i}`}>{i}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>ชม.</Typography>
                    <FormControl sx={{ width: 110 }}>
                      <InputLabel>นาที</InputLabel>
                      <Select value={durationMinute} label="นาที" onChange={e => setFormData({ ...formData, duration: `${durationHour}:${e.target.value}` })}>
                        {['00', '15', '30', '45'].map(m => (
                          <MenuItem key={m} value={m}>{m}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>นาที</Typography>
                  </Box>
                </Grid>
                {(formData.isExtraclass || formData.isEvent) && (
                  <Grid item xs={12}>
                    <TextField label="📍 สถานที่จัดกิจกรรม (ระบุเมื่อเป็น Extra Class หรือ Event)" fullWidth placeholder="เช่น ลานกิจกรรมชั้น 1 Central Chidlom" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                  </Grid>
                )}
                {(formData.isExtraclass || formData.isEvent) && (
                  <Grid item xs={12}>
                    <TextField label="🔗 ลิงก์ Google Map (สถานที่จัดกิจกรรม)" fullWidth placeholder="เช่น https://maps.app.goo.gl/..." value={formData.locationLink} onChange={e => setFormData({ ...formData, locationLink: e.target.value })} />
                  </Grid>
                )}
              </Grid>
            </Paper>
            </>)}

            {editTab === 1 && (<>
            {/* Pricing */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<PriceIcon />} title="ราคาและคูปอง" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="ราคาปกติ" type="number" fullWidth
                    value={formData.originalPrice}
                    onChange={e => setFormData({ ...formData, originalPrice: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="ราคา Premium Member" type="number" fullWidth
                    value={formData.premiumPrice}
                    onChange={e => setFormData({ ...formData, premiumPrice: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      ประเภทคูปองที่ต้องใช้
                      {formData.couponRequirements.length > 0 && (
                        <Box component="span" sx={{ ml: 1, color: 'primary.main' }}>
                          (รวม {formData.couponRequirements.reduce((s, r) => s + r.count, 0)} ใบ)
                        </Box>
                      )}
                    </Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addCouponRequirement} variant="outlined" sx={{ borderRadius: 2 }}>
                      เพิ่มประเภทคูปอง
                    </Button>
                  </Box>

                  {formData.couponRequirements.length === 0 ? (
                    <Box sx={{ p: 2.5, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.disabled">ยังไม่ได้กำหนดประเภทคูปอง — กด "เพิ่มประเภทคูปอง" เพื่อเริ่มต้น</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {formData.couponRequirements.map((req, idx) => {
                        const typeInfo = couponTypes.find(t => t.id === req.typeId);
                        return (
                          <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <FormControl size="small" sx={{ flex: 2, minWidth: 160 }}>
                              <InputLabel>ประเภทคูปอง</InputLabel>
                              <Select
                                value={req.typeId}
                                label="ประเภทคูปอง"
                                onChange={e => updateCouponRequirement(idx, 'typeId', e.target.value)}
                              >
                                {couponTypes.map(t => (
                                  <MenuItem key={t.id} value={t.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color, flexShrink: 0 }} />
                                      {t.name}
                                    </Box>
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <TextField
                              label="จำนวน (ใบ)"
                              type="number"
                              size="small"
                              sx={{ width: 110 }}
                              value={req.count}
                              onChange={e => updateCouponRequirement(idx, 'count', e.target.value)}
                              inputProps={{ min: 1, max: 99 }}
                            />
                            <Box sx={{
                              display: 'flex', alignItems: 'center', gap: 1, flex: 1,
                              px: 1.5, py: 0.9, borderRadius: 2,
                              bgcolor: (typeInfo?.color ?? '#888') + '18',
                              border: '1px solid', borderColor: (typeInfo?.color ?? '#888') + '44',
                            }}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: typeInfo?.color ?? '#888', flexShrink: 0 }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, color: typeInfo?.color ?? 'text.secondary' }}>
                                {req.count} × {typeInfo?.name ?? req.label}
                              </Typography>
                            </Box>
                            <IconButton size="small" color="error" onClick={() => removeCouponRequirement(idx)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Grid>
              </Grid>
            </Paper>

            {/* Commission */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<PercentIcon />} title="ค่าคอมมิชชัน" />
              <Grid container spacing={3}>
                {/* Sales commission */}
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <SalesIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                    <Typography variant="body2" fontWeight={700}>พนักงานขาย</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <ToggleButtonGroup
                      exclusive size="small"
                      value={formData.salesCommissionType}
                      onChange={(_, v) => v && setFormData({ ...formData, salesCommissionType: v })}
                      sx={{ height: 40 }}
                    >
                      <ToggleButton value="percent" sx={{ fontWeight: 700, px: 1.5 }}>%</ToggleButton>
                      <ToggleButton value="fixed"   sx={{ fontWeight: 700, px: 1.5 }}>฿</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField
                      size="small" type="number" fullWidth
                      label={formData.salesCommissionType === 'percent' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (฿)'}
                      inputProps={{ min: 0, step: formData.salesCommissionType === 'percent' ? 0.5 : 1 }}
                      value={formData.salesCommissionValue}
                      onChange={e => setFormData({ ...formData, salesCommissionValue: e.target.value })}
                    />
                  </Box>
                </Grid>
                {/* Teacher commission */}
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <TeacherIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
                    <Typography variant="body2" fontWeight={700}>ครูสอน</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <ToggleButtonGroup
                      exclusive size="small"
                      value={formData.teacherCommissionType}
                      onChange={(_, v) => v && setFormData({ ...formData, teacherCommissionType: v })}
                      sx={{ height: 40 }}
                    >
                      <ToggleButton value="percent" sx={{ fontWeight: 700, px: 1.5 }}>%</ToggleButton>
                      <ToggleButton value="fixed"   sx={{ fontWeight: 700, px: 1.5 }}>฿</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField
                      size="small" type="number" fullWidth
                      label={formData.teacherCommissionType === 'percent' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (฿)'}
                      inputProps={{ min: 0, step: formData.teacherCommissionType === 'percent' ? 0.5 : 1 }}
                      value={formData.teacherCommissionValue}
                      onChange={e => setFormData({ ...formData, teacherCommissionValue: e.target.value })}
                    />
                  </Box>
                </Grid>
              </Grid>
            </Paper>
            </>)}

            {editTab === 2 && (
              <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
                <SectionLabel icon={<SmsIcon />} title="การแจ้งเตือนเมื่อจองสำเร็จ" />
                <CourseNotificationsTab
                  value={{
                    confirmationChannelMode: formData.confirmationChannelMode,
                    smsSuccessEnabled: formData.smsSuccessEnabled,
                    smsSuccessTemplate: formData.smsSuccessTemplate,
                    smsReminderTemplate: formData.smsReminderTemplate,
                    emailSuccessEnabled: formData.emailSuccessEnabled,
                    emailSuccessSubject: formData.emailSuccessSubject,
                    emailSuccessTemplate: formData.emailSuccessTemplate,
                  }}
                  onChange={patch => setFormData(f => ({ ...f, ...patch }))}
                  builtins={BUILTIN_SMS_VARIABLES}
                  formFields={smsFormFields.map(f => ({ key: f.field_key, label: f.label }))}
                  courseName={formData.name}
                />
              </Paper>
            )}

            {/* Skills + Achievement — draws from the same Skills Library
                that's hidden entirely on the Event page, so this section
                (a per-course pick from that library) doesn't apply there
                either. */}
            {editTab === 3 && courseType === 'class' && (
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <SectionLabel icon={<SkillsIcon />} title="ทักษะและตัวชี้วัด" />
                <SkillTagInput
                  label="Skills — ทักษะที่ได้รับในคลาสนี้"
                  values={formData.skills}
                  onChange={(v) => setFormData({ ...formData, skills: v })}
                  color="primary"
                  onOpenPicker={() => setPickerState({ open: true, field: 'skills', type: 'achievement' })}
                  libraryItems={libraryItems}
                />
                <Divider sx={{ my: 1 }} />
                <Box sx={{ mt: 2 }}>
                  <SkillTagInput
                    label="Achievement — ตัวชี้วัดความสำเร็จ"
                    values={formData.metrics}
                    onChange={(v) => setFormData({ ...formData, metrics: v })}
                    color="secondary"
                    onOpenPicker={() => setPickerState({ open: true, field: 'metrics', type: 'indicator' })}
                    libraryItems={libraryItems}
                  />
                </Box>
              </Paper>
            )}
          </Grid>

          {/* Media summary + Teacher Guide boxes now live inside "ข้อมูลพื้นฐาน"
              above; the full media editor is still this modal (physical
              JSX position doesn't matter for a Dialog — it portals regardless). */}
          <Grid item xs={12}>
            <Dialog open={mediaModalOpen} onClose={() => setMediaModalOpen(false)} maxWidth="md" fullWidth>
              <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                จัดการรูปภาพและวิดีโอ
                <IconButton onClick={() => setMediaModalOpen(false)}><ClearIcon /></IconButton>
              </DialogTitle>
              <DialogContent sx={{ p: 0 }} dividers>
                <Box sx={{ display: 'flex', minHeight: 480, maxHeight: '70vh' }}>
                  {/* Left sidebar */}
                  <Box sx={{ width: 210, flexShrink: 0, borderRight: '1px solid #eee', bgcolor: '#fafafa', overflowY: 'auto' }}>
                    <List dense sx={{ py: 1 }}>
                      <ListItemButton selected={mediaModalTab === 'media'} onClick={() => setMediaModalTab('media')} sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}><ImageIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="รูปภาพ" primaryTypographyProps={{ fontSize: 13, fontWeight: mediaModalTab === 'media' ? 800 : 600 }} />
                      </ListItemButton>
                      <ListItemButton selected={mediaModalTab === 'video'} onClick={() => setMediaModalTab('video')} sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}><VideoIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="วิดีโอ" primaryTypographyProps={{ fontSize: 13, fontWeight: mediaModalTab === 'video' ? 800 : 600 }} />
                      </ListItemButton>
                      {/* Shown even before the course is saved, disabled with a
                          reason. Hiding it outright made the feature look like
                          it did not exist rather than like it was not ready
                          yet — the framing is keyed on a course id, so there is
                          nothing to attach it to until the first save. */}
                      {/* Framing no longer waits for the first save. The
                          framing IS keyed on a course id, but nothing needed
                          the id while editing — saveImageViewsAndFocals already
                          runs after the create call with the new id, so the
                          choices made here are simply carried along. Locking
                          the tab meant the one moment staff most want to frame
                          a picture, right after uploading it, was the one
                          moment they could not. */}
                      <Tooltip title="" placement="right">
                        <ListItemButton
                          selected={mediaModalTab === 'views'}
                          onClick={() => setMediaModalTab('views')}
                          sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}><CropIcon fontSize="small" /></ListItemIcon>
                          <ListItemText primary="มุมมองการแสดงผล" primaryTypographyProps={{ fontSize: 13, fontWeight: mediaModalTab === 'views' ? 800 : 600 }} />
                        </ListItemButton>
                      </Tooltip>
                      {posterViewDef && (
                        <ListItemButton selected={mediaModalTab === 'poster'} onClick={() => setMediaModalTab('poster')} sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}><CropIcon fontSize="small" /></ListItemIcon>
                          <ListItemText primary="แกลเลอรีโปสเตอร์" primaryTypographyProps={{ fontSize: 13, fontWeight: mediaModalTab === 'poster' ? 800 : 600 }} />
                        </ListItemButton>
                      )}
                    </List>
                  </Box>

                  {/* Right content panel */}
                  <Box sx={{ flex: 1, overflowY: 'auto', p: 3, minWidth: 0 }}>
                    {mediaModalTab === 'media' && (
                      <>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                          รูปภาพ <span style={{ color: '#94a3b8', marginLeft: 4, fontWeight: 400 }}>* ลากรูปเพื่อจัดลำดับ หรือกดไอคอนดาวเพื่อตั้งเป็นรูปปกได้ทันที — รูปแรกจะถูกใช้เป็นรูปปกของคลาสโดยอัตโนมัติ</span>
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {mergedImages.map((img, idx) => (
                            <Box
                              key={img}
                              draggable
                              onDragStart={() => setDragImageIndex(idx)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => {
                                e.preventDefault();
                                if (dragImageIndex !== null) reorderGalleryImages(dragImageIndex, idx);
                                setDragImageIndex(null);
                              }}
                              onDragEnd={() => setDragImageIndex(null)}
                              sx={{
                                position: 'relative', width: 84, height: 84, borderRadius: 1.5, overflow: 'hidden',
                                border: idx === 0 ? '2px solid' : '1px solid', borderColor: idx === 0 ? 'primary.main' : '#eee',
                                cursor: 'grab', opacity: dragImageIndex === idx ? 0.4 : 1, transition: 'opacity 0.15s',
                              }}
                            >
                              <img src={getImageUrl(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} alt="" />
                              {idx === 0 ? (
                                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 9, fontWeight: 700, textAlign: 'center', py: 0.25 }}>
                                  ปก
                                </Box>
                              ) : (
                                <Tooltip title="ตั้งเป็นรูปปก">
                                  <IconButton
                                    onClick={() => setAsCoverImage(img)}
                                    sx={{ position: 'absolute', bottom: 1, left: 1, bgcolor: 'rgba(255,255,255,0.85)', p: 0.15, '&:hover': { bgcolor: 'white' } }}
                                  >
                                    <CoverIcon sx={{ fontSize: 13 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <IconButton onClick={() => removeGalleryImage(img)} sx={{ position: 'absolute', top: 1, right: 1, bgcolor: 'rgba(255,255,255,0.85)', p: 0.15 }}>
                                <ClearIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            </Box>
                          ))}
                          <Box
                            onClick={() => imageInputRef.current?.click()}
                            sx={{ width: 84, height: 84, borderRadius: 1.5, border: '2px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                          >
                            <AddIcon color="disabled" fontSize="small" />
                          </Box>
                        </Box>
                        <input type="file" hidden accept="image/*" multiple ref={imageInputRef} onChange={async e => {
                          const files = e.target.files;
                          if (!files || files.length === 0) return;
                          setImagesUploading(true);
                          const uploads = await Promise.all(Array.from(files).map(f => uploadFile(f, 'images')));
                          const urls = uploads.filter(Boolean) as string[];
                          addGalleryImages(urls);
                          setImagesUploading(false);
                          e.target.value = '';
                        }} />
                      </>
                    )}

                    {mediaModalTab === 'video' && (
                      <>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>วิดีโอประกอบ</Typography>
                        {formData.videoUrl ? (
                          <Box sx={{ position: 'relative', maxWidth: 360, aspectRatio: '16/9', borderRadius: 2, overflow: 'hidden', bgcolor: 'black', mb: 2.5 }}>
                            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => setIsVideoPreviewOpen(true)}>
                              <PlayIcon sx={{ color: 'white', fontSize: 40 }} />
                            </Box>
                            <IconButton onClick={() => setFormData({ ...formData, videoUrl: '' })} sx={{ position: 'absolute', top: 4, right: 4, color: 'white', bgcolor: 'rgba(0,0,0,0.45)', p: 0.5 }}>
                              <ClearIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                        ) : (
                          <Box
                            onClick={() => videoInputRef.current?.click()}
                            sx={{ maxWidth: 360, aspectRatio: '16/9', borderRadius: 2, border: '2px dashed #e2e8f0', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', mb: 2.5, '&:hover': { borderColor: 'primary.main', bgcolor: '#f5f0ff' } }}
                          >
                            <VideoIcon color="disabled" sx={{ mb: 0.5 }} />
                            <Typography variant="caption" color="text.disabled">คลิกเพื่ออัปโหลดวิดีโอ</Typography>
                          </Box>
                        )}
                        <input type="file" hidden accept="video/*" ref={videoInputRef} onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setVideoUploading(true);
                          const url = await uploadFile(file, 'videos');
                          if (url) setFormData(f => ({ ...f, videoUrl: url }));
                          setVideoUploading(false);
                          e.target.value = '';
                        }} />
                      </>
                    )}

                    {mediaModalTab === 'views' && (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                          เลือกรูปและจุดโฟกัสสำหรับแต่ละตำแหน่งที่แสดงผลในระบบ ถ้าไม่ตั้งค่า ระบบจะใช้รูปปกและจุดกึ่งกลางเป็นค่าเริ่มต้น
                        </Typography>
                        {/* A warning used to sit here saying the poster gallery
                            would override this banner. It is gone because the
                            override is gone: the consumer app no longer reads
                            poster_images, so what is set here is what shows.
                            The warning also told staff to "remove the images from
                            the poster gallery tab", which was not possible — that
                            tab lists the course's own cover and gallery images and
                            only sets a focal point per image; it has no list of its
                            own and no delete. There was no way to undo the override
                            from the CRM at all, which is why it had to be fixed in
                            the rendering instead. */}
                        {imageViewDefs.length === 0 ? (
                          <Typography variant="body2" color="text.disabled">กำลังโหลด...</Typography>
                        ) : (
                          <Stack spacing={2.5}>
                            {imageViewDefs.map(def => {
                              const candidateImages = [formData.thumbnailUrl, ...formData.images].filter(Boolean);
                              const currentImage = getViewImageUrl(def.key);
                              const focal = getViewFocal(def.key);
                              return (
                                <Box key={def.key} sx={{ p: 2.5, borderRadius: 2, border: '1px solid #eee', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                  <Box sx={{ width: { xs: '100%', sm: 220 }, flexShrink: 0 }}>
                                    <FocalPointPicker
                                      imageUrl={getImageUrl(currentImage)}
                                      ratioW={def.ratioW}
                                      ratioH={def.ratioH}
                                      focalX={focal.x}
                                      focalY={focal.y}
                                      zoom={focal.zoom}
                                      onChange={(x, y) => setViewFocal(def.key, x, y)}
                                      onZoomChange={z => setViewZoom(def.key, z)}
                                    />
                                  </Box>
                                  <Box sx={{ flex: 1, minWidth: 220 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 800 }}>{def.label}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                      {def.usageNote}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: 'primary.main', fontWeight: 700 }}>
                                      แนะนำ {def.recommendedWidth}×{def.recommendedHeight}px (อัตราส่วน {def.ratioW}:{def.ratioH})
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                                      <Button
                                        size="small" variant="outlined"
                                        onClick={() => applyViewToAll(def.key)}
                                        sx={{ textTransform: 'none', fontWeight: 700 }}
                                      >
                                        ใช้รูปและการครอปนี้กับทุกขนาด
                                      </Button>
                                      <Button
                                        size="small"
                                        onClick={() => resetViewFraming(def.key)}
                                        sx={{ textTransform: 'none' }}
                                      >
                                        รีเซ็ตกลับกึ่งกลาง
                                      </Button>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                                      เลือกรูป
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                      {candidateImages.map((img, i) => {
                                        const selected = img === currentImage;
                                        return (
                                          <Box
                                            key={i}
                                            onClick={() => setViewImage(def.key, img)}
                                            sx={{
                                              width: 56, height: 56, borderRadius: 1.5, overflow: 'hidden', cursor: 'pointer',
                                              border: '2px solid', borderColor: selected ? 'primary.main' : 'transparent',
                                              boxShadow: selected ? 2 : 0, opacity: selected ? 1 : 0.7,
                                              '&:hover': { opacity: 1 },
                                            }}
                                          >
                                            <img src={getImageUrl(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          </Box>
                                        );
                                      })}
                                    </Box>
                                  </Box>
                                </Box>
                              );
                            })}
                          </Stack>
                        )}
                      </>
                    )}

                    {mediaModalTab === 'poster' && posterViewDef && (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                          {posterViewDef.usageNote} — คลิกรูปเพื่อตั้งจุดโฟกัส แนะนำ {posterViewDef.recommendedWidth}×{posterViewDef.recommendedHeight}px (อัตราส่วน {posterViewDef.ratioW}:{posterViewDef.ratioH})
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                          {[formData.thumbnailUrl, ...formData.images].filter(Boolean).map((img, i) => (
                            <Box
                              key={i}
                              onClick={() => setPosterModalImage(img)}
                              sx={{
                                width: 84, aspectRatio: '4/5', borderRadius: 2, overflow: 'hidden', cursor: 'pointer',
                                border: '1px solid #eee', position: 'relative',
                                '&:hover .poster-edit-hint': { opacity: 1 },
                              }}
                            >
                              <img
                                src={getImageUrl(img)}
                                alt=""
                                style={{
                                  width: '100%', height: '100%', objectFit: 'cover',
                                  objectPosition: `${getImageFocal(img).x}% ${getImageFocal(img).y}%`,
                                  transform: `scale(${getImageFocal(img).zoom})`,
                                  transformOrigin: `${getImageFocal(img).x}% ${getImageFocal(img).y}%`,
                                }}
                              />
                              <Box
                                className="poster-edit-hint"
                                sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                              >
                                <CropIcon sx={{ color: 'white', fontSize: 20 }} />
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </>
                    )}
                  </Box>
                </Box>
              </DialogContent>
              <DialogActions sx={{ px: 3, py: 2 }}>
                <Button variant="contained" onClick={() => setMediaModalOpen(false)}>เสร็จสิ้น</Button>
              </DialogActions>
            </Dialog>

            {/* Poster focal-point modal — manage one image's crop at a time */}
            <Dialog open={!!posterModalImage} onClose={() => setPosterModalImage(null)} maxWidth="xs" fullWidth>
              <DialogTitle sx={{ fontWeight: 800 }}>
                ตั้งจุดโฟกัสรูปโปสเตอร์
                <IconButton onClick={() => setPosterModalImage(null)} sx={{ position: 'absolute', right: 12, top: 12 }}><ClearIcon /></IconButton>
              </DialogTitle>
              <DialogContent>
                {posterModalImage && posterViewDef && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                      ลากจุดวงกลมเพื่อเลือกส่วนของภาพที่จะโชว์ในหน้ารายละเอียดคลาส (Consumer)
                    </Typography>
                    <FocalPointPicker
                      imageUrl={getImageUrl(posterModalImage)}
                      ratioW={posterViewDef.ratioW}
                      ratioH={posterViewDef.ratioH}
                      focalX={getImageFocal(posterModalImage).x}
                      focalY={getImageFocal(posterModalImage).y}
                      zoom={getImageFocal(posterModalImage).zoom}
                      onChange={(x, y) => setImageFocal(posterModalImage, x, y)}
                      onZoomChange={z => setImageZoom(posterModalImage, z)}
                    />
                  </>
                )}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button variant="contained" onClick={() => setPosterModalImage(null)}>เสร็จสิ้น</Button>
              </DialogActions>
            </Dialog>
          </Grid>

          {editCourse && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>รีวิวจากลูกค้า</Typography>
                  {courseReviews.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Rating
                        value={courseReviews.reduce((s, r) => s + r.rating, 0) / courseReviews.length}
                        precision={0.1}
                        readOnly
                        size="small"
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                        {(courseReviews.reduce((s, r) => s + r.rating, 0) / courseReviews.length).toFixed(1)} ({courseReviews.length})
                      </Typography>
                    </Box>
                  )}
                </Box>

                {reviewsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
                ) : courseReviews.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">ยังไม่มีรีวิวสำหรับคลาสนี้</Typography>
                ) : (
                  <Stack spacing={1.5} sx={{ maxHeight: 320, overflowY: 'auto' }}>
                    {courseReviews.map((r) => (
                      <Box key={r.id} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#f8fafc' }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>{(r.nickname || r.child_name || '?')[0]}</Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.nickname || r.child_name}</Typography>
                            <Rating value={r.rating} readOnly size="small" />
                          </Box>
                          {r.comment && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{r.comment}</Typography>
                          )}
                          <Typography variant="caption" color="text.disabled">
                            {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Grid>
          )}
        </Grid>

        {/* Fixed save buttons */}
        <Box sx={{ position: 'fixed', bottom: 32, right: 32, display: 'flex', gap: 2, zIndex: 1000 }}>
          <Button variant="contained" size="large" startIcon={<SaveIcon />} onClick={handleSubmit} sx={{ px: 5, py: 1.5, borderRadius: 10, fontWeight: 800, boxShadow: '0 8px 24px rgba(116,82,214,0.3)' }}>
            บันทึกคลาส
          </Button>
          <Button variant="outlined" size="large" onClick={() => setIsEditing(false)} sx={{ px: 4, py: 1.5, borderRadius: 10, bgcolor: 'white', fontWeight: 800 }}>
            ยกเลิก
          </Button>
        </Box>

        {/* Short-description expand dialog — description itself no longer
            uses this, since RichTextEditor already has its own scroll area;
            this was previously hardcoded to always show/edit `description`
            regardless of which field's Expand button was clicked, so
            expanding "Short Description" silently edited the wrong field. */}
        <Dialog open={!!descExpandModal?.open} onClose={() => setDescExpandModal(null)} fullWidth maxWidth="md">
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {descExpandModal?.lang === 'th' ? '🇹🇭 รายละเอียดอย่างย่อ (ภาษาไทย)' : '🇬🇧 Short Description (English)'}
            <IconButton onClick={() => setDescExpandModal(null)}><ClearIcon /></IconButton>
          </DialogTitle>
          <DialogContent>
            <TextField
              multiline rows={16} fullWidth autoFocus sx={{ mt: 1 }}
              placeholder={descExpandModal?.lang === 'th' ? 'กรอกรายละเอียดอย่างย่อภาษาไทย...' : 'Enter short description in English...'}
              value={descExpandModal?.lang === 'th' ? formData.shortDescription : formData.shortDescriptionEn}
              onChange={e => descExpandModal?.lang === 'th'
                ? setFormData({ ...formData, shortDescription: e.target.value })
                : setFormData({ ...formData, shortDescriptionEn: e.target.value })
              }
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="contained" onClick={() => setDescExpandModal(null)}>เสร็จสิ้น</Button>
          </DialogActions>
        </Dialog>

        {/* Skills / Metrics picker */}
        <Dialog
          open={pickerState.open}
          onClose={() => setPickerState(prev => ({ ...prev, open: false }))}
          TransitionProps={{ onExited: () => setPickerState({ open: false, field: null, type: null }) }}
          fullWidth maxWidth="sm"
        >
          <DialogTitle sx={{ fontWeight: 800 }}>{pickerState.type === 'achievement' ? '⭐ เลือกทักษะ (Achievement)' : '📊 เลือกตัวชี้วัด (Indicator)'}</DialogTitle>
          <DialogContent dividers>
            {libraryItems.filter(s => s.type === pickerState.type).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                ยังไม่มีรายการในคลัง — ไปเพิ่มได้ที่หน้า "จัดการ Skills & ตัวชี้วัด" ก่อน
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {libraryItems.filter(s => s.type === pickerState.type).map(item => {
                  const isSelected = pickerState.field ? formData[pickerState.field].some(s => s.th === item.name) : false;
                  const label = item.name_en ? `${item.name} (${item.name_en})` : item.name;
                  return (
                    <Chip
                      key={item.id}
                      icon={renderSkillIcon(item.icon, { fontSize: 'small', sx: { color: isSelected ? 'inherit' : (item.type === 'achievement' ? '#7452d6' : '#ef4f55') } })}
                      label={label}
                      onClick={() => togglePickerItem(item)}
                      color={isSelected ? (pickerState.type === 'achievement' ? 'primary' : 'secondary') : 'default'}
                      variant={isSelected ? 'filled' : 'outlined'}
                    />
                  );
                })}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPickerState(prev => ({ ...prev, open: false }))}>เสร็จสิ้น</Button>
          </DialogActions>
        </Dialog>

        {/* Video preview */}
        <Dialog open={isVideoPreviewOpen} onClose={() => setIsVideoPreviewOpen(false)} maxWidth="xs" fullWidth>
          <Box sx={{ position: 'relative', bgcolor: 'black', aspectRatio: '9/16' }}>
            <video src={formData.videoUrl} controls autoPlay style={{ width: '100%', height: '100%' }} />
            <IconButton onClick={() => setIsVideoPreviewOpen(false)} sx={{ position: 'absolute', top: 8, right: 8, color: 'white', bgcolor: 'rgba(0,0,0,0.3)' }}>
              <ClearIcon />
            </IconButton>
          </Box>
        </Dialog>
      </Box>
    );
  }

  // ─── List View ───────────────────────────────────────────────────────────────
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{pageLabels.title}</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {pageTab === 0 && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleEditOpen()} sx={{ borderRadius: 3, fontWeight: 700 }}>
              {pageLabels.add}
            </Button>
          )}
          {pageTab === 1 && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
              setEditCategory(null);
              setCategoryFormData({ name: '', description: '', color: '#7452d6', imageUrl: '', imagePosition: '50% 50%', type: courseType });
              setCategoryImagePreview('');
              setCategoryImagePos({ x: 50, y: 50 });
              catImgPosRef.current = { x: 50, y: 50 };
              setCategoryError(null);
              setCategoryFormDialogOpen(true);
            }} sx={{ borderRadius: 3, fontWeight: 700 }}>
              เพิ่มหมวดหมู่
            </Button>
          )}
        </Box>
      </Box>

      {/* Page Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={pageTab} onChange={(_, v) => setPageTab(v)}>
          <Tab label={pageLabels.tab} />
          <Tab label="หมวดหมู่" icon={<CategoryIcon sx={{ fontSize: 16 }} />} iconPosition="end" />
          {/* Events and Services don't earn skills-on-completion or reserve
              physical materials/stock — those are Class-only concepts. */}
          {courseType === 'class' && <Tab label="Skills Library" icon={<SkillsLibIcon sx={{ fontSize: 16 }} />} iconPosition="end" />}
          {courseType === 'class' && <Tab label="วัสดุ/อุปกรณ์" />}
        </Tabs>
      </Box>

      {/* ── Tab 0: Course list ──────────────────────────────────────────────── */}
      {pageTab === 0 && <><Paper sx={{ p: 2.5, mb: 3, bgcolor: '#f9fafb', borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField fullWidth size="small" placeholder="ค้นหาชื่อหรือรหัสคลาส" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>หมวดหมู่</InputLabel>
              <Select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })} label="หมวดหมู่">
                <MenuItem value="">ทั้งหมด</MenuItem>
                {categoriesForPage.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          {courseType === 'class' && (
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>ประเภท</InputLabel>
                <Select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} label="ประเภท">
                  <MenuItem value="">ทั้งหมด</MenuItem>
                  {Object.values(TYPE_META).map(t => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Fixed layout + horizontal scroll: the columns keep their widths
          instead of being squeezed by whichever row happens to hold the
          longest name, and the manage column is pinned to the left edge so the
          buttons stay reachable however far the table is scrolled. */}
      <TableContainer component={Paper} sx={{ border: '1px solid #e5e7eb', borderRadius: 3, overflowX: 'auto' }}>
        <Table sx={{
          tableLayout: 'fixed',
          minWidth: SORTABLE_COLUMNS.reduce((n, c) => n + c.width, 0) + ACTIONS_COLUMN_WIDTH + 56,
          '& .sticky-actions': {
            position: 'sticky',
            left: 0,
            zIndex: 3,
            bgcolor: 'white',
            borderRight: '1px solid #e5e7eb',
          },
          '& thead .sticky-actions': { zIndex: 4, bgcolor: '#f9fafb' },
        }}>
          <TableHead sx={{ bgcolor: '#f9fafb' }}>
            <TableRow>
              <TableCell className="sticky-actions" align="center" sx={{ fontWeight: 800, width: ACTIONS_COLUMN_WIDTH }}>จัดการ</TableCell>
              <TableCell sx={{ fontWeight: 800, width: 56 }}>รูป</TableCell>
              {SORTABLE_COLUMNS.filter(col => col.key !== 'type' || courseType === 'class').map(col => (
                <TableCell key={col.key} sx={{ fontWeight: 800, width: col.width }}>
                  <TableSortLabel
                    active={sort?.key === col.key}
                    direction={sort?.key === col.key ? sort.dir : 'asc'}
                    onClick={() => setSort(prev =>
                      prev?.key === col.key
                        ? (prev.dir === 'asc' ? { key: col.key, dir: 'desc' } : null)
                        : { key: col.key, dir: 'asc' })}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
            {/* Filter row. One box per column rather than a single search
                field, because "ชื่อมีคำว่า X และหมวดหมู่คือ Y" is the question
                staff actually ask and the one search box above cannot express. */}
            <TableRow>
              <TableCell className="sticky-actions" align="center" sx={{ py: 0.5 }}>
                {(sort || Object.values(colFilters).some(Boolean)) && (
                  <Button size="small" onClick={() => { setColFilters({}); setSort(null); setPage(0); }} sx={{ fontSize: 11 }}>
                    ล้าง
                  </Button>
                )}
              </TableCell>
              <TableCell sx={{ py: 0.5 }} />
              {SORTABLE_COLUMNS.filter(col => col.key !== 'type' || courseType === 'class').map(col => (
                <TableCell key={col.key} sx={{ py: 0.5 }}>
                  <TextField
                    size="small" variant="standard" placeholder="กรอง"
                    value={colFilters[col.key] ?? ''}
                    onChange={e => { setColFilters(f => ({ ...f, [col.key]: e.target.value })); setPage(0); }}
                    InputProps={{ sx: { fontSize: 12 } }}
                    sx={{ width: '100%', minWidth: 64 }}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCourses.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(course => {
              const ageRange = formatAgeRange(course.age_min, course.age_max);
              const catColor = categories.find(c => c.id === course.category_id)?.color || '#7452d6';
              const typeMeta = TYPE_META[getCourseType(course)];
              // A hidden course stays in the list — that is the point of hiding
              // rather than deleting — but has to be tellable apart from a live
              // one at a glance, hence the dimming and the strike on its name.
              return (
                <TableRow
                  key={course.id}
                  hover
                  sx={!isCourseVisible(course) ? { opacity: 0.55, '& td:first-of-type': { textDecoration: 'line-through' } } : undefined}
                >
                  <TableCell className="sticky-actions" align="center" sx={{ width: ACTIONS_COLUMN_WIDTH, whiteSpace: 'nowrap' }}>
                    <Tooltip title={copiedLinkId === course.id ? 'คัดลอกลิงก์แล้ว!' : 'คัดลอกลิงก์'}>
                      <IconButton size="small" onClick={() => copyCourseLink(course)} color={copiedLinkId === course.id ? 'success' : 'default'}><CopyLinkIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="ดูความจุคงเหลือ (ที่นั่ง/ทีม)">
                      <IconButton size="small" onClick={() => openCapacityDialog(course)}><CapacityIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={isCourseVisible(course) ? 'กำลังแสดงในแอป — กดเพื่อซ่อน' : 'ซ่อนอยู่ — กดเพื่อแสดงในแอป'}>
                      <IconButton
                        size="small"
                        onClick={() => toggleCourseVisibility(course)}
                        disabled={visibilityBusyId === course.id}
                        color={isCourseVisible(course) ? 'success' : 'default'}
                      >
                        {isCourseVisible(course) ? <VisibleIcon fontSize="small" /> : <HiddenIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" onClick={() => handleEditOpen(course)} color="primary"><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => { setItemToDelete({ id: course.id, name: course.name }); setDeleteType('course'); setDeleteDialogOpen(true); }} color="error"><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                  <TableCell sx={{ width: 56 }}>
                    {/* A 44px square is enough to tell two covers apart and not
                        enough to check one — hovering shows the artwork at a
                        size where the text on it can actually be read, which is
                        the reason to look at it at all. Only when there is a
                        real image: a tooltip of the placeholder logo says
                        nothing. */}
                    <Tooltip
                      arrow
                      placement="right"
                      disableHoverListener={!course.thumbnail_url}
                      componentsProps={{
                        tooltip: { sx: { p: 0.5, bgcolor: 'white', boxShadow: 4, maxWidth: 'none', border: '1px solid #e5e7eb' } },
                        arrow: { sx: { color: 'white', '&::before': { border: '1px solid #e5e7eb' } } },
                      }}
                      title={course.thumbnail_url
                        ? <Box
                            component="img"
                            src={getImageUrl(course.thumbnail_url)}
                            alt={course.name}
                            sx={{ display: 'block', width: 320, maxHeight: 320, objectFit: 'contain', borderRadius: 1 }}
                          />
                        : ''}
                    >
                      <Box sx={{ width: 44, height: 44, borderRadius: 1.5, overflow: 'hidden', bgcolor: '#f8f5ff', border: '1px solid #eee', cursor: course.thumbnail_url ? 'zoom-in' : 'default' }}>
                        {course.thumbnail_url ? (
                          <img src={getImageUrl(course.thumbnail_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={mellowPlayLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6, opacity: 0.5 }} />
                        )}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{course.id}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {course.code || <Typography component="span" variant="caption" color="text.disabled">-</Typography>}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{course.name}</TableCell>
                  {courseType === 'class' && (
                    <TableCell>
                      <Chip label={typeMeta.label} size="small" sx={{ bgcolor: `${typeMeta.color}1a`, color: typeMeta.color, fontWeight: 700 }} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Chip label={course.category_name} size="small" sx={{ bgcolor: catColor, color: 'white', fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    {ageRange
                      ? <Chip label={ageRange} size="small" icon={<AgeIcon sx={{ fontSize: '14px !important' }} />} variant="outlined" sx={{ fontWeight: 600 }} />
                      : <Typography variant="caption" color="text.disabled">-</Typography>}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {course.original_price != null ? `฿${course.original_price.toLocaleString()}` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{formatDuration(course.duration)}</Typography>
                  </TableCell>
                  <TableCell>
                    {capacityByCourse[course.id] ? (
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {capacityByCourse[course.id].booked.toLocaleString('th-TH')}
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                          {' / '}{capacityByCourse[course.id].seats.toLocaleString('th-TH')}
                        </Typography>
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatUpdatedAt(course.updated_at) || '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredCourses.length === 0 && (
              <TableRow>
                <TableCell colSpan={courseType === 'class' ? 12 : 11} align="center" sx={{ py: 8 }}>
                  <Typography variant="body2" color="text.secondary">{pageLabels.empty}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination component="div" count={filteredCourses.length} rowsPerPage={rowsPerPage} page={page} onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => setRowsPerPage(parseInt(e.target.value, 10))} />
      </TableContainer>
      </>}

      {/* ── Tab 1: Categories ────────────────────────────────────────────────── */}
      {pageTab === 1 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {categoriesForPage.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <CategoryIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
              <Typography variant="body2">ยังไม่มีหมวดหมู่ — กด "เพิ่มหมวดหมู่" เพื่อเริ่มต้น</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {categoriesForPage.map((cat, idx) => (
                <ListItem
                  key={cat.id}
                  divider={idx < categoriesForPage.length - 1}
                  sx={{ py: 1.5, px: 2.5, '&:hover': { bgcolor: '#f8fafc' } }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => {
                        setEditCategory(cat);
                        setCategoryFormData({ name: cat.name, description: cat.description || '', color: cat.color || '#7452d6', imageUrl: cat.image_url || '', imagePosition: (cat as any).image_position || '50% 50%', type: cat.type || 'class' });
                        setCategoryImagePreview(cat.image_url ? `${API_URL}${cat.image_url}` : '');
                        const parts = ((cat as any).image_position || '50% 50%').split(' ');
                        const savedPos = { x: parseFloat(parts[0]) || 50, y: parseFloat(parts[1]) || 50 };
                        setCategoryImagePos(savedPos);
                        catImgPosRef.current = savedPos;
                        setCategoryError(null);
                        setCategoryFormDialogOpen(true);
                      }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => { setItemToDelete({ id: cat.id, name: cat.name }); setDeleteType('category'); setDeleteDialogOpen(true); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  }
                >
                  {cat.image_url ? (
                    <Box sx={{ width: 44, height: 44, borderRadius: 2, overflow: 'hidden', mr: 2, flexShrink: 0, border: '1px solid #e2e8f0' }}>
                      <img src={`${API_URL}${cat.image_url}`} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: (cat as any).image_position || '50% 50%' }} />
                    </Box>
                  ) : (
                    <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: cat.color || '#7452d6', mr: 2, flexShrink: 0, opacity: 0.85 }} />
                  )}
                  <ListItemText
                    primary={<Typography sx={{ fontWeight: 700 }}>{cat.name}</Typography>}
                    secondary={cat.description || '—'}
                    secondaryTypographyProps={{ noWrap: true, sx: { fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 400 } }}
                  />
                  <Chip
                    size="small" variant="outlined"
                    label={`${courses.filter(c => c.category_id === cat.id).length} คลาส`}
                    sx={{ mr: 8, fontWeight: 700, fontSize: '0.65rem' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      )}

      {/* ── Tab 2: Skills Library ─────────────────────────────────────────────── */}
      {pageTab === 2 && courseType === 'class' && (
        <SkillsLibraryManagement currentUserRole={currentUserRole} />
      )}

      {/* ── Tab 3: Course Materials ────────────────────────────────────────────── */}
      {pageTab === 3 && courseType === 'class' && (
        <CourseMaterialsTab courses={courses} apiBase={`${API_URL}/api/v1/admin`} />
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setDeleteError(null); setDeleteNeedsForce(false); }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบ {deleteType === 'course' ? 'คลาส' : 'หมวดหมู่'} <strong>"{itemToDelete?.name}"</strong> ใช่หรือไม่?</Typography>
          {deleteError && (
            <Alert severity={deleteNeedsForce ? 'warning' : 'error'} sx={{ mt: 2, borderRadius: 2, fontWeight: 600 }}>
              {deleteError}
            </Alert>
          )}
          {deleteNeedsForce && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary', fontWeight: 600 }}>
              ถ้าไม่ต้องการลบประวัติ ให้ปิดการมองเห็นคลาสนี้แทน (สวิตช์ "แสดงในแอป" ในหน้าแก้ไขคลาส)
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setDeleteDialogOpen(false); setDeleteError(null); setDeleteNeedsForce(false); }} variant="outlined">ยกเลิก</Button>
          {deleteNeedsForce ? (
            <Button onClick={() => confirmDelete(true)} color="error" variant="contained">
              ลบพร้อมประวัติทั้งหมด
            </Button>
          ) : (
            <Button onClick={() => confirmDelete(false)} color="error" variant="contained">ลบข้อมูล</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Capacity dialog — remaining seats per upcoming round (from the
          course's calendar) and remaining spots per team (from its
          registration form's team_select field(s), if any). */}
      <Dialog open={!!capacityDialogCourse} onClose={() => setCapacityDialogCourse(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ความจุคงเหลือ — {capacityDialogCourse?.name}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {capacityLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={800}>
                ที่นั่ง{capacityFormName ? ` และทีม (${capacityFormName})` : ''}คงเหลือแต่ละรอบ
              </Typography>
              {!capacityDialogCourse?.calendar_id ? (
                <Typography variant="body2" color="text.secondary">คลาสนี้ยังไม่ได้ผูกปฏิทิน จึงไม่มีรอบเวลาให้แสดง</Typography>
              ) : !capacitySlots || capacitySlots.length === 0 ? (
                <Typography variant="body2" color="text.secondary">ไม่มีรอบที่กำลังจะถึง</Typography>
              ) : (
                <TableContainer sx={{ maxHeight: 420 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>เวลา</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">ที่นั่งคงเหลือ</TableCell>
                        {capacityFormName && <TableCell sx={{ fontWeight: 700 }}>ทีมคงเหลือ</TableCell>}
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {capacitySlots.flatMap(day => day.slots.map((s: any, i: number) => {
                        const roundKey = `${day.date} ${s.startTime}`;
                        const roundTeamFields = capacityTeamByRound[roundKey];
                        const dateLabel = new Date(day.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                        return (
                          <TableRow key={`${day.date}-${i}`} hover>
                            <TableCell>{dateLabel}</TableCell>
                            <TableCell>{s.label ? `${s.label} (${s.startTime}–${s.endTime})` : `${s.startTime}–${s.endTime}`}</TableCell>
                            <TableCell align="center">
                              <Chip
                                label={`${s.available}/${s.maxCapacity}`}
                                size="small"
                                color={s.available === 0 ? 'error' : 'success'}
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                            {capacityFormName && (
                              <TableCell>
                                {roundTeamFields ? (
                                  <Stack spacing={0.5}>
                                    {roundTeamFields.map((f, fi) => (
                                      <Stack key={fi} direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                        {f.teams.map(t => (
                                          <Chip
                                            key={t.label}
                                            label={`${t.label}: ${t.remaining}/${t.capacity}`}
                                            size="small"
                                            color={t.remaining === 0 ? 'error' : 'success'}
                                            variant={t.remaining === 0 ? 'filled' : 'outlined'}
                                            sx={{ fontWeight: 700, height: 20, fontSize: '11px' }}
                                          />
                                        ))}
                                      </Stack>
                                    ))}
                                  </Stack>
                                ) : (
                                  <CircularProgress size={14} />
                                )}
                              </TableCell>
                            )}
                            <TableCell align="right">
                              <Tooltip title="ลิงก์เชิญพิเศษสำหรับรอบนี้">
                                <IconButton size="small" onClick={() => openInviteLinksDialog(capacityDialogCourse!.id, s.ruleId, s.label ? `${dateLabel} · ${s.label} (${s.startTime}–${s.endTime})` : `${dateLabel} · ${s.startTime}–${s.endTime}`)}>
                                  <LinkIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      }))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {!capacityDialogCourse?.calendar_id && !capacityFormName && (
                <Typography variant="body2" color="text.secondary">
                  คลาสนี้ยังไม่ได้ผูกปฏิทินหรือฟอร์มที่มีทีม จึงไม่มีข้อมูลความจุให้แสดง
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCapacityDialogCourse(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>

      {/* Invite links for one round — a general link/PIN that unlocks that
          round's reserved invite_capacity (set per-rule in CalendarManagement).
          The round still shows as ordinarily full to everyone without it. */}
      <Dialog open={!!inviteLinksRound} onClose={() => setInviteLinksRound(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ลิงก์เชิญพิเศษ</DialogTitle>
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 1, mt: -1 }}>{inviteLinksRound?.dateLabel}</Typography>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {inviteLinksLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {inviteLinks.length === 0 && (
                <Typography variant="body2" color="text.secondary">ยังไม่มีลิงก์เชิญสำหรับรอบนี้</Typography>
              )}
              {inviteLinks.map(link => {
                const isExpired = link.expires_at && new Date(link.expires_at).getTime() < Date.now();
                const status = link.is_revoked ? 'ยกเลิกแล้ว' : isExpired ? 'หมดอายุ' : 'ใช้งานได้';
                const statusColor = link.is_revoked || isExpired ? 'default' : 'success';
                return (
                  <Paper key={link.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} noWrap>{link.label || `ลิงก์ #${link.id}`}</Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                          <Chip label={status} size="small" color={statusColor as any} sx={{ height: 18, fontSize: '10px', fontWeight: 700 }} />
                          {/* Whether this link asks for anything, said on the
                              row — the difference decides how it is sent. */}
                          <Chip
                            label={link.requires_pin ? 'มีรหัสผ่าน' : 'เปิดได้เลย'}
                            size="small" variant="outlined"
                            sx={{ height: 18, fontSize: '10px', fontWeight: 700 }}
                          />
                        </Stack>
                        {/* The short address is the one to send; the long one
                            still works and is kept visible for anything already
                            printed or scheduled. */}
                        {inviteShortUrl(link) && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontFamily: 'ui-monospace, monospace', color: 'text.secondary' }}>
                            {inviteShortUrl(link)}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row">
                        {!link.is_revoked && !isExpired && (
                          <>
                            <Tooltip title={copiedInviteId === link.id ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์สั้น'}>
                              <IconButton size="small" onClick={() => copyInviteLink(link, 'short')} color={copiedInviteId === link.id ? 'success' : 'default'}>
                                <CopyLinkIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="คัดลอกลิงก์แบบเต็ม">
                              <IconButton size="small" onClick={() => copyInviteLink(link, 'full')}>
                                <LinkIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {!link.is_revoked && (
                          <IconButton size="small" color="error" onClick={() => revokeInviteLink(link.id)}><DeleteIcon fontSize="small" /></IconButton>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}

          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>สร้างลิงก์ใหม่</Typography>
          {newInviteError && <Alert severity="error" sx={{ mb: 1.5 }}>{newInviteError}</Alert>}
          <Stack spacing={1.5}>
            <TextField label="ชื่อลิงก์ (ถ้ามี)" size="small" fullWidth value={newInviteLabel} onChange={e => setNewInviteLabel(e.target.value)} />
            <TextField
              label="รหัสผ่าน (ไม่บังคับ — ตัวเลข 4-8 หลัก)" size="small" fullWidth value={newInvitePin}
              onChange={e => setNewInvitePin(e.target.value.replace(/\D/g, ''))}
              helperText={newInvitePin ? 'ผู้รับต้องกรอกรหัสนี้ก่อนจึงจะจองได้' : 'ไม่ใส่ = กดลิงก์แล้วเข้าหน้าจองได้เลย'}
            />
            <TextField
              label="วันหมดอายุ (ไม่บังคับ)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
              value={newInviteExpiresAt} onChange={e => setNewInviteExpiresAt(e.target.value)}
            />
            <Button variant="contained" onClick={createInviteLink} sx={{ borderRadius: 2, fontWeight: 700 }}>สร้างลิงก์</Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInviteLinksRound(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>

      {/* Category CREATE / EDIT form dialog */}
      <Dialog
        open={categoryFormDialogOpen}
        onClose={() => { setCategoryFormDialogOpen(false); setCategoryError(null); }}
        fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editCategory ? `แก้ไข — ${editCategory.name}` : 'เพิ่มหมวดหมู่ใหม่'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {categoryError && <Alert severity="error" sx={{ borderRadius: 2 }}>{categoryError}</Alert>}

            {/* Image upload */}
            <Box
              onClick={() => { if (!categoryImagePreview) categoryImageRef.current?.click(); }}
              sx={{
                width: '100%', height: 160, borderRadius: 3, border: '2px dashed',
                borderColor: categoryImagePreview ? 'primary.main' : '#cbd5e1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: categoryImagePreview ? 'default' : 'pointer',
                overflow: 'hidden', position: 'relative', bgcolor: '#f8fafc',
                transition: 'all 0.15s',
                '&:hover': !categoryImagePreview ? { borderColor: 'primary.main', bgcolor: '#f0f9ff' } : {},
              }}
            >
              {categoryImageUploading ? (
                <CircularProgress size={32} />
              ) : categoryImagePreview ? (
                <>
                  <img
                    src={categoryImagePreview}
                    alt="preview"
                    draggable={false}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      objectPosition: `${categoryImagePos.x}% ${categoryImagePos.y}%`,
                      cursor: isDraggingCatImg ? 'grabbing' : 'grab',
                      userSelect: 'none',
                      transition: isDraggingCatImg ? 'none' : 'object-position 0.1s',
                    }}
                    onMouseDown={e => {
                      e.preventDefault();
                      setIsDraggingCatImg(true);
                      catImgDragRef.current = { mouseX: e.clientX, mouseY: e.clientY, posX: catImgPosRef.current.x, posY: catImgPosRef.current.y };
                    }}
                    onMouseMove={e => {
                      if (!isDraggingCatImg || !catImgDragRef.current) return;
                      const dx = e.clientX - catImgDragRef.current.mouseX;
                      const dy = e.clientY - catImgDragRef.current.mouseY;
                      const newX = Math.max(0, Math.min(100, catImgDragRef.current.posX - dx * 0.18));
                      const newY = Math.max(0, Math.min(100, catImgDragRef.current.posY - dy * 0.18));
                      catImgPosRef.current = { x: newX, y: newY };
                      setCategoryImagePos({ x: newX, y: newY });
                    }}
                    onMouseUp={() => {
                      if (!isDraggingCatImg) return;
                      setIsDraggingCatImg(false);
                      catImgDragRef.current = null;
                      const { x, y } = catImgPosRef.current;
                      setCategoryFormData(p => ({ ...p, imagePosition: `${Math.round(x)}% ${Math.round(y)}%` }));
                    }}
                    onMouseLeave={() => {
                      if (!isDraggingCatImg) return;
                      setIsDraggingCatImg(false);
                      catImgDragRef.current = null;
                      const { x, y } = catImgPosRef.current;
                      setCategoryFormData(p => ({ ...p, imagePosition: `${Math.round(x)}% ${Math.round(y)}%` }));
                    }}
                  />
                  <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.35)', py: 0.5, textAlign: 'center', pointerEvents: 'none' }}>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: 600, fontSize: '10px' }}>
                      {isDraggingCatImg ? '🎯 กำลังปรับตำแหน่ง...' : '↕ ลากเพื่อปรับตำแหน่งรูป'}
                    </Typography>
                  </Box>
                  <Box
                    onClick={e => { e.stopPropagation(); setCategoryFormData(p => ({ ...p, imageUrl: '', imagePosition: '50% 50%' })); setCategoryImagePreview(''); setCategoryImagePos({ x: 50, y: 50 }); catImgPosRef.current = { x: 50, y: 50 }; }}
                    sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.55)', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', fontSize: 14, fontWeight: 700, zIndex: 1 }}
                  >✕</Box>
                </>
              ) : (
                <Stack alignItems="center" spacing={0.5}>
                  <UploadIcon sx={{ color: 'text.disabled', fontSize: 32 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>คลิกเพื่ออัปโหลดรูปภาพหมวดหมู่</Typography>
                  <Typography variant="caption" color="text.disabled">PNG, JPG ขนาดไม่เกิน 5MB</Typography>
                </Stack>
              )}
              <input
                ref={categoryImageRef} type="file" hidden accept="image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleCategoryImageUpload(f); e.target.value = ''; }}
              />
            </Box>

            {/* Name */}
            <TextField
              label="ชื่อหมวดหมู่ *" fullWidth
              value={categoryFormData.name}
              onChange={e => { setCategoryFormData(p => ({ ...p, name: e.target.value })); setCategoryError(null); }}
              autoFocus
            />

            {/* Type is fixed to the current page (see the initial/reset
                defaults above) — Class/Event/Service categories are
                separate pools, and each page now only ever manages its
                own, so there's nothing to pick manually. */}

            {/* Description */}
            <TextField
              label="คำอธิบาย (ไม่บังคับ)" fullWidth multiline rows={3}
              value={categoryFormData.description}
              onChange={e => setCategoryFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="อธิบายหมวดหมู่นี้..."
            />

            {/* Color */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>สีหมวดหมู่</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {['#7452d6','#0284c7','#16a34a','#ca8a04','#dc2626','#db2777','#0d9488','#ea580c','#64748b'].map(c => (
                  <Box
                    key={c}
                    onClick={() => setCategoryFormData(p => ({ ...p, color: c }))}
                    sx={{
                      width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                      border: '3px solid', borderColor: categoryFormData.color === c ? 'text.primary' : 'transparent',
                      transition: 'all 0.15s', transform: categoryFormData.color === c ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => { setCategoryFormDialogOpen(false); setCategoryError(null); }} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button
            variant="contained"
            onClick={handleCategorySubmit}
            disabled={categorySubmitting || !categoryFormData.name.trim()}
            sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}
          >
            {categorySubmitting ? <CircularProgress size={18} color="inherit" /> : (editCategory ? 'บันทึกการแก้ไข' : 'สร้างหมวดหมู่')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CourseManagement;
