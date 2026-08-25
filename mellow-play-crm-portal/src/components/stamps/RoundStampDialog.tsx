import React, { useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, MenuItem, Select, FormControl, Chip, Divider, Alert,
} from '@mui/material';
import { LocalActivity as StampIcon } from '@mui/icons-material';

/**
 * Per-round stamp artwork, behind one button instead of down the page.
 *
 * Every round used to get its own dropdown in the course form. A twelve-round
 * item therefore showed twelve identical controls all reading "ตามกิจกรรม",
 * which is a wall of decisions where in practice there is nearly always none:
 * the whole point of the item-level design is that rounds inherit it, and the
 * exception is one round out of twelve — a final, a special day.
 *
 * So the form shows the answer ("ทุกรอบใช้ดีไซน์ของกิจกรรม") and the exceptions
 * are set behind a button. The dialog leads with the bulk action, because
 * "make them all X" is a likelier intent than editing rows one at a time, and
 * marks the rows that differ so the exceptions can be seen at a glance.
 */

export interface RoundRow {
  id: number;
  day_of_week?: number | null;
  specific_date?: string | null;
  start_time: string;
  end_time?: string | null;
  design_id?: number | null;
}

export interface StampDesign { id: number; name: string; is_active?: number | boolean }

const roundLabel = (r: RoundRow, dayLabels: Record<number, string>) =>
  r.specific_date ? r.specific_date : `ทุก${dayLabels[r.day_of_week ?? -1] || ''}`;

const RoundStampButton = ({ rounds, designs, dayLabels, onChange }: {
  rounds: RoundRow[];
  designs: StampDesign[];
  dayLabels: Record<number, string>;
  onChange: (roundId: number, designId: number | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const active = useMemo(() => designs.filter(d => d.is_active !== 0 && d.is_active !== false), [designs]);
  const overrides = rounds.filter(r => r.design_id != null);
  const nameOf = (id: number | null | undefined) =>
    (id == null ? null : active.find(d => d.id === id)?.name ?? `ดีไซน์ #${id}`);

  // Grouped by day, so a four-round Saturday reads as one day with four times
  // rather than four unrelated lines.
  const groups = useMemo(() => {
    const map = new Map<string, RoundRow[]>();
    for (const r of rounds) {
      const key = roundLabel(r, dayLabels);
      map.set(key, [...(map.get(key) || []), r]);
    }
    return Array.from(map.entries());
  }, [rounds, dayLabels]);

  const setAll = (designId: number | null) => rounds.forEach(r => onChange(r.id, designId));

  if (rounds.length === 0) return null;

  return (
    <>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <StampIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            แสตมป์รายรอบ
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {overrides.length === 0
              ? `ทั้ง ${rounds.length} รอบใช้ดีไซน์ของกิจกรรม`
              : `${overrides.length} จาก ${rounds.length} รอบใช้ดีไซน์ต่างออกไป`}
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ fontWeight: 700 }}>
          {overrides.length === 0 ? 'ตั้งเฉพาะบางรอบ' : 'แก้ไขรอบที่ตั้งไว้'}
        </Button>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>แสตมป์รายรอบ</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            ปกติทุกรอบใช้ดีไซน์เดียวกับกิจกรรม — ตั้งตรงนี้เฉพาะรอบที่อยากให้ต่างออกไป
            เช่น รอบชิงชนะเลิศ หรือรอบวันพิเศษ
          </Alert>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              ตั้งทุกรอบเป็น
            </Typography>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select value="" displayEmpty onChange={e => setAll(e.target.value === '' ? null : Number(e.target.value))}>
                <MenuItem value="" disabled>เลือกดีไซน์…</MenuItem>
                {active.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" onClick={() => setAll(null)} disabled={overrides.length === 0}>
              ล้างทั้งหมด
            </Button>
          </Stack>

          <Divider sx={{ mb: 1.5 }} />

          <Stack spacing={2}>
            {groups.map(([label, rows]) => (
              <Box key={label}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                  {label}
                </Typography>
                <Stack spacing={1}>
                  {rows.map(r => (
                    <Box key={r.id} sx={{
                      display: 'flex', gap: 1.5, alignItems: 'center',
                      p: 0.75, borderRadius: 2,
                      // Only the exceptions are tinted: the point of the dialog
                      // is seeing which rounds are not the ordinary case.
                      bgcolor: r.design_id != null ? '#f6f2ff' : 'transparent',
                    }}>
                      <Typography variant="body2" sx={{ minWidth: 64, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {String(r.start_time).slice(0, 5)}
                      </Typography>
                      <FormControl size="small" sx={{ flex: 1 }}>
                        <Select
                          value={r.design_id ?? ''} displayEmpty
                          onChange={e => onChange(r.id, e.target.value === '' ? null : Number(e.target.value))}
                        >
                          <MenuItem value="">ตามกิจกรรม</MenuItem>
                          {active.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                        </Select>
                      </FormControl>
                      {r.design_id != null && (
                        <Chip size="small" color="primary" variant="outlined" label={nameOf(r.design_id)} sx={{ maxWidth: 140 }} />
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', pl: 1 }}>
            {overrides.length === 0 ? 'ยังไม่มีรอบไหนตั้งต่างจากกิจกรรม' : `ตั้งไว้ ${overrides.length} รอบ`}
            {' · บันทึกพร้อมกิจกรรม'}
          </Typography>
          <Button variant="contained" onClick={() => setOpen(false)}>เสร็จสิ้น</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default RoundStampButton;
