import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Button, IconButton, TextField, MenuItem, Select,
  FormControl, InputLabel, Stack, Divider, Alert, Tooltip, CircularProgress,
  ToggleButton, ToggleButtonGroup, Slider,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon,
  Image as ImageIcon, TextFields as TextIcon, DataObject as VarIcon,
  QrCode2 as QrIcon, Print as PrintIcon,
} from '@mui/icons-material';
import { API_URL } from '../config';
import {
  CertField, CERT_VARIABLES, parseFields, ptToPx, fieldText,
} from '../utils/certificateLayout';

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

  const pageRef = useRef<HTMLDivElement>(null);
  const [renderWidth, setRenderWidth] = useState(760);

  const load = async (keepId?: number) => {
    const { data } = await axios.get(`${API_BASE}/certificate-templates`);
    if (!data.success) return;
    setTemplates(data.templates || []);
    const pick = data.templates.find((t: any) => t.id === (keepId ?? activeId)) || data.templates[0];
    if (pick) applyTemplate(pick);
  };

  const applyTemplate = (t: any) => {
    setActiveId(t.id);
    setName(t.name || '');
    setBackground(t.background_url || null);
    setPageW(Number(t.page_width) || 297);
    setPageH(Number(t.page_height) || 210);
    setFields(parseFields(t.fields_json));
    setSelected(null);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const measure = () => {
      const w = pageRef.current?.parentElement?.clientWidth;
      if (w) setRenderWidth(Math.max(320, w - 8));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeId]);

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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'certificates');
      const { data } = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
      if (data.success) setBackground(data.url);
    } finally { setUploading(false); }
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
      if (activeId) await axios.put(`${API_BASE}/certificate-templates/${activeId}`, payload);
      else {
        const { data } = await axios.post(`${API_BASE}/certificate-templates`, payload);
        setActiveId(data.id);
      }
      setNotice('บันทึกแล้ว');
      await load(activeId ?? undefined);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const sampleData = useMemo(
    () => Object.fromEntries(CERT_VARIABLES.map(v => [v.key, v.sample])),
    []
  );

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
          color: f.color || '#172038',
          lineHeight: 1.25,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      >
        {fieldText(f, sampleData, true) || '—'}
      </Box>
    );
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>ออกแบบเกียรติบัตร</Typography>
          <Typography variant="body2" color="text.secondary">
            อัปโหลดพื้นหลัง แล้วลากกล่องไปวางตรงที่ต้องการ · ตัวอักษรที่เห็นเป็นข้อมูลตัวอย่าง
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>แบบเกียรติบัตร</InputLabel>
            <Select
              label="แบบเกียรติบัตร" value={activeId ?? ''}
              onChange={e => { const t = templates.find(x => x.id === Number(e.target.value)); if (t) applyTemplate(t); }}
            >
              {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Button
            variant="outlined" startIcon={<AddIcon />}
            onClick={() => { setActiveId(null); setName('แบบใหม่'); setBackground(null); setFields([]); setSelected(null); }}
          >
            แบบใหม่
          </Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={save} disabled={saving}>
            บันทึก
          </Button>
        </Stack>
      </Stack>

      {notice && <Alert severity={notice === 'บันทึกแล้ว' ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start">
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, flex: 1, minWidth: 0 }}>
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

          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {sel ? 'กล่องที่เลือก' : 'ยังไม่ได้เลือกกล่อง'}
          </Typography>

          {!sel && (
            <Typography variant="body2" color="text.secondary">
              คลิกกล่องบนหน้ากระดาษเพื่อแก้ไข หรือกดปุ่มด้านบนเพื่อเพิ่มกล่องใหม่
            </Typography>
          )}

          {sel && (
            <Stack spacing={1.5}>
              {sel.type === 'field' && (
                <FormControl size="small" fullWidth>
                  <InputLabel>ตัวแปร</InputLabel>
                  <Select label="ตัวแปร" value={sel.value} onChange={e => patch(sel.id, { value: String(e.target.value) })}>
                    {CERT_VARIABLES.map(v => <MenuItem key={v.key} value={v.key}>{v.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
              {sel.type === 'text' && (
                <TextField size="small" label="ข้อความ" fullWidth multiline minRows={2}
                  value={sel.value} onChange={e => patch(sel.id, { value: e.target.value })} />
              )}
              {sel.type === 'image' && (
                <TextField size="small" label="ลิงก์รูป" fullWidth
                  value={sel.value} onChange={e => patch(sel.id, { value: e.target.value })}
                  helperText="อัปโหลดที่คลังรูปแล้ววางลิงก์ที่นี่" />
              )}

              {sel.type !== 'qr' && sel.type !== 'image' && (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>ขนาดอักษร {sel.fontSize} pt</Typography>
                    <Slider size="small" min={8} max={72} value={sel.fontSize || 16}
                      onChange={(_, v) => patch(sel.id, { fontSize: v as number })} />
                  </Box>
                  <ToggleButtonGroup exclusive size="small" fullWidth value={sel.fontWeight || 400}
                    onChange={(_, v) => v && patch(sel.id, { fontWeight: v })}>
                    <ToggleButton value={400}>ปกติ</ToggleButton>
                    <ToggleButton value={600}>กึ่งหนา</ToggleButton>
                    <ToggleButton value={700}>หนา</ToggleButton>
                  </ToggleButtonGroup>
                  <ToggleButtonGroup exclusive size="small" fullWidth value={sel.align || 'center'}
                    onChange={(_, v) => v && patch(sel.id, { align: v })}>
                    <ToggleButton value="left">ซ้าย</ToggleButton>
                    <ToggleButton value="center">กลาง</ToggleButton>
                    <ToggleButton value="right">ขวา</ToggleButton>
                  </ToggleButtonGroup>
                </>
              )}

              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', flex: 1 }}>สี</Typography>
                <input type="color" value={sel.color || '#172038'}
                  onChange={e => patch(sel.id, { color: e.target.value })}
                  style={{ width: 42, height: 30, border: 'none', background: 'none', cursor: 'pointer' }} />
              </Stack>

              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>ความกว้าง {sel.w}%</Typography>
                <Slider size="small" min={5} max={100} value={sel.w}
                  onChange={(_, v) => patch(sel.id, { w: v as number })} />
              </Box>

              <Button size="small" color="error" startIcon={<DeleteIcon />}
                onClick={() => { setFields(fs => fs.filter(f => f.id !== sel.id)); setSelected(null); }}>
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
    </Box>
  );
};

export default CertificateDesigner;
