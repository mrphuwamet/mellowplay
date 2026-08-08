import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Box, CircularProgress, Button, Chip, IconButton,
  Paper, Stack, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { ArrowBack as BackIcon, Visibility as ViewIcon, Download as DownloadIcon } from '@mui/icons-material';

const API_BASE = `${API_URL}/api/v1/admin`;

const formatDateTime = (raw: string | undefined): string => {
  if (!raw) return '-';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
};

const SurveyResponses = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/survey-forms/${id}`),
      axios.get(`${API_BASE}/survey-forms/${id}/submissions`),
    ]).then(([formRes, subsRes]) => {
      if (formRes.data.success) setForm(formRes.data.form);
      if (subsRes.data.success) setSubmissions(subsRes.data.submissions);
    }).finally(() => setLoading(false));
  }, [id]);

  const fieldsByKey = new Map((form?.fields || []).map((f: any) => [f.field_key, f]));

  const respondentLabel = (s: any) => {
    if (s.user_id) {
      const name = `${s.user_first_name || ''} ${s.user_last_name || ''}`.trim();
      return `สมาชิก: ${s.respondent_name || name || `#${s.user_id}`}`;
    }
    return s.respondent_name || 'ไม่ระบุตัวตน (Guest)';
  };

  const exportCSV = () => {
    const questionFields = (form?.fields || []).filter((f: any) => f.type !== 'heading');
    const headers = ['วันที่ตอบ', 'ผู้ตอบ', 'เบอร์โทร', ...(form?.has_answer_key ? ['คะแนน'] : []), ...questionFields.map((f: any) => f.label)];
    const rows = submissions.map(s => {
      let answers: Record<string, any> = {};
      try { answers = JSON.parse(s.answers_json || '{}'); } catch { /* malformed row shouldn't block the rest of the export */ }
      return [
        formatDateTime(s.created_at),
        respondentLabel(s),
        s.respondent_phone || '',
        ...(form?.has_answer_key ? [s.total_score != null ? `${s.total_score}/${s.max_score}` : ''] : []),
        ...questionFields.map((f: any) => {
          const v = answers[f.field_key];
          return Array.isArray(v) ? v.join('; ') : (v ?? '');
        }),
      ];
    });
    const csv = [headers, ...rows].map(r => r.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form?.name || 'survey'}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate('/crm/surveys')} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>คำตอบ: {form?.name}</Typography>
          <Typography variant="body2" color="text.secondary">{submissions.length} คำตอบ</Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCSV} disabled={submissions.length === 0}>
          Export CSV
        </Button>
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>วันที่ตอบ</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ผู้ตอบ</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>เบอร์โทร</TableCell>
              {form?.has_answer_key && <TableCell sx={{ fontWeight: 700 }}>คะแนน</TableCell>}
              <TableCell sx={{ fontWeight: 700 }} align="right">จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {submissions.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">
                <Typography variant="body2" color="text.disabled" sx={{ py: 4 }}>ยังไม่มีคนตอบ</Typography>
              </TableCell></TableRow>
            )}
            {submissions.map(s => (
              <TableRow key={s.id} hover>
                <TableCell>{formatDateTime(s.created_at)}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{respondentLabel(s)}</TableCell>
                <TableCell>{s.respondent_phone || '-'}</TableCell>
                {form?.has_answer_key && (
                  <TableCell>
                    <Chip label={s.total_score != null ? `${s.total_score} / ${s.max_score}` : '-'} size="small" color="primary" variant="outlined" />
                  </TableCell>
                )}
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setViewing(s)}><ViewIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!viewing} onClose={() => setViewing(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>คำตอบของ {viewing ? respondentLabel(viewing) : ''}</DialogTitle>
        <DialogContent dividers>
          {viewing && (() => {
            let answers: Record<string, any> = {};
            try { answers = JSON.parse(viewing.answers_json || '{}'); } catch { /* malformed answers shouldn't block the rest of the dialog */ }
            return (
              <Stack spacing={2}>
                {form?.has_answer_key && (
                  <Chip label={`คะแนนรวม: ${viewing.total_score} / ${viewing.max_score}`} color="primary" sx={{ fontWeight: 700, alignSelf: 'flex-start' }} />
                )}
                {(form?.fields || []).filter((f: any) => f.type !== 'heading' && f.type !== 'identity').map((f: any) => {
                  const v = answers[f.field_key];
                  const display = Array.isArray(v) ? (v.length ? v.join(', ') : '-') : (v ?? '-');
                  return (
                    <Box key={f.field_key}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>{f.label}</Typography>
                      <Typography variant="body2">{String(display)}</Typography>
                    </Box>
                  );
                })}
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewing(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SurveyResponses;
