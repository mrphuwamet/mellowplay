import { API_URL } from '../config';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SkillsLibraryManagement from './SkillsLibraryManagement';
import mellowPlayLogo from '../assets/logo.svg';
import CourseMaterialsTab from '../components/CourseMaterialsTab';
import {
  Typography, Box, CircularProgress,
  Grid, Button, Chip,
  TextField, MenuItem, Select, FormControl, InputLabel, InputAdornment,
  IconButton, Paper, Stack, Alert, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, ListItemButton, ListItemIcon, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
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
  People as SalesIcon,
  School as TeacherIcon,
  AutoStories as SkillsLibIcon,
  AspectRatio as CropIcon,
  CheckCircle as SavedIcon,
  Translate as TranslateIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { renderSkillIcon, type SkillItem, type SkillType } from '../utils/skillsLibrary';
import FocalPointPicker from '../components/FocalPointPicker';
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
  detail_poster_url?: string;
  images_json?: string;
  video_url?: string;
  teacher_guide_url?: string;
  is_recommended?: boolean;
  is_extraclass?: boolean;
  allow_repeat?: boolean;
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

const SectionLabel = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
  </Box>
);

const CourseManagement = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
    allowRepeat: true,
    stampsOnCompletion: 0,
    stampExpiryMonths: 12,
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

  const getViewImageUrl = (viewKey: string) => courseImageViews[viewKey]?.imageUrl || formData.thumbnailUrl || '';
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

    await Promise.all([
      views.length > 0 ? axios.put(`${API_BASE}/courses/${courseId}/image-views`, { views }) : Promise.resolve(),
      focals.length > 0 ? axios.put(`${API_BASE}/courses/${courseId}/image-focals`, { focals }) : Promise.resolve(),
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
    setCourseImageViews({});
    setImageFocals({});
    setPosterModalImage(null);
    if (course) {
      loadCourseImageViews(course.id);
      loadCourseImageFocals(course.id);
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
        allowRepeat: course.allow_repeat === undefined || course.allow_repeat === null ? true : !!course.allow_repeat,
        stampsOnCompletion: course.stamps_on_completion ?? 0,
        stampExpiryMonths: course.stamp_expiry_months ?? 12,
      });
    } else {
      setEditCourse(null);
      setFormData({
        id: 0, code: '', name: '', nameEn: '', description: '', descriptionEn: '', shortDescription: '', shortDescriptionEn: '', location: '', locationLink: '', branchIds: [],
        categoryId: categories[0]?.id || 0, calendarId: 0, ageMin: 3, ageMax: 9,
        duration: '01:00', originalPrice: '', premiumPrice: '', couponRequirements: [],
        skills: [] as { th: string; en: string }[], metrics: [] as { th: string; en: string }[], thumbnailUrl: '', detailPosterUrl: '', images: [], videoUrl: '', teacherGuideUrl: '',
        salesCommissionType: 'percent', salesCommissionValue: '',
        teacherCommissionType: 'percent', teacherCommissionValue: '',
        isRecommended: false,
        isExtraclass: false,
        allowRepeat: true,
        stampsOnCompletion: 0,
        stampExpiryMonths: 12,
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
        allowRepeat:            formData.allowRepeat,
        stampsOnCompletion:     formData.stampsOnCompletion,
        stampExpiryMonths:      formData.stampExpiryMonths,
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
          {/* Single full-width column now — the media/guide summary boxes
              that used to live in a separate right sidebar are folded into
              Basic Info below instead, so the whole form uses the full width. */}
          <Grid item xs={12}>

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
                    <FormControlLabel
                      control={<Switch checked={formData.isExtraclass} onChange={e => setFormData({ ...formData, isExtraclass: e.target.checked })} color="secondary" />}
                      label="คลาสพิเศษ"
                    />
                    <FormControlLabel
                      control={<Switch checked={formData.allowRepeat} onChange={e => setFormData({ ...formData, allowRepeat: e.target.checked })} />}
                      label="อนุญาตให้เข้าร่วมซ้ำ"
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="แสตมป์ที่ได้รับ (หลังเรียนจบ)"
                    type="number"
                    fullWidth
                    inputProps={{ min: 0 }}
                    value={formData.stampsOnCompletion}
                    onChange={e => setFormData({ ...formData, stampsOnCompletion: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="ระยะเวลาหมดอายุแสตมป์ (เดือน)"
                    type="number"
                    fullWidth
                    inputProps={{ min: 1 }}
                    value={formData.stampExpiryMonths}
                    onChange={e => setFormData({ ...formData, stampExpiryMonths: Math.max(1, parseInt(e.target.value) || 12) })}
                    helperText="วันหมดอายุจริงจะปัดขึ้นเป็นสิ้นเดือน 6 หรือสิ้นปี"
                  />
                </Grid>

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
                  <Button
                    fullWidth variant="outlined" size="small" startIcon={<ImageIcon />}
                    onClick={() => { setMediaModalTab('media'); setMediaModalOpen(true); }}
                  >
                    จัดการรูปภาพและวิดีโอ
                  </Button>
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

            {/* Skills + Achievement */}
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
                      {!!formData.id && (
                        <ListItemButton selected={mediaModalTab === 'views'} onClick={() => setMediaModalTab('views')} sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}><CropIcon fontSize="small" /></ListItemIcon>
                          <ListItemText primary="มุมมองการแสดงผล" primaryTypographyProps={{ fontSize: 13, fontWeight: mediaModalTab === 'views' ? 800 : 600 }} />
                        </ListItemButton>
                      )}
                      {!!formData.id && posterViewDef && (
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
                          รูปภาพ <span style={{ color: '#94a3b8', marginLeft: 4, fontWeight: 400 }}>* ลากรูปเพื่อจัดลำดับ — รูปแรกจะถูกใช้เป็นรูปปกของคลาสโดยอัตโนมัติ</span>
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
                              {idx === 0 && (
                                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 9, fontWeight: 700, textAlign: 'center', py: 0.25 }}>
                                  ปก
                                </Box>
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
              <TableCell sx={{ fontWeight: 800 }}>รูป</TableCell>
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
                  <TableCell sx={{ width: 56 }}>
                    <Box sx={{ width: 44, height: 44, borderRadius: 1.5, overflow: 'hidden', bgcolor: '#f8f5ff', border: '1px solid #eee' }}>
                      {course.thumbnail_url ? (
                        <img src={getImageUrl(course.thumbnail_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <img src={mellowPlayLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6, opacity: 0.5 }} />
                      )}
                    </Box>
                  </TableCell>
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
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
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
