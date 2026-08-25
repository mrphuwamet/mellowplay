import React, { useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, Chip, IconButton, Tooltip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon,
  VisibilityOff as HideIcon, Visibility as ShowIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * Every certificate design, and what is standing on it.
 *
 * The two counts are the point of the table. A design nothing was issued from
 * is genuinely disposable; one with certificates behind it is the artwork those
 * certificates reprint from, and deleting it would not fail — the foreign key
 * is ON DELETE SET NULL, so it would quietly strip the design off documents
 * already in families' hands, which reprint blank afterwards.
 *
 * So delete is offered only for the first kind. Retiring the second kind is
 * ปิดใช้งาน: it stops being offered for new items and keeps printing the old
 * ones.
 */

export interface TemplateRow {
  id: number;
  name: string;
  page_width: number;
  page_height: number;
  is_active: number;
  issued_count?: number;
  binding_count?: number;
}

const CertificateTemplateList = ({ templates, onEdit, onNew, onChanged }: {
  templates: TemplateRow[];
  onEdit: (t: TemplateRow) => void;
  onNew: () => void;
  onChanged: () => void;
}) => {
  const [confirm, setConfirm] = useState<TemplateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { data } = await axios.delete(`${API_BASE}/certificate-templates/${confirm.id}`);
      setNotice(data.success ? 'ลบแบบเกียรติบัตรแล้ว' : (data.message || 'ลบไม่สำเร็จ'));
      setConfirm(null);
      onChanged();
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'ลบไม่สำเร็จ');
      setConfirm(null);
    } finally { setBusy(false); }
  };

  const setActive = async (t: TemplateRow, active: boolean) => {
    try {
      await axios.put(`${API_BASE}/certificate-templates/${t.id}/active`, { active });
      setNotice(active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว — จะไม่ถูกเลือกใช้กับกิจกรรมใหม่');
      onChanged();
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>แบบเกียรติบัตรทั้งหมด</Typography>
          <Typography variant="caption" color="text.secondary">
            ลบได้เฉพาะแบบที่ยังไม่เคยออกเกียรติบัตร · แบบที่ใช้ไปแล้วให้ปิดใช้งานแทน ใบเก่าจะได้ยังพิมพ์ได้
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={onNew} sx={{ fontWeight: 700 }}>
          แบบใหม่
        </Button>
      </Stack>

      {notice && <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>ชื่อแบบ</TableCell>
              <TableCell sx={{ fontWeight: 800, width: 110 }}>ขนาด</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, width: 96 }}>ออกไปแล้ว</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, width: 96 }}>กิจกรรมที่ใช้</TableCell>
              <TableCell sx={{ fontWeight: 800, width: 130 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
                    ยังไม่มีแบบเกียรติบัตร
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {templates.map(t => {
              const issued = Number(t.issued_count ?? 0);
              const bound = Number(t.binding_count ?? 0);
              const canDelete = issued === 0;
              return (
                <TableRow key={t.id} hover sx={{ opacity: t.is_active ? 1 : 0.55 }}>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.name}</Typography>
                      {!t.is_active && <Chip size="small" label="ปิดใช้งาน" sx={{ fontWeight: 700 }} />}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {t.page_width}×{t.page_height} มม.
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: issued > 0 ? 800 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {issued}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{bound}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="แก้ไขแบบนี้">
                      <IconButton size="small" onClick={() => onEdit(t)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={t.is_active ? 'ปิดใช้งาน — ใบเก่ายังพิมพ์ได้' : 'เปิดใช้งานอีกครั้ง'}>
                      <IconButton size="small" onClick={() => void setActive(t, !t.is_active)}>
                        {t.is_active ? <HideIcon fontSize="small" /> : <ShowIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={canDelete ? 'ลบถาวร' : `ลบไม่ได้ — ออกไปแล้ว ${issued} ใบ`}>
                      {/* A disabled IconButton swallows its own tooltip, so the
                          span is what the pointer actually lands on — otherwise
                          the reason it cannot be deleted is unreadable. */}
                      <span>
                        <IconButton
                          size="small" color="error" disabled={!canDelete}
                          onClick={() => setConfirm(t)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!confirm} onClose={() => !busy && setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>ลบแบบเกียรติบัตร</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            ลบ “{confirm?.name}” ถาวร — ยังไม่เคยออกเกียรติบัตรจากแบบนี้ จึงไม่มีใบไหนได้รับผลกระทบ
            {Number(confirm?.binding_count ?? 0) > 0
              && ` · มี ${confirm?.binding_count} กิจกรรมที่ผูกไว้กับแบบนี้ กิจกรรมเหล่านั้นจะกลับไปเป็นยังไม่ได้เลือกแบบ และจะออกเกียรติบัตรไม่ได้จนกว่าจะเลือกใหม่`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={busy}>ยกเลิก</Button>
          <Button
            color="error" variant="contained" onClick={() => void remove()} disabled={busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <DeleteIcon />}
          >
            ลบถาวร
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default CertificateTemplateList;
