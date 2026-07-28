import { API_URL } from '../config';
import React, { useEffect, useState, useRef } from 'react';
import {
  Typography, Box, CircularProgress,
  Grid, Button, Chip, Alert,
  TextField, IconButton, Paper,
  Avatar, Stack, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Save as SaveIcon,
  Movie as VideoIcon,
  Close as ClearIcon,
  Add as AddIcon,
  AutoAwesome as SkillsStepIcon,
  RateReview as CommentStepIcon,
  PhotoLibrary as MediaStepIcon,
  Groups as AgeIcon,
  Check as CheckIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Phone as PhoneIcon,
  EventNote as BookingIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { renderSkillIcon, type SkillItem } from '../utils/skillsLibrary';

const API_BASE = `${API_URL}/api/v1`;

interface RecordMilestoneProps {
  // `booking` (single, still used by POSBookingView/CourseManagement) or
  // `bookings` (BookingManagement's List view — a report per selected
  // child, filled one at a time via the Prev/Next wizard below) — exactly
  // one of the two is provided by any given caller.
  booking?: any;
  bookings?: any[];
  onClose: () => void;
  onSuccess: () => void;
}

// type distinguishes course-level "skills" (achievement_skills_json) from
// a per-report "today's highlight" observation (metrics_json) — both used
// to just get flattened into one list on save, making it impossible to
// show them as separate sections later (BookingDetailModal/ReportDetail).
interface BilingualSkill { th: string; en: string; type?: 'achievement' | 'indicator'; }

interface ReportForm {
  skills: BilingualSkill[];
  teacherComment: string;
  images: string[];
  videoUrl: string;
}

const blankForm = (): ReportForm => ({ skills: [], teacherComment: '', images: [], videoUrl: '' });
const isFormBlank = (f: ReportForm | undefined) =>
  !f || (f.skills.length === 0 && !f.teacherComment.trim() && f.images.length === 0 && !f.videoUrl);

const skillKey = (s: BilingualSkill) => `${s.th}|${s.en}`;

const getImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const RecordMilestone: React.FC<RecordMilestoneProps> = ({ booking, bookings, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [skillsLibrary, setSkillsLibrary] = useState<SkillItem[]>([]);

  const targets: any[] = bookings && bookings.length > 0 ? bookings : [booking];
  const isBulk = targets.length > 1;

  // Which person (booking) is currently being filled in — always 0 outside
  // bulk mode, so every currentTarget-based computation below is exactly
  // the old single-booking behavior when isBulk is false.
  const [bulkIndex, setBulkIndex] = useState(0);
  const currentTarget = targets[bulkIndex];
  const currentIsEditMode = currentTarget.status === 'completed';

  // Each person's in-progress report, kept independently so navigating away
  // and back (or jumping via the avatar strip) never loses what was typed.
  const [bulkForms, setBulkForms] = useState<Record<number, ReportForm>>({});
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState<ReportForm>(blankForm());
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Loads whichever form belongs to the currently-shown person — from
  // memory if they've already been visited this session, from their
  // existing filed report if reopening a completed booking, or blank.
  useEffect(() => {
    let cancelled = false;
    const existing = bulkForms[currentTarget.id];
    if (existing) {
      setFormData(existing);
      return;
    }
    if (currentTarget.status === 'completed') {
      setPrefillLoading(true);
      axios.get(`${API_BASE}/admin/journey/progress-by-booking/${currentTarget.id}`)
        .then(res => {
          if (cancelled) return;
          const progress = res.data.success ? res.data.progress : null;
          let skills: BilingualSkill[] = [];
          if (progress) {
            try {
              skills = typeof progress.skills_learned === 'string'
                ? JSON.parse(progress.skills_learned)
                : (progress.skills_learned || []);
            } catch { skills = []; }
          }
          const media: { url: string; type: string }[] = progress?.media || [];
          const loaded: ReportForm = {
            skills,
            teacherComment: progress?.teacher_comment || '',
            images: media.filter(m => m.type === 'image').map(m => m.url),
            videoUrl: media.find(m => m.type === 'video')?.url || '',
          };
          setFormData(loaded);
          setBulkForms(prev => ({ ...prev, [currentTarget.id]: loaded }));
        })
        .catch(err => console.error('Failed to load existing report', err))
        .finally(() => { if (!cancelled) setPrefillLoading(false); });
    } else {
      setFormData(blankForm());
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTarget.id]);

  // Course list + Skills Library fetched once, independent of which person
  // is currently shown — each person can be a different course in bulk
  // mode, so which skills are selectable is derived per-target below
  // instead of being tied to a single fetch.
  useEffect(() => {
    const fetchCourseSkills = async () => {
      setSkillsLoading(true);
      try {
        const [coursesRes, libraryRes] = await Promise.all([
          axios.get(`${API_BASE}/admin/courses`),
          axios.get(`${API_BASE}/admin/skills-library`),
        ]);
        if (coursesRes.data.success) setAllCourses(coursesRes.data.courses);
        if (libraryRes.data.success) setSkillsLibrary(libraryRes.data.skills);
      } catch (err) {
        console.error('Failed to load course skills', err);
      } finally {
        setSkillsLoading(false);
      }
    };
    fetchCourseSkills();
  }, []);

  const currentCourse = React.useMemo(
    () => allCourses.find((c: any) => c.id === currentTarget.course_id) || null,
    [allCourses, currentTarget.course_id]
  );

  // Both are arrays of { th, en } pairs — set via SkillTagInput in
  // CourseManagement, NOT plain strings.
  const availableSkills = React.useMemo(() => {
    let achievementSkills: BilingualSkill[] = [];
    let indicatorSkills: BilingualSkill[] = [];
    try { achievementSkills = currentCourse?.achievement_skills_json ? JSON.parse(currentCourse.achievement_skills_json) : []; } catch { /* malformed json */ }
    try { indicatorSkills = currentCourse?.metrics_json ? JSON.parse(currentCourse.metrics_json) : []; } catch { /* malformed json */ }
    const tagged = [
      ...achievementSkills.map(skill => ({ skill, type: 'achievement' as const })),
      ...indicatorSkills.map(skill => ({ skill, type: 'indicator' as const })),
    ];
    return tagged.map(({ skill, type }) => {
      const found = skillsLibrary.find(s => s.name === skill.th);
      // Backfill a missing translation from the Skills Library so the
      // report page can still show both languages even if whoever
      // configured the course only filled in one.
      const resolved: BilingualSkill = {
        th: skill.th || found?.name || '',
        en: skill.en || found?.name_en || '',
      };
      return {
        id: skillKey(skill),
        skill: resolved,
        icon: renderSkillIcon(found?.icon || 'Star', { fontSize: 'small' }),
        type,
      };
    });
  }, [currentCourse, skillsLibrary]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const toggleSkill = (skill: BilingualSkill, type: 'achievement' | 'indicator') => {
    const key = skillKey(skill);
    const isSelected = formData.skills.some(s => skillKey(s) === key);
    setFormData({
      ...formData,
      skills: isSelected
        ? formData.skills.filter(s => skillKey(s) !== key)
        : [...formData.skills, { ...skill, type }],
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImageUploading(true);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append('file', files[i]);
        fd.append('folder', 'journey-media');
        const res = await axios.post(`${API_BASE}/admin/upload`, fd);
        if (res.data.success) uploaded.push(res.data.url);
      }
      setFormData(f => ({ ...f, images: [...f.images, ...uploaded] }));
    } catch (err) {
      console.error('Failed to upload image', err);
      setError('อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setImageUploading(false);
      e.target.value = '';
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'journey-media');
      const res = await axios.post(`${API_BASE}/admin/upload`, fd);
      if (res.data.success) setFormData(f => ({ ...f, videoUrl: res.data.url }));
    } catch (err) {
      console.error('Failed to upload video', err);
      setError('อัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setVideoUploading(false);
      e.target.value = '';
    }
  };

  const submitReportForTarget = async (target: any, form: ReportForm) => {
    await axios.post(`${API_BASE}/journey/record`, {
      childId: target.child_id,
      bookingId: target.id,
      skillsLearned: form.skills,
      teacherComment: form.teacherComment,
      media: [
        ...form.images.map(url => ({ url, type: 'image' })),
        ...(form.videoUrl ? [{ url: form.videoUrl, type: 'video' }] : [])
      ]
    });
  };

  // ── Single-booking flow (unchanged behavior) ──────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await submitReportForTarget(currentTarget, formData);
      // The booking only becomes "completed" (stock deducted, stamps
      // awarded) once the report is first filed — see BookingManagement's
      // handleComplete. Skip this when editing an already-completed booking,
      // or it would deduct stock / award stamps a second time.
      if (currentTarget.status !== 'completed') {
        await axios.post(`${API_BASE}/admin/bookings/${currentTarget.id}/complete`);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  // ── Bulk wizard flow ──────────────────────────────────────────────────────
  const flushCurrentForm = () => {
    setBulkForms(prev => ({ ...prev, [currentTarget.id]: formData }));
    return { ...bulkForms, [currentTarget.id]: formData };
  };

  const goTo = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= targets.length || newIndex === bulkIndex) return;
    flushCurrentForm();
    setBulkIndex(newIndex);
  };
  const goPrev = () => goTo(bulkIndex - 1);
  const goNext = () => goTo(bulkIndex + 1);

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    setError(null);
    try {
      await submitReportForTarget(currentTarget, formData);
      setBulkForms(prev => ({ ...prev, [currentTarget.id]: formData }));
      setSavedIds(prev => new Set(prev).add(currentTarget.id));
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'บันทึกฉบับร่างไม่สำเร็จ');
    } finally {
      setDraftSaving(false);
    }
  };

  const countFilled = (formsMap: Record<number, ReportForm>) => {
    let filled = 0;
    for (const t of targets) if (!isFormBlank(formsMap[t.id])) filled++;
    return filled;
  };

  const mergedForms = { ...bulkForms, [currentTarget.id]: formData };
  const filledCount = countFilled(mergedForms);
  const unfilledCount = targets.length - filledCount;

  const runFinish = async (formsMap: Record<number, ReportForm>) => {
    setFinishing(true);
    setError(null);
    try {
      for (const t of targets) {
        const form = formsMap[t.id];
        if (isFormBlank(form)) continue; // no report typed — leave this booking untouched
        await submitReportForTarget(t, form!);
        if (t.status !== 'completed') {
          await axios.post(`${API_BASE}/admin/bookings/${t.id}/complete`);
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit report');
    } finally {
      setFinishing(false);
      setFinishConfirmOpen(false);
    }
  };

  const handleFinishClick = () => {
    const merged = flushCurrentForm();
    if (countFilled(merged) < targets.length) {
      setFinishConfirmOpen(true);
    } else {
      runFinish(merged);
    }
  };

  const stepsDone = {
    skills: formData.skills.length > 0,
    comment: formData.teacherComment.trim().length > 0,
    media: formData.images.length > 0 || !!formData.videoUrl,
  };
  const steps = [
    { key: 'skills', icon: <SkillsStepIcon fontSize="small" />, done: stepsDone.skills },
    { key: 'comment', icon: <CommentStepIcon fontSize="small" />, done: stepsDone.comment },
    { key: 'media', icon: <MediaStepIcon fontSize="small" />, done: stepsDone.media },
  ];

  return (
    <Box sx={{ pb: 10, maxWidth: isBulk ? 1100 : 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: isBulk ? 2 : 3 }}>
        <IconButton onClick={onClose} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <BackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {isBulk
              ? `บันทึกรายงานการเรียนรู้ (คนที่ ${bulkIndex + 1}/${targets.length})`
              : (currentIsEditMode ? 'แก้ไขรายงานการเรียนรู้' : 'บันทึกรายงานการเรียนรู้วันนี้')}
          </Typography>
          {isBulk && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              กรอกแล้ว {filledCount}/{targets.length} คน
            </Typography>
          )}
        </Box>
      </Box>

      {/* Avatar strip — jump directly to any person, or step with the arrows;
          a green check marks who already has content typed (or saved). */}
      {isBulk && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflowX: 'auto', pb: 1, mb: 3 }}>
          <IconButton onClick={goPrev} disabled={bulkIndex === 0} size="small" sx={{ bgcolor: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            <PrevIcon fontSize="small" />
          </IconButton>
          {targets.map((t, i) => {
            const isCurrent = i === bulkIndex;
            const filled = !isFormBlank(mergedForms[t.id]);
            return (
              <Box
                key={t.id}
                onClick={() => goTo(i)}
                sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, cursor: 'pointer', flexShrink: 0, px: 0.5, opacity: isCurrent ? 1 : 0.65 }}
              >
                <Box sx={{ position: 'relative' }}>
                  <Avatar sx={{
                    width: 38, height: 38, fontSize: 14, fontWeight: 800,
                    bgcolor: isCurrent ? '#7c3aed' : '#e2e8f0', color: isCurrent ? 'white' : '#64748b',
                    border: isCurrent ? '2px solid #7c3aed' : 'none',
                  }}>
                    {(t.child_nickname || t.child_name || '?').charAt(0)}
                  </Avatar>
                  {filled && (
                    <Box sx={{
                      position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%',
                      bgcolor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white',
                    }}>
                      <CheckIcon sx={{ fontSize: 10, color: 'white' }} />
                    </Box>
                  )}
                </Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, maxWidth: 52, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.child_nickname || t.child_name}
                </Typography>
              </Box>
            );
          })}
          <IconButton onClick={goNext} disabled={bulkIndex === targets.length - 1} size="small" sx={{ bgcolor: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            <NextIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Class header — cover image + details, single-booking mode only; in
          bulk mode the same info lives in the right-hand sidebar instead
          (see below), scoped to whichever person is currently shown. */}
      {!isBulk && (
        <Paper sx={{ borderRadius: 4, border: '1px solid #f1f3f9', overflow: 'hidden', mb: 4, display: 'flex' }}>
          <Box sx={{ width: 140, minHeight: 140, flexShrink: 0, bgcolor: '#f1f5f9' }}>
            {currentCourse?.thumbnail_url ? (
              <img src={getImageUrl(currentCourse.thumbnail_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MediaStepIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
              </Box>
            )}
          </Box>
          <Box sx={{ p: 2.5, flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3 }}>{currentTarget.course_name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              นักเรียน: {currentTarget.child_name}
            </Typography>
            {currentCourse?.short_description && (
              <Typography variant="body2" color="text.secondary" sx={{
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {currentCourse.short_description}
              </Typography>
            )}
            {(currentCourse?.age_min || currentCourse?.age_max) && (
              <Chip icon={<AgeIcon sx={{ fontSize: 14 }} />} label={`${currentCourse.age_min}-${currentCourse.age_max} ปี`} size="small" sx={{ mt: 1.5, fontWeight: 700 }} />
            )}
          </Box>
        </Paper>
      )}

      <Grid container spacing={3}>
        {/* Left step rail — visual progress, not interactive navigation (everything below is on one page) */}
        <Grid item xs={1} sx={{ display: { xs: 'none', sm: isBulk ? 'none' : 'block', md: isBulk ? 'block' : 'block' } }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', pt: 2 }}>
            {steps.map((step, i) => (
              <React.Fragment key={step.key}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: step.done ? '#7c3aed' : '#f1f5f9',
                  color: step.done ? 'white' : '#94a3b8',
                  transition: 'all 0.2s',
                }}>
                  {step.done ? <CheckIcon fontSize="small" /> : step.icon}
                </Box>
                {i < steps.length - 1 && (
                  <Box sx={{ width: 2, flex: 1, minHeight: 48, my: 0.5, bgcolor: step.done ? '#7c3aed' : '#e2e8f0', transition: 'all 0.2s' }} />
                )}
              </React.Fragment>
            ))}
          </Box>
        </Grid>

        <Grid item xs={12} sm={isBulk ? 12 : 11} md={isBulk ? 7 : 11}>
          {prefillLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
          ) : (
          <>
          <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #f1f3f9', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>วันนี้น้องได้เรียนรู้อะไรบ้าง</Typography>

            {skillsLoading ? (
              <Box><CircularProgress size={20} /></Box>
            ) : availableSkills.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                คลาสนี้ยังไม่ได้ตั้งค่าทักษะ/ตัวชี้วัดไว้ — ไปตั้งค่าได้ที่หน้าจัดการคลาสเรียน
              </Typography>
            ) : (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#7c3aed', mb: 1.5 }}>Skills — ทักษะที่ได้จากคลาสนี้</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
                  {availableSkills.filter(item => item.type === 'achievement').length === 0 ? (
                    <Typography variant="caption" color="text.disabled">คลาสนี้ยังไม่ได้ตั้งค่า Skills</Typography>
                  ) : availableSkills.filter(item => item.type === 'achievement').map(item => {
                    const isSelected = formData.skills.some(s => skillKey(s) === item.id);
                    const label = item.skill.th && item.skill.en
                      ? `${item.skill.th} (${item.skill.en})`
                      : (item.skill.th || item.skill.en);
                    return (
                      <Chip
                        key={item.id}
                        icon={item.icon}
                        label={label}
                        onClick={() => toggleSkill(item.skill, 'achievement')}
                        color={isSelected ? "primary" : "default"}
                        variant={isSelected ? "filled" : "outlined"}
                        sx={{ py: 2.5, px: 1, borderRadius: 3, fontWeight: 700 }}
                      />
                    );
                  })}
                </Box>

                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0284c7', mb: 1.5 }}>วันนี้น้องโดดเด่นเรื่องอะไรบ้าง</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {availableSkills.filter(item => item.type === 'indicator').length === 0 ? (
                    <Typography variant="caption" color="text.disabled">คลาสนี้ยังไม่ได้ตั้งค่าตัวชี้วัด</Typography>
                  ) : availableSkills.filter(item => item.type === 'indicator').map(item => {
                    const isSelected = formData.skills.some(s => skillKey(s) === item.id);
                    const label = item.skill.th && item.skill.en
                      ? `${item.skill.th} (${item.skill.en})`
                      : (item.skill.th || item.skill.en);
                    return (
                      <Chip
                        key={item.id}
                        icon={item.icon}
                        label={label}
                        onClick={() => toggleSkill(item.skill, 'indicator')}
                        color={isSelected ? "info" : "default"}
                        variant={isSelected ? "filled" : "outlined"}
                        sx={{ py: 2.5, px: 1, borderRadius: 3, fontWeight: 700 }}
                      />
                    );
                  })}
                </Box>
              </>
            )}
          </Paper>

          <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #f1f3f9', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>ความคิดเห็นจากคุณครู</Typography>
            <TextField
              multiline
              rows={6}
              fullWidth
              placeholder="เล่าบรรยากาศการเรียน และพัฒนาการของน้องในวันนี้..."
              value={formData.teacherComment}
              onChange={(e) => setFormData({ ...formData, teacherComment: e.target.value })}
            />
          </Paper>

          <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #f1f3f9', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>รูปภาพและวิดีโอประกอบ</Typography>

            <Grid container spacing={2}>
              {/* Video Placeholder */}
              <Grid item xs={4} sm={3}>
                <Box
                  onClick={() => videoInputRef.current?.click()}
                  sx={{
                    aspectRatio: '1/1',
                    borderRadius: 3,
                    border: '2px dashed #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    bgcolor: formData.videoUrl ? 'slate.900' : 'transparent',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  {videoUploading ? (
                    <CircularProgress size={20} />
                  ) : formData.videoUrl ? (
                    <>
                      <video src={getImageUrl(formData.videoUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setFormData({...formData, videoUrl: ''}); }}
                        sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.4)', color: 'white', p: 0.5 }}
                      >
                        <ClearIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <VideoIcon color="disabled" sx={{ fontSize: 20 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, mt: 0.5, fontSize: '10px' }}>วิดีโอ</Typography>
                    </>
                  )}
                </Box>
              </Grid>

              {/* Images */}
              {formData.images.map((img, idx) => (
                <Grid item xs={4} sm={3} key={idx}>
                  <Box sx={{ position: 'relative', pt: '100%', borderRadius: 3, overflow: 'hidden', border: '1px solid #eee' }}>
                    <img src={getImageUrl(img)} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    <IconButton
                      size="small"
                      onClick={() => {
                        const newImgs = [...formData.images];
                        newImgs.splice(idx, 1);
                        setFormData({...formData, images: newImgs});
                      }}
                      sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(255,255,255,0.8)', p: 0.25 }}
                    >
                      <ClearIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                </Grid>
              ))}
              {formData.images.length < 8 && (
                <Grid item xs={4} sm={3}>
                  <Box
                    onClick={() => !imageUploading && imageInputRef.current?.click()}
                    sx={{ pt: '100%', position: 'relative', borderRadius: 3, border: '2px dashed #e2e8f0', cursor: imageUploading ? 'default' : 'pointer' }}
                  >
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {imageUploading ? <CircularProgress size={18} /> : <AddIcon color="disabled" sx={{ fontSize: 18 }} />}
                    </Box>
                  </Box>
                </Grid>
              )}
            </Grid>

            <input type="file" hidden accept="image/*" multiple ref={imageInputRef} onChange={handleImageUpload} />
            <input type="file" hidden accept="video/*" ref={videoInputRef} onChange={handleVideoUpload} />
          </Paper>

          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>{error}</Alert>}

          {isBulk ? (
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                onClick={goPrev}
                disabled={bulkIndex === 0}
                startIcon={<PrevIcon />}
                sx={{ fontWeight: 800, borderRadius: 2.5 }}
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="outlined"
                onClick={handleSaveDraft}
                disabled={draftSaving}
                startIcon={draftSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                sx={{ fontWeight: 800, borderRadius: 2.5 }}
              >
                {savedIds.has(currentTarget.id) ? 'บันทึกฉบับร่างอีกครั้ง' : 'บันทึกฉบับร่าง'}
              </Button>
              <Button
                variant="outlined"
                onClick={goNext}
                disabled={bulkIndex === targets.length - 1}
                endIcon={<NextIcon />}
                sx={{ fontWeight: 800, borderRadius: 2.5 }}
              >
                ถัดไป
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={handleFinishClick}
                disabled={finishing}
                sx={{ fontWeight: 800, borderRadius: 2.5, ml: 'auto' }}
              >
                {finishing ? <CircularProgress size={18} color="inherit" /> : `เสร็จสิ้น (${filledCount}/${targets.length})`}
              </Button>
            </Stack>
          ) : (
            <Button
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              onClick={handleSubmit}
              startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
              sx={{ py: 2, fontWeight: 800 }}
            >
              {currentIsEditMode ? 'บันทึกการแก้ไข' : 'ส่งรายงานให้ผู้ปกครอง'}
            </Button>
          )}
          </>
          )}
        </Grid>

        {/* Right sidebar — who this report is for, and which class/round it
            was booked against. Only in bulk mode; single-booking mode keeps
            showing this in the class-header banner above instead. */}
        {isBulk && (
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #f1f3f9', mb: 3 }}>
              <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 1 }}>ข้อมูลเด็ก</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, mb: 2 }}>
                <Avatar sx={{ width: 48, height: 48, bgcolor: '#7c3aed', fontWeight: 800 }}>
                  {(currentTarget.child_nickname || currentTarget.child_name || '?').charAt(0)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800 }}>{currentTarget.child_nickname || currentTarget.child_name}</Typography>
                  {currentTarget.child_nickname && currentTarget.child_name && currentTarget.child_nickname !== currentTarget.child_name && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {currentTarget.child_name}{currentTarget.child_name_en ? ` (${currentTarget.child_name_en})` : ''}
                    </Typography>
                  )}
                </Box>
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>ผู้ปกครอง</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{currentTarget.parent_name || '-'}</Typography>
              {currentTarget.parent_phone && (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                  <PhoneIcon sx={{ fontSize: 13 }} color="action" />
                  <Typography variant="body2" color="text.secondary">{currentTarget.parent_phone}</Typography>
                </Stack>
              )}
            </Paper>

            <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #f1f3f9' }}>
              <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 1 }}>ข้อมูลการจอง</Typography>
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1.5 }}>
                <BookingIcon sx={{ fontSize: 18, color: '#7c3aed', mt: 0.25 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800 }}>{currentTarget.course_name}</Typography>
                  {currentTarget.scheduled_at && !isNaN(new Date(currentTarget.scheduled_at).getTime()) && (
                    <Typography variant="body2" color="text.secondary">
                      {new Date(currentTarget.scheduled_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}
                      {new Date(currentTarget.scheduled_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                    </Typography>
                  )}
                  {currentTarget.branch_name && (
                    <Typography variant="body2" color="text.secondary">{currentTarget.branch_name}</Typography>
                  )}
                </Box>
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Finish confirmation — only shown when at least one person still has
          a completely blank form; skips straight through otherwise. */}
      <Dialog open={finishConfirmOpen} onClose={() => !finishing && setFinishConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันจบการกรอกรายงาน?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            กรอกแล้ว {filledCount} คน — ยังไม่ได้กรอก {unfilledCount} คน
          </Alert>
          <Typography variant="body2" color="text.secondary">
            คนที่ยังไม่ได้กรอกจะไม่ถูกบันทึกรายงานและจะไม่ถูกทำเครื่องหมายว่าเรียนเสร็จ ต้องการดำเนินการต่อหรือไม่?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFinishConfirmOpen(false)} disabled={finishing}>ยกเลิก</Button>
          <Button variant="contained" color="warning" onClick={() => runFinish(mergedForms)} disabled={finishing}>
            {finishing ? <CircularProgress size={18} color="inherit" /> : 'ยืนยัน จบการกรอก'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecordMilestone;
