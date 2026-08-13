import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  Chip, Tooltip, CircularProgress, Alert, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Feed as FeedIcon, Article as NewsIcon, PermMedia as MediaIcon,
  CloudUpload as UploadIcon, Close as ClearIcon, Translate as TranslateIcon,
  ArrowBack as BackIcon, Save as SaveIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';
import NewsFeedEditor from '../components/NewsFeedEditor';
import ImageCropDialog from '../components/ImageCropDialog';
import { uploadEditorImage } from '../utils/imageUpload';

const API_BASE = `${API_URL}/api/v1/admin`;

interface NewsItem {
  id: number;
  type: 'news' | 'media';
  title: string;
  title_en: string | null;
  content: string | null;
  content_en: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  link_url: string | null;
  is_published: number;
  display_order: number;
  created_at: string;
}

const emptyForm = {
  type: 'news' as 'news' | 'media',
  title: '',
  titleEn: '',
  content: '',
  contentEn: '',
  imageUrl: '',
  // CSS object-position for the thumbnail, adjusted by dragging the preview.
  imagePosition: '50% 50%',
  imageUrls: [] as string[],
  videoUrl: '',
  linkUrl: '',
  isPublished: true,
  displayOrder: 0,
};

// '50% 30%' -> { x: 50, y: 30 }. Falls back to centre for an empty or
// unexpected value so an article saved before migration 0073 still loads.
const parseImagePosition = (raw?: string | null) => {
  const match = /^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(raw || '');
  return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : { x: 50, y: 50 };
};

const getImageUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

// Converts rich HTML content into paragraph-separated plain text before
// sending to the translate API, which only understands plain text.
const stripHtmlForTranslate = (html: string) => {
  const withBreaks = html.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  const div = document.createElement('div');
  div.innerHTML = withBreaks;
  return (div.textContent || '').split(/\n+/).map(l => l.trim()).filter(Boolean).join('\n');
};

const NewsFeedManagement = () => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'news' | 'media'>('all');

  const [isEditing, setIsEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NewsItem | null>(null);
  const [editTarget, setEditTarget] = useState<NewsItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingMulti, setUploadingMulti] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [translating, setTranslating] = useState<'title' | 'content' | null>(null);
  const [error, setError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const multiImageInputRef = useRef<HTMLInputElement>(null);

  // Thumbnail framing. Mirrors the drag-to-position control already used for
  // course-category images in CourseManagement.tsx: a ref carries the live
  // value during the drag (state alone would lag behind the pointer) and the
  // form field is only written on release, so one drag is one undo step.
  const [thumbCropFile, setThumbCropFile] = useState<File | null>(null);
  const [thumbPos, setThumbPos] = useState({ x: 50, y: 50 });
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);
  const thumbPosRef = useRef({ x: 50, y: 50 });
  const thumbDragRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);

  const commitThumbPos = () => {
    if (!isDraggingThumb) return;
    setIsDraggingThumb(false);
    thumbDragRef.current = null;
    const { x, y } = thumbPosRef.current;
    setForm(f => ({ ...f, imagePosition: `${Math.round(x)}% ${Math.round(y)}%` }));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/news-feed`);
      if (res.data.success) setItems(res.data.items);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredItems = filterType === 'all' ? items : items.filter(i => i.type === filterType);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    // Without this the previous article's framing stays on screen and gets
    // applied to whatever thumbnail is uploaded next.
    setThumbPos({ x: 50, y: 50 });
    thumbPosRef.current = { x: 50, y: 50 };
    setError('');
    setIsEditing(true);
  };
  const openEdit = (item: NewsItem) => {
    setEditTarget(item);
    setForm({
      type: item.type,
      title: item.title,
      titleEn: item.title_en || '',
      content: item.content || '',
      contentEn: item.content_en || '',
      imageUrl: item.image_url || '',
      imagePosition: (item as any).image_position || '50% 50%',
      imageUrls: item.image_urls || [],
      videoUrl: item.video_url || '',
      linkUrl: item.link_url || '',
      isPublished: !!item.is_published,
      displayOrder: item.display_order,
    });
    const pos = parseImagePosition((item as any).image_position);
    setThumbPos(pos);
    thumbPosRef.current = pos;
    setError('');
    setIsEditing(true);
  };

  // Thumbnails go through the crop dialog first (defaulting to the 4:5 frame
  // they will be displayed in) and are downscaled/compressed on the way out —
  // see utils/imageUpload.ts for why that matters for a phone-camera photo.
  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadEditorImage(file, 'news-feed');
      if (result) {
        setForm(f => ({ ...f, imageUrl: result.url }));
        // A freshly cropped thumbnail is framed by the crop, not by
        // object-position, so start it centred.
        setThumbPos({ x: 50, y: 50 });
        thumbPosRef.current = { x: 50, y: 50 };
      } else {
        setError('อัปโหลดรูปไม่สำเร็จ');
      }
    } catch {
      setError('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const uploadMultiImage = async (file: File) => {
    setUploadingMulti(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'news-feed');
      const res = await axios.post(`${API_BASE}/upload`, fd);
      if (res.data.success) setForm(f => ({ ...f, imageUrls: [...f.imageUrls, res.data.url] }));
      else setError('อัปโหลดรูปไม่สำเร็จ');
    } catch {
      setError('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploadingMulti(false);
    }
  };

  const uploadVideo = async (file: File) => {
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'news-feed');
      const res = await axios.post(`${API_BASE}/upload`, fd);
      if (res.data.success) setForm(f => ({ ...f, videoUrl: res.data.url }));
      else setError('อัปโหลดวิดีโอไม่สำเร็จ');
    } catch {
      setError('อัปโหลดวิดีโอไม่สำเร็จ');
    } finally {
      setUploadingVideo(false);
    }
  };

  const translate = async (field: 'title' | 'content') => {
    const sourceText = field === 'title' ? form.title : stripHtmlForTranslate(form.content);
    if (!sourceText.trim()) return;
    setTranslating(field);
    try {
      const res = await axios.post(`${API_BASE}/translate`, { text: sourceText, from: 'th', to: 'en' });
      if (res.data.success) {
        if (field === 'title') {
          setForm(f => ({ ...f, titleEn: res.data.translatedText }));
        } else {
          // Rough draft only — wraps each translated line back into a <p>
          // rather than trying to preserve original rich formatting, since
          // the translation API only works on plain text.
          const html = res.data.translatedText
            .split(/\n+/).map((line: string) => line.trim()).filter(Boolean)
            .map((line: string) => `<p>${line}</p>`).join('');
          setForm(f => ({ ...f, contentEn: html || res.data.translatedText }));
        }
      } else {
        setError(res.data.message || 'แปลภาษาไม่สำเร็จ');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'แปลภาษาไม่สำเร็จ');
    } finally {
      setTranslating(null);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!form.title.trim()) { setError('กรุณากรอกหัวข้อ'); return; }
    setSaving(true);
    try {
      // If only the multi-image slideshow was filled in, use its first
      // photo as the single-image thumbnail shown on cards/lists elsewhere.
      const payload = { ...form, imageUrl: form.imageUrl || form.imageUrls[0] || '' };
      if (editTarget) await axios.put(`${API_BASE}/news-feed/${editTarget.id}`, payload);
      else await axios.post(`${API_BASE}/news-feed`, payload);
      setIsEditing(false);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${API_BASE}/news-feed/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch { /* ignore */ }
  };

  const togglePublished = async (item: NewsItem) => {
    try {
      await axios.put(`${API_BASE}/news-feed/${item.id}`, {
        type: item.type,
        title: item.title,
        titleEn: item.title_en,
        content: item.content,
        contentEn: item.content_en,
        imageUrl: item.image_url,
        // Every field has to be echoed back here: this endpoint is a full
        // replace, so anything omitted is reset to its default. image_position
        // would silently snap back to centre on a publish/unpublish toggle.
        imagePosition: (item as any).image_position,
        videoUrl: item.video_url,
        linkUrl: item.link_url,
        isPublished: !item.is_published,
        displayOrder: item.display_order,
      });
      fetchData();
    } catch { /* ignore */ }
  };

  if (isEditing) {
    return (
      <Box sx={{ pb: 12 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <BackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight="bold">{editTarget ? 'แก้ไขเนื้อหา' : 'เพิ่มเนื้อหาใหม่'}</Typography>
            <Typography variant="body2" color="text.secondary">เนื้อหาที่แสดงในหน้า Explore ของแอป Consumer</Typography>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <ToggleButtonGroup
            value={form.type}
            exclusive
            onChange={(_, v) => v && setForm(f => ({ ...f, type: v }))}
            size="small"
          >
            <ToggleButton value="news"><NewsIcon sx={{ fontSize: 16, mr: 0.5 }} /> ข่าวสาร</ToggleButton>
            <ToggleButton value="media"><MediaIcon sx={{ fontSize: 16, mr: 0.5 }} /> สื่อความรู้</ToggleButton>
          </ToggleButtonGroup>
        </Paper>

        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>รูปภาพปก (Thumbnail)</Typography>
              <Box
                onClick={() => { if (!form.imageUrl) imageInputRef.current?.click(); }}
                sx={{
                  position: 'relative', aspectRatio: '4/5', maxWidth: 320, borderRadius: 2, overflow: 'hidden',
                  border: '2px dashed #e2e8f0', cursor: form.imageUrl ? 'default' : 'pointer', bgcolor: '#f9fafb',
                  '&:hover': !form.imageUrl ? { borderColor: 'primary.main', bgcolor: '#f5f0ff' } : {},
                }}
              >
                {form.imageUrl ? (
                  <>
                    {/* This frame is exactly the 4:5 object-fit:cover box the
                        consumer app renders the thumbnail into, so dragging
                        here shows the real crop rather than an approximation. */}
                    <img
                      src={getImageUrl(form.imageUrl)}
                      alt=""
                      draggable={false}
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        objectPosition: `${thumbPos.x}% ${thumbPos.y}%`,
                        cursor: isDraggingThumb ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        transition: isDraggingThumb ? 'none' : 'object-position 0.1s',
                      }}
                      onMouseDown={e => {
                        e.preventDefault();
                        setIsDraggingThumb(true);
                        thumbDragRef.current = { mouseX: e.clientX, mouseY: e.clientY, posX: thumbPosRef.current.x, posY: thumbPosRef.current.y };
                      }}
                      onMouseMove={e => {
                        if (!isDraggingThumb || !thumbDragRef.current) return;
                        const dx = e.clientX - thumbDragRef.current.mouseX;
                        const dy = e.clientY - thumbDragRef.current.mouseY;
                        // Inverted and damped: the image moves with the cursor
                        // (dragging left reveals more of the right side), and
                        // 0.18 keeps a small frame from swinging 0-100% in a
                        // few pixels of travel.
                        const newX = Math.max(0, Math.min(100, thumbDragRef.current.posX - dx * 0.18));
                        const newY = Math.max(0, Math.min(100, thumbDragRef.current.posY - dy * 0.18));
                        thumbPosRef.current = { x: newX, y: newY };
                        setThumbPos({ x: newX, y: newY });
                      }}
                      onMouseUp={commitThumbPos}
                      onMouseLeave={commitThumbPos}
                    />
                    <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.4)', py: 0.4, textAlign: 'center', pointerEvents: 'none' }}>
                      <Typography variant="caption" sx={{ color: 'white', fontWeight: 700, fontSize: 10 }}>
                        {isDraggingThumb ? 'กำลังปรับตำแหน่ง...' : 'ลากรูปเพื่อเลือกส่วนที่จะแสดงในกรอบ 4:5'}
                      </Typography>
                    </Box>
                    <IconButton
                      onClick={e => {
                        e.stopPropagation();
                        setForm(f => ({ ...f, imageUrl: '', imagePosition: '50% 50%' }));
                        setThumbPos({ x: 50, y: 50 });
                        thumbPosRef.current = { x: 50, y: 50 };
                      }}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.45)', color: 'white', p: 0.5 }}
                    >
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </>
                ) : (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {uploading ? <CircularProgress size={24} /> : (
                      <>
                        <UploadIcon color="disabled" sx={{ mb: 0.5 }} />
                        <Typography variant="caption" color="text.disabled">คลิกเพื่ออัปโหลดรูป</Typography>
                      </>
                    )}
                  </Box>
                )}
              </Box>
              <input type="file" hidden accept="image/*" ref={imageInputRef} onChange={e => {
                const file = e.target.files?.[0];
                if (file) setThumbCropFile(file);
                e.target.value = '';
              }} />
              <ImageCropDialog
                open={!!thumbCropFile}
                file={thumbCropFile}
                defaultAspect={4 / 5}
                title="ครอบตัดรูปปก (กรอบ 4:5 ตามที่แสดงในแอป)"
                onCancel={() => setThumbCropFile(null)}
                onCropped={file => { setThumbCropFile(null); void uploadImage(file); }}
              />
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                รูปภาพหลายรูป (สไลด์ต่อกันแบบติ๊กตอก — ใช้กับ "สื่อความรู้")
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                {form.imageUrls.map((url, i) => (
                  <Box key={i} sx={{ position: 'relative', width: 90, height: 90, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                    <img src={getImageUrl(url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <Box sx={{ position: 'absolute', bottom: 3, left: 3, bgcolor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, fontWeight: 800, px: 0.7, borderRadius: 0.75 }}>
                      {i + 1}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setForm(f => ({ ...f, imageUrls: f.imageUrls.filter((_, idx) => idx !== i) }))}
                      sx={{ position: 'absolute', top: 3, right: 3, bgcolor: 'rgba(0,0,0,0.45)', color: 'white', p: 0.4 }}
                    >
                      <ClearIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                ))}
                <Box
                  onClick={() => multiImageInputRef.current?.click()}
                  sx={{
                    width: 90, height: 90, borderRadius: 2, border: '2px dashed #e2e8f0', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9fafb',
                    '&:hover': { borderColor: 'primary.main', bgcolor: '#f5f0ff' },
                  }}
                >
                  {uploadingMulti ? <CircularProgress size={18} /> : <AddIcon color="disabled" />}
                </Box>
              </Box>
              <input type="file" hidden accept="image/*" ref={multiImageInputRef} onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadMultiImage(file);
                e.target.value = '';
              }} />
            </Box>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            <TextField label="หัวข้อ (ภาษาไทย) *" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} fullWidth />
            <Box display="flex" gap={1} alignItems="flex-start">
              <TextField label="หัวข้อ (English)" value={form.titleEn} onChange={(e) => setForm(f => ({ ...f, titleEn: e.target.value }))} fullWidth />
              <Tooltip title="แปลจากภาษาไทยอัตโนมัติ">
                <span>
                  <IconButton onClick={() => translate('title')} disabled={translating === 'title' || !form.title.trim()} sx={{ mt: 0.5 }}>
                    {translating === 'title' ? <CircularProgress size={18} /> : <TranslateIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>เนื้อหา (ภาษาไทย)</Typography>
              <NewsFeedEditor value={form.content} onChange={(html) => setForm(f => ({ ...f, content: html }))} placeholder="เขียนเนื้อหาข่าว..." />
            </Box>
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>เนื้อหา (English)</Typography>
                <Tooltip title="แปลจากภาษาไทยอัตโนมัติ (ฉบับร่าง)">
                  <span>
                    <Button
                      size="small"
                      startIcon={translating === 'content' ? <CircularProgress size={14} /> : <TranslateIcon sx={{ fontSize: 16 }} />}
                      onClick={() => translate('content')}
                      disabled={translating === 'content' || !form.content.trim()}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      แปลอัตโนมัติ
                    </Button>
                  </span>
                </Tooltip>
              </Box>
              <NewsFeedEditor value={form.contentEn} onChange={(html) => setForm(f => ({ ...f, contentEn: html }))} placeholder="Write the article content..." />
            </Box>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            {/* The article-level "ลิงก์ภายนอก" field used to be here. A link
                now belongs to an individual image inside the content (select an
                image in the editor and set its link), so one article can point
                several images at different destinations instead of the whole
                article sharing one URL.

                `form.linkUrl` is deliberately still loaded and still sent in
                the save payload: articles published before this change have a
                link_url in the database, and dropping it from the payload would
                erase their link the first time anyone edited them. The consumer
                app keeps rendering it for exactly those articles. */}

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                วิดีโอ (วางลิงก์ YouTube หรืออัปโหลดไฟล์วีดีโอ — เล่นฝังอยู่ในเนื้อหาเลย)
              </Typography>
              <Box display="flex" gap={1} alignItems="flex-start">
                <TextField
                  label="ลิงก์วิดีโอ (YouTube หรืออื่นๆ)"
                  value={form.videoUrl}
                  onChange={(e) => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                  fullWidth
                  placeholder="https://youtube.com/watch?v=..."
                />
                <Tooltip title="อัปโหลดไฟล์วีดีโอ">
                  <span>
                    <Button
                      variant="outlined"
                      component="label"
                      sx={{ borderRadius: 2, whiteSpace: 'nowrap', height: 56 }}
                      disabled={uploadingVideo}
                      startIcon={uploadingVideo ? <CircularProgress size={16} /> : <UploadIcon />}
                    >
                      อัปโหลด
                      <input
                        type="file"
                        hidden
                        accept="video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadVideo(file);
                          e.target.value = '';
                        }}
                      />
                    </Button>
                  </span>
                </Tooltip>
              </Box>
              {form.videoUrl && (
                <Button size="small" onClick={() => setForm(f => ({ ...f, videoUrl: '' }))} sx={{ mt: 0.5, textTransform: 'none', color: 'text.disabled' }}>
                  ลบวิดีโอ
                </Button>
              )}
            </Box>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            <TextField
              label="ลำดับการแสดงผล (น้อยไปมาก)"
              type="number"
              value={form.displayOrder}
              onChange={(e) => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))}
              sx={{ maxWidth: 220 }}
            />

            <FormControlLabel
              control={<Switch checked={form.isPublished} onChange={(e) => setForm(f => ({ ...f, isPublished: e.target.checked }))} color="success" />}
              label={<Typography fontWeight="bold">{form.isPublished ? 'เผยแพร่' : 'ซ่อนไว้ก่อน'}</Typography>}
            />
          </Box>
        </Paper>

        <Box sx={{ position: 'fixed', bottom: 32, right: 32, display: 'flex', gap: 2, zIndex: 1000 }}>
          <Button
            variant="contained" size="large"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={saving}
            sx={{ borderRadius: 10, px: 4 }}
          >
            {saving ? 'บันทึก...' : (editTarget ? 'บันทึก' : 'สร้าง')}
          </Button>
          <Button variant="outlined" size="large" onClick={() => setIsEditing(false)} sx={{ borderRadius: 10, bgcolor: 'white' }}>
            ยกเลิก
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <FeedIcon sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">จัดการฟีดข่าวสาร / สื่อความรู้</Typography>
            <Typography variant="body2" color="text.secondary">เนื้อหาที่แสดงในหน้า Explore ของแอป Consumer</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 'bold' }}>
          เพิ่มเนื้อหา
        </Button>
      </Box>

      <ToggleButtonGroup
        value={filterType}
        exclusive
        onChange={(_, v) => v && setFilterType(v)}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all">ทั้งหมด</ToggleButton>
        <ToggleButton value="news"><NewsIcon sx={{ fontSize: 16, mr: 0.5 }} /> ข่าวสาร</ToggleButton>
        <ToggleButton value="media"><MediaIcon sx={{ fontSize: 16, mr: 0.5 }} /> สื่อความรู้</ToggleButton>
      </ToggleButtonGroup>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width={64} sx={{ fontWeight: 'bold' }}>รูป</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>หัวข้อ</TableCell>
              <TableCell width={100} sx={{ fontWeight: 'bold' }}>ประเภท</TableCell>
              <TableCell width={140} sx={{ fontWeight: 'bold' }}>วันที่สร้าง</TableCell>
              <TableCell width={110} sx={{ fontWeight: 'bold' }}>สถานะ</TableCell>
              <TableCell width={90} align="center" sx={{ fontWeight: 'bold' }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}><CircularProgress size={32} /></TableCell></TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่พบเนื้อหา</TableCell></TableRow>
            ) : filteredItems.map((item) => (
              <TableRow key={item.id} hover sx={{ opacity: item.is_published ? 1 : 0.55 }}>
                <TableCell>
                  <Box sx={{ width: 44, height: 44, borderRadius: 1.5, overflow: 'hidden', bgcolor: '#f1f5f9', border: '1px solid #eee' }}>
                    {item.image_url && (
                      <img src={getImageUrl(item.image_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">{item.title}</Typography>
                  {item.title_en && <Typography variant="caption" color="text.secondary">{item.title_en}</Typography>}
                </TableCell>
                <TableCell>
                  <Chip
                    label={item.type === 'news' ? 'ข่าวสาร' : 'สื่อความรู้'}
                    size="small"
                    color={item.type === 'news' ? 'info' : 'secondary'}
                    sx={{ fontWeight: 'bold' }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(item.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={item.is_published ? 'เผยแพร่' : 'ซ่อนอยู่'}
                    size="small"
                    color={item.is_published ? 'success' : 'default'}
                    onClick={() => togglePublished(item)}
                    sx={{ fontWeight: 'bold', cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="แก้ไข"><IconButton size="small" onClick={() => openEdit(item)} color="primary"><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="ลบ"><IconButton size="small" onClick={() => setDeleteTarget(item)} color="error"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>คุณต้องการลบเนื้อหา <b>{deleteTarget?.title}</b> ใช่หรือไม่?</Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>การลบจะไม่สามารถกู้คืนกลับมาได้</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} variant="outlined" sx={{ borderRadius: 2 }}>ยกเลิก</Button>
          <Button onClick={handleDelete} variant="contained" color="error" startIcon={<DeleteIcon />} sx={{ borderRadius: 2, fontWeight: 'bold' }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NewsFeedManagement;
