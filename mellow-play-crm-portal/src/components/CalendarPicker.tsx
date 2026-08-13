import React from 'react';
import { Autocomplete, TextField, Box } from '@mui/material';

export interface PickableCalendar {
  id: number;
  name: string;
  color?: string;
  description?: string;
}

/**
 * Calendar chooser for the booking screens.
 *
 * These screens used to show a plain dropdown of calendars pre-filtered by
 * Calendar.type — class screens saw only 'class' calendars, POS only
 * 'service'. That field is gone (staff could pick any calendar on the course
 * form anyway, so the type only ever hid options), which leaves one list of
 * everything. A list of everything needs to be searchable, so this types to
 * filter instead of asking anyone to scroll.
 *
 * Value stays the calendar id as a string, matching what the screens already
 * hold in state and send to the API.
 */
const CalendarPicker = ({
  calendars, value, onChange, label = 'ปฏิทิน', size = 'small',
}: {
  calendars: PickableCalendar[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  size?: 'small' | 'medium';
}) => {
  const selected = calendars.find(c => String(c.id) === value) ?? null;

  return (
    <Autocomplete
      size={size}
      fullWidth
      options={calendars}
      value={selected}
      onChange={(_, next) => onChange(next ? String(next.id) : '')}
      getOptionLabel={c => c.name ?? ''}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      // Matches on the description too — calendars are often named alike
      // ("รอบเช้า", "รอบบ่าย") and the description is where the difference is.
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (!q) return opts;
        return opts.filter(c =>
          (c.name ?? '').toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q)
        );
      }}
      renderOption={(props, c) => (
        <Box component="li" {...props} key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {c.color && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />}
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ fontWeight: 600, fontSize: 14 }}>{c.name}</Box>
            {c.description && <Box sx={{ fontSize: 11, color: 'text.secondary' }}>{c.description}</Box>}
          </Box>
        </Box>
      )}
      renderInput={params => <TextField {...params} label={label} placeholder="พิมพ์เพื่อค้นหา" />}
      noOptionsText="ไม่พบปฏิทินที่ค้นหา"
    />
  );
};

export default CalendarPicker;
