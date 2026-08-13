import React from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, Typography } from '@mui/material';

/**
 * A time field that is always 24-hour.
 *
 * Replaces `<input type="time">`, which renders in the BROWSER's locale — a
 * staff member whose Chrome is set to English gets an AM/PM picker no matter
 * what the page says, and there is no HTML attribute that reliably overrides
 * it across Chrome, Firefox and Safari. Two explicit selects sidestep the
 * question entirely: 00–23 and 00–59, the same everywhere.
 *
 * The value contract is unchanged — a "HH:MM" string, or '' for empty — so
 * this drops into the places that used a native time input without touching
 * how anything is stored or sent.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

const TimeField24 = ({
  label, value, onChange, size = 'medium', fullWidth = false, disabled = false, required = false, minuteStep = 1,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Coarser minute list where a schedule only ever lands on :00/:15/:30 etc. */
  minuteStep?: number;
}) => {
  const [rawHour = '', rawMinute = ''] = (value || '').split(':');
  const hour = HOURS.includes(rawHour) ? rawHour : '';
  const minute = MINUTES.includes(rawMinute) ? rawMinute : '';

  // A half-filled field would silently save as "09:" — until both halves are
  // chosen the value stays empty, and picking one defaults the other to 00 so
  // one click is enough for the common "on the hour" case.
  const emit = (h: string, m: string) => {
    if (!h && !m) { onChange(''); return; }
    onChange(`${h || '00'}:${m || '00'}`);
  };

  // Copied, never the module-level MINUTES itself — the off-step insert below
  // would otherwise mutate the shared constant for every other field on screen.
  const minuteOptions = minuteStep > 1
    ? MINUTES.filter((_, i) => i % minuteStep === 0)
    : [...MINUTES];
  // Keep an existing off-step value selectable rather than silently dropping it.
  if (minute && !minuteOptions.includes(minute)) minuteOptions.unshift(minute);

  return (
    <Box sx={{ width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
          {label}{required && <span style={{ color: '#d32f2f' }}> *</span>}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <FormControl size={size} sx={{ minWidth: 78, flex: fullWidth ? 1 : 'none' }} disabled={disabled}>
          <InputLabel shrink={false} sx={{ display: 'none' }}>ชั่วโมง</InputLabel>
          <Select
            value={hour}
            displayEmpty
            onChange={e => emit(e.target.value as string, minute)}
            renderValue={v => (v ? String(v) : <span style={{ color: '#9ca3af' }}>ชม.</span>)}
            MenuProps={{ PaperProps: { style: { maxHeight: 280 } } }}
          >
            {HOURS.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography sx={{ fontWeight: 800, color: 'text.secondary' }}>:</Typography>
        <FormControl size={size} sx={{ minWidth: 78, flex: fullWidth ? 1 : 'none' }} disabled={disabled}>
          <Select
            value={minute}
            displayEmpty
            onChange={e => emit(hour, e.target.value as string)}
            renderValue={v => (v ? String(v) : <span style={{ color: '#9ca3af' }}>นาที</span>)}
            MenuProps={{ PaperProps: { style: { maxHeight: 280 } } }}
          >
            {minuteOptions.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.25 }}>น.</Typography>
      </Box>
    </Box>
  );
};

export default TimeField24;
