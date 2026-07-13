import { API_URL } from '../config';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SkillsLibraryManagement from './SkillsLibraryManagement';
import CourseMaterialsTab from '../components/CourseMaterialsTab';
import {
  Typography, Box, CircularProgress,
  Grid, Button, Chip,
  TextField, MenuItem, Select, FormControl, InputLabel, InputAdornment,
  IconButton, Paper, Stack, Alert, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  ToggleButton, ToggleButtonGroup, Switch, FormControlLabel,
  Tab, Tabs,
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
  People as SalesIcon,
  School as TeacherIcon,
  AutoStories as SkillsLibIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { renderSkillIcon, type SkillItem, type SkillType } from '../utils/skillsLibrary';

const API_BASE = `${API_URL}/api/v1/admin`;

interface Course {
  id: number;
  code: string;
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
  images_json?: string;
  video_url?: string;
  teacher_guide_url?: string;
  is_recommended?: boolean;
  is_extraclass?: boolean;
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

// Bilingual tag input with Modal
const SkillTagInput = ({ label, values, onChange, color = 'primary' }: {
  label: string;
  values: { th: string; en: string }[];
  onChange: (v: { th: string; en: string }[]) => void;
  color?: 'primary' | 'secondary';
}) => {
  const [open, setOpen] = React.useState(false);
  const [th, setTh] = React.useState('');
  const [en, setEn] = React.useState('');

  const accentColor = color === 'primary' ? '#7c3aed' : '#0284c7';
  const bgColor     = color === 'primary' ? '#f5f3ff' : '#eff6ff';

  const handleAdd = () => {
    if (!th.trim() && !en.trim()) return;
    onChange([...values, { th: th.trim(), en: en.trim() }]);
    setTh(''); setEn('');
    setOpen(false);
  };

  const handleClose = () => { setTh(''); setEn(''); setOpen(false); };

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ color: accentColor }}>
          {label}
        </Typography>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setOpen(true)}
          sx={{ borderRadius: 2, fontWeight: 700, borderColor: accentColor, color: accentColor,
            '&:hover': { borderColor: accentColor, bgcolor: bgColor } }}>
          เพิ่มรายการ
        </Button>
      </Box>

      {/* List */}
      {values.length === 0
        ? <Typography variant="caption" color="text.disabled">ยังไม่มีรายการ — กด "เพิ่มรายการ"</Typography>
        : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {values.map((v, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 1.25, borderRadius: 2, bgcolor: bgColor,
                border: '1px solid', borderColor: `${accentColor}30` }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {v.th && <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.5 }}>{v.th}</Typography>}
                  {v.en && <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, display: 'block' }}>{v.en}</Typography>}
                </Box>
                <IconButton size="small" onClick={() => onChange(values.filter((_, j) => j !== i))}
                  sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

      {/* Modal */}
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
          {label.split('—')[0].trim()}
          <Typography variant="body2" color="text.secondary" fontWeight={400}>กรอกทั้ง 2 ภาษา อย่างน้อย 1 ภาษา</Typography>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField autoFocus fullWidth label="ภาษาไทย" placeholder="เช่น ความคิดสร้างสรรค์"
            value={th} onChange={(e) => setTh(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('skill-en-input')?.focus(); } }}
            InputProps={{ sx: { borderRadius: 2 } }} />
          <TextField id="skill-en-input" fullWidth label="English" placeholder="e.g. Creative Thinking"
            value={en} onChange={(e) => setEn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            InputProps={{ sx: { borderRadius: 2 } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleClose} sx={{ fontWeight: 700, borderRadius: 2 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!th.trim() && !en.trim()}
            disableElevation sx={{ fontWeight: 700, borderRadius: 2,
              bgcolor: accentColor, '&:hover': { bgcolor: accentColor, opacity: 0.9 } }}>
            เพิ่มรายการ
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const SectionLabel = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
  </Box>
);

const CourseManagement = () => {
  const navigate = useNavigate();
  const [pageTab, setPageTab] = useState(0);
  const currentUserRole = (() => { try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role; } catch { return ''; } })();
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [couponTypes, setCouponTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryFormDialogOpen, setCategoryFormDialogOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [descExpandModal, setDescExpandModal] = useState<{ open: boolean; lang: 'th' | 'en' } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    images: [] as string[],
    videoUrl: '',
    teacherGuideUrl: '',
    salesCommissionType: 'percent' as 'percent' | 'fixed',
    salesCommissionValue: '',
    teacherCommissionType: 'percent' as 'percent' | 'fixed',
    teacherCommissionValue: '',
    isRecommended: false,
    isExtraclass: false,
  });

  const [categoryFormData, setCategoryFormData] = useState({ name: '', description: '', color: '#7452d6', imageUrl: '', imagePosition: '50% 50%' });
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
  const [deleteType, setDeleteType] = useState<'course' | 'category'>('course');

  type TagField = 'skills' | 'metrics';
  const [libraryItems, setLibraryItems] = useState<SkillItem[]>([]);
  const [pickerState, setPickerState] = useState<{ open: boolean; field: TagField | null; type: SkillType | null }>({ open: false, field: null, type: null });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filters, setFilters] = useState({ search: '', category: '' });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const guideInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

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
      const [coursesRes, catsRes, calRes, branchesRes, couponsRes] = await Promise.all([
        axios.get(`${API_BASE}/courses`),
        axios.get(`${API_BASE}/categories`),
        axios.get(`${API_BASE}/calendars`),
        axios.get(`${API_BASE}/branches`),
        axios.get(`${API_BASE}/coupon-types`),
      ]);
      if (coursesRes.data.success) setCourses(coursesRes.data.courses || []);
      if (catsRes.data.success) setCategories(catsRes.data.categories || []);
      if (calRes.data.success) setCalendars(calRes.data.calendars || []);
      if (branchesRes.data.success) setBranches(branchesRes.data.branches || []);
      if (couponsRes.data.success) setCouponTypes(couponsRes.data.couponTypes || []);
    } catch (e) { console.error('Failed to fetch data', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredCourses = React.useMemo(() => {
    return courses.filter(course => {
      const q = filters.search.toLowerCase();
      const matchesSearch = !q ||
        course.name.toLowerCase().includes(q) ||
        (course.code && course.code.toLowerCase().includes(q)) ||
        course.id.toString().includes(q);
      const matchesCat = !filters.category || course.category_id === parseInt(filters.category);
      return matchesSearch && matchesCat;
    });
  }, [courses, filters]);

  const handleEditOpen = async (course: Course | null = null) => {
    setSaveError(null);
    setPageTab(0);
    if (course) {
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
        images: course.images_json ? JSON.parse(course.images_json) : [],
        videoUrl: course.video_url || '',
        teacherGuideUrl: course.teacher_guide_url || '',
        salesCommissionType: (course as any).sales_commission_type || 'percent',
        salesCommissionValue: (course as any).sales_commission_value != null ? String((course as any).sales_commission_value) : '',
        teacherCommissionType: (course as any).teacher_commission_type || 'percent',
        teacherCommissionValue: (course as any).teacher_commission_value != null ? String((course as any).teacher_commission_value) : '',
        isRecommended: !!course.is_recommended,
        isExtraclass: !!course.is_extraclass,
      });
    } else {
      setEditCourse(null);
      setFormData({
        id: 0, code: '', name: '', nameEn: '', description: '', descriptionEn: '', shortDescription: '', shortDescriptionEn: '', location: '', locationLink: '', branchIds: [],
        categoryId: categories[0]?.id || 0, calendarId: 0, ageMin: 3, ageMax: 9,
        duration: '01:00', originalPrice: '', premiumPrice: '', couponRequirements: [],
        skills: [] as { th: string; en: string }[], metrics: [] as { th: string; en: string }[], thumbnailUrl: '', images: [], videoUrl: '', teacherGuideUrl: '',
        salesCommissionType: 'percent', salesCommissionValue: '',
        teacherCommissionType: 'percent', teacherCommissionValue: '',
        isRecommended: false,
        isExtraclass: false,
      });
    }
    setIsEditing(true);
  };

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
        imagesJson:        JSON.stringify(formData.images),
        videoUrl:          formData.videoUrl,
        teacherGuideUrl:   formData.teacherGuideUrl,
        salesCommissionType:    formData.salesCommissionValue ? formData.salesCommissionType : null,
        salesCommissionValue:   formData.salesCommissionValue ? parseFloat(formData.salesCommissionValue) : null,
        teacherCommissionType:  formData.teacherCommissionValue ? formData.teacherCommissionType : null,
        teacherCommissionValue: formData.teacherCommissionValue ? parseFloat(formData.teacherCommissionValue) : null,
        isRecommended:          formData.isRecommended,
        isExtraclass:           formData.isExtraclass,
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
      }

      setIsEditing(false);
      fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setSaveError(msg || 'ไม่สามารถบันทึกข้อมูลคลาสเรียนได้ กรุณาลองใหม่');
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (deleteType === 'course') await axios.delete(`${API_BASE}/courses/${itemToDelete.id}`);
      else await axios.delete(`${API_BASE}/categories/${itemToDelete.id}`);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchData();
    } catch (e) { console.error(e); }
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
      setCategoryFormData({ name: '', description: '', color: '#7452d6', imageUrl: '', imagePosition: '50% 50%' });
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

  const togglePickerItem = (name: string) => {
    if (!pickerState.field) return;
    const field = pickerState.field;
    const current = formData[field];
    setFormData({ ...formData, [field]: current.includes(name) ? current.filter(t => t !== name) : [...current, name] });
  };

  // Derived state
  const selectedPreset = AGE_PRESETS.find(p => p.min === formData.ageMin && p.max === formData.ageMax);
  const durationHour = formData.duration.split(':')[0] || '01';
  const durationMinute = formData.duration.split(':')[1] || '00';

  if (loading && !isEditing) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  // ─── Edit Form ───────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <Box sx={{ pb: 12 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{editCourse ? 'แก้ไขคลาสเรียน' : 'สร้างคลาสเรียนใหม่'}</Typography>
            {editCourse && <Typography variant="body2" color="text.secondary">{editCourse.name}</Typography>}
          </Box>
        </Box>

        {saveError && <Alert severity="error" onClose={() => setSaveError(null)} sx={{ mb: 3 }}>{saveError}</Alert>}

        <Grid container spacing={3}>
          {/* ── Left column ── */}
          <Grid item xs={12} md={8}>

            {/* Basic Info */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<CategoryIcon />} title="ข้อมูลพื้นฐาน" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>หมวดหมู่ *</InputLabel>
                    <Select value={formData.categoryId} label="หมวดหมู่ *" onChange={e => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                      {categories.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>ปฏิทิน (Calendar)</InputLabel>
                    <Select value={formData.calendarId} label="ปฏิทิน (Calendar)" onChange={e => setFormData({ ...formData, calendarId: Number(e.target.value) })}>
                      <MenuItem value={0}><em>(ไม่ผูกกับปฏิทิน)</em></MenuItem>
                      {calendars.map(cal => <MenuItem key={cal.id} value={cal.id}>{cal.name}</MenuItem>)}
                    </Select>
                  </FormControl>
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
                <Grid item xs={12} sm={6}>
                  <TextField label="รหัสวิชา (Subject Code)" fullWidth value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="🇹🇭 ชื่อคลาส (ภาษาไทย) *" fullWidth value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="🇬🇧 Class Name (English)" fullWidth value={formData.nameEn} onChange={e => setFormData({ ...formData, nameEn: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel 
                    control={<Switch checked={formData.isRecommended} onChange={e => setFormData({ ...formData, isRecommended: e.target.checked })} />} 
                    label="โปรโมทเป็นคลาสแนะนำ (Recommended)" 
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel 
                    control={<Switch checked={formData.isExtraclass} onChange={e => setFormData({ ...formData, isExtraclass: e.target.checked })} color="secondary" />} 
                    label="ตั้งเป็น Extra Class" 
                  />
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
                  <TextField label="🇹🇭 รายละเอียดอย่างย่อ (ภาษาไทย) - แสดงบนการ์ด" fullWidth value={formData.shortDescription} onChange={e => setFormData({ ...formData, shortDescription: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="🇬🇧 รายละเอียดอย่างย่อ (ภาษาอังกฤษ) - แสดงบนการ์ด" fullWidth value={formData.shortDescriptionEn} onChange={e => setFormData({ ...formData, shortDescriptionEn: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ position: 'relative' }}>
                    <TextField label="🇹🇭 รายละเอียด (ภาษาไทย)" multiline rows={4} fullWidth value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                    <Tooltip title="ขยาย">
                      <IconButton size="small" onClick={() => setDescExpandModal({ open: true, lang: 'th' })} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}>
                        <ExpandIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ position: 'relative' }}>
                    <TextField label="🇬🇧 Description (English)" multiline rows={4} fullWidth value={formData.descriptionEn} onChange={e => setFormData({ ...formData, descriptionEn: e.target.value })} />
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setDescExpandModal({ open: true, lang: 'en' })} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}>
                        <ExpandIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
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
                {formData.isExtraclass && (
                  <Grid item xs={12}>
                    <TextField label="📍 สถานที่จัดกิจกรรม (ระบุเมื่อเป็น Extra Class)" fullWidth placeholder="เช่น ลานกิจกรรมชั้น 1 Central Chidlom" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                  </Grid>
                )}
                {formData.isExtraclass && (
                  <Grid item xs={12}>
                    <TextField label="🔗 ลิงก์ Google Map (สถานที่จัดกิจกรรม)" fullWidth placeholder="เช่น https://maps.app.goo.gl/..." value={formData.locationLink} onChange={e => setFormData({ ...formData, locationLink: e.target.value })} />
                  </Grid>
                )}
              </Grid>
            </Paper>

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
                        const typeInfo = COUPON_TYPES.find(t => t.id === req.typeId);
                        return (
                          <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <FormControl size="small" sx={{ flex: 2, minWidth: 160 }}>
                              <InputLabel>ประเภทคูปอง</InputLabel>
                              <Select
                                value={req.typeId}
                                label="ประเภทคูปอง"
                                onChange={e => updateCouponRequirement(idx, 'typeId', e.target.value)}
                              >
                                {COUPON_TYPES.map(t => (
                                  <MenuItem key={t.id} value={t.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color, flexShrink: 0 }} />
                                      {t.label}
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
                                {req.count} × {typeInfo?.label ?? req.label}
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

            {/* Skills + Achievement */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <SectionLabel icon={<SkillsIcon />} title="ทักษะและตัวชี้วัด" />
              <SkillTagInput
                label="Skills — ทักษะที่ได้รับในคลาสนี้"
                values={formData.skills}
                onChange={(v) => setFormData({ ...formData, skills: v })}
                color="primary"
              />
              <Divider sx={{ my: 1 }} />
              <Box sx={{ mt: 2 }}>
                <SkillTagInput
                  label="Achievement — ตัวชี้วัดความสำเร็จ"
                  values={formData.metrics}
                  onChange={(v) => setFormData({ ...formData, metrics: v })}
                  color="secondary"
                />
              </Box>
            </Paper>
          </Grid>

          {/* ── Right column ── */}
          <Grid item xs={12} md={4}>

            {/* Media */}
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel icon={<ImageIcon />} title="สื่อประกอบคลาส" />

              {/* Thumbnail */}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                รูปปก (Thumbnail) <span style={{ color: '#ef4444', marginLeft: 4 }}>* ขนาดแนะนำ: 800x450 (อัตราส่วน 16:9)</span>
              </Typography>
              <Box
                onClick={() => thumbnailInputRef.current?.click()}
                sx={{
                  position: 'relative', mb: 2.5, aspectRatio: '16/9', borderRadius: 2, overflow: 'hidden',
                  border: '2px dashed #e2e8f0', cursor: 'pointer', bgcolor: '#f9fafb',
                  '&:hover': { borderColor: 'primary.main', bgcolor: '#f5f0ff' },
                }}
              >
                {formData.thumbnailUrl ? (
                  <>
                    <img src={formData.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="thumbnail" />
                    <IconButton
                      onClick={e => { e.stopPropagation(); setFormData({ ...formData, thumbnailUrl: '' }); }}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.45)', color: 'white', p: 0.5 }}
                    >
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </>
                ) : (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon color="disabled" sx={{ mb: 0.5 }} />
                    <Typography variant="caption" color="text.disabled">คลิกเพื่ออัปโหลดรูปปก</Typography>
                  </Box>
                )}
              </Box>
              <input type="file" hidden accept="image/*" ref={thumbnailInputRef} onChange={e => { if (e.target.files?.[0]) setFormData({ ...formData, thumbnailUrl: URL.createObjectURL(e.target.files[0]) }); }} />

              {/* Video */}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>วิดีโอประกอบ</Typography>
              {formData.videoUrl ? (
                <Box sx={{ position: 'relative', aspectRatio: '16/9', borderRadius: 2, overflow: 'hidden', bgcolor: 'black', mb: 2.5 }}>
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
                  sx={{ aspectRatio: '16/9', borderRadius: 2, border: '2px dashed #e2e8f0', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', mb: 2.5, '&:hover': { borderColor: 'primary.main', bgcolor: '#f5f0ff' } }}
                >
                  <VideoIcon color="disabled" sx={{ mb: 0.5 }} />
                  <Typography variant="caption" color="text.disabled">คลิกเพื่ออัปโหลดวิดีโอ</Typography>
                </Box>
              )}
              <input type="file" hidden accept="video/*" ref={videoInputRef} onChange={e => { if (e.target.files?.[0]) setFormData({ ...formData, videoUrl: URL.createObjectURL(e.target.files[0]) }); }} />

              {/* Additional Images */}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>รูปภาพเพิ่มเติม</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {formData.images.map((img, idx) => (
                  <Box key={idx} sx={{ position: 'relative', width: 60, height: 60, borderRadius: 1.5, overflow: 'hidden', border: '1px solid #eee' }}>
                    <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    <IconButton onClick={() => setFormData({ ...formData, images: formData.images.filter((_, i) => i !== idx) })} sx={{ position: 'absolute', top: 1, right: 1, bgcolor: 'rgba(255,255,255,0.85)', p: 0.15 }}>
                      <ClearIcon sx={{ fontSize: 10 }} />
                    </IconButton>
                  </Box>
                ))}
                <Box
                  onClick={() => imageInputRef.current?.click()}
                  sx={{ width: 60, height: 60, borderRadius: 1.5, border: '2px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                >
                  <AddIcon color="disabled" fontSize="small" />
                </Box>
              </Box>
              <input type="file" hidden accept="image/*" multiple ref={imageInputRef} onChange={e => { if (e.target.files) { const imgs = Array.from(e.target.files).map(f => URL.createObjectURL(f)); setFormData({ ...formData, images: [...formData.images, ...imgs] }); } }} />
            </Paper>

            {/* Teacher Guide */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <SectionLabel icon={<GuideIcon />} title="คู่มือการสอน" />
              {formData.teacherGuideUrl ? (
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  sx={{ py: 5, border: '2px dashed #e2e8f0', borderRadius: 2, textAlign: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc', borderColor: 'primary.main' } }}
                >
                  <UploadIcon color="disabled" sx={{ fontSize: 28, mb: 0.5 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>อัปโหลดคู่มือ PDF</Typography>
                  <Typography variant="caption" color="text.secondary">คลิกเพื่อเลือกไฟล์</Typography>
                </Box>
              )}
              <input type="file" hidden accept="application/pdf" ref={guideInputRef} onChange={e => { if (e.target.files?.[0]) setFormData({ ...formData, teacherGuideUrl: URL.createObjectURL(e.target.files[0]) }); }} />
            </Paper>
          </Grid>
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

        {/* Description expand dialog */}
        <Dialog open={!!descExpandModal?.open} onClose={() => setDescExpandModal(null)} fullWidth maxWidth="md">
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {descExpandModal?.lang === 'th' ? '🇹🇭 รายละเอียดคลาส (ภาษาไทย)' : '🇬🇧 Class Description (English)'}
            <IconButton onClick={() => setDescExpandModal(null)}><ClearIcon /></IconButton>
          </DialogTitle>
          <DialogContent>
            <TextField
              multiline rows={16} fullWidth autoFocus sx={{ mt: 1 }}
              placeholder={descExpandModal?.lang === 'th' ? 'กรอกรายละเอียดคลาสภาษาไทย...' : 'Enter class description in English...'}
              value={descExpandModal?.lang === 'th' ? formData.description : formData.descriptionEn}
              onChange={e => descExpandModal?.lang === 'th'
                ? setFormData({ ...formData, description: e.target.value })
                : setFormData({ ...formData, descriptionEn: e.target.value })
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
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {libraryItems.filter(s => s.type === pickerState.type).map(item => {
                const isSelected = pickerState.field ? formData[pickerState.field].includes(item.name) : false;
                return (
                  <Chip
                    key={item.id}
                    icon={renderSkillIcon(item.icon, { fontSize: 'small', sx: { color: isSelected ? 'inherit' : (item.type === 'achievement' ? '#7452d6' : '#ef4f55') } })}
                    label={item.name}
                    onClick={() => togglePickerItem(item.name)}
                    color={isSelected ? (pickerState.type === 'achievement' ? 'primary' : 'secondary') : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                  />
                );
              })}
            </Box>
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
        <Typography variant="h5" sx={{ fontWeight: 800 }}>จัดการคลาสเรียน</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {pageTab === 0 && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleEditOpen()} sx={{ borderRadius: 3, fontWeight: 700 }}>
              เพิ่มคลาส
            </Button>
          )}
          {pageTab === 1 && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
              setEditCategory(null);
              setCategoryFormData({ name: '', description: '', color: '#7452d6', imageUrl: '', imagePosition: '50% 50%' });
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
          <Tab label="รายการคลาส" />
          <Tab label="หมวดหมู่" icon={<CategoryIcon sx={{ fontSize: 16 }} />} iconPosition="end" />
          <Tab label="Skills Library" icon={<SkillsLibIcon sx={{ fontSize: 16 }} />} iconPosition="end" />
          <Tab label="วัสดุ/อุปกรณ์" />
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
                {categories.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} sx={{ border: '1px solid #e5e7eb', borderRadius: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f9fafb' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>รหัสคลาส</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ชื่อคลาส</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>หมวดหมู่</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ช่วงอายุ</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ราคาปกติ</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ระยะเวลา</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800 }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCourses.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(course => {
              const ageRange = formatAgeRange(course.age_min, course.age_max);
              const catColor = categories.find(c => c.id === course.category_id)?.color || '#7452d6';
              return (
                <TableRow key={course.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{course.code || `#${course.id}`}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{course.name}</TableCell>
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
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => handleEditOpen(course)} color="primary"><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => { setItemToDelete({ id: course.id, name: course.name }); setDeleteType('course'); setDeleteDialogOpen(true); }} color="error"><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredCourses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                  <Typography variant="body2" color="text.secondary">ไม่พบข้อมูลคลาสเรียน</Typography>
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
          {categories.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <CategoryIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
              <Typography variant="body2">ยังไม่มีหมวดหมู่ — กด "เพิ่มหมวดหมู่" เพื่อเริ่มต้น</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {categories.map((cat, idx) => (
                <ListItem
                  key={cat.id}
                  divider={idx < categories.length - 1}
                  sx={{ py: 1.5, px: 2.5, '&:hover': { bgcolor: '#f8fafc' } }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => {
                        setEditCategory(cat);
                        setCategoryFormData({ name: cat.name, description: cat.description || '', color: cat.color || '#7452d6', imageUrl: cat.image_url || '', imagePosition: (cat as any).image_position || '50% 50%' });
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
      {pageTab === 2 && (
        <SkillsLibraryManagement currentUserRole={currentUserRole} />
      )}

      {/* ── Tab 3: Course Materials ────────────────────────────────────────────── */}
      {pageTab === 3 && (
        <CourseMaterialsTab courses={courses} apiBase={`${API_URL}/api/v1/admin`} />
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบ {deleteType === 'course' ? 'คลาส' : 'หมวดหมู่'} <strong>"{itemToDelete?.name}"</strong> ใช่หรือไม่?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined">ยกเลิก</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">ลบข้อมูล</Button>
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
