import React from 'react';
import {
  Box, Paper, Stack, Typography, TextField, Switch, FormControlLabel,
  IconButton, Button, Divider, Alert, InputAdornment, MenuItem,
} from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';

export interface ParticipantDetail { label: string; price?: number }
export interface ParticipantOption {
  key: string;
  label: string;
  price?: number;
  priceFrom2?: number;
  disabledOnFirst?: boolean;
  disabledOnFirstNote?: string;
  detail?: ParticipantDetail[];
}
/** A question asked about each person, on top of their name. */
export interface PersonField {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'tel' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface ParticipantConfig {
  itemLabel?: string;
  addLabel?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  choiceLabel?: string;
  min?: number;
  max?: number;
  firstMustChooseNote?: string;
  options?: ParticipantOption[];
  personFields?: PersonField[];
}

const PERSON_FIELD_TYPES: { value: NonNullable<PersonField['type']>; label: string }[] = [
  { value: 'text', label: 'ข้อความ' },
  { value: 'date', label: 'วันที่' },
  { value: 'number', label: 'ตัวเลข' },
  { value: 'tel', label: 'เบอร์โทร' },
  { value: 'select', label: 'ตัวเลือก' },
];

interface Props {
  config: ParticipantConfig;
  onChange: (next: ParticipantConfig) => void;
}

const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * The prices on a "add people one at a time" field.
 *
 * These used to be reachable only by hand-editing config_json, which meant a
 * price change needed someone who could write SQL. Everything a price depends
 * on is here: what the first person pays, what everyone after pays, and which
 * option the first person is not allowed to take.
 */
const ParticipantPricingEditor: React.FC<Props> = ({ config, onChange }) => {
  const options = config.options || [];

  const patch = (next: Partial<ParticipantConfig>) => onChange({ ...config, ...next });
  const patchOption = (i: number, next: Partial<ParticipantOption>) =>
    patch({ options: options.map((o, j) => (j === i ? { ...o, ...next } : o)) });

  const addOption = () => patch({
    options: [...options, { key: `opt_${Date.now().toString(36)}`, label: 'ตัวเลือกใหม่', price: 0 }],
  });
  const removeOption = (i: number) => patch({ options: options.filter((_, j) => j !== i) });

  const patchDetail = (oi: number, di: number, next: Partial<ParticipantDetail>) =>
    patchOption(oi, { detail: (options[oi].detail || []).map((d, j) => (j === di ? { ...d, ...next } : d)) });
  const addDetail = (oi: number) =>
    patchOption(oi, { detail: [...(options[oi].detail || []), { label: '', price: undefined }] });
  const removeDetail = (oi: number, di: number) =>
    patchOption(oi, { detail: (options[oi].detail || []).filter((_, j) => j !== di) });

  // ── the questions asked about each person ──
  const personFields = config.personFields || [];
  const patchPerson = (i: number, next: Partial<PersonField>) =>
    patch({ personFields: personFields.map((pf, j) => (j === i ? { ...pf, ...next } : pf)) });
  // The key is generated and never edited: it is what already-collected
  // answers are filed under, so letting it be retyped would orphan them.
  const addPerson = () => patch({
    personFields: [...personFields, { key: `pf_${Date.now().toString(36)}`, label: '', type: 'text' }],
  });
  const removePerson = (i: number) => patch({ personFields: personFields.filter((_, j) => j !== i) });

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small" label="เรียกผู้เข้าร่วมว่า" value={config.itemLabel ?? ''}
          onChange={e => patch({ itemLabel: e.target.value })}
          placeholder="เด็ก" sx={{ maxWidth: 180 }}
        />
        <TextField
          size="small" label="หัวข้อช่องชื่อ" value={config.nameLabel ?? ''}
          onChange={e => patch({ nameLabel: e.target.value })}
          placeholder={config.namePlaceholder || 'ชื่อ-นามสกุล'}
          helperText="ต่อท้ายด้วย คนที่ 1, 2, … เอง"
          sx={{ maxWidth: 220 }}
        />
        <TextField
          size="small" type="number" label="อย่างน้อย" value={config.min ?? ''}
          onChange={e => patch({ min: num(e.target.value) })} sx={{ maxWidth: 110 }}
        />
        <TextField
          size="small" type="number" label="สูงสุด" value={config.max ?? ''}
          onChange={e => patch({ max: num(e.target.value) })} sx={{ maxWidth: 110 }}
        />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, mb: 2 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, display: 'block' }}>
          ข้อมูลที่ถามแต่ละคน
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          ช่องชื่อมีอยู่แล้วทุกคน ตรงนี้คือสิ่งที่อยากถามเพิ่ม เช่น ชื่อเล่น หรือวันเกิด —
          ถามแยกรายคน ไม่มีผลกับราคา
        </Typography>

        <Stack spacing={1.5}>
          {personFields.map((pf, i) => (
            <Box key={pf.key || i}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  size="small" fullWidth label="คำถาม" value={pf.label}
                  onChange={e => patchPerson(i, { label: e.target.value })}
                  placeholder="เช่น ชื่อเล่น"
                />
                <TextField
                  size="small" select label="ชนิด" value={pf.type || 'text'}
                  onChange={e => patchPerson(i, { type: e.target.value as PersonField['type'] })}
                  sx={{ minWidth: 130 }}
                >
                  {PERSON_FIELD_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <IconButton size="small" onClick={() => removePerson(i)} title="ลบคำถามนี้">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>

              {pf.type === 'select' && (
                <TextField
                  size="small" fullWidth sx={{ mt: 1 }}
                  label="ตัวเลือก (คั่นด้วยจุลภาค)"
                  value={(pf.options || []).join(', ')}
                  onChange={e => patchPerson(i, {
                    options: e.target.value.split(',').map(v => v.trim()).filter(Boolean),
                  })}
                  placeholder="S, M, L"
                />
              )}

              <FormControlLabel
                sx={{ mt: 0.5 }}
                control={
                  <Switch
                    size="small" checked={!!pf.required}
                    onChange={e => patchPerson(i, { required: e.target.checked })}
                  />
                }
                label={<Typography variant="caption">จำเป็นต้องกรอก</Typography>}
              />
            </Box>
          ))}
        </Stack>

        <Button size="small" startIcon={<AddIcon />} onClick={addPerson} sx={{ mt: 1, fontWeight: 700 }}>
          เพิ่มคำถามรายคน
        </Button>

        {personFields.some(pf => !String(pf.label || '').trim()) && (
          <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2 }}>
            คำถามที่ยังไม่ได้ตั้งชื่อจะไม่ถูกแสดงในฟอร์ม
          </Alert>
        )}
      </Paper>

      <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 1 }}>
        ตัวเลือกและราคา
      </Typography>

      <Stack spacing={1.5}>
        {options.map((option, i) => (
          <Paper key={option.key || i} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
            <Stack direction="row" alignItems="flex-start" gap={1}>
              <TextField
                size="small" fullWidth label="ชื่อตัวเลือก" value={option.label}
                onChange={e => patchOption(i, { label: e.target.value })}
              />
              <IconButton size="small" onClick={() => removeOption(i)} title="ลบตัวเลือกนี้">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
              <TextField
                size="small" type="number" label="ราคาคนแรก" value={option.price ?? ''}
                onChange={e => patchOption(i, { price: num(e.target.value) })}
                InputProps={{ endAdornment: <InputAdornment position="end">฿</InputAdornment> }}
                sx={{ maxWidth: 160 }}
              />
              <TextField
                size="small" type="number" label="ราคาคนที่ 2 เป็นต้นไป" value={option.priceFrom2 ?? ''}
                onChange={e => patchOption(i, { priceFrom2: num(e.target.value) })}
                placeholder="เท่ากับคนแรก"
                InputProps={{ endAdornment: <InputAdornment position="end">฿</InputAdornment> }}
                helperText="เว้นว่าง = ราคาเดียวกันทุกคน"
                sx={{ maxWidth: 220 }}
              />
            </Stack>

            <FormControlLabel
              sx={{ mt: 0.5 }}
              control={
                <Switch
                  size="small" checked={!!option.disabledOnFirst}
                  onChange={e => patchOption(i, { disabledOnFirst: e.target.checked })}
                />
              }
              label={<Typography variant="caption">คนแรกของแต่ละครอบครัวเลือกตัวเลือกนี้ไม่ได้</Typography>}
            />
            {option.disabledOnFirst && (
              <TextField
                size="small" fullWidth label="เหตุผลที่แสดงให้ผู้กรอกเห็น"
                value={option.disabledOnFirstNote ?? ''}
                onChange={e => patchOption(i, { disabledOnFirstNote: e.target.value })}
                sx={{ mt: 1 }}
              />
            )}

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              รายการย่อย — แสดงให้เห็นว่าราคามาจากอะไร <b>ไม่ถูกนำไปบวกเพิ่ม</b>
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {(option.detail || []).map((d, di) => (
                <Stack key={di} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small" fullWidth placeholder="เช่น ซุ้มแกะฟักทอง" value={d.label}
                    onChange={e => patchDetail(i, di, { label: e.target.value })}
                  />
                  <TextField
                    size="small" type="number" placeholder="มูลค่า" value={d.price ?? ''}
                    onChange={e => patchDetail(i, di, { price: num(e.target.value) })}
                    InputProps={{ endAdornment: <InputAdornment position="end">฿</InputAdornment> }}
                    sx={{ maxWidth: 140 }}
                  />
                  <IconButton size="small" onClick={() => removeDetail(i, di)}><CloseIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => addDetail(i)} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
                เพิ่มรายการย่อย
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Button size="small" startIcon={<AddIcon />} onClick={addOption} sx={{ mt: 1.5, fontWeight: 700 }}>
        เพิ่มตัวเลือก
      </Button>

      {options.length > 0 && (
        <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
          ตัวอย่าง: เด็ก 2 คนเลือก "{options[0].label}" ทั้งคู่ จะเป็น{' '}
          <b>
            {(Number(options[0].price) || 0).toLocaleString('th-TH')}
            {' + '}
            {(options[0].priceFrom2 ?? options[0].price ?? 0).toLocaleString('th-TH')}
            {' = '}
            {((Number(options[0].price) || 0) + Number(options[0].priceFrom2 ?? options[0].price ?? 0)).toLocaleString('th-TH')} บาท
          </b>
          {' · '}ยอดจริงคำนวณที่เซิร์ฟเวอร์เสมอ บรรทัดนี้เป็นเพียงตัวอย่างให้ตรวจก่อนเผยแพร่
        </Alert>
      )}
    </Box>
  );
};

export default ParticipantPricingEditor;
