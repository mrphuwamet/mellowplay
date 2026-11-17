import React, { useState } from 'react';
import { Box, Button, IconButton, Popover, Stack, TextField, Tooltip, Typography, Alert } from '@mui/material';

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

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Relative luminance, 0–1. Only ever used to warn: the consumer paints a
 * selected option as white text on its own colour, and this editor previews the
 * colour on white, so a pale pick looks fine here and is unreadable there.
 */
const luminanceOf = (hex: string): number => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const chan = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(chan[0]) + 0.7152 * lin(chan[1]) + 0.0722 * lin(chan[2]);
};

/**
 * A swatch grid plus a hex box, behind one dot in the option row.
 *
 * Replaces a nine-item dropdown: picking a colour is a visual comparison, and a
 * list of names made you read to choose. The named eight stay as the quick
 * picks because they are known to read on white; the hex box is for matching a
 * brand or a printed sheet, which the fixed list could never do.
 *
 * Shared between the survey/test builder and the registration-form builder —
 * both let an option (dropdown/radio/checkbox) carry a colour, and this is the
 * one place that editing UI lives.
 */
const OptionColorPicker = ({ value, onChange }: { value?: string; onChange: (color?: string) => void }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState('');
  const draftValid = HEX_RE.test(draft.trim());
  const tooLight = !!value && HEX_RE.test(value) && luminanceOf(value) > 0.6;
  const apply = () => { if (draftValid) { onChange(draft.trim().toLowerCase()); setAnchor(null); } };

  return (
    <>
      <Tooltip title={value ? `สี ${value}` : 'เลือกสี'}>
        <IconButton size="small" sx={{ p: 0.5 }}
          onClick={e => { setDraft(value || ''); setAnchor(e.currentTarget); }}>
          <Box sx={{
            width: 22, height: 22, borderRadius: '50%',
            bgcolor: value || '#fff',
            border: '1px solid', borderColor: value ? 'rgba(0,0,0,0.18)' : '#cbd5e1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* A struck-through blank reads as "no colour"; an empty circle
                reads as white, which is a colour. */}
            {!value && <Box sx={{ width: 15, height: 1.5, bgcolor: '#cbd5e1', transform: 'rotate(-45deg)' }} />}
          </Box>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, width: 236 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>สีของตัวเลือก</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75, mb: 1.5 }}>
            {OPTION_COLORS.filter(c => c.value).map(c => (
              <Tooltip key={c.value} title={c.label}>
                <Box
                  onClick={() => { onChange(c.value); setAnchor(null); }}
                  sx={{
                    height: 34, borderRadius: 1, bgcolor: c.value, cursor: 'pointer',
                    outline: value === c.value ? '2px solid #111' : 'none', outlineOffset: 2,
                    '&:hover': { opacity: 0.85 },
                  }}
                />
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TextField
              size="small" label="โค้ดสี" placeholder="#7452d6" value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(); }}
              error={draft.trim() !== '' && !draftValid}
              sx={{ flex: 1 }}
            />
            <Button size="small" variant="contained" disabled={!draftValid} onClick={apply}>ใช้</Button>
          </Stack>
          {draft.trim() !== '' && !draftValid && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
              ต้องเป็นรูปแบบ #RGB หรือ #RRGGBB
            </Typography>
          )}
          {tooLight && (
            <Alert severity="warning" sx={{ py: 0, mb: 1 }}>
              <Typography variant="caption">สีนี้อ่อนมาก ตัวหนังสือสีขาวบนตัวเลือกที่ถูกเลือกจะอ่านยาก</Typography>
            </Alert>
          )}
          <Button size="small" fullWidth onClick={() => { onChange(undefined); setAnchor(null); }}>ไม่ระบุสี</Button>
        </Box>
      </Popover>
    </>
  );
};

export default OptionColorPicker;
