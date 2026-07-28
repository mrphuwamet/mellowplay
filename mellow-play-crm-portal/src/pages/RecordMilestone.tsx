import { API_URL } from '../config';
import React, { useEffect, useState, useRef } from 'react';
import {
  Typography, Box, CircularProgress,
  Grid, Button, Chip, Alert,
  TextField, IconButton, Paper,
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
} from '@mui/icons-material';
import axios from 'axios';
import { renderSkillIcon, type SkillItem } from '../utils/skillsLibrary';

const API_BASE = `${API_URL}/api/v1`;

interface RecordMilestoneProps {
  // `booking` (single, still used by POSBookingView/CourseManagement) or
  // `bookings` (BookingManagement's List view — lets one report be filed
  // once across every selected child, e.g. a whole group that did the same
  // activity) — exactly one of the two is provided by any given caller.
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
  const [availableSkills, setAvailableSkills] = useState<{ id: string; skill: BilingualSkill; icon: React.ReactElement; type: 'achievement' | 'indicator' }[]>([]);
  const [course, setCourse] = useState<any>(null);

  // Bulk mode only ever prefills a blank form (see isEditMode below) — the
  // whole point is one shared report applied to every selected child, not
  // reopening N different existing reports at once.
  const targets: any[] = bookings && bookings.length > 0 ? bookings : [booking];
  const isBulk = targets.length > 1;
  const primary = targets[0];

  const [formData, setFormData] = useState({
    skills: [] as BilingualSkill[],
    teacherComment: '',
    images: [] as string[],
    videoUrl: ''
  });
  const [imageUploading, setImageUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);

  // A report already exists for this booking (opened via "แก้ไขรายงาน" on a
  // completed booking) — prefill instead of starting from a blank form, and
  // update it in place on submit rather than filing a duplicate.
  const isEditMode = !isBulk && primary.status === 'completed';

  useEffect(() => {
    if (!isEditMode) return;
    axios.get(`${API_BASE}/admin/journey/progress-by-booking/${primary.id}`)
      .then(res => {
        const progress = res.data.success ? res.data.progress : null;
        if (!progress) return;
        let skills: BilingualSkill[] = [];
        try {
          skills = typeof progress.skills_learned === 'string'
            ? JSON.parse(progress.skills_learned)
            : (progress.skills_learned || []);
        } catch { skills = []; }
        const media: { url: string; type: string }[] = progress.media || [];
        setFormData({
          skills,
          teacherComment: progress.teacher_comment || '',
          images: media.filter(m => m.type === 'image').map(m => m.url),
          videoUrl: media.find(m => m.type === 'video')?.url || '',
        });
      })
      .catch(err => console.error('Failed to load existing report', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.id, isEditMode]);

  // Skills selectable in a report must come from THIS course's own setup
  // (achievement_skills_json / metrics_json, picked from the Skills Library
  // when the course was configured) — different courses teach different
  // skills, so a fixed global list would be wrong here.
  useEffect(() => {
    const fetchCourseSkills = async () => {
      setSkillsLoading(true);
      try {
        const [coursesRes, libraryRes] = await Promise.all([
          axios.get(`${API_BASE}/admin/courses`),
          axios.get(`${API_BASE}/admin/skills-library`),
        ]);

        if (coursesRes.data.success) {
          const course = coursesRes.data.courses.find((c: any) => c.id === primary.course_id);
          setCourse(course || null);
          // Both are arrays of { th, en } pairs — set via SkillTagInput in
          // CourseManagement, NOT plain strings.
          let achievementSkills: BilingualSkill[] = [];
          let indicatorSkills: BilingualSkill[] = [];
          try { achievementSkills = course?.achievement_skills_json ? JSON.parse(course.achievement_skills_json) : []; } catch {}
          try { indicatorSkills = course?.metrics_json ? JSON.parse(course.metrics_json) : []; } catch {}

          const library: SkillItem[] = libraryRes.data.success ? libraryRes.data.skills : [];
          const tagged = [
            ...achievementSkills.map(skill => ({ skill, type: 'achievement' as const })),
            ...indicatorSkills.map(skill => ({ skill, type: 'indicator' as const })),
          ];
          setAvailableSkills(tagged.map(({ skill, type }) => {
            const found = library.find(s => s.name === skill.th);
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
          }));
        }
      } catch (err) {
        console.error('Failed to load course skills', err);
      } finally {
        setSkillsLoading(false);
      }
    };
    fetchCourseSkills();
  }, [primary.course_id]);

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

  // Same loop for a single booking or a bulk one — one iteration for the
  // ordinary case, so nothing about the single-booking flow actually changes.
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      for (const b of targets) {
        await axios.post(`${API_BASE}/journey/record`, {
          childId: b.child_id,
          bookingId: b.id,
          skillsLearned: formData.skills,
          teacherComment: formData.teacherComment,
          media: [
            ...formData.images.map(url => ({ url, type: 'image' })),
            ...(formData.videoUrl ? [{ url: formData.videoUrl, type: 'video' }] : [])
          ]
        });
        // Each booking only becomes "completed" (stock deducted, stamps
        // awarded) once its report is first filed — see BookingManagement's
        // handleComplete. Skip any booking already completed, or it would
        // deduct stock / award stamps a second time.
        if (b.status !== 'completed') {
          await axios.post(`${API_BASE}/admin/bookings/${b.id}/complete`);
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit report');
    } finally {
      setLoading(false);
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
    <Box sx={{ pb: 10, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={onClose} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <BackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {isEditMode ? 'แก้ไขรายงานการเรียนรู้' : isBulk ? `บันทึกรายงานการเรียนรู้วันนี้ (${targets.length} คน)` : 'บันทึกรายงานการเรียนรู้วันนี้'}
        </Typography>
      </Box>

      {/* Class header — cover image + details, for context while filling the report */}
      <Paper sx={{ borderRadius: 4, border: '1px solid #f1f3f9', overflow: 'hidden', mb: 4, display: 'flex' }}>
        <Box sx={{ width: 140, minHeight: 140, flexShrink: 0, bgcolor: '#f1f5f9' }}>
          {course?.thumbnail_url ? (
            <img src={getImageUrl(course.thumbnail_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MediaStepIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
            </Box>
          )}
        </Box>
        <Box sx={{ p: 2.5, flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3 }}>{primary.course_name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {isBulk
              ? `กำลังกรอกรายงานให้ ${targets.length} คน: ${targets.map(b => b.child_nickname || b.child_name).join(', ')}`
              : `นักเรียน: ${primary.child_name}`}
          </Typography>
          {course?.short_description && (
            <Typography variant="body2" color="text.secondary" sx={{
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {course.short_description}
            </Typography>
          )}
          {(course?.age_min || course?.age_max) && (
            <Chip icon={<AgeIcon sx={{ fontSize: 14 }} />} label={`${course.age_min}-${course.age_max} ปี`} size="small" sx={{ mt: 1.5, fontWeight: 700 }} />
          )}
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Left step rail — visual progress, not interactive navigation (everything below is on one page) */}
        <Grid item xs={1} sx={{ display: { xs: 'none', sm: 'block' } }}>
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

        <Grid item xs={12} sm={11}>
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

          <Button
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            onClick={handleSubmit}
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
            sx={{ py: 2, fontWeight: 800 }}
          >
            {isEditMode ? 'บันทึกการแก้ไข' : 'ส่งรายงานให้ผู้ปกครอง'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default RecordMilestone;
