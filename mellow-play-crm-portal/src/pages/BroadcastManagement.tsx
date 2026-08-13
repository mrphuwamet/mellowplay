import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import {
  Typography, Box, CircularProgress, Chip, IconButton, Paper, Stack, Alert,
  TextField, MenuItem, Select, FormControl, InputLabel, Button, Switch, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress, Divider,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, ArrowBack as BackIcon,
  Save as SaveIcon, Send as SendIcon, Refresh as RefreshIcon, Cancel as CancelIcon,
} from '@mui/icons-material';
import RichTextEditor from '../components/RichTextEditor';

const API_BASE = `${API_URL}/api/v1/admin`;

const STATUS_META: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' }> = {
  draft: { label: 'ฉบับร่าง', color: 'default' },
  sending: { label: 'กำลังส่ง', color: 'info' },
  sent: { label: 'ส่งครบแล้ว', color: 'success' },
  cancelled: { label: 'ยกเลิก', color: 'warning' },
};

/**
 * Marketing broadcasts.
 *
 * Launching does not send: it freezes the audience into a queue that the cron
 * drains a batch at a time (see broadcastSender). This screen therefore has to
 * show progress rather than a result, and the numbers below come from counting
 * recipient rows, not from anything the send call returned.
 */
const BroadcastManagement = () => {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string } | null>(null);

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [allMembers, setAllMembers] = useState(false);
  const [courseIds, setCourseIds] = useState<number[]>([]);
  const [audiencePreview, setAudiencePreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/broadcasts`),
      axios.get(`${API_BASE}/courses`),
    ]).then(([bRes, cRes]) => {
      if (bRes.data.success) setBroadcasts(bRes.data.broadcasts);
      const list = cRes.data.courses ?? cRes.data.data ?? [];
      if (Array.isArray(list)) setCourses(list);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    setName(''); setChannel('email'); setSubject(''); setBodyHtml(''); setSmsMessage('');
    setMarketingConsent(true); setAllMembers(false); setCourseIds([]);
    setAudiencePreview(null); setError(null);
  };

  const audience = () => ({ marketingConsent, allMembers, courseIds });

  const openCreate = () => { resetForm(); setEditId(null); setIsEditing(true); };

  const openEdit = async (id: number) => {
    resetForm();
    setEditId(id);
    setIsEditing(true);
    const res = await axios.get(`${API_BASE}/broadcasts/${id}`);
    if (res.data.success) {
      const b = res.data.broadcast;
      setName(b.name || '');
      setChannel(b.channel || 'email');
      setSubject(b.subject || '');
      setBodyHtml(b.body_html || '');
      setSmsMessage(b.sms_message || '');
      try {
        const a = JSON.parse(b.audience_json || '{}');
        setMarketingConsent(!!a.marketingConsent);
        setAllMembers(!!a.allMembers);
        setCourseIds(Array.isArray(a.courseIds) ? a.courseIds : []);
      } catch { /* a malformed filter just starts from the defaults */ }
    }
  };

  const checkAudience = async () => {
    setPreviewing(true);
    try {
      const res = await axios.post(`${API_BASE}/broadcasts/preview-audience`, { audience: audience() });
      if (res.data.success) setAudiencePreview(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'ตรวจสอบกลุ่มผู้รับไม่สำเร็จ');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('กรุณาตั้งชื่อแคมเปญ'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { name, channel, subject, bodyHtml, smsMessage, audience: audience() };
      if (editId) await axios.put(`${API_BASE}/broadcasts/${editId}`, payload);
      else await axios.post(`${API_BASE}/broadcasts`, payload);
      setIsEditing(false);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const launch = async (id: number) => {
    setError(null);
    try {
      const res = await axios.post(`${API_BASE}/broadcasts/${id}/launch`);
      setNotice(`เข้าคิวแล้ว ${res.data.queued} ฉบับ — ระบบจะทยอยส่งเองทุก 5 นาที`);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'เริ่มส่งไม่สำเร็จ');
    }
  };

  const cancel = async (id: number) => {
    await axios.post(`${API_BASE}/broadcasts/${id}/cancel`);
    fetchAll();
  };

  const sendNow = async () => {
    setNotice(null);
    const res = await axios.post(`${API_BASE}/broadcasts/drain`);
    setNotice(`ส่งรอบนี้ไป ${res.data.processed} ฉบับ`);
    fetchAll();
  };

  if (loading && !isEditing) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;
  }

  if (isEditing) {
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
          <IconButton onClick={() => setIsEditing(false)} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
          <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>{editId ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญ'}</Typography>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>บันทึกฉบับร่าง</Button>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Stack spacing={2}>
            <TextField fullWidth label="ชื่อแคมเปญ (ใช้ภายใน ผู้รับไม่เห็น)" value={name} onChange={e => setName(e.target.value)} />
            <FormControl fullWidth>
              <InputLabel>ช่องทาง</InputLabel>
              <Select value={channel} label="ช่องทาง" onChange={e => setChannel(e.target.value as any)}>
                <MenuItem value="email">อีเมลอย่างเดียว</MenuItem>
                <MenuItem value="sms">SMS อย่างเดียว</MenuItem>
                <MenuItem value="both">ทั้งอีเมลและ SMS</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>กลุ่มผู้รับ</Typography>
          <Stack spacing={1.5}>
            <FormControlLabel
              control={<Switch checked={marketingConsent} disabled={allMembers} onChange={e => setMarketingConsent(e.target.checked)} />}
              label="คนที่ติ๊กยินยอมรับข้อมูลการตลาดตอนสมัคร"
            />
            <FormControl fullWidth size="small" disabled={allMembers}>
              <InputLabel>คนที่เคยเข้าร่วมกิจกรรม/คอร์ส</InputLabel>
              <Select
                multiple value={courseIds} label="คนที่เคยเข้าร่วมกิจกรรม/คอร์ส"
                onChange={e => setCourseIds(e.target.value as number[])}
                renderValue={(sel) => `${(sel as number[]).length} รายการ`}
              >
                {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Divider />
            <FormControlLabel
              control={<Switch checked={allMembers} onChange={e => setAllMembers(e.target.checked)} />}
              label="ส่งถึงสมาชิกทุกคน (ไม่สนความยินยอม)"
            />
            {allMembers && (
              <Alert severity="warning">
                ใช้กับประกาศที่จำเป็นต้องแจ้งทุกคนเท่านั้น เช่น แจ้งปิดปรับปรุงระบบ — ไม่ใช่โฆษณา
                เพราะคนที่กดยกเลิกรับข่าวสารไว้จะได้รับด้วย
              </Alert>
            )}
            <Stack direction="row" spacing={2} alignItems="center">
              <Button variant="outlined" onClick={checkAudience} disabled={previewing}>
                {previewing ? 'กำลังนับ...' : 'ตรวจสอบจำนวนผู้รับ'}
              </Button>
              {audiencePreview && (
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {audiencePreview.total} คน · มีอีเมล {audiencePreview.withEmail} · มีเบอร์ {audiencePreview.withPhone}
                </Typography>
              )}
            </Stack>
            {audiencePreview?.sample?.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                ตัวอย่าง: {audiencePreview.sample.map((s: any) => s.name).filter(Boolean).join(', ')}
              </Typography>
            )}
          </Stack>
        </Paper>

        {(channel === 'email' || channel === 'both') && (
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>เนื้อหาอีเมล</Typography>
            <Stack spacing={2}>
              <TextField fullWidth label="หัวเรื่อง" value={subject} onChange={e => setSubject(e.target.value)} />
              <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
              <Alert severity="info">
                ใช้ตัวแปร <code>{'{{name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{phone}}'}</code> ได้ ·
                ระบบจะต่อลิงก์ "ยกเลิกรับข่าวสาร" ท้ายอีเมลให้อัตโนมัติ กดแล้วหยุดส่งทันทีรวมถึงฉบับที่ยังค้างคิวอยู่
              </Alert>
            </Stack>
          </Paper>
        )}

        {(channel === 'sms' || channel === 'both') && (
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>ข้อความ SMS</Typography>
            <TextField
              fullWidth multiline minRows={3} value={smsMessage} onChange={e => setSmsMessage(e.target.value)}
              helperText={`${smsMessage.length} ตัวอักษร · ภาษาไทยคิด 70 ตัวอักษรต่อ 1 ข้อความ`}
            />
          </Paper>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>ส่งข่าวสาร / ประชาสัมพันธ์</Typography>
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchAll}>รีเฟรช</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>สร้างแคมเปญ</Button>
        </Stack>
      </Stack>

      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        ระบบทยอยส่งเองเบื้องหลังทุก 5 นาที เพื่อไม่ให้ไปแย่งโควตาการส่งกับอีเมลยืนยันการจอง
        ถ้าอยากเร่งรอบถัดไปทันที กด "ส่งรอบถัดไปเลย"
        <Button size="small" sx={{ ml: 1, fontWeight: 700 }} onClick={sendNow}>ส่งรอบถัดไปเลย</Button>
      </Alert>

      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>ชื่อแคมเปญ</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ช่องทาง</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>ความคืบหน้า</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {broadcasts.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">
                <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีแคมเปญ</Typography>
              </TableCell></TableRow>
            )}
            {broadcasts.map(b => {
              const done = (b.sent_count || 0) + (b.failed_count || 0);
              const total = b.total_recipients || 0;
              return (
                <TableRow key={b.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{b.name}</TableCell>
                  <TableCell>{b.channel === 'both' ? 'อีเมล + SMS' : b.channel === 'sms' ? 'SMS' : 'อีเมล'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_META[b.status]?.label ?? b.status} color={STATUS_META[b.status]?.color ?? 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {total > 0 ? (
                      <Box>
                        <LinearProgress variant="determinate" value={Math.min(100, (done / total) * 100)} sx={{ height: 6, borderRadius: 3, mb: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">
                          ส่งแล้ว {b.sent_count} · ล้มเหลว {b.failed_count} · รอคิว {b.pending_count} จาก {total}
                        </Typography>
                      </Box>
                    ) : <Typography variant="caption" color="text.disabled">ยังไม่ได้เริ่มส่ง</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    {b.status === 'draft' && (
                      <>
                        <IconButton size="small" onClick={() => openEdit(b.id)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="primary" onClick={() => launch(b.id)} title="เริ่มส่ง"><SendIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={() => setItemToDelete({ id: b.id, name: b.name })}><DeleteIcon fontSize="small" /></IconButton>
                      </>
                    )}
                    {b.status === 'sending' && (
                      <IconButton size="small" color="warning" onClick={() => cancel(b.id)} title="หยุดส่งที่เหลือ"><CancelIcon fontSize="small" /></IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
        <DialogTitle sx={{ fontWeight: 800 }}>ลบแคมเปญ</DialogTitle>
        <DialogContent>
          <Typography variant="body2">ลบ "{itemToDelete?.name}" ใช่ไหม — ลบได้เฉพาะฉบับร่างที่ยังไม่ได้ส่ง</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={async () => {
            await axios.delete(`${API_BASE}/broadcasts/${itemToDelete!.id}`);
            setItemToDelete(null);
            fetchAll();
          }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BroadcastManagement;
