import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, TextField, Alert, CircularProgress, Stack } from '@mui/material';
import { AxiosInstance } from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * The staff note on one booking — the same field wherever it is edited.
 *
 * ONE note, not a separate one for the door and one for the phone calls. Two
 * would mean opening two screens to know what is going on with a family, which
 * is exactly the thing a note exists to prevent.
 *
 * Two callers: the booking list's dialog, where notes get written while working
 * down a call list, and the check-in card, where something worth remembering
 * happens while the family is standing there. Both save through here, so
 * neither can drift into its own idea of what a note is.
 */

export const NOTE_MAX = 1000;

const BookingNoteBox = ({ client, bookingId, initialNote, onSaved, autoFocus, minRows = 4 }: {
  client: AxiosInstance;
  bookingId: number;
  initialNote?: string | null;
  /** Handed the saved value so the caller can update its own copy in place. */
  onSaved?: (note: string | null) => void;
  autoFocus?: boolean;
  minRows?: number;
}) => {
  const [text, setText] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => { setText(initialNote || ''); setSavedAt(null); setError(''); }, [bookingId, initialNote]);

  const dirty = (initialNote || '') !== text;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await client.put(`${API_BASE}/bookings/${bookingId}/staff-note`, { note: text });
      onSaved?.(res.data?.staff_note ?? null);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.response?.data?.message || 'บันทึกโน้ตไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        เห็นเฉพาะเจ้าหน้าที่ ลูกค้าไม่เห็นข้อความนี้ · แยกจากหมายเหตุที่ลูกค้ากรอกตอนจอง
      </Typography>
      <TextField
        fullWidth multiline minRows={minRows} autoFocus={autoFocus}
        placeholder="เช่น โทรแล้ว 21/8 ไม่รับสาย · ขอเลื่อนเป็นรอบบ่าย"
        value={text}
        onChange={e => setText(e.target.value.slice(0, NOTE_MAX))}
        helperText={`${text.length}/${NOTE_MAX}`}
      />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        {/* Clearing is emptying the box and saving — one action, not a second
            button that means almost the same thing. */}
        <Button size="small" onClick={() => setText('')} disabled={saving || !text}>ล้างข้อความ</Button>
        <Box sx={{ flex: 1 }} />
        {savedAt && !dirty && (
          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700 }}>บันทึกแล้ว</Typography>
        )}
        <Button
          size="small" variant="contained" onClick={() => void save()}
          disabled={saving || !dirty}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          บันทึก
        </Button>
      </Stack>
    </Box>
  );
};

export default BookingNoteBox;
