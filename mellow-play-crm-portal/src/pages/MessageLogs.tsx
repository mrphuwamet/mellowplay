import React, { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import {
  Typography, Box, CircularProgress, Chip, IconButton, Paper, Stack, Alert,
  TextField, MenuItem, Select, FormControl, InputLabel, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, InputAdornment,
} from '@mui/material';
import {
  Visibility as ViewIcon, Search as SearchIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';

const API_BASE = `${API_URL}/api/v1/system`;

const EMAIL_TYPE_LABEL: Record<string, string> = {
  booking_success: 'ยืนยันการจอง',
  reminder: 'เตือนล่วงหน้า',
  otp: 'OTP',
  password_reset: 'รีเซ็ตรหัสผ่าน',
  welcome: 'ต้อนรับสมาชิกใหม่',
  broadcast: 'ประชาสัมพันธ์',
};

const SMS_TYPE_LABEL: Record<string, string> = {
  booking_success: 'ยืนยันการจอง',
  reminder: 'เตือนล่วงหน้า',
  broadcast: 'ประชาสัมพันธ์',
};

const formatDateTime = (raw?: string): string => {
  if (!raw) return '-';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
};

const StatusChip = ({ status }: { status: string }) => (
  <Chip
    size="small"
    label={status === 'sent' ? 'สำเร็จ' : 'ล้มเหลว'}
    sx={{
      fontWeight: 800,
      color: status === 'sent' ? '#047857' : '#b91c1c',
      bgcolor: status === 'sent' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
    }}
  />
);

/**
 * Send history for both channels.
 *
 * Email_Logs and Sms_Logs have been filling up since the notification work
 * shipped; this is the first screen that reads them back. The preview fetches
 * one body at a time — a full HTML body per row would dwarf the list.
 */
const MessageLogs = () => {
  const [tab, setTab] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const [previewing, setPreviewing] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const channel = tab === 0 ? 'email' : 'sms';

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    axios.get(`${API_BASE}/${channel}-logs?${params.toString()}`)
      .then(res => { if (res.data.success) setLogs(res.data.logs); })
      .catch(err => setError(err.response?.data?.message || 'ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [channel, type, status, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Filters are per-channel; carrying an email-only type across to SMS would
  // silently return nothing and look like a bug.
  const switchTab = (v: number) => { setTab(v); setType(''); setStatus(''); setSearch(''); };

  const openPreview = async (row: any) => {
    setPreviewLoading(true);
    setPreviewing({ ...row, body_html: undefined });
    try {
      const res = await axios.get(`${API_BASE}/email-logs/${row.id}`);
      if (res.data.success) setPreviewing(res.data.log);
    } catch {
      setPreviewing({ ...row, body_html: null });
    } finally {
      setPreviewLoading(false);
    }
  };

  const typeOptions = tab === 0 ? EMAIL_TYPE_LABEL : SMS_TYPE_LABEL;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>ประวัติการส่งอีเมล / SMS</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchLogs}>รีเฟรช</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => switchTab(v)} sx={{ mb: 3, borderBottom: '1px solid #eef0f3' }}>
        <Tab label="อีเมล" sx={{ fontWeight: 700 }} />
        <Tab label="SMS" sx={{ fontWeight: 700 }} />
      </Tabs>

      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <InputLabel>ประเภท</InputLabel>
            <Select value={type} label="ประเภท" onChange={e => setType(e.target.value)}>
              <MenuItem value="">ทั้งหมด</MenuItem>
              {Object.entries(typeOptions).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>สถานะ</InputLabel>
            <Select value={status} label="สถานะ" onChange={e => setStatus(e.target.value)}>
              <MenuItem value="">ทั้งหมด</MenuItem>
              <MenuItem value="sent">สำเร็จ</MenuItem>
              <MenuItem value="failed">ล้มเหลว</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small" sx={{ minWidth: 260 }}
            placeholder={tab === 0 ? 'ค้นหาอีเมลหรือหัวเรื่อง' : 'ค้นหาเบอร์หรือข้อความ'}
            value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>เวลา</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ประเภท</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{tab === 0 ? 'อีเมล' : 'เบอร์โทร'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{tab === 0 ? 'หัวเรื่อง' : 'ข้อความ'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                {tab === 0 && <TableCell sx={{ fontWeight: 700 }} align="right">ดู</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีประวัติการส่งที่ตรงเงื่อนไข</Typography>
                </TableCell></TableRow>
              )}
              {logs.map(row => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={typeOptions[row.type] || row.type} />
                  </TableCell>
                  <TableCell>{tab === 0 ? row.email : row.phone}</TableCell>
                  <TableCell sx={{ maxWidth: 340 }}>
                    <Typography variant="body2" noWrap title={tab === 0 ? row.subject : row.message}>
                      {tab === 0 ? row.subject : row.message}
                    </Typography>
                  </TableCell>
                  <TableCell><StatusChip status={row.status} /></TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography variant="caption" color="text.secondary" noWrap title={row.provider_detail || ''}>
                      {row.provider_detail || '-'}
                    </Typography>
                  </TableCell>
                  {tab === 0 && (
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openPreview(row)} disabled={!row.has_body} title={row.has_body ? 'ดูเนื้อหา' : 'รายการนี้ไม่ได้เก็บเนื้อหาไว้'}>
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!previewing} onClose={() => setPreviewing(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {previewing?.subject}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500 }}>
            ถึง {previewing?.email} · {formatDateTime(previewing?.created_at)}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {previewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : previewing?.body_html ? (
            // A sandboxed iframe, not dangerouslySetInnerHTML: these bodies are
            // assembled from staff-authored templates AND customer-supplied form
            // answers. The template service escapes the values, but rendering
            // stored markup straight into the CRM would make any gap there a
            // hole in the admin panel. The sandbox has no allow-scripts, so the
            // preview cannot execute anything either way.
            <Box
              component="iframe"
              sandbox=""
              srcDoc={previewing.body_html}
              title="ตัวอย่างอีเมล"
              sx={{ width: '100%', height: 460, border: '1px solid #eef0f3', borderRadius: 2, bgcolor: 'white' }}
            />
          ) : (
            <Alert severity="info">
              รายการนี้ไม่ได้เก็บเนื้อหาไว้ — อีเมล OTP และรีเซ็ตรหัสผ่านมีรหัสใช้ครั้งเดียวอยู่ข้างใน จึงตั้งใจไม่บันทึกเนื้อหาลง log
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewing(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MessageLogs;
