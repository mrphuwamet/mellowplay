import React, { useEffect, useState } from 'react';
import { API_URL, CONSUMER_APP_URL } from '../config';
import RichTextEditor from '../components/RichTextEditor';
import axios from 'axios';
import {
  Typography, Box, CircularProgress, Grid, Button, Chip,
  TextField, MenuItem, Select, FormControl, InputLabel,
  IconButton, Paper, Stack, Alert, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tab, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as BackIcon,
  Save as SaveIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  Title as HeadingIcon,
  ShortText as TextFieldIcon,
  Notes as TextareaIcon,
  Numbers as NumberIcon,
  LocalPhone as PhoneIcon,
  Gavel as ConsentFieldIcon,
  Notes as ParagraphIcon,
  Visibility as PreviewIcon,
  DragIndicator as DragIcon,
  Event as DateIcon,
  ArrowDropDownCircle as SelectIcon,
  RadioButtonChecked as RadioIcon,
  CheckBox as CheckboxIcon,
  FamilyRestroom as FamilyPickerIcon,
  Groups as TeamSelectIcon,
  Image as ImageFieldIcon,
  CloudUpload as UploadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

const API_BASE = `${API_URL}/api/v1/admin`;

type FieldType = 'heading' | 'paragraph' | 'text' | 'textarea' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'consent' | 'family_member_picker' | 'team_select' | 'image';

/** A consent document this form can attach — see ConsentDocumentManagement. */
interface ConsentDocOption {
  id: number;
  doc_key: string;
  title: string;
  summary: string;
  version: number;
  is_required_default: number;
}

interface TeamOption { label: string; capacity: number; }

interface FieldDraft {
  fieldKey: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];         // select/radio/checkbox
  teamOptions?: TeamOption[]; // team_select — each team's name + how many it can take
  role?: 'adult' | 'child';   // family_member_picker
  duplicateCheckScope?: 'none' | 'course' | 'round' | 'calendar';
  imageUrl?: string;          // image
  /**
   * paragraph — the formatted copy, as HTML. `label` keeps a plain-text copy
   * of the same words so anything reading a field by its label (the check-in
   * card, a CSV header, this list) still has something readable rather than
   * markup.
   */
  labelHtml?: string;
  /**
   * consent — which document is being agreed to, by its stable slug rather
   * than its row id, so the reference survives a document being re-keyed and
   * reads plainly in the stored config.
   */
  consentDocKey?: string;
  /** Pin this answer to the top of the check-in card, highlighted. */
  showAtCheckin?: boolean;
}

const FIELD_TYPE_META: Record<FieldType, { label: string; icon: React.ReactNode }> = {
  heading: { label: 'หัวข้อ/คำอธิบาย', icon: <HeadingIcon fontSize="small" /> },
  // Not a heading and not a question: a block of copy for the reader, laid
  // out — bold, lists, links, line breaks. Headings were being used for this
  // and came out as one long unbreakable line.
  paragraph: { label: 'เนื้อหาให้อ่าน (จัดรูปแบบได้)', icon: <ParagraphIcon fontSize="small" /> },
  text: { label: 'ข้อความสั้น', icon: <TextFieldIcon fontSize="small" /> },
  textarea: { label: 'ข้อความยาว', icon: <TextareaIcon fontSize="small" /> },
  // Not a plain text field with a different name: it keeps to digits, offers
  // the account holder's own number in one tap, and refuses a number that is
  // too short to call back — which is the whole reason the field is asked for.
  phone: { label: 'เบอร์โทรศัพท์', icon: <PhoneIcon fontSize="small" /> },
  number: { label: 'ตัวเลข', icon: <NumberIcon fontSize="small" /> },
  date: { label: 'วันที่', icon: <DateIcon fontSize="small" /> },
  select: { label: 'ตัวเลือก (Dropdown)', icon: <SelectIcon fontSize="small" /> },
  radio: { label: 'ตัวเลือก (Radio)', icon: <RadioIcon fontSize="small" /> },
  checkbox: { label: 'ช่องติ๊ก (หลายตัวเลือก)', icon: <CheckboxIcon fontSize="small" /> },
  // Not a checkbox with legal wording typed into its label: this one is tied
  // to a managed document, shows its full text on demand, and records which
  // version of that text the family actually saw.
  consent: { label: 'ยินยอม (PDPA)', icon: <ConsentFieldIcon fontSize="small" /> },
  family_member_picker: { label: 'เลือกสมาชิกในครอบครัว', icon: <FamilyPickerIcon fontSize="small" /> },
  team_select: { label: 'เลือกทีม (จำกัดจำนวนต่อทีม)', icon: <TeamSelectIcon fontSize="small" /> },
  image: { label: 'รูปภาพ', icon: <ImageFieldIcon fontSize="small" /> },
};

/**
 * Opens the form in the consumer app, the way a parent sees it.
 *
 * A new tab into the real renderer rather than a preview drawn here: a preview
 * built a second time inside the CRM is a second implementation of the form,
 * and the bugs worth catching before a form goes out are exactly the ones a
 * reimplementation would not reproduce. Same reasoning as the survey's
 * "ทดลองทำ" button. Nothing the preview collects is saved.
 */
const openFormPreview = (formId: number) => {
  window.open(`${CONSUMER_APP_URL}/preview/registration-form/${formId}`, '_blank', 'noopener,noreferrer');
};

/** Plain-text copy of formatted content, for the places that cannot show markup. */
const stripHtml = (html: string): string => {
  const el = document.createElement('div');
  // Block ends become newlines first, so paragraphs and list items do not run
  // together once the tags are gone.
  el.innerHTML = (html || '')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return (el.textContent || '').split(/\n+/).map(l => l.trim()).filter(Boolean).join('\n');
};

const newFieldKey = () => (crypto as any).randomUUID ? crypto.randomUUID() : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const emptyField = (type: FieldType): FieldDraft => ({
  fieldKey: newFieldKey(),
  type,
  label: FIELD_TYPE_META[type].label,
  required: false,
  options: (type === 'select' || type === 'radio' || type === 'checkbox') ? ['ตัวเลือก 1'] : undefined,
  teamOptions: type === 'team_select' ? [{ label: 'ทีม 1', capacity: 10 }] : undefined,
  role: type === 'family_member_picker' ? 'child' : undefined,
});

// Same /admin/upload endpoint the rich-text editors and the Survey builder
// already use for inline images.
const uploadImage = async (file: File): Promise<string> => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'registration-forms');
  const res = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
  if (!res.data.success) throw new Error(res.data.message || 'Upload failed');
  return res.data.url;
};

const ImageUploadField = ({ url, onChange }: { url?: string; onChange: (url: string | undefined) => void }) => {
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
          {url ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
        </Button>
      </label>
    </Stack>
  );
};

const SectionLabel = ({ title }: { title: string }) => (
  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>{title}</Typography>
);

const RegistrationFormManagement = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Only documents still in use. A retired one stays readable for the consents
  // already given against it, but must not be attachable to anything new.
  const [consentDocs, setConsentDocs] = useState<ConsentDocOption[]>([]);
  useEffect(() => {
    axios.get(`${API_BASE}/consent-documents/active`)
      .then(res => setConsentDocs(res.data.documents || []))
      .catch(() => setConsentDocs([]));
  }, []);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pages, setPages] = useState<FieldDraft[][]>([[]]);
  const [activePage, setActivePage] = useState(0);

  const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string } | null>(null);

  const fetchForms = () => {
    setLoading(true);
    axios.get(`${API_BASE}/registration-forms`)
      .then(res => { if (res.data.success) setForms(res.data.forms); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchForms(); }, []);

  const resetFormState = () => {
    setName(''); setDescription(''); setIsActive(true);
    setPages([[]]); setActivePage(0); setSaveError(null);
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
      const res = await axios.get(`${API_BASE}/registration-forms/${id}`);
      if (res.data.success) {
        const form = res.data.form;
        setName(form.name || '');
        setDescription(form.description || '');
        setIsActive(!!form.is_active);

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
            options: (f.options_json && f.type !== 'team_select') ? JSON.parse(f.options_json) : undefined,
            teamOptions: (f.options_json && f.type === 'team_select') ? JSON.parse(f.options_json) : undefined,
            role: config.role,
            imageUrl: config.imageUrl,
            consentDocKey: config.consentDocKey,
            labelHtml: config.labelHtml,
            showAtCheckin: !!config.showAtCheckin,
            duplicateCheckScope: f.duplicate_check_scope || 'none',
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
        optionsJson: f.type === 'team_select'
          ? (f.teamOptions ? JSON.stringify(f.teamOptions) : undefined)
          : (f.options ? JSON.stringify(f.options) : undefined),
        configJson: (() => {
          const cfg: Record<string, any> = {};
          if (f.role) cfg.role = f.role;
          if (f.type === 'image' && f.imageUrl) cfg.imageUrl = f.imageUrl;
          if (f.type === 'consent' && f.consentDocKey) cfg.consentDocKey = f.consentDocKey;
          if (f.type === 'paragraph' && f.labelHtml) cfg.labelHtml = f.labelHtml;
          if (f.showAtCheckin) cfg.showAtCheckin = true;
          return Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : undefined;
        })(),
        duplicateCheckScope: f.duplicateCheckScope,
      })));
      const payload = { name, description, isActive, fields };
      if (editId) {
        await axios.put(`${API_BASE}/registration-forms/${editId}`, payload);
      } else {
        await axios.post(`${API_BASE}/registration-forms`, payload);
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
    await axios.delete(`${API_BASE}/registration-forms/${itemToDelete.id}`);
    setItemToDelete(null);
    fetchForms();
  };

  // ── Page/field editing helpers ──────────────────────────────────────────
  const addPage = () => { setPages([...pages, []]); setActivePage(pages.length); };
  const removePage = (pageIdx: number) => {
    const next = pages.filter((_, i) => i !== pageIdx);
    setPages(next.length > 0 ? next : [[]]);
    setActivePage(Math.max(0, Math.min(activePage, next.length - 1)));
  };
  /**
   * Moves a page, and keeps whichever page was open still open.
   *
   * activePage is an index, so every page between the two ends shifts by one
   * and the plain "if it was dragged, follow it" rule is not enough: drag page
   * 1 to the end while sitting on page 2, and page 2 is now index 1. Each case
   * below is one of those shifts, not defensive padding.
   */
  const reorderPage = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= pages.length || toIdx >= pages.length) return;
    const next = [...pages];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setPages(next);
    setActivePage(prev => {
      if (prev === fromIdx) return toIdx;                       // the page being dragged
      if (fromIdx < prev && prev <= toIdx) return prev - 1;      // it passed under this one, going down
      if (toIdx <= prev && prev < fromIdx) return prev + 1;      // ...or going up
      return prev;                                              // untouched by the move
    });
  };

  const [pageDragFrom, setPageDragFrom] = useState<number | null>(null);
  const [pageDragOver, setPageDragOver] = useState<number | null>(null);

  const addField = (type: FieldType) => {
    const next = pages.map((page, i) => i === activePage ? [...page, emptyField(type)] : page);
    setPages(next);
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
   * Moves a field to a position, for the drag.
   *
   * Separate from moveField's neighbour swap because a drag is not a series of
   * swaps: dropping item 1 onto item 5 has to take the four in between along
   * with it, and swapping repeatedly would scramble their order instead.
   */
  const reorderField = (fromIdx: number, toIdx: number) => {
    const page = pages[activePage];
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= page.length || toIdx >= page.length) return;
    const reordered = [...page];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setPages(pages.map((p, i) => (i === activePage ? reordered : p)));
  };

  // Which card is being dragged, and which one the pointer is over. Held here
  // rather than read off the drag event because Firefox gives dragover no
  // access to the payload, so the source index has to be remembered.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

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
    return (
      <Box sx={{ pb: 12 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {editId ? 'แก้ไขแบบฟอร์มลงทะเบียน' : 'สร้างแบบฟอร์มลงทะเบียนใหม่'}
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
              </Grid>
              <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 2 }}>
                <FormControlLabel
                  control={<Switch checked={isActive} onChange={e => setIsActive(e.target.checked)} />}
                  label="เปิดใช้งาน"
                />
              </Stack>
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
                {pages.map((_, i) => (
                  <Tab
                    key={i}
                    label={`หน้า ${i + 1}`}
                    // The tab itself is the handle. Unlike a field card there is
                    // nothing inside it to select, so there is no text-selection
                    // to break by making the whole thing draggable.
                    draggable
                    onDragStart={e => {
                      setPageDragFrom(i);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(i)); // Firefox needs a payload
                    }}
                    onDragEnd={() => { setPageDragFrom(null); setPageDragOver(null); }}
                    onDragOver={e => { if (pageDragFrom !== null) { e.preventDefault(); setPageDragOver(i); } }}
                    onDragLeave={() => setPageDragOver(prev => (prev === i ? null : prev))}
                    onDrop={e => {
                      e.preventDefault();
                      if (pageDragFrom !== null) reorderPage(pageDragFrom, i);
                      setPageDragFrom(null);
                      setPageDragOver(null);
                    }}
                    sx={{
                      fontWeight: 700, textTransform: 'none', cursor: 'grab',
                      '&:active': { cursor: 'grabbing' },
                      opacity: pageDragFrom === i ? 0.4 : 1,
                      // The side the page would land on — tabs run across, so
                      // the marker is a left or right edge rather than top/bottom.
                      borderLeft: pageDragOver === i && pageDragFrom !== null && pageDragFrom > i ? '3px solid' : undefined,
                      borderRight: pageDragOver === i && pageDragFrom !== null && pageDragFrom < i ? '3px solid' : undefined,
                      borderLeftColor: 'primary.main',
                      borderRightColor: 'primary.main',
                    }}
                  />
                ))}
              </Tabs>

              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Button size="small" startIcon={<AddIcon />} onClick={addPage}>เพิ่มหน้า</Button>
                  {pages.length > 1 && (
                    <Typography variant="caption" color="text.secondary">ลากแท็บหน้าเพื่อสลับลำดับได้</Typography>
                  )}
                </Stack>
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
                  <Paper
                    key={field.fieldKey}
                    variant="outlined"
                    // The whole card is the drop target, so the pointer does
                    // not have to find the handle again to let go.
                    onDragOver={e => { if (dragFrom !== null) { e.preventDefault(); setDragOver(idx); } }}
                    onDragLeave={() => setDragOver(prev => (prev === idx ? null : prev))}
                    onDrop={e => {
                      e.preventDefault();
                      if (dragFrom !== null) reorderField(dragFrom, idx);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    sx={{
                      p: 2, borderRadius: 2,
                      opacity: dragFrom === idx ? 0.4 : 1,
                      // A line on the edge the card would land against, rather
                      // than a highlight of the whole row: "between these two"
                      // is the thing being chosen, and a filled box says
                      // "onto this one" instead.
                      borderTop: dragOver === idx && dragFrom !== null && dragFrom > idx ? '3px solid' : undefined,
                      borderBottom: dragOver === idx && dragFrom !== null && dragFrom < idx ? '3px solid' : undefined,
                      borderTopColor: 'primary.main',
                      borderBottomColor: 'primary.main',
                      transition: 'opacity .15s',
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      {/* Only the handle is draggable, not the card. Making the
                          card itself draggable means selecting text in any
                          field inside it starts a drag instead. */}
                      <Tooltip title="ลากเพื่อจัดลำดับ">
                        <Box
                          draggable
                          onDragStart={e => {
                            setDragFrom(idx);
                            e.dataTransfer.effectAllowed = 'move';
                            // Firefox refuses to start a drag without payload.
                            e.dataTransfer.setData('text/plain', String(idx));
                          }}
                          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                          sx={{
                            mt: 1.25, color: 'text.disabled', cursor: 'grab',
                            '&:active': { cursor: 'grabbing' },
                            display: 'flex', touchAction: 'none',
                          }}
                        >
                          <DragIcon fontSize="small" />
                        </Box>
                      </Tooltip>
                      <Box sx={{ mt: 1.5, color: 'text.secondary' }}>{FIELD_TYPE_META[field.type].icon}</Box>
                      <Stack spacing={1.5} sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Chip label={FIELD_TYPE_META[field.type].label} size="small" sx={{ fontWeight: 700 }} />
                          {field.type !== 'heading' && field.type !== 'paragraph' && field.type !== 'image' && (
                            <FormControlLabel
                              control={<Switch size="small" checked={field.required} onChange={e => updateField(idx, { required: e.target.checked })} />}
                              label={<Typography variant="caption">จำเป็นต้องกรอก</Typography>}
                            />
                          )}
                          {/* The check-in card lists every answer at the same
                              weight, so "แพ้นม" reads exactly like "รู้จักเรา
                              จากไหน". This lifts the few that matter to the top
                              of it, in a colour someone glances at while a
                              family is standing in front of them. */}
                          {field.type !== 'heading' && field.type !== 'image' && (
                            <Tooltip title="เด้งขึ้นบนสุดของหน้าจอเช็คอิน พร้อมไฮไลต์ — ใช้กับข้อมูลอย่างการแพ้อาหารหรือโรคประจำตัว">
                              <FormControlLabel
                                control={<Switch size="small" color="warning" checked={!!field.showAtCheckin} onChange={e => updateField(idx, { showAtCheckin: e.target.checked })} />}
                                label={<Typography variant="caption">เน้นตอนเช็คอิน</Typography>}
                              />
                            </Tooltip>
                          )}
                        </Stack>
                        {field.type === 'paragraph' ? (
                          <Box>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                              เนื้อหา (จัดรูปแบบได้ — ตัวหนา สี หัวข้อย่อย ลิงก์)
                            </Typography>
                            {/* label is kept in step with the text, stripped of
                                markup: the check-in card and the CSV export read
                                a field by its label and would otherwise show
                                raw HTML. */}
                            <RichTextEditor
                              value={field.labelHtml ?? (field.label ? `<p>${field.label}</p>` : '')}
                              onChange={html => updateField(idx, { labelHtml: html, label: stripHtml(html) })}
                              uploadFolder="registration-forms"
                              placeholder="พิมพ์เนื้อหาที่อยากให้ผู้กรอกอ่าน"
                            />
                          </Box>
                        ) : (
                          <TextField
                            fullWidth size="small" label={field.type === 'image' ? 'คำอธิบายรูป (ไม่บังคับ)' : 'ข้อความ/คำถาม'}
                            value={field.label}
                            onChange={e => updateField(idx, { label: e.target.value })}
                          />
                        )}
                        {field.type === 'image' && (
                          <ImageUploadField url={field.imageUrl} onChange={imageUrl => updateField(idx, { imageUrl })} />
                        )}
                        {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                          <TextField
                            fullWidth size="small" label="ตัวเลือก (คั่นด้วย ,)"
                            value={(field.options || []).join(', ')}
                            onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          />
                        )}
                        {field.type === 'team_select' && (
                          <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                              ทีมและจำนวนที่รับ — เมื่อทีมใดเต็มแล้ว ผู้ลงทะเบียนจะเลือกทีมนั้นไม่ได้
                            </Typography>
                            {(field.teamOptions || []).map((team, tIdx) => (
                              <Stack key={tIdx} direction="row" spacing={1} alignItems="center">
                                <TextField
                                  size="small" label="ชื่อทีม" sx={{ flex: 1 }}
                                  value={team.label}
                                  onChange={e => updateField(idx, {
                                    teamOptions: (field.teamOptions || []).map((t, i) => i === tIdx ? { ...t, label: e.target.value } : t),
                                  })}
                                />
                                <TextField
                                  size="small" type="number" label="จำนวนที่รับ" sx={{ width: 130 }}
                                  value={team.capacity}
                                  onChange={e => updateField(idx, {
                                    teamOptions: (field.teamOptions || []).map((t, i) => i === tIdx ? { ...t, capacity: parseInt(e.target.value) || 0 } : t),
                                  })}
                                />
                                <IconButton
                                  size="small" color="error"
                                  onClick={() => updateField(idx, { teamOptions: (field.teamOptions || []).filter((_, i) => i !== tIdx) })}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            ))}
                            <Button
                              size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }}
                              onClick={() => updateField(idx, {
                                teamOptions: [...(field.teamOptions || []), { label: `ทีม ${(field.teamOptions?.length || 0) + 1}`, capacity: 10 }],
                              })}
                            >
                              เพิ่มทีม
                            </Button>
                          </Stack>
                        )}
                        {field.type === 'consent' && (() => {
                          const picked = consentDocs.find(d => d.doc_key === field.consentDocKey);
                          return (
                            <Box sx={{ width: '100%' }}>
                              <FormControl size="small" fullWidth>
                                <InputLabel>เอกสารที่ให้ยินยอม</InputLabel>
                                <Select
                                  value={consentDocs.some(d => d.doc_key === field.consentDocKey) ? field.consentDocKey : ''}
                                  label="เอกสารที่ให้ยินยอม"
                                  onChange={e => {
                                    const doc = consentDocs.find(d => d.doc_key === e.target.value);
                                    updateField(idx, {
                                      consentDocKey: e.target.value as string,
                                      // The document already says whether it is
                                      // refusable; carrying that over means the
                                      // rule lives in one place rather than
                                      // being re-decided per form.
                                      ...(doc ? { label: doc.title, required: doc.is_required_default !== 0 } : {}),
                                    });
                                  }}
                                >
                                  {consentDocs.length === 0 && <MenuItem value=""><em>ยังไม่มีเอกสาร — สร้างที่เมนู "เอกสารความยินยอม (PDPA)"</em></MenuItem>}
                                  {consentDocs.map(d => (
                                    <MenuItem key={d.doc_key} value={d.doc_key}>
                                      {d.title} (ฉบับที่ {d.version})
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                              {picked ? (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                  ข้อความข้างช่องติ๊ก: "{picked.summary}" — ผู้กรอกเปิดอ่านฉบับเต็มได้ และระบบจะบันทึกว่ายินยอมกับฉบับที่ {picked.version}
                                </Typography>
                              ) : (
                                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                                  ยังไม่ได้เลือกเอกสาร — ฟิลด์นี้จะไม่แสดงในฟอร์มจนกว่าจะเลือก
                                </Typography>
                              )}
                            </Box>
                          );
                        })()}
                        {field.type === 'family_member_picker' && (
                          <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>ให้เลือกสมาชิกบทบาท</InputLabel>
                            <Select
                              value={field.role || 'child'}
                              label="ให้เลือกสมาชิกบทบาท"
                              onChange={e => updateField(idx, { role: e.target.value as 'adult' | 'child' })}
                            >
                              <MenuItem value="child">เด็ก (เลือกจากสมาชิกในครอบครัวที่มีบทบาทเป็น "ลูก")</MenuItem>
                              <MenuItem value="adult">ผู้ใหญ่ (เลือกได้จากสมาชิกในครอบครัวทุกคนที่ไม่ใช่ "ลูก")</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                        {field.type !== 'heading' && field.type !== 'paragraph' && field.type !== 'image' && (
                          <FormControl size="small" sx={{ minWidth: 280, display: 'block' }}>
                            <InputLabel>ป้องกันการลงทะเบียนซ้ำ</InputLabel>
                            <Select
                              value={field.duplicateCheckScope || 'none'}
                              label="ป้องกันการลงทะเบียนซ้ำ"
                              onChange={e => updateField(idx, { duplicateCheckScope: e.target.value as 'none' | 'course' | 'round' | 'calendar' })}
                            >
                              <MenuItem value="none">ไม่ป้องกัน</MenuItem>
                              {field.type === 'family_member_picker' ? (
                                <MenuItem value="calendar">ห้ามซ้ำ — คนนี้เคยลงทะเบียนในปฏิทินนี้แล้ว (ทุกคลาส/กิจกรรมที่ใช้ปฏิทินเดียวกัน)</MenuItem>
                              ) : [
                                <MenuItem key="course" value="course">ห้ามซ้ำ — ทั้งคลาส/กิจกรรมนี้ (ทุกรอบ)</MenuItem>,
                                <MenuItem key="round" value="round">ห้ามซ้ำ — เฉพาะรอบ/วันเวลาเดียวกัน</MenuItem>,
                              ]}
                            </Select>
                            {field.duplicateCheckScope && field.duplicateCheckScope !== 'none' && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                {field.duplicateCheckScope === 'calendar'
                                  ? 'ตรวจสอบจากชื่อ-นามสกุลจริงของคนที่เลือกในฟิลด์นี้ — จะบล็อกถ้าคนคนนี้เคยลงทะเบียนคลาส/กิจกรรมใดก็ตามที่ใช้ปฏิทินเดียวกันกับคลาสนี้มาแล้ว ไม่ว่าจะบทบาทไหน (พ่อ/แม่/ลูก)'
                                  : 'ตรวจสอบการซ้ำโดยเทียบจากค่าของฟิลด์นี้เป็นหลัก (เช่น ชื่อ-นามสกุลผู้เข้าร่วม)'}
                                {field.duplicateCheckScope === 'course' && ' — จะบล็อกถ้าเคยลงทะเบียนคลาส/กิจกรรมนี้มาแล้ว ไม่ว่าจะรอบไหน'}
                                {field.duplicateCheckScope === 'round' && ' — จะบล็อกเฉพาะตอนลงทะเบียนรอบ/วันเวลาเดียวกันซ้ำเท่านั้น ต่างรอบลงทะเบียนได้ปกติ'}
                              </Typography>
                            )}
                          </FormControl>
                        )}
                      </Stack>
                      <Stack spacing={0.5}>
                        <IconButton size="small" disabled={idx === 0} onClick={() => moveField(idx, -1)}><UpIcon fontSize="small" /></IconButton>
                        <IconButton size="small" disabled={idx === currentPageFields.length - 1} onClick={() => moveField(idx, 1)}><DownIcon fontSize="small" /></IconButton>
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

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained" size="large" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                disabled={saving} onClick={handleSave}
              >
                บันทึกฟอร์ม
              </Button>
              {/* Shows what was last saved, not what is on screen — the
                  preview loads the form from the server. Said in the tooltip
                  rather than left to be discovered by previewing an edit and
                  not finding it. */}
              <Tooltip title={editId
                ? "เปิดดูตัวอย่างฉบับที่บันทึกล่าสุด — กดบันทึกก่อนถ้าเพิ่งแก้"
                : "บันทึกฟอร์มก่อนจึงจะดูตัวอย่างได้"}>
                <span>
                  <Button
                    variant="outlined" size="large" startIcon={<PreviewIcon />}
                    disabled={!editId || saving} onClick={() => editId && openFormPreview(editId)}
                  >
                    ดูตัวอย่าง
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Box>
    );
  }

  // ─── List View ───────────────────────────────────────────────────────────
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>จัดการแบบฟอร์มลงทะเบียน</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={startCreate}>สร้างฟอร์มใหม่</Button>
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>ชื่อฟอร์ม</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>คำอธิบาย</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จำนวนคลาสที่ใช้</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {forms.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">
                <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีแบบฟอร์มลงทะเบียน</Typography>
              </TableCell></TableRow>
            )}
            {forms.map(form => (
              <TableRow key={form.id} hover>
                <TableCell sx={{ fontWeight: 700 }}>{form.name}</TableCell>
                <TableCell>{form.description || '-'}</TableCell>
                <TableCell>
                  <Chip label={form.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'} color={form.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell align="right">{form.course_count}</TableCell>
                <TableCell align="right">
                  <Tooltip title="ดูตัวอย่างแบบฟอร์ม (เปิดแท็บใหม่ ไม่บันทึกอะไร)">
                    <IconButton size="small" onClick={() => openFormPreview(form.id)}><PreviewIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <IconButton size="small" onClick={() => startEdit(form.id)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => setItemToDelete({ id: form.id, name: form.name })}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบแบบฟอร์ม <strong>"{itemToDelete?.name}"</strong> ใช่หรือไม่? คลาสที่เคยใช้ฟอร์มนี้จะไม่มีฟอร์มลงทะเบียนอีกต่อไป</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RegistrationFormManagement;
