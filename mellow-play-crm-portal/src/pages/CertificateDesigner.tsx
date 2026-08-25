import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Box, Paper, Typography, Button, IconButton, TextField, MenuItem, Select,
  FormControl, InputLabel, Stack, Divider, Alert, Tooltip, CircularProgress,
  ToggleButton, ToggleButtonGroup, Slider, ListSubheader, Autocomplete,
  FormHelperText, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon,
  Image as ImageIcon, TextFields as TextIcon, DataObject as VarIcon,
  QrCode2 as QrIcon, Print as PrintIcon,
  FormatSize as SizeIcon, FormatBold as WeightIcon, Palette as ColourIcon,
  SwapHoriz as WidthIcon, TextFormat as FontIcon, Computer as MachineIcon,
  CloudDone as OnlineIcon, TouchApp as PickIcon, Tune as StyleIcon,
  FormatAlignLeft as AlignLeftIcon, FormatAlignCenter as AlignCentreIcon,
  FormatAlignRight as AlignRightIcon,
} from '@mui/icons-material';
import { API_URL } from '../config';
import {
  CertField, CertRule, CERT_VARIABLES, FORM_PREFIX,
  parseFields, ptToPx, fieldText,
} from '../utils/certificateLayout';
import CertificatePrintSheet, { PrintableCertificate } from '../components/CertificatePrintSheet';
import RuleEditor from '../components/CertificateRuleEditor';
import CertificateTemplateList from '../components/CertificateTemplateList';
import { useUnsavedChanges } from '../utils/unsavedChanges';
import {
  FontChoice, GOOGLE_FONTS, SYSTEM_FONTS, DEFAULT_FONT,
  fontStack, ensureFontLoaded, queryMachineFonts,
} from '../utils/certificateFonts';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * Laying out a certificate by dragging, rather than by editing a template file.
 *
 * The whole layout is one JSON column, so a change here never needs a deploy —
 * the same reason heat positions and stamp designs are data. Positions are
 * percentages of the page, which is what lets this canvas be any size on screen
 * while the printed sheet comes out identical.
 *
 * Drag mechanics are deliberately the same as HeatCanvas: pointer events, a
 * grab offset, and a commit on release. Two different drag idioms in one CRM is
 * a thing staff have to learn twice.
 */

const uid = () => `f${Math.random().toString(36).slice(2, 9)}`;

/** What each kind of box is called, and what it looks like in the list. */
const FIELD_META: Record<CertField['type'], { label: string; icon: React.ReactNode; tint: string }> = {
  field: { label: 'ช่องตัวแปร', icon: <VarIcon fontSize="small" />, tint: '#efeaff' },
  text: { label: 'ข้อความคงที่', icon: <TextIcon fontSize="small" />, tint: '#e8f4ff' },
  qr: { label: 'QR ตรวจสอบ', icon: <QrIcon fontSize="small" />, tint: '#eaf7ee' },
  image: { label: 'รูป / ลายเซ็น', icon: <ImageIcon fontSize="small" />, tint: '#fff3e3' },
};

/**
 * One labelled group in the inspector.
 *
 * The panel was a single run of controls where a font picker looked exactly
 * like a delete button. Grouping them under quiet headings means the eye can
 * jump to "ตัวอักษร" instead of reading every row to find it.
 */
const Section = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <Box>
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25 }}>
      <Box sx={{ color: 'text.disabled', display: 'flex' }}>{icon}</Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 800, letterSpacing: '.06em', color: 'text.secondary', textTransform: 'uppercase' }}
      >
        {label}
      </Typography>
    </Stack>
    <Stack spacing={1.25}>{children}</Stack>
  </Box>
);

/** A slider's name on the left and its value on the right, so the number
 *  stays in one place instead of moving with the label's length. */
const SliderRow = ({ label, value }: { label: string; value: string }) => (
  <Stack direction="row" alignItems="baseline" justifyContent="space-between">
    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
    <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
  </Stack>
);

const newField = (type: CertField['type']): CertField => ({
  id: uid(),
  type,
  value: type === 'field' ? 'recipient_name' : type === 'text' ? 'ข้อความใหม่' : '',
  x: 30, y: 45, w: 40,
  fontSize: type === 'field' ? 28 : 16,
  fontWeight: type === 'field' ? 700 : 400,
  color: '#172038',
  align: 'center',
});

const CertificateDesigner = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [fields, setFields] = useState<CertField[]>([]);
  const [name, setName] = useState('');
  const [background, setBackground] = useState<string | null>(null);
  const [pageW, setPageW] = useState(297);
  const [pageH, setPageH] = useState(210);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);

  // The raw one on purpose: this is the navigation that happens *after* the
  // question has been answered, so it must not be asked again.
  const rawNavigate = useNavigate();

  const pageRef = useRef<HTMLDivElement>(null);
  const [renderWidth, setRenderWidth] = useState(760);

  // Which registration form's answers this template may print. A template is
  // not owned by one form — it is picked here only so the variable list has
  // real questions in it instead of asking anyone to type a field key.
  const [forms, setForms] = useState<any[]>([]);
  const [formId, setFormId] = useState<number | ''>('');
  const [formFields, setFormFields] = useState<{ key: string; label: string }[]>([]);

  // Preview against a real booking rather than invented samples: the questions
  // that matter — does the longest real name fit, is this date the right one —
  // cannot be answered by a placeholder.
  const [sampleBookings, setSampleBookings] = useState<any[]>([]);
  const [previewBooking, setPreviewBooking] = useState<any | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string> | null>(null);
  const [printing, setPrinting] = useState(false);
  // Separate from the background's upload state: both can be in flight and the
  // spinner has to sit on the one that is actually working.
  const [uploadingField, setUploadingField] = useState(false);
  // Only what this machine has, and only once someone asks — the browser puts
  // a permission prompt in front of it, so it cannot be read on page load.
  const [machineFonts, setMachineFonts] = useState<FontChoice[] | null>(null);
  const [fontNotice, setFontNotice] = useState('');

  // What the template looked like when it was last loaded or saved. Comparing
  // against a snapshot rather than setting a flag on every edit means undoing a
  // change back to where it started counts as clean, which is what someone who
  // just undid it expects.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  // Where they were trying to go, or what they were trying to do, held while
  // the question is on screen.
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
  const [tab, setTab] = useState<'design' | 'list'>('design');

  const load = async (keepId?: number) => {
    const { data } = await axios.get(`${API_BASE}/certificate-templates`, { params: { all: 1 } });
    if (!data.success) return;
    setTemplates(data.templates || []);
    const pick = data.templates.find((t: any) => t.id === (keepId ?? activeId)) || data.templates[0];
    if (pick) applyTemplate(pick);
  };

  const snapshotOf = (v: {
    name: string; background: string | null; pageW: number; pageH: number; fields: CertField[];
  }) => JSON.stringify(v);

  const applyTemplate = (t: any) => {
    const next = {
      name: t.name || '',
      background: t.background_url || null,
      pageW: Number(t.page_width) || 297,
      pageH: Number(t.page_height) || 210,
      fields: parseFields(t.fields_json),
    };
    setActiveId(t.id);
    setName(next.name);
    setBackground(next.background);
    setPageW(next.pageW);
    setPageH(next.pageH);
    setFields(next.fields);
    setSelected(null);
    setSavedSnapshot(snapshotOf(next));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/registration-forms`)
      .then(({ data }) => setForms(data.forms || data.registrationForms || []))
      .catch(() => { /* the built-in variables still work without a form */ });
    axios.get(`${API_BASE}/certificates/sample-bookings`)
      .then(({ data }) => setSampleBookings(data.bookings || []))
      .catch(() => { /* fall back to the sample values */ });
  }, []);

  // The chosen form's questions, as variables.
  useEffect(() => {
    if (!formId) { setFormFields([]); return; }
    axios.get(`${API_BASE}/registration-forms/${formId}`)
      .then(({ data }) => {
        const raw = data.form?.fields || data.fields || [];
        setFormFields(
          raw
            // Headings and images carry no answer, so they are not variables.
            .filter((f: any) => !['heading', 'paragraph', 'image'].includes(f.type))
            .map((f: any) => ({ key: `${FORM_PREFIX}${f.field_key}`, label: f.label || f.field_key }))
        );
      })
      .catch(() => setFormFields([]));
  }, [formId]);

  // Real values for the chosen booking, from the same resolver the issuer uses.
  useEffect(() => {
    if (!previewBooking) { setPreviewValues(null); return; }
    axios.get(`${API_BASE}/certificates/preview/${previewBooking.id}`)
      .then(({ data }) => setPreviewValues(data.success ? data.values : null))
      .catch(() => setPreviewValues(null));
  }, [previewBooking]);

  useEffect(() => {
    const measure = () => {
      const w = pageRef.current?.parentElement?.clientWidth;
      if (w) setRenderWidth(Math.max(320, w - 8));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeId]);

  const currentSnapshot = snapshotOf({ name, background, pageW, pageH, fields });
  const dirty = savedSnapshot !== '' && currentSnapshot !== savedSnapshot;

  const askBeforeLeaving = useCallback((to: any) => {
    setPending({ label: 'ออกจากหน้านี้', run: () => rawNavigate(to) });
  }, [rawNavigate]);

  useUnsavedChanges(dirty, askBeforeLeaving);

  /** Runs the action now if nothing would be lost, or asks first if it would. */
  const guarded = (label: string, action: () => void) => () => {
    if (!dirty) { action(); return; }
    setPending({ label, run: action });
  };

  const startNewTemplate = () => {
    const blank = { name: 'แบบใหม่', background: null as string | null, pageW: 297, pageH: 210, fields: [] as CertField[] };
    setActiveId(null);
    setName(blank.name);
    setBackground(blank.background);
    setPageW(blank.pageW);
    setPageH(blank.pageH);
    setFields(blank.fields);
    setSelected(null);
    setSavedSnapshot(snapshotOf(blank));
  };

  useEffect(() => {
    for (const f of fields) ensureFontLoaded(f.fontFamily);
  }, [fields]);

  const height = renderWidth * (pageH / pageW);
  const sel = fields.find(f => f.id === selected) || null;

  const patch = (id: string, next: Partial<CertField>) =>
    setFields(fs => fs.map(f => (f.id === id ? { ...f, ...next } : f)));

  // Percentages come straight out of the pointer position, so what is dragged
  // is what is stored — no conversion that has to agree in two places.
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100 - dragging.dx;
    const y = ((e.clientY - rect.top) / rect.height) * 100 - dragging.dy;
    patch(dragging.id, {
      x: Math.round(Math.max(-5, Math.min(100, x)) * 10) / 10,
      y: Math.round(Math.max(-5, Math.min(100, y)) * 10) / 10,
    });
  };

  const uploadBackground = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) setBackground(url);
      else setNotice('อัปโหลดพื้นหลังไม่สำเร็จ');
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'อัปโหลดพื้นหลังไม่สำเร็จ');
    } finally { setUploading(false); }
  };

  /** Uploads and returns the URL, or null. Shared by the background and by
   *  the image boxes, so there is one upload path rather than two. */
  const uploadImage = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'certificates');
    const { data } = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
    return data.success ? String(data.url) : null;
  };

  const uploadFieldImage = async (id: string, file?: File) => {
    if (!file) return;
    setUploadingField(true);
    try {
      const url = await uploadImage(file);
      if (url) patch(id, { value: url });
      else setNotice('อัปโหลดรูปไม่สำเร็จ');
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'อัปโหลดรูปไม่สำเร็จ');
    } finally { setUploadingField(false); }
  };

  const save = async () => {
    setSaving(true);
    setNotice('');
    try {
      const payload = {
        name: name.trim() || 'เกียรติบัตร',
        background_url: background,
        page_width: pageW, page_height: pageH,
        fields_json: JSON.stringify(fields),
      };
      // Held in a local, not read back off state: setActiveId has not landed
      // by the time load() runs, so reloading by the state value would fail to
      // find the template just created and quietly show a different one — which
      // reads as the work having been lost.
      let savedId = activeId;
      if (activeId) await axios.put(`${API_BASE}/certificate-templates/${activeId}`, payload);
      else {
        const { data } = await axios.post(`${API_BASE}/certificate-templates`, payload);
        savedId = Number(data.id);
        setActiveId(savedId);
      }
      setNotice('บันทึกแล้ว');
      setSavedSnapshot(currentSnapshot);
      await load(savedId ?? undefined);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  /** Everything the designer offers: built-ins, then the chosen form's own questions. */
  const allVariables = useMemo(
    () => [...CERT_VARIABLES.map(v => ({ key: v.key, label: v.label })), ...formFields],
    [formFields]
  );

  /**
   * What the canvas prints. A real booking when one is chosen, invented samples
   * otherwise — and sample-filling is off for a real booking on purpose: a blank
   * means that family genuinely did not answer, which is exactly what the
   * designer needs to see before the sheet is printed.
   */
  const previewData = useMemo(
    () => previewValues ?? Object.fromEntries(CERT_VARIABLES.map(v => [v.key, v.sample])),
    [previewValues]
  );
  const usingReal = !!previewValues;

  const printItems: PrintableCertificate[] = useMemo(() => [{
    id: 'preview',
    template: { background_url: background, page_width: pageW, page_height: pageH, fields_json: JSON.stringify(fields) },
    values: previewData,
  }], [background, pageW, pageH, fields, previewData]);

  /**
   * Print what is on the canvas, without issuing anything.
   *
   * A preview must never create a certificate: issuing is what assigns a serial
   * number, and there is no taking that back from a print dialog.
   */
  const printPreview = () => {
    setPrinting(true);
    // One frame, so the print-only sheet is in the DOM before the dialog opens.
    requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
  };

  const patchRules = (id: string, rules: CertRule[]) => patch(id, { rules });

  const renderField = (f: CertField) => {
    const isSel = f.id === selected;
    const common: React.CSSProperties = {
      position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`,
      textAlign: f.align || 'center', cursor: 'move',
      outline: isSel ? '2px solid #5b3fd1' : '1px dashed rgba(91,63,209,.28)',
      outlineOffset: 2, borderRadius: 2,
    };
    const start = (e: React.PointerEvent) => {
      e.stopPropagation();
      const rect = pageRef.current!.getBoundingClientRect();
      setSelected(f.id);
      setDragging({
        id: f.id,
        dx: ((e.clientX - rect.left) / rect.width) * 100 - f.x,
        dy: ((e.clientY - rect.top) / rect.height) * 100 - f.y,
      });
    };

    if (f.type === 'qr') {
      // A placeholder square, not a real QR. At design time the only questions
      // are where it sits and how big it is; generating a scannable code that
      // points at a certificate which does not exist yet would be theatre, and
      // a QR library the designer does not need.
      const px = Math.max(36, (f.w / 100) * renderWidth);
      return (
        <Box key={f.id} onPointerDown={start} sx={{ ...common, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{
            width: px, height: px, border: '2px solid', borderColor: f.color || '#172038',
            borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.max(9, px / 5), fontWeight: 800, color: f.color || '#172038',
            backgroundImage: 'repeating-linear-gradient(45deg, rgba(23,32,56,.06) 0 4px, transparent 4px 8px)',
          }}>
            QR
          </Box>
        </Box>
      );
    }
    if (f.type === 'image') {
      return (
        <Box key={f.id} onPointerDown={start} sx={{ ...common, minHeight: 24 }}>
          {f.value
            ? <img src={f.value} alt="" style={{ width: '100%', display: 'block' }} />
            : <Typography variant="caption" sx={{ color: 'text.disabled' }}>ยังไม่ได้เลือกรูป</Typography>}
        </Box>
      );
    }
    return (
      <Box
        key={f.id}
        onPointerDown={start}
        sx={{
          ...common,
          fontSize: `${ptToPx(f.fontSize || 16, pageW, renderWidth)}px`,
          fontWeight: f.fontWeight || 400,
          fontFamily: fontStack(f.fontFamily),
          color: f.color || '#172038',
          lineHeight: 1.25,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      >
        {fieldText(f, previewData, !usingReal) || '—'}
      </Box>
    );
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>ออกแบบเกียรติบัตร</Typography>
          <Typography variant="body2" color="text.secondary">
            อัปโหลดพื้นหลัง แล้วลากกล่องไปวางตรงที่ต้องการ ·{' '}
            {usingReal ? 'กำลังแสดงข้อมูลจริงจากการจองที่เลือก' : 'ตัวอักษรที่เห็นเป็นข้อมูลตัวอย่าง'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>แบบเกียรติบัตร</InputLabel>
            <Select
              label="แบบเกียรติบัตร" value={activeId ?? ''}
              onChange={e => {
                const t = templates.find(x => x.id === Number(e.target.value));
                if (t) guarded('เปลี่ยนไปแบบอื่น', () => applyTemplate(t))();
              }}
            >
              {templates.filter(t => t.is_active || t.id === activeId).map(t => (
                <MenuItem key={t.id} value={t.id}>{t.name}{t.is_active ? '' : ' (ปิดใช้งาน)'}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined" startIcon={<AddIcon />}
            onClick={guarded('เริ่มแบบใหม่', startNewTemplate)}
          >
            แบบใหม่
          </Button>
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={printPreview} disabled={printing}>
            พิมพ์ตัวอย่าง
          </Button>
          <Button
            variant="contained" color={dirty ? 'warning' : 'primary'}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={save} disabled={saving}
          >
            {dirty ? 'บันทึก (ยังไม่ได้บันทึก)' : 'บันทึก'}
          </Button>
        </Stack>
      </Stack>

      {notice && <Alert severity={notice === 'บันทึกแล้ว' ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 40 }}>
        <Tab value="design" label="ออกแบบ" sx={{ minHeight: 40, fontWeight: 700 }} />
        <Tab value="list" label={`รายการแบบ (${templates.length})`} sx={{ minHeight: 40, fontWeight: 700 }} />
      </Tabs>

      {tab === 'list' && (
        <CertificateTemplateList
          templates={templates as any}
          onEdit={t => { const full = templates.find(x => x.id === t.id); if (full) { applyTemplate(full); setTab('design'); } }}
          onNew={() => { startNewTemplate(); setTab('design'); }}
          onChanged={() => load(activeId ?? undefined)}
        />
      )}

      <Stack
        direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start"
        sx={{ display: tab === 'design' ? 'flex' : 'none' }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, flex: 1, minWidth: 0 }}>
          {/* Preview source. Sitting above the page rather than in the sidebar
              because it changes what the whole page says, not one box. */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
            <Autocomplete
              size="small" fullWidth options={sampleBookings} value={previewBooking}
              onChange={(_, v) => setPreviewBooking(v)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              getOptionLabel={(o: any) => `#${o.id} ${o.who || ''} — ${o.course_name || ''}`.trim()}
              renderInput={params => (
                <TextField {...params} label="ดูตัวอย่างด้วยข้อมูลจริงจากการจอง"
                  placeholder="ค้นหาชื่อ หรือหมายเลขการจอง" />
              )}
              renderOption={(props, o: any) => (
                <li {...props} key={o.id}>
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>#{o.id} {o.who || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {o.course_name || ''}{o.form_submission_id ? ' · มีคำตอบจากฟอร์ม' : ' · ไม่มีคำตอบจากฟอร์ม'}
                    </Typography>
                  </Stack>
                </li>
              )}
            />
            <FormControl size="small" sx={{ minWidth: { sm: 240 } }}>
              <InputLabel>ตัวแปรจากฟอร์มลงทะเบียน</InputLabel>
              <Select
                label="ตัวแปรจากฟอร์มลงทะเบียน" value={formId}
                onChange={e => setFormId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">ไม่ใช้คำตอบจากฟอร์ม</MenuItem>
                {forms.map((f: any) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            <Button size="small" startIcon={<VarIcon />} onClick={() => setFields(f => [...f, newField('field')])}>ช่องตัวแปร</Button>
            <Button size="small" startIcon={<TextIcon />} onClick={() => setFields(f => [...f, newField('text')])}>ข้อความ</Button>
            <Button size="small" startIcon={<QrIcon />} onClick={() => setFields(f => [...f, { ...newField('qr'), w: 12, x: 82, y: 78 }])}>QR ตรวจสอบ</Button>
            <Button size="small" startIcon={<ImageIcon />} onClick={() => setFields(f => [...f, { ...newField('image'), w: 20 }])}>รูป/ลายเซ็น</Button>
          </Stack>

          {/* The page. Dropping the pointer anywhere on it also deselects, so
              there is always a way out of a selection without hunting. */}
          <Box
            ref={pageRef}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
            onPointerDown={() => setSelected(null)}
            sx={{
              position: 'relative', width: renderWidth, height, mx: 'auto',
              bgcolor: '#fff', border: '1px solid #e4e6f0', borderRadius: 1,
              backgroundImage: background ? `url(${background})` : undefined,
              backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat',
              touchAction: 'none', overflow: 'hidden',
            }}
          >
            {fields.map(renderField)}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, width: { xs: '100%', lg: 320 }, flexShrink: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5 }}>ตั้งค่าแบบ</Typography>
          <Stack spacing={1.5}>
            <TextField size="small" label="ชื่อแบบ" fullWidth value={name} onChange={e => setName(e.target.value)} />
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="กว้าง (มม.)" type="number" value={pageW} onChange={e => setPageW(Number(e.target.value) || 297)} />
              <TextField size="small" label="สูง (มม.)" type="number" value={pageH} onChange={e => setPageH(Number(e.target.value) || 210)} />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <label htmlFor="cert-bg" style={{ flex: 1 }}>
                <input id="cert-bg" type="file" accept="image/*" hidden onChange={e => uploadBackground(e.target.files?.[0])} />
                <Button component="span" size="small" variant="outlined" fullWidth startIcon={uploading ? <CircularProgress size={14} /> : <ImageIcon />}>
                  {background ? 'เปลี่ยนพื้นหลัง' : 'อัปโหลดพื้นหลัง'}
                </Button>
              </label>
              {background && (
                <Tooltip title="เอาพื้นหลังออก">
                  <IconButton size="small" color="error" onClick={() => setBackground(null)}><DeleteIcon fontSize="small" /></IconButton>
                </Tooltip>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              พื้นหลังจะถูกยืดให้พอดีกับขนาดกระดาษ — ไฟล์ควรมีสัดส่วนเดียวกัน
            </Typography>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {sel ? (
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
              <Box sx={{
                width: 34, height: 34, borderRadius: 2, flexShrink: 0,
                bgcolor: FIELD_META[sel.type].tint, color: '#4b3aa8',
                display: 'grid', placeItems: 'center',
              }}>
                {FIELD_META[sel.type].icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  {FIELD_META[sel.type].label}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {fieldText(sel, previewData, !usingReal) || 'ยังไม่มีข้อความ'}
                </Typography>
              </Box>
            </Stack>
          ) : (
            <Stack alignItems="center" spacing={1} sx={{ py: 3, textAlign: 'center' }}>
              <PickIcon sx={{ fontSize: 30, color: 'text.disabled' }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>เลือกกล่องเพื่อแก้ไข</Typography>
              <Typography variant="caption" color="text.secondary">
                คลิกกล่องบนหน้ากระดาษ หรือกดปุ่มด้านบนเพื่อเพิ่มกล่องใหม่
              </Typography>
            </Stack>
          )}

          {sel && (
            <Stack spacing={2.5}>
              {sel.type === 'field' && (
                <Section icon={<VarIcon fontSize="small" />} label="เนื้อหา">
                  <FormControl size="small" fullWidth>
                    <InputLabel>ตัวแปร</InputLabel>
                    <Select label="ตัวแปร" value={sel.value} onChange={e => patch(sel.id, { value: String(e.target.value) })}>
                      <ListSubheader>ข้อมูลพื้นฐาน</ListSubheader>
                      {CERT_VARIABLES.map(v => <MenuItem key={v.key} value={v.key}>{v.label}</MenuItem>)}
                      {formFields.length > 0 && <ListSubheader>คำตอบจากฟอร์มลงทะเบียน</ListSubheader>}
                      {formFields.map(v => <MenuItem key={v.key} value={v.key}>{v.label}</MenuItem>)}
                      {/* A key from a form that is not the one being browsed
                          right now must still survive being re-selected. */}
                      {sel.value.startsWith(FORM_PREFIX) && !formFields.some(v => v.key === sel.value) && (
                        <MenuItem value={sel.value}>{sel.value.slice(FORM_PREFIX.length)} (จากฟอร์มอื่น)</MenuItem>
                      )}
                    </Select>
                  </FormControl>

                  <RuleEditor
                    field={sel}
                    variables={allVariables}
                    values={previewData}
                    onChange={rules => patchRules(sel.id, rules)}
                  />
                </Section>
              )}
              {sel.type === 'text' && (
                <Section icon={<TextIcon fontSize="small" />} label="เนื้อหา">
                  <TextField
                    size="small" label="ข้อความ" fullWidth multiline minRows={2}
                    value={sel.value} onChange={e => patch(sel.id, { value: e.target.value })}
                    helperText="แทรกตัวแปรได้ด้วย {{ชื่อตัวแปร}} เช่น ขอมอบให้ {{recipient_name}}"
                  />
                </Section>
              )}
              {sel.type === 'qr' && (
                <Section icon={<QrIcon fontSize="small" />} label="เนื้อหา">
                  <Typography variant="caption" color="text.secondary">
                    QR จะชี้ไปหน้าตรวจสอบของใบนั้น ๆ ตอนออกจริง — ในหน้านี้แสดงเป็นกรอบตัวอย่างไว้จัดตำแหน่ง
                  </Typography>
                </Section>
              )}
              {sel.type === 'image' && (
                <Section icon={<ImageIcon fontSize="small" />} label="รูป">
                  {sel.value && (
                    <Box sx={{
                      p: 1, border: '1px solid #e4e6f0', borderRadius: 2,
                      display: 'flex', justifyContent: 'center',
                      // A signature on white artwork is invisible on a white
                      // swatch — the chequerboard shows what is transparent.
                      backgroundImage: 'repeating-conic-gradient(#f4f5f9 0% 25%, #fff 0% 50%)',
                      backgroundSize: '14px 14px',
                    }}>
                      <img src={sel.value} alt="" style={{ maxWidth: '100%', maxHeight: 110, display: 'block' }} />
                    </Box>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center">
                    <label htmlFor={`cert-img-${sel.id}`} style={{ flex: 1 }}>
                      <input
                        id={`cert-img-${sel.id}`} type="file" accept="image/*" hidden
                        onChange={e => { void uploadFieldImage(sel.id, e.target.files?.[0]); e.target.value = ''; }}
                      />
                      <Button
                        component="span" size="small" variant="outlined" fullWidth
                        startIcon={uploadingField ? <CircularProgress size={14} /> : <ImageIcon />}
                      >
                        {sel.value ? 'เปลี่ยนรูป' : 'อัปโหลดรูป / ลายเซ็น'}
                      </Button>
                    </label>
                    {sel.value && (
                      <Tooltip title="เอารูปออก">
                        <IconButton size="small" color="error" onClick={() => patch(sel.id, { value: '' })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  <TextField
                    size="small" label="หรือวางลิงก์รูป" fullWidth
                    value={sel.value} onChange={e => patch(sel.id, { value: e.target.value })}
                    helperText="ไฟล์ PNG พื้นหลังโปร่งใสจะวางบนลายเกียรติบัตรได้สวยที่สุด"
                  />
                </Section>
              )}

              {sel.type !== 'qr' && sel.type !== 'image' && (
                <Section icon={<FontIcon fontSize="small" />} label="ตัวอักษร">
                  <FormControl size="small" fullWidth>
                    <InputLabel>ฟอนต์</InputLabel>
                    <Select
                      label="ฟอนต์"
                      value={sel.fontFamily || DEFAULT_FONT}
                      onChange={e => { const v = String(e.target.value); ensureFontLoaded(v); patch(sel.id, { fontFamily: v }); }}
                      renderValue={v => <span style={{ fontFamily: fontStack(String(v)) }}>{String(v)}</span>}
                    >
                      <ListSubheader>ฟอนต์ออนไลน์ (เห็นเหมือนกันทุกเครื่อง)</ListSubheader>
                      {GOOGLE_FONTS.map(f => (
                        <MenuItem key={f.name} value={f.name} onMouseEnter={() => ensureFontLoaded(f.name)}>
                          <span style={{ fontFamily: fontStack(f.name) }}>{f.label}</span>
                        </MenuItem>
                      ))}
                      <ListSubheader>ฟอนต์ในเครื่อง</ListSubheader>
                      {(machineFonts ?? SYSTEM_FONTS).map(f => (
                        <MenuItem key={f.name} value={f.name}>
                          <span style={{ fontFamily: fontStack(f.name) }}>{f.label}</span>
                        </MenuItem>
                      ))}
                      {/* A font chosen on another machine must survive being
                          re-opened on one that does not have it. */}
                      {sel.fontFamily
                        && !GOOGLE_FONTS.some(f => f.name === sel.fontFamily)
                        && !(machineFonts ?? SYSTEM_FONTS).some(f => f.name === sel.fontFamily) && (
                        <MenuItem value={sel.fontFamily}>{sel.fontFamily} (ไม่มีในเครื่องนี้)</MenuItem>
                      )}
                    </Select>
                  </FormControl>

                  {/* Says which kind is selected, because the failure is
                      silent: a machine font prints correctly here and reaches
                      a parent's phone as something else entirely. */}
                  <Stack direction="row" spacing={0.75} alignItems="flex-start">
                    {GOOGLE_FONTS.some(f => f.name === (sel.fontFamily || DEFAULT_FONT))
                      ? <OnlineIcon sx={{ fontSize: 15, color: 'success.main', mt: '2px' }} />
                      : <MachineIcon sx={{ fontSize: 15, color: 'warning.main', mt: '2px' }} />}
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                      {GOOGLE_FONTS.some(f => f.name === (sel.fontFamily || DEFAULT_FONT))
                        ? 'ฟอนต์ออนไลน์ — ใบที่พิมพ์และที่ผู้ปกครองเปิดดูจะเหมือนกัน'
                        : 'ฟอนต์ในเครื่อง — เครื่องที่สั่งพิมพ์ต้องมีฟอนต์นี้ด้วย ไม่งั้นจะเปลี่ยนเป็นฟอนต์อื่นเอง'}
                    </Typography>
                  </Stack>

                  <Button
                    size="small" variant="outlined" startIcon={<MachineIcon />}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                    onClick={async () => {
                      const list = await queryMachineFonts();
                      if (list.length === 0) {
                        setFontNotice('เบราว์เซอร์นี้ไม่ยอมให้อ่านรายชื่อฟอนต์ (ใช้ Chrome แล้วกดอนุญาต) — เลือกจากรายการที่มีให้ได้');
                        return;
                      }
                      setMachineFonts(list);
                      setFontNotice(`พบฟอนต์ในเครื่องนี้ ${list.length} แบบ`);
                    }}
                  >
                    ดึงฟอนต์จากเครื่องนี้
                  </Button>
                  {fontNotice && (
                    <Typography variant="caption" color="text.secondary">{fontNotice}</Typography>
                  )}

                  <Box>
                    <SliderRow label="ขนาด" value={`${sel.fontSize || 16} pt`} />
                    <Slider size="small" min={8} max={72} value={sel.fontSize || 16}
                      onChange={(_, v) => patch(sel.id, { fontSize: v as number })} />
                  </Box>

                  {/* Each button is set in the weight it applies, so the choice
                      is shown rather than described. */}
                  <ToggleButtonGroup exclusive size="small" fullWidth value={sel.fontWeight || 400}
                    onChange={(_, v) => v && patch(sel.id, { fontWeight: v })}
                    sx={{ '& .MuiToggleButton-root': { borderRadius: 2, py: 0.6 } }}>
                    <ToggleButton value={400} sx={{ fontWeight: 400 }}>ปกติ</ToggleButton>
                    <ToggleButton value={600} sx={{ fontWeight: 600 }}>กึ่งหนา</ToggleButton>
                    <ToggleButton value={700} sx={{ fontWeight: 800 }}>หนา</ToggleButton>
                  </ToggleButtonGroup>
                </Section>
              )}

              <Section icon={<StyleIcon fontSize="small" />} label="การจัดวาง">
                {sel.type !== 'qr' && sel.type !== 'image' && (
                  <ToggleButtonGroup exclusive size="small" fullWidth value={sel.align || 'center'}
                    onChange={(_, v) => v && patch(sel.id, { align: v })}
                    sx={{ '& .MuiToggleButton-root': { borderRadius: 2, py: 0.6 } }}>
                    <ToggleButton value="left" aria-label="ชิดซ้าย"><AlignLeftIcon fontSize="small" /></ToggleButton>
                    <ToggleButton value="center" aria-label="กึ่งกลาง"><AlignCentreIcon fontSize="small" /></ToggleButton>
                    <ToggleButton value="right" aria-label="ชิดขวา"><AlignRightIcon fontSize="small" /></ToggleButton>
                  </ToggleButtonGroup>
                )}

                <Box>
                  <SliderRow label="ความกว้างของกล่อง" value={`${sel.w}%`} />
                  <Slider size="small" min={5} max={100} value={sel.w}
                    onChange={(_, v) => patch(sel.id, { w: v as number })} />
                </Box>

                {/* A swatch that reads as pressable, with the hex beside it —
                    the bare colour input looked like a coloured rectangle
                    somebody had left on the page. */}
                {sel.type !== 'image' && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <ColourIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', flex: 1 }}>
                    {sel.type === 'qr' ? 'สี QR' : 'สีตัวอักษร'}
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {(sel.color || '#172038').toUpperCase()}
                  </Typography>
                  <Box
                    component="label"
                    sx={{
                      width: 34, height: 26, borderRadius: 1.5, cursor: 'pointer', flexShrink: 0,
                      bgcolor: sel.color || '#172038',
                      border: '2px solid #fff', boxShadow: '0 0 0 1px #d9dbe6',
                    }}
                  >
                    <input type="color" value={sel.color || '#172038'}
                      onChange={e => patch(sel.id, { color: e.target.value })}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                  </Box>
                </Stack>
                )}
              </Section>

              <Divider />

              <Button
                size="small" color="error" variant="outlined" startIcon={<DeleteIcon />}
                sx={{ borderRadius: 2, fontWeight: 700 }}
                onClick={() => { setFields(fs => fs.filter(f => f.id !== sel.id)); setSelected(null); }}
              >
                ลบกล่องนี้
              </Button>
            </Stack>
          )}

          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <PrintIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            <Typography variant="caption" color="text.secondary">
              ใบจริงพิมพ์จากหน้าเกียรติบัตรของแต่ละคน ตัวอักษรจะคมกว่านี้เพราะพิมพ์เป็นเวกเตอร์
            </Typography>
          </Stack>
        </Paper>
      </Stack>

      {/* Hidden on screen; the print stylesheet inside it hides everything else
          when the dialog opens. Same component the booking list prints with. */}
      <CertificatePrintSheet items={printItems} />

      {/* Asked only for moves inside the CRM. Refreshing or closing the tab is
          the browser's own prompt — no site has been allowed to word that one
          for years. */}
      <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>ยังไม่ได้บันทึกการแก้ไข</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            การแก้ไขแบบเกียรติบัตรนี้ยังไม่ถูกบันทึก ถ้า{pending?.label}ตอนนี้ สิ่งที่แก้ไว้จะหายไป
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>อยู่หน้านี้ต่อ</Button>
          <Button
            color="error"
            onClick={() => { const run = pending?.run; setSavedSnapshot(currentSnapshot); setPending(null); run?.(); }}
          >
            ไม่บันทึก
          </Button>
          <Button
            variant="contained" disabled={saving}
            onClick={async () => { const run = pending?.run; await save(); setPending(null); run?.(); }}
          >
            บันทึกแล้วไปต่อ
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CertificateDesigner;
