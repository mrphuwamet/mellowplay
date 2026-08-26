import React from 'react';
import {
  Box, Paper, Typography, Stack, IconButton, Tooltip, Chip,
} from '@mui/material';
import {
  Visibility as ShowIcon, VisibilityOff as HideIcon,
  Lock as LockIcon, LockOpen as UnlockIcon,
  KeyboardArrowUp as UpIcon, KeyboardArrowDown as DownIcon,
  DataObject as VarIcon, TextFields as TextIcon,
  QrCode2 as QrIcon, Image as ImageIcon, Layers as LayersIcon,
} from '@mui/icons-material';
import { CertField, CertValueMap, fieldText } from '../utils/certificateLayout';

/**
 * The stack of boxes on the page, front to back.
 *
 * Everything on a certificate overlaps something — a name sits on artwork, a
 * signature sits on a line — and until now the only way to change what covered
 * what was to delete a box and add it again, because paint order is array
 * order and nothing exposed the array.
 *
 * Listed front-first, which is the way every layout tool lists layers and the
 * opposite of the array: the last item painted is the one on top, and the one
 * on top is the one being fought with.
 */

const TYPE_ICON: Record<CertField['type'], React.ReactNode> = {
  field: <VarIcon sx={{ fontSize: 15 }} />,
  text: <TextIcon sx={{ fontSize: 15 }} />,
  qr: <QrIcon sx={{ fontSize: 15 }} />,
  image: <ImageIcon sx={{ fontSize: 15 }} />,
};

/** What to call a box in the list — what it says, not what it is. */
export const layerName = (f: CertField, values: CertValueMap): string => {
  if (f.type === 'qr') return 'QR ตรวจสอบ';
  if (f.type === 'image') return f.value ? 'รูป / ลายเซ็น' : 'รูป (ยังไม่ได้เลือก)';
  const text = fieldText(f, values, true).trim();
  return text || (f.type === 'field' ? f.value : 'ข้อความว่าง');
};

const CertificateLayers = ({ fields, selected, values, onSelect, onPatch, onMove }: {
  fields: CertField[];
  selected: string | null;
  values: CertValueMap;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<CertField>) => void;
  /** by = -1 moves one step towards the back, +1 towards the front. */
  onMove: (id: string, by: number) => void;
}) => {
  // Front of the page first. The array is back-to-front because that is the
  // order it is painted in.
  const ordered = [...fields].reverse();

  return (
    <Box>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25 }}>
        <LayersIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 800, letterSpacing: '.06em', color: 'text.secondary', textTransform: 'uppercase', flex: 1 }}
        >
          เลเยอร์
        </Typography>
        <Chip size="small" label={fields.length} sx={{ height: 18, fontSize: 11, fontWeight: 800 }} />
      </Stack>

      {fields.length === 0 ? (
        <Typography variant="caption" color="text.disabled">ยังไม่มีกล่องบนหน้ากระดาษ</Typography>
      ) : (
        <Stack spacing={0.5} sx={{ maxHeight: 240, overflowY: 'auto', pr: 0.5 }}>
          {ordered.map((f, i) => {
            const isSel = f.id === selected;
            // i is the position in the reversed list, so the first row is the
            // frontmost box and cannot go any further forward.
            const atFront = i === 0;
            const atBack = i === ordered.length - 1;
            return (
              <Paper
                key={f.id}
                variant="outlined"
                onClick={() => onSelect(f.id)}
                sx={{
                  px: 1, py: 0.5, borderRadius: 2, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  borderColor: isSel ? '#5b3fd1' : '#eef0f3',
                  bgcolor: isSel ? '#f6f3ff' : 'transparent',
                  opacity: f.hidden ? 0.5 : 1,
                }}
              >
                <Box sx={{ color: isSel ? '#5b3fd1' : 'text.disabled', display: 'flex' }}>
                  {TYPE_ICON[f.type]}
                </Box>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ flex: 1, minWidth: 0, fontWeight: isSel ? 800 : 600, textDecoration: f.hidden ? 'line-through' : undefined }}
                >
                  {layerName(f, values)}
                </Typography>

                <Tooltip title={atFront ? 'อยู่หน้าสุดแล้ว' : 'ขึ้นหน้า'}>
                  <span>
                    <IconButton size="small" disabled={atFront}
                      onClick={e => { e.stopPropagation(); onMove(f.id, 1); }}>
                      <UpIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={atBack ? 'อยู่หลังสุดแล้ว' : 'ลงหลัง'}>
                  <span>
                    <IconButton size="small" disabled={atBack}
                      onClick={e => { e.stopPropagation(); onMove(f.id, -1); }}>
                      <DownIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={f.hidden ? 'แสดงกล่องนี้' : 'ซ่อน — จะไม่ถูกพิมพ์ด้วย'}>
                  <IconButton size="small"
                    onClick={e => { e.stopPropagation(); onPatch(f.id, { hidden: !f.hidden }); }}>
                    {f.hidden ? <HideIcon sx={{ fontSize: 15 }} /> : <ShowIcon sx={{ fontSize: 15 }} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title={f.locked ? 'ปลดล็อก' : 'ล็อกไม่ให้ลากโดนโดยบังเอิญ'}>
                  <IconButton size="small"
                    onClick={e => { e.stopPropagation(); onPatch(f.id, { locked: !f.locked }); }}>
                    {f.locked ? <LockIcon sx={{ fontSize: 15, color: '#b45309' }} /> : <UnlockIcon sx={{ fontSize: 15 }} />}
                  </IconButton>
                </Tooltip>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};

export default CertificateLayers;
