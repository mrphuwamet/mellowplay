import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Box, CircularProgress, Grid, Button, Chip,
  TextField, MenuItem, Select, FormControl, InputLabel,
  IconButton, Paper, Stack, Alert, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tab, Snackbar, Menu,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as BackIcon,
  Save as SaveIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  DriveFileMoveOutlined as MovePageIcon,
  Title as HeadingIcon,
  Science as TestRunIcon,
  Article as ParagraphIcon,
  ShortText as TextFieldIcon,
  Notes as TextareaIcon,
  Numbers as NumberIcon,
  Event as DateIcon,
  ArrowDropDownCircle as SelectIcon,
  RadioButtonChecked as RadioIcon,
  CheckBox as CheckboxIcon,
  Badge as IdentityIcon,
  Link as LinkIcon,
  ListAlt as ResponsesIcon,
  Image as ImageFieldIcon,
  CloudUpload as UploadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

import SessionManagement from './SessionManagement';
import RichTextEditor from '../components/RichTextEditor';

const API_BASE = `${API_URL}/api/v1/admin`;
const CONSUMER_APP_URL = (import.meta.env.VITE_CONSUMER_APP_URL as string) || 'https://mellowplay.co';

type FieldType = 'heading' | 'paragraph' | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'identity' | 'image';

interface ScoredOption {
  label: string;
  points: number;
  /**
   * Optional colour for this choice. Purely presentational — scoring and
   * duplicate checks still key on the label text, so recolouring an option never
   * touches an answer that was already given.
   */
  color?: string;
}

// A short fixed set rather than a free colour picker: these are what the rest
// of the app already uses for team and status chips, they read on white, and a
// list of eight keeps a form from turning into a paint box.
const OPTION_COLORS = [
  { label: 'ไม่ระบุสี', value: '' },
  { label: 'แดง', value: '#d03b3b' },
  { label: 'ส้ม', value: '#e07a1f' },
  { label: 'เหลือง', value: '#b58900' },
  { label: 'เขียว', value: '#0ca30c' },
  { label: 'ฟ้า', value: '#3987e5' },
  { label: 'น้ำเงิน', value: '#1c5cab' },
  { label: 'ม่วง', value: '#7452d6' },
  { label: 'ชมพู', value: '#d6367f' },
];

interface FieldDraft {
  fieldKey: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: ScoredOption[]; // select/radio/checkbox
  scored?: boolean;         // select/radio/checkbox — per-field toggle for whether points count at all
  imageUrl?: string;        // image
  /**
   * Formatted version of the label (bold, colour), authored in the rich editor.
   * The plain label stays as-is and remains what exports, the responses table
   * and the summary read — a chart axis full of <strong> tags helps nobody.
   */
  labelHtml?: string;
  /**
   * identity only — whether the respondent's phone number is compulsory.
   * A feedback form does not need one; a form whose answers someone will be
   * called back about does, and asking politely gets it left blank.
   */
  phoneRequired?: boolean;
  /**
   * radio only — lay the options out as one horizontal rung row instead of a
   * stacked list. Stored as config, not as its own field type, so scoring, CSV
   * export, the answer-key stripping and the response charts all keep working
   * on it unchanged: a scale IS a single-choice question, drawn differently.
   */
  display?: 'scale';
  /** Optional captions for the two ends of the row ("น้อยที่สุด" … "มากที่สุด"). */
  scaleLowLabel?: string;
  scaleHighLabel?: string;
}

// Mirrors fitsScaleRow() in
// mellow-play-consumer-app/src/components/SurveyFillForm.tsx. Change both or
// the hint below starts lying about what the respondent will actually see.
const SCALE_MAX_OPTIONS = 7;
const SCALE_MAX_LABEL = 10;
const fitsScaleRow = (opts: { label: string }[] | undefined): boolean =>
  !!opts && opts.length >= 2 && opts.length <= SCALE_MAX_OPTIONS &&
  opts.every(o => (o.label || '').trim().length <= SCALE_MAX_LABEL);

// Filling five options and five point values by hand, once per question, is
// the reason a 10-item evaluation form never got built. These write the whole
// ladder in one click. Highest first, matching the paper forms these are
// transcribed from, where column (5) sits on the left.
const SCALE_PRESETS: { name: string; options: ScoredOption[]; low?: string; high?: string }[] = [
  {
    name: 'ตัวเลข 5–1',
    options: [5, 4, 3, 2, 1].map(n => ({ label: String(n), points: n })),
    low: 'เห็นด้วยมากที่สุด', high: 'เห็นด้วยน้อยที่สุด',
  },
  {
    name: 'ระดับความเห็น',
    options: [['มากที่สุด', 5], ['มาก', 4], ['ปานกลาง', 3], ['น้อย', 2], ['น้อยที่สุด', 1]]
      .map(([label, points]) => ({ label: label as string, points: points as number })),
  },
  {
    name: 'ระดับความพึงพอใจ',
    options: [['พอใจมากที่สุด', 5], ['พอใจมาก', 4], ['ปานกลาง', 3], ['ไม่พอใจ', 2], ['ไม่พอใจเลย', 1]]
      .map(([label, points]) => ({ label: label as string, points: points as number })),
  },
]

interface ScoreRange {
  min: number;
  max: number;
  resultText: string;
  /** Formatted copy of resultText — see FieldDraft.labelHtml for the pattern. */
  resultTextHtml?: string;
  imageUrl?: string;
}

const FIELD_TYPE_META: Record<FieldType, { label: string; icon: React.ReactNode }> = {
  heading: { label: 'หัวข้อ/คำอธิบาย', icon: <HeadingIcon fontSize="small" /> },
  // A passage to READ, not a question: a comprehension text, a scenario, an
  // instruction sheet. 'heading' renders bold and on one line, which is why
  // there was nowhere to put more than a title.
  paragraph: { label: 'เนื้อหาให้อ่าน (หลายบรรทัด)', icon: <ParagraphIcon fontSize="small" /> },
  text: { label: 'ข้อความสั้น', icon: <TextFieldIcon fontSize="small" /> },
  textarea: { label: 'ข้อความยาว', icon: <TextareaIcon fontSize="small" /> },
  number: { label: 'ตัวเลข', icon: <NumberIcon fontSize="small" /> },
  date: { label: 'วันที่', icon: <DateIcon fontSize="small" /> },
  select: { label: 'ตัวเลือก (Dropdown)', icon: <SelectIcon fontSize="small" /> },
  radio: { label: 'ตัวเลือก (Radio)', icon: <RadioIcon fontSize="small" /> },
  checkbox: { label: 'ช่องติ๊ก (หลายตัวเลือก)', icon: <CheckboxIcon fontSize="small" /> },
  identity: { label: 'ผู้ตอบแบบสอบถาม (ใครเป็นคนตอบ)', icon: <IdentityIcon fontSize="small" /> },
  image: { label: 'รูปภาพ', icon: <ImageFieldIcon fontSize="small" /> },
};

// Reused by both the field editor's own image field and the score-range
// result images below — same /admin/upload endpoint the rich-text editors
// already use for inline images.
const uploadImage = async (file: File): Promise<string> => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'surveys');
  const res = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
  if (!res.data.success) throw new Error(res.data.message || 'Upload failed');
  return res.data.url;
};

const ImageUploadField = ({ label, url, onChange }: { label: string; url?: string; onChange: (url: string | undefined) => void }) => {
  const [uploading, setUploading] = useState(false);
  const inputId = `img-upload-${Math.random().toString(36).slice(2)}`;
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { onChange(await uploadImage(file)); } catch { /* leave the previous image in place on failure */ }
    finally { setUploading(false); }
  };
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      {url && (
        <Box sx={{ position: 'relative' }}>
          <Box component="img" src={url} alt="" sx={{ width: 64, height: 64, borderRadius: 1.5, objectFit: 'cover', border: '1px solid #eee' }} />
          <IconButton size="small" onClick={() => onChange(undefined)}
            sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'white', boxShadow: 1, p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      )}
      <label htmlFor={inputId}>
        <input id={inputId} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
        <Button component="span" size="small" variant="outlined" startIcon={uploading ? <CircularProgress size={14} /> : <UploadIcon fontSize="small" />} disabled={uploading}>
          {url ? `เปลี่ยน${label}` : `อัปโหลด${label}`}
        </Button>
      </label>
    </Stack>
  );
};

// 'pretest'/'posttest' were merged into one 'test' kind: a before/after
// comparison is the SAME form answered twice (its rounds are counted per
// respondent), so offering two types only led staff into building two forms
// whose scores can't be compared. The old values stay mapped here for any row
// that predates the migration.
const FORM_KIND_META: Record<string, { label: string; color: 'default' | 'info' | 'warning' }> = {
  survey: { label: 'แบบสอบถาม', color: 'default' },
  test: { label: 'แบบทดสอบ', color: 'info' },
  pretest: { label: 'แบบทดสอบ', color: 'info' },
  posttest: { label: 'แบบทดสอบ', color: 'info' },
};

const normalizeFormKind = (raw?: string) =>
  raw === 'pretest' || raw === 'posttest' ? 'test' : (raw || 'survey');

// The plain-text twin of a formatted label, kept so a CSV export, the
// responses table and the summary charts stay readable text.
const stripHtml = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

const newFieldKey = () => (crypto as any).randomUUID ? crypto.randomUUID() : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const isChoiceType = (type: FieldType) => type === 'select' || type === 'radio' || type === 'checkbox';

const emptyField = (type: FieldType): FieldDraft => ({
  fieldKey: newFieldKey(),
  type,
  label: FIELD_TYPE_META[type].label,
  required: false,
  options: isChoiceType(type) ? [{ label: 'ตัวเลือก 1', points: 0 }] : undefined,
  scored: false,
});

const SectionLabel = ({ title }: { title: string }) => (
  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>{title}</Typography>
);

const SurveyManagement = () => {
  const navigate = useNavigate();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formKind, setFormKind] = useState('survey');
  const [slug, setSlug] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [topTab, setTopTab] = useState(0);
  const [sessionEditing, setSessionEditing] = useState(false);
  const [shuffleMode, setShuffleMode] = useState('none');
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [pages, setPages] = useState<FieldDraft[][]>([[]]);
  // Aligned to `pages` by position, so a pin travels with its page when
  // another is added or deleted rather than sliding onto its neighbour.
  const [pinnedPages, setPinnedPages] = useState<boolean[]>([]);
  const [activePage, setActivePage] = useState(0);
  // Which field's "move to page" menu is open, and where to anchor it.
  const [movePageMenu, setMovePageMenu] = useState<{ anchor: HTMLElement; fieldIdx: number } | null>(null);
  const [scoreRanges, setScoreRanges] = useState<ScoreRange[]>([]);

  const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string } | null>(null);

  const fetchForms = () => {
    setLoading(true);
    axios.get(`${API_BASE}/survey-forms`)
      .then(res => { if (res.data.success) setForms(res.data.forms); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchForms(); }, []);

  const resetFormState = () => {
    setName(''); setDescription(''); setFormKind('survey'); setSlug(''); setIsActive(true);
    setShuffleMode('none'); setShuffleOptions(false);
    setPages([[]]); setPinnedPages([]); setActivePage(0); setScoreRanges([]); setSaveError(null);
  };

  const startCreate = () => {
    resetFormState();
    setEditId(null);
    setIsEditing(true);
  };

  const startEdit = async (id: number) => {
    resetFormState();
    setEditId(id);
    setIsEditing(true);
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/survey-forms/${id}`);
      if (res.data.success) {
        const form = res.data.form;
        setName(form.name || '');
        setDescription(form.description || '');
        setFormKind(normalizeFormKind(form.form_kind));
        setSlug(form.slug || '');
        setIsActive(!!form.is_active);
        setShuffleMode(form.shuffle_mode || (form.shuffle_questions ? 'within_section' : 'none'));
        setShuffleOptions(!!form.shuffle_options);
        try {
          const parsedPins = form.shuffle_pinned_pages ? JSON.parse(form.shuffle_pinned_pages) : [];
          setPinnedPages(Array.isArray(parsedPins) ? parsedPins.map(Boolean) : []);
        } catch { setPinnedPages([]); }
        try { setScoreRanges(form.score_ranges_json ? JSON.parse(form.score_ranges_json) : []); } catch { setScoreRanges([]); }

        const grouped: FieldDraft[][] = [];
        (form.fields || []).forEach((f: any) => {
          const pIdx = f.page_index ?? 0;
          if (!grouped[pIdx]) grouped[pIdx] = [];
          let config: any = {};
          try { config = f.config_json ? JSON.parse(f.config_json) : {}; } catch { /* malformed config shouldn't block loading the rest of the field */ }
          grouped[pIdx][f.field_index] = {
            fieldKey: f.field_key,
            type: f.type,
            label: f.label,
            required: !!f.required,
            options: f.options_json ? JSON.parse(f.options_json) : undefined,
            scored: !!config.scored,
            imageUrl: config.imageUrl,
            labelHtml: config.labelHtml,
            phoneRequired: !!config.phoneRequired,
            display: config.display === 'scale' ? 'scale' : undefined,
            scaleLowLabel: config.scaleLowLabel,
            scaleHighLabel: config.scaleHighLabel,
          };
        });
        const compacted = grouped.map(page => page.filter(Boolean));
        setPages(compacted.length > 0 ? compacted : [[]]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setSaveError('กรุณากรอกชื่อฟอร์ม'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const fields = pages.flatMap((page, pageIndex) => page.map((f, fieldIndex) => ({
        fieldKey: f.fieldKey,
        pageIndex,
        fieldIndex,
        type: f.type,
        label: f.label,
        required: f.required,
        // Only for the types that actually have options. A field switched
        // from Dropdown to ข้อความสั้น keeps its old options in the draft so
        // switching back restores them, but they must not be saved onto a
        // type that has no use for them.
        optionsJson: isChoiceType(f.type) && f.options ? JSON.stringify(f.options) : undefined,
        // config_json is rebuilt from scratch on every save, so anything that
        // lives in it has to be written here or it is silently dropped.
        configJson: JSON.stringify({
          ...(isChoiceType(f.type) ? { scored: !!f.scored } : {}),
          ...(f.type === 'image' ? { imageUrl: f.imageUrl } : {}),
          ...(f.type === 'identity' ? { phoneRequired: !!f.phoneRequired } : {}),
          ...(f.type === 'radio' && f.display === 'scale' ? {
            display: 'scale',
            scaleLowLabel: f.scaleLowLabel?.trim() || undefined,
            scaleHighLabel: f.scaleHighLabel?.trim() || undefined,
          } : {}),
          ...(f.labelHtml && stripHtml(f.labelHtml).trim() ? { labelHtml: f.labelHtml } : {}),
        }),
      })));
      const payload = {
        name, description, formKind, slug: slug.trim() || undefined, isActive,
        shuffleMode, shuffleOptions,
        shufflePinnedPages: pages.map((_, i) => !!pinnedPages[i]),
        scoreRanges, fields,
      };
      if (editId) {
        await axios.put(`${API_BASE}/survey-forms/${editId}`, payload);
      } else {
        await axios.post(`${API_BASE}/survey-forms`, payload);
      }
      setIsEditing(false);
      fetchForms();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    await axios.delete(`${API_BASE}/survey-forms/${itemToDelete.id}`);
    setItemToDelete(null);
    fetchForms();
  };

  const copyLink = (form: any) => {
    const url = `${CONSUMER_APP_URL}/survey/${form.slug || form.id}`;
    navigator.clipboard.writeText(url).then(() => setLinkCopied(true)).catch(() => {});
  };

  // Opens the real form, the way a respondent sees it — shuffling, scoring,
  // result screen and all — with ?test=1 so the answer is stored apart from
  // the real ones. A preview rendered inside the CRM would be a second
  // implementation of the form, and the bugs worth catching are exactly the
  // ones a reimplementation would not reproduce.
  const openTestRun = (form: any) => {
    window.open(`${CONSUMER_APP_URL}/survey/${form.slug || form.id}?test=1`, '_blank', 'noopener,noreferrer');
  };

  // ── Page/field editing helpers ──────────────────────────────────────────
  const addPage = () => {
    setPages([...pages, []]);
    setPinnedPages([...pinnedPages, false]);
    setActivePage(pages.length);
  };
  const togglePagePinned = (pageIdx: number) => {
    const next = pages.map((_, i) => !!pinnedPages[i]);
    next[pageIdx] = !next[pageIdx];
    setPinnedPages(next);
  };
  const removePage = (pageIdx: number) => {
    const next = pages.filter((_, i) => i !== pageIdx);
    setPages(next.length > 0 ? next : [[]]);
    setPinnedPages(pages.map((_, i) => !!pinnedPages[i]).filter((_, i) => i !== pageIdx));
    setActivePage(Math.max(0, Math.min(activePage, next.length - 1)));
  };
  const addField = (type: FieldType) => {
    const next = pages.map((page, i) => i === activePage ? [...page, emptyField(type)] : page);
    setPages(next);
  };
  /**
   * Change an existing field's type in place.
   *
   * Dropdown, Radio and ช่องติ๊ก differ only in how the same list of options is
   * presented, so picking the wrong one meant deleting the field and retyping
   * every option. The options carry across untouched — including their points —
   * and are kept even when switching to a type that ignores them, so a wrong
   * turn costs nothing.
   *
   * The label follows only while it is still the untouched default for the old
   * type; anything the author actually wrote is left alone.
   */
  const changeFieldType = (fieldIdx: number, nextType: FieldType) => {
    const field = pages[activePage]?.[fieldIdx];
    if (!field || field.type === nextType) return;
    const patch: Partial<FieldDraft> = { type: nextType };
    if (field.label === FIELD_TYPE_META[field.type].label) patch.label = FIELD_TYPE_META[nextType].label;
    if (isChoiceType(nextType) && (!field.options || field.options.length === 0)) {
      patch.options = [{ label: 'ตัวเลือก 1', points: 0 }];
    }
    updateField(fieldIdx, patch);
  };

  const updateField = (fieldIdx: number, patch: Partial<FieldDraft>) => {
    const next = pages.map((page, i) => i === activePage
      ? page.map((f, j) => j === fieldIdx ? { ...f, ...patch } : f)
      : page);
    setPages(next);
  };
  const removeField = (fieldIdx: number) => {
    const next = pages.map((page, i) => i === activePage ? page.filter((_, j) => j !== fieldIdx) : page);
    setPages(next);
  };
  /**
   * Move a field to the end of another page.
   *
   * Splitting a form into one question per page used to mean deleting a field
   * and building it again on the right page, options and points included —
   * which is also how a question quietly loses its scoring.
   *
   * The editor follows the field rather than staying put: the field is gone
   * from the page still on screen, and watching it vanish is a worse answer to
   * "did that work?" than seeing where it landed.
   */
  const moveFieldToPage = (fieldIdx: number, targetPage: number) => {
    if (targetPage === activePage || targetPage < 0 || targetPage >= pages.length) return;
    const field = pages[activePage]?.[fieldIdx];
    if (!field) return;
    setPages(pages.map((page, i) => {
      if (i === activePage) return page.filter((_, j) => j !== fieldIdx);
      if (i === targetPage) return [...page, field];
      return page;
    }));
    setActivePage(targetPage);
    setMovePageMenu(null);
  };

  const moveField = (fieldIdx: number, dir: -1 | 1) => {
    const page = pages[activePage];
    const targetIdx = fieldIdx + dir;
    if (targetIdx < 0 || targetIdx >= page.length) return;
    const reordered = [...page];
    [reordered[fieldIdx], reordered[targetIdx]] = [reordered[targetIdx], reordered[fieldIdx]];
    const next = pages.map((p, i) => i === activePage ? reordered : p);
    setPages(next);
  };

  if (loading && !isEditing) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  // ─── Edit/Create Form ────────────────────────────────────────────────────
  if (isEditing) {
    const currentPageFields = pages[activePage] || [];
    const hasAnyScored = pages.some(page => page.some(f => isChoiceType(f.type) && f.scored));
    const addScoreRange = () => setScoreRanges([...scoreRanges, { min: 0, max: 0, resultText: '' }]);
    const updateScoreRange = (i: number, patch: Partial<ScoreRange>) =>
      setScoreRanges(scoreRanges.map((r, ri) => ri === i ? { ...r, ...patch } : r));
    const removeScoreRange = (i: number) => setScoreRanges(scoreRanges.filter((_, ri) => ri !== i));
    return (
      <Box sx={{ pb: 12 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {editId ? 'แก้ไขแบบสอบถาม/แบบทดสอบ' : 'สร้างแบบสอบถาม/แบบทดสอบใหม่'}
          </Typography>
        </Box>

        {saveError && <Alert severity="error" onClose={() => setSaveError(null)} sx={{ mb: 3 }}>{saveError}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel title="ข้อมูลทั่วไป" />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="ชื่อฟอร์ม" value={name} onChange={e => setName(e.target.value)} required />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="คำอธิบาย" value={description} onChange={e => setDescription(e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>ประเภท</InputLabel>
                    <Select value={formKind} label="ประเภท" onChange={e => setFormKind(e.target.value)}>
                      <MenuItem value="survey">แบบสอบถาม (ไม่มีคะแนน)</MenuItem>
                      <MenuItem value="test">แบบทดสอบ (มีคะแนน · ตอบซ้ำเพื่อเทียบก่อน–หลังได้)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth label="ลิงก์ (ไม่บังคับ)" value={slug}
                    onChange={e => setSlug(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                    helperText={`${CONSUMER_APP_URL}/survey/${slug || '(สุ่มจาก id อัตโนมัติถ้าเว้นว่าง)'}`}
                  />
                </Grid>
              </Grid>
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={3} alignItems="center" sx={{ mt: 2 }}>
                <FormControlLabel
                  control={<Switch checked={isActive} onChange={e => setIsActive(e.target.checked)} />}
                  label="เปิดใช้งาน"
                />
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel>สลับลำดับข้อ</InputLabel>
                  <Select value={shuffleMode} label="สลับลำดับข้อ" onChange={e => setShuffleMode(e.target.value)}>
                    <MenuItem value="none">ไม่สลับ</MenuItem>
                    <MenuItem value="within_section">สลับภายใน Section</MenuItem>
                    <MenuItem value="sections">สลับลำดับ Section</MenuItem>
                    <MenuItem value="all">สลับทั้งชุด (ข้ามหัวข้อ)</MenuItem>
                      <MenuItem value="pages">สลับทั้งหน้า (สำหรับหน้าละข้อ)</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch checked={shuffleOptions} onChange={e => setShuffleOptions(e.target.checked)} />}
                  label="สลับลำดับตัวเลือก"
                />
              </Stack>
              {(shuffleMode !== 'none' || shuffleOptions) && (
                <Alert severity={shuffleMode === 'all' ? 'warning' : 'info'} sx={{ mt: 2 }}>
                  สุ่มลำดับใหม่ทุกครั้งที่เปิดฟอร์ม เพื่อไม่ให้จำตำแหน่งคำตอบได้ตอนทำรอบสอง ·
                  คะแนนไม่เพี้ยน เพราะระบบตรวจจากข้อความตัวเลือก ไม่ใช่ลำดับ{shuffleMode === 'pages' ? '' : ' · ไม่สลับข้ามหน้า'}
                  {shuffleMode === 'within_section' && ' · หัวข้อและรูปภาพอยู่ที่เดิม สลับเฉพาะข้อที่อยู่ใต้หัวข้อเดียวกัน'}
                  {shuffleMode === 'sections' && ' · แต่ละ Section ย้ายไปทั้งก้อนพร้อมหัวข้อ ข้อข้างในเรียงเดิม'}
                  {shuffleMode === 'all' && ' · โหมดนี้ย้ายข้อข้ามหัวข้อได้ เหมาะกับฟอร์มที่ไม่มี Section — ถ้าฟอร์มนี้มีหัวข้อแบ่งเรื่อง ข้อจะไปโผล่ใต้หัวข้อผิดเรื่อง'}
                  {shuffleMode === 'pages' && ' · สลับลำดับหน้าทั้งหน้า เนื้อหาในแต่ละหน้าเรียงเดิม — ใช้กับฟอร์มที่แยกหน้าละข้อ ซึ่งโหมดอื่นจะไม่สลับอะไรเลย'}
                </Alert>
              )}
            </Paper>

            <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
              <SectionLabel title="หน้าและฟิลด์" />

              <Tabs
                value={activePage}
                onChange={(_, v) => setActivePage(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, borderBottom: '1px solid #eee' }}
              >
                {pages.map((_, i) => <Tab key={i} label={`หน้า ${i + 1}`} sx={{ fontWeight: 700, textTransform: 'none' }} />)}
              </Tabs>

              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
                <Button size="small" startIcon={<AddIcon />} onClick={addPage}>เพิ่มหน้า</Button>
                {/* Only offered for the mode it affects — on any other mode a
                    pinned page would be a switch that quietly does nothing. */}
                {shuffleMode === 'pages' && (
                  <FormControlLabel
                    control={<Switch size="small" checked={!!pinnedPages[activePage]} onChange={() => togglePagePinned(activePage)} />}
                    label={<Typography variant="caption" sx={{ fontWeight: 700 }}>ไม่สลับหน้านี้ (ตรึงไว้ที่เดิม)</Typography>}
                  />
                )}
                {pages.length > 1 && (
                  <Button size="small" color="error" onClick={() => removePage(activePage)}>ลบหน้านี้</Button>
                )}
              </Stack>

              <Stack spacing={2}>
                {currentPageFields.length === 0 && (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
                    ยังไม่มีฟิลด์ในหน้านี้ — เลือกเพิ่มฟิลด์ด้านล่าง
                  </Typography>
                )}
                {currentPageFields.map((field, idx) => (
                  <Paper key={field.fieldKey} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ mt: 1.5, color: 'text.secondary' }}>{FIELD_TYPE_META[field.type].icon}</Box>
                      <Stack spacing={1.5} sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                          <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel>ชนิดฟิลด์</InputLabel>
                            <Select
                              label="ชนิดฟิลด์"
                              value={field.type}
                              onChange={e => changeFieldType(idx, e.target.value as FieldType)}
                            >
                              {(Object.keys(FIELD_TYPE_META) as FieldType[]).map(t => (
                                <MenuItem key={t} value={t}>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    {FIELD_TYPE_META[t].icon}
                                    <span>{FIELD_TYPE_META[t].label}</span>
                                  </Stack>
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          {field.type !== 'heading' && field.type !== 'paragraph' && field.type !== 'image' && (
                            <FormControlLabel
                              control={<Switch size="small" checked={field.required} onChange={e => updateField(idx, { required: e.target.checked })} />}
                              label={<Typography variant="caption">จำเป็นต้องกรอก</Typography>}
                            />
                          )}
                          {isChoiceType(field.type) && (
                            <FormControlLabel
                              control={<Switch size="small" checked={!!field.scored} onChange={e => updateField(idx, { scored: e.target.checked })} />}
                              label={<Typography variant="caption">ให้คะแนน</Typography>}
                            />
                          )}
                          {field.type === 'identity' && (
                            <FormControlLabel
                              control={<Switch size="small" checked={!!field.phoneRequired} onChange={e => updateField(idx, { phoneRequired: e.target.checked })} />}
                              label={<Typography variant="caption">บังคับกรอกเบอร์โทร</Typography>}
                            />
                          )}
                          {field.type === 'radio' && (
                            <FormControlLabel
                              control={
                                <Switch
                                  size="small"
                                  checked={field.display === 'scale'}
                                  // Turning it on turns on scoring too: a scale
                                  // with no points behind it produces no average,
                                  // which is the only thing anyone reads a rating
                                  // form's results for.
                                  onChange={e => updateField(idx, e.target.checked
                                    ? { display: 'scale', scored: true }
                                    : { display: undefined })}
                                />
                              }
                              label={<Typography variant="caption">แสดงเป็นสเกลแถวเดียว</Typography>}
                            />
                          )}
                        </Stack>
                        {field.labelHtml === undefined ? (
                          <TextField
                            fullWidth size="small"
                            label={field.type === 'image' ? 'คำอธิบายรูป (ไม่บังคับ)' : field.type === 'paragraph' ? 'เนื้อหา (ขึ้นบรรทัดใหม่ได้)' : 'ข้อความ/คำถาม'}
                            value={field.label}
                            onChange={e => updateField(idx, { label: e.target.value })}
                            multiline={field.type === 'paragraph'}
                            minRows={field.type === 'paragraph' ? 6 : undefined}
                            helperText={field.type === 'paragraph' ? 'ผู้ทำแบบทดสอบจะเห็นข้อความนี้ตามที่พิมพ์ รวมถึงการเว้นบรรทัด' : undefined}
                          />
                        ) : (
                          <Box>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                              ข้อความ/คำถาม (จัดรูปแบบได้)
                            </Typography>
                            <RichTextEditor
                              value={field.labelHtml}
                              onChange={html => updateField(idx, { labelHtml: html, label: stripHtml(html) })}
                              uploadFolder="surveys"
                            />
                          </Box>
                        )}
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={field.labelHtml !== undefined}
                              onChange={e => updateField(idx, e.target.checked
                                // Seeded from whatever plain text is already
                                // there, so turning this on never blanks the
                                // question someone just typed.
                                ? { labelHtml: field.label ? `<p>${field.label}</p>` : '' }
                                : { labelHtml: undefined })}
                            />
                          }
                          label={<Typography variant="caption">จัดรูปแบบข้อความ (สี / ตัวหนา)</Typography>}
                        />
                        {field.type === 'image' && (
                          <ImageUploadField label="รูป" url={field.imageUrl} onChange={imageUrl => updateField(idx, { imageUrl })} />
                        )}
                        {field.type === 'radio' && field.display === 'scale' && (
                          <Stack spacing={1.5} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#faf9ff', border: '1px solid #ece8fa' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                              สเกลนี้ใช้ตัวเลือกด้านล่างเป็นช่องให้กด เรียงจากซ้ายไปขวาตามลำดับที่กรอกไว้
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {SCALE_PRESETS.map(p => (
                                <Button
                                  key={p.name} size="small" variant="outlined"
                                  onClick={() => updateField(idx, {
                                    options: p.options.map(o => ({ ...o })),
                                    scored: true,
                                    scaleLowLabel: p.low,
                                    scaleHighLabel: p.high,
                                  })}
                                >{p.name}</Button>
                              ))}
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                              <TextField
                                size="small" label="ป้ายฝั่งซ้าย (ไม่บังคับ)" sx={{ flex: 1 }}
                                value={field.scaleLowLabel || ''}
                                onChange={e => updateField(idx, { scaleLowLabel: e.target.value })}
                              />
                              <TextField
                                size="small" label="ป้ายฝั่งขวา (ไม่บังคับ)" sx={{ flex: 1 }}
                                value={field.scaleHighLabel || ''}
                                onChange={e => updateField(idx, { scaleHighLabel: e.target.value })}
                              />
                            </Stack>
                            {/* Says what will actually happen on the phone rather
                                than assuming the row always fits: long options
                                fall back to the stacked list on their own. */}
                            {fitsScaleRow(field.options) ? (
                              <Alert severity="success" sx={{ py: 0.25 }}>
                                <Typography variant="caption">
                                  จะแสดงเป็นแถวเดียว {(field.options || []).length} ช่อง — กดได้สะดวกบนมือถือ
                                </Typography>
                              </Alert>
                            ) : (
                              <Alert severity="warning" sx={{ py: 0.25 }}>
                                <Typography variant="caption">
                                  ตัวเลือกยาวหรือมากเกินไป (เกิน {SCALE_MAX_OPTIONS} ช่อง หรือข้อความเกิน {SCALE_MAX_LABEL} ตัวอักษร)
                                  จะแสดงเป็นรายการแนวตั้งแบบเดิมเพื่อให้ยังอ่านออกบนมือถือ
                                </Typography>
                              </Alert>
                            )}
                          </Stack>
                        )}
                        {isChoiceType(field.type) && (
                          <Stack spacing={1}>
                            {(field.options || []).map((opt, oIdx) => (
                              <Stack key={oIdx} direction="row" spacing={1} alignItems="center">
                                <TextField
                                  size="small" label="ตัวเลือก" sx={{ flex: 1 }}
                                  value={opt.label}
                                  onChange={e => updateField(idx, {
                                    options: (field.options || []).map((o, i) => i === oIdx ? { ...o, label: e.target.value } : o),
                                  })}
                                />
                                {field.scored && (
                                  <TextField
                                    size="small" type="number" label="คะแนน" sx={{ width: 110 }}
                                    value={opt.points}
                                    onChange={e => updateField(idx, {
                                      options: (field.options || []).map((o, i) => i === oIdx ? { ...o, points: parseInt(e.target.value) || 0 } : o),
                                    })}
                                  />
                                )}
                                <FormControl size="small" sx={{ width: 130 }}>
                                  <InputLabel>สี</InputLabel>
                                  <Select
                                    label="สี"
                                    value={opt.color || ''}
                                    onChange={e => updateField(idx, {
                                      options: (field.options || []).map((o, i) => i === oIdx ? { ...o, color: e.target.value || undefined } : o),
                                    })}
                                    renderValue={v => (
                                      <Stack direction="row" spacing={0.75} alignItems="center">
                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: v || '#e2e8f0', border: '1px solid #cbd5e1' }} />
                                        <span>{OPTION_COLORS.find(c => c.value === v)?.label ?? 'ไม่ระบุสี'}</span>
                                      </Stack>
                                    )}
                                  >
                                    {OPTION_COLORS.map(c => (
                                      <MenuItem key={c.value || 'none'} value={c.value}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                          <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: c.value || '#e2e8f0', border: '1px solid #cbd5e1' }} />
                                          <span>{c.label}</span>
                                        </Stack>
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                                <IconButton
                                  size="small" color="error"
                                  onClick={() => updateField(idx, { options: (field.options || []).filter((_, i) => i !== oIdx) })}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            ))}
                            <Button
                              size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }}
                              onClick={() => updateField(idx, {
                                options: [...(field.options || []), { label: `ตัวเลือก ${(field.options?.length || 0) + 1}`, points: 0 }],
                              })}
                            >
                              เพิ่มตัวเลือก
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                      <Stack spacing={0.5}>
                        <IconButton size="small" disabled={idx === 0} onClick={() => moveField(idx, -1)}><UpIcon fontSize="small" /></IconButton>
                        <IconButton size="small" disabled={idx === currentPageFields.length - 1} onClick={() => moveField(idx, 1)}><DownIcon fontSize="small" /></IconButton>
                        {/* Only worth offering when there is somewhere else to
                            go — on a single-page form it would open an empty
                            menu. */}
                        {pages.length > 1 && (
                          <IconButton
                            size="small"
                            title="ย้ายไปหน้าอื่น"
                            onClick={e => setMovePageMenu({ anchor: e.currentTarget, fieldIdx: idx })}
                          >
                            <MovePageIcon fontSize="small" />
                          </IconButton>
                        )}
                        <IconButton size="small" color="error" onClick={() => removeField(idx)}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mt: 3, mb: 1 }}>
                เพิ่มฟิลด์ในหน้านี้
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {(Object.keys(FIELD_TYPE_META) as FieldType[]).map(type => (
                  <Button
                    key={type}
                    size="small"
                    variant="outlined"
                    startIcon={FIELD_TYPE_META[type].icon}
                    onClick={() => addField(type)}
                    sx={{ textTransform: 'none', fontWeight: 700 }}
                  >
                    {FIELD_TYPE_META[type].label}
                  </Button>
                ))}
              </Stack>
            </Paper>

            {hasAnyScored && (
              <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
                <SectionLabel title="เกณฑ์ผลการประเมิน" />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  แสดงข้อความ (และรูป) ให้ผู้ตอบเห็นหลังส่งคำตอบ ตามช่วงคะแนนรวมที่ได้
                </Typography>
                <Stack spacing={2}>
                  {scoreRanges.map((range, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1.5}>
                          <TextField
                            size="small" type="number" label="คะแนนต่ำสุด" sx={{ width: 130 }}
                            value={range.min} onChange={e => updateScoreRange(i, { min: parseInt(e.target.value) || 0 })}
                          />
                          <TextField
                            size="small" type="number" label="คะแนนสูงสุด" sx={{ width: 130 }}
                            value={range.max} onChange={e => updateScoreRange(i, { max: parseInt(e.target.value) || 0 })}
                          />
                          <IconButton size="small" color="error" sx={{ ml: 'auto' }} onClick={() => removeScoreRange(i)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        {range.resultTextHtml === undefined ? (
                          <TextField
                            fullWidth size="small" multiline minRows={2} label="ข้อความผลการประเมิน"
                            value={range.resultText} onChange={e => updateScoreRange(i, { resultText: e.target.value })}
                          />
                        ) : (
                          <Box>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                              ข้อความผลการประเมิน (จัดรูปแบบได้)
                            </Typography>
                            <RichTextEditor
                              value={range.resultTextHtml}
                              onChange={html => updateScoreRange(i, { resultTextHtml: html, resultText: stripHtml(html) })}
                              uploadFolder="surveys"
                            />
                          </Box>
                        )}
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={range.resultTextHtml !== undefined}
                              onChange={e => updateScoreRange(i, e.target.checked
                                ? { resultTextHtml: range.resultText ? `<p>${range.resultText}</p>` : '' }
                                : { resultTextHtml: undefined })}
                            />
                          }
                          label={<Typography variant="caption">จัดรูปแบบข้อความ (สี / ตัวหนา)</Typography>}
                        />
                        <ImageUploadField label="รูป" url={range.imageUrl} onChange={imageUrl => updateScoreRange(i, { imageUrl })} />
                      </Stack>
                    </Paper>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={addScoreRange}>
                    เพิ่มช่วงคะแนน
                  </Button>
                </Stack>
              </Paper>
            )}

            <Button
              variant="contained" size="large" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              disabled={saving} onClick={handleSave}
            >
              บันทึกฟอร์ม
            </Button>
          </Grid>
        </Grid>

      {/* One menu for the whole list rather than one per field — the pages
          it offers are the same either way, and mounting a Menu inside every
          field card is a lot of hidden markup for a rarely used action. */}
      <Menu
        anchorEl={movePageMenu?.anchor}
        open={!!movePageMenu}
        onClose={() => setMovePageMenu(null)}
      >
        {pages.map((page, i) => (
          i === activePage ? null : (
            <MenuItem key={i} onClick={() => movePageMenu && moveFieldToPage(movePageMenu.fieldIdx, i)}>
              ย้ายไปหน้า {i + 1} ({page.length} ฟิลด์)
            </MenuItem>
          )
        ))}
      </Menu>

      </Box>
    );
  }

  // ─── List View ───────────────────────────────────────────────────────────
  // Forms and sessions share this screen: a session is just a bundle of these
  // forms, and splitting them across two menu entries made staff hop back and
  // forth to build one thing. Session editing hides the tabs the same way form
  // editing does, so an editor is never framed by navigation it can't use.
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>แบบสอบถาม / แบบทดสอบ</Typography>
        {topTab === 0 && <Button variant="contained" startIcon={<AddIcon />} onClick={startCreate}>สร้างฟอร์มใหม่</Button>}
      </Stack>

      {!sessionEditing && (
        <Tabs value={topTab} onChange={(_, v) => setTopTab(v)} sx={{ mb: 3, borderBottom: '1px solid #eef0f3' }}>
          <Tab label="แบบฟอร์ม" sx={{ fontWeight: 700 }} />
          <Tab label="ชุดแบบฟอร์ม (Session)" sx={{ fontWeight: 700 }} />
          <Tab label="เปรียบเทียบ Session" sx={{ fontWeight: 700 }} />
        </Tabs>
      )}

      {topTab === 1 && <SessionManagement view="list" onEditingChange={setSessionEditing} />}
      {topTab === 2 && <SessionManagement view="compare" onEditingChange={setSessionEditing} />}

      {topTab === 0 && (
      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>ชื่อฟอร์ม</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ประเภท</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>เฉลย</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จำนวนคำตอบ</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {forms.length === 0 && (
              <TableRow><TableCell colSpan={6} align="center">
                <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีแบบสอบถาม/แบบทดสอบ</Typography>
              </TableCell></TableRow>
            )}
            {forms.map(form => (
              <TableRow key={form.id} hover>
                <TableCell sx={{ fontWeight: 700 }}>{form.name}</TableCell>
                <TableCell>
                  <Chip label={FORM_KIND_META[form.form_kind]?.label ?? form.form_kind} color={FORM_KIND_META[form.form_kind]?.color ?? 'default'} size="small" />
                </TableCell>
                <TableCell>
                  <Chip label={form.has_answer_key ? 'มีเฉลย' : 'ไม่มีเฉลย'} size="small" variant={form.has_answer_key ? 'filled' : 'outlined'} />
                </TableCell>
                <TableCell>
                  <Chip label={form.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'} color={form.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell align="right">{form.response_count}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => copyLink(form)} title="คัดลอกลิงก์"><LinkIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="warning" onClick={() => openTestRun(form)} title="ทดลองทำแบบทดสอบ (ผลเก็บแยก ไม่นับรวม)"><TestRunIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => navigate(`/crm/surveys/${form.id}/responses`)} title="ดูคำตอบ"><ResponsesIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => startEdit(form.id)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => setItemToDelete({ id: form.id, name: form.name })}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      )}

      <Dialog open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบ <strong>"{itemToDelete?.name}"</strong> ใช่หรือไม่? คำตอบที่มีคนตอบไว้แล้วจะถูกลบไปด้วย</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={linkCopied} autoHideDuration={2000} onClose={() => setLinkCopied(false)} message="คัดลอกลิงก์แล้ว" />
    </Box>
  );
};

export default SurveyManagement;
