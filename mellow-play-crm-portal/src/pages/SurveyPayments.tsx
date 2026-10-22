import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Box, CircularProgress, Button, Chip, Paper, Stack, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogContent, IconButton, TextField, InputAdornment,
} from '@mui/material';
import {
  ArrowBack as BackIcon, Download as DownloadIcon, Close as CloseIcon,
  Search as SearchIcon, ImageNotSupported as NoSlipIcon,
} from '@mui/icons-material';
import { API_URL } from '../config';
import { downloadCsv } from '../utils/csvExport';
import { useActionFeedback } from '../utils/actionFeedback';

const API_BASE = `${API_URL}/api/v1/admin`;

/** A stored file path points at the API's own origin, never this app's. */
const fileUrl = (path: string | null | undefined): string =>
  !path ? '' : path.startsWith('/api/v1/files/') ? `${API_URL}${path}` : path;

const formatDateTime = (raw: string | undefined | null): string => {
  if (!raw) return '-';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  awaiting_payment: { label: 'ยังไม่แนบสลิป', color: '#92400e', bg: '#fef3c7' },
  submitted: { label: 'แนบสลิปแล้ว', color: '#1e40af', bg: '#dbeafe' },
  verified: { label: 'ยืนยันแล้ว', color: '#166534', bg: '#dcfce7' },
  rejected: { label: 'ตีกลับ', color: '#991b1b', bg: '#fee2e2' },
};

/**
 * Who registered and what they sent.
 *
 * Deliberately a list and not a review queue. This form is meant to run
 * without anyone standing behind it: the confirmation email already went out
 * when the slip arrived, so nothing here is blocking a respondent. It exists
 * so the people running the event can see the names, read the slips, and take
 * the lot away as a spreadsheet.
 */
const SurveyPayments = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, feedback } = useActionFeedback();

  const [formName, setFormName] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingSlip, setViewingSlip] = useState<any | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // The list already carries the form's name on every row, so there is
        // no second request to make for a heading.
        const payments = await axios.get(`${API_BASE}/survey-payments`, {
          params: { formId: id, status: 'all' },
        });
        if (payments.data.success) {
          setRows(payments.data.submissions || []);
          setFormName(payments.data.submissions?.[0]?.form_name || '');
        }
      } catch (err) {
        // An empty table and a failed request look identical without this.
        showError(err, 'โหลดรายการชำระเงินไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.respondent_name || '').toLowerCase().includes(q) ||
      String(r.respondent_phone || '').includes(q) ||
      String(r.id).includes(q));
  }, [rows, search]);

  // Counted over what is on screen, so a search narrows the total with it —
  // a figure that ignores the filter above it is a figure nobody can use.
  const totals = useMemo(() => ({
    count: filtered.length,
    withSlip: filtered.filter(r => !!r.slip_url).length,
    baht: filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
  }), [filtered]);

  const exportCsv = () => {
    downloadCsv(
      `survey-${id}-payments`,
      ['เลขที่', 'ชื่อ', 'เบอร์โทร', 'ยอด (บาท)', 'สถานะ', 'แนบสลิปเมื่อ', 'ลิงก์สลิป', 'ส่งฟอร์มเมื่อ'],
      filtered.map(r => [
        r.id,
        r.respondent_name || '',
        r.respondent_phone || '',
        Number(r.amount) || 0,
        STATUS_LABEL[r.payment_status]?.label || r.payment_status || '',
        formatDateTime(r.slip_uploaded_at),
        r.slip_url ? fileUrl(r.slip_url) : '',
        formatDateTime(r.created_at),
      ]),
    );
  };

  return (
    <Box>
      {feedback}

      <Stack direction="row" alignItems="center" gap={1.5} mb={2.5}>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/crm/surveys')} sx={{ fontWeight: 700 }}>
          กลับ
        </Button>
        <Box flex={1} minWidth={0}>
          <Typography sx={{ fontWeight: 900, fontSize: 20 }} noWrap>รายชื่อและสลิป</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{formName || `แบบฟอร์ม #${id}`}</Typography>
        </Box>
        <Button
          variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv}
          disabled={filtered.length === 0} sx={{ fontWeight: 700, borderRadius: 2.5 }}
        >
          ดาวน์โหลด CSV
        </Button>
      </Stack>

      <Stack direction="row" spacing={1.25} mb={2.5} flexWrap="wrap" useFlexGap>
        {[
          { label: 'รายการ', value: totals.count.toLocaleString('th-TH') },
          { label: 'แนบสลิปแล้ว', value: `${totals.withSlip.toLocaleString('th-TH')} / ${totals.count.toLocaleString('th-TH')}` },
          { label: 'ยอดรวม', value: `${totals.baht.toLocaleString('th-TH')} บาท` },
        ].map(stat => (
          <Paper key={stat.label} variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 3, minWidth: 140 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{stat.label}</Typography>
            <Typography sx={{ fontWeight: 900, fontSize: 18 }}>{stat.value}</Typography>
          </Paper>
        ))}
      </Stack>

      <TextField
        size="small" fullWidth placeholder="ค้นหาชื่อ เบอร์โทร หรือเลขที่รายการ"
        value={search} onChange={e => setSearch(e.target.value)}
        sx={{ mb: 2, maxWidth: 420 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
      ) : rows.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2.5 }}>
          ยังไม่มีใครสมัครผ่านแบบฟอร์มนี้ — หรือแบบฟอร์มนี้ยังไม่ได้เปิดเก็บเงิน
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>ชื่อ</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>เบอร์โทร</TableCell>
                <TableCell sx={{ fontWeight: 800 }} align="right">ยอด</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>สลิป</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>สถานะ</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>แนบเมื่อ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(row => {
                const status = STATUS_LABEL[row.payment_status] || { label: row.payment_status || '-', color: '#475569', bg: '#f1f5f9' };
                return (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontWeight: 800 }}>{row.id}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.respondent_name || '-'}</TableCell>
                    <TableCell>{row.respondent_phone || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>
                      {(Number(row.amount) || 0).toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell>
                      {row.slip_url ? (
                        // The thumbnail is the button: staff open dozens of
                        // these in a row and a separate "view" icon beside a
                        // picture of the thing is one click too many.
                        <Box
                          component="img"
                          src={fileUrl(row.slip_url)}
                          alt={`สลิปของ ${row.respondent_name || row.id}`}
                          onClick={() => setViewingSlip(row)}
                          sx={{
                            width: 46, height: 46, objectFit: 'cover', borderRadius: 1.5,
                            border: '1px solid #e2e8f0', cursor: 'pointer', display: 'block',
                            '&:hover': { borderColor: '#94a3b8' },
                          }}
                        />
                      ) : (
                        <NoSlipIcon fontSize="small" sx={{ color: '#cbd5e1' }} titleAccess="ยังไม่ได้แนบสลิป" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={status.label} size="small"
                        sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: status.bg, color: status.color }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.slip_uploaded_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!viewingSlip} onClose={() => setViewingSlip(null)} maxWidth="sm" fullWidth>
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: '#0f172a' }}>
          <IconButton
            onClick={() => setViewingSlip(null)}
            sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          {viewingSlip && (
            <>
              <Box
                component="img"
                src={fileUrl(viewingSlip.slip_url)}
                alt={`สลิปของ ${viewingSlip.respondent_name || viewingSlip.id}`}
                sx={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }}
              />
              <Box sx={{ p: 2, bgcolor: '#fff' }}>
                <Typography sx={{ fontWeight: 900 }}>
                  #{viewingSlip.id} · {viewingSlip.respondent_name || '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {(Number(viewingSlip.amount) || 0).toLocaleString('th-TH')} บาท · แนบเมื่อ {formatDateTime(viewingSlip.slip_uploaded_at)}
                </Typography>
                <Button
                  size="small" href={fileUrl(viewingSlip.slip_url)} target="_blank" rel="noopener noreferrer"
                  sx={{ fontWeight: 700, mt: 1, px: 0 }}
                >
                  เปิดรูปเต็มในแท็บใหม่
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default SurveyPayments;
