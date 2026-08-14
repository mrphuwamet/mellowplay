import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Box, CircularProgress, Button, Chip, IconButton,
  Paper, Stack, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tab,
} from '@mui/material';
import { ArrowBack as BackIcon, Visibility as ViewIcon } from '@mui/icons-material';
import FormResponseDashboard, { DashboardSubmission } from '../components/FormResponseDashboard';
import ExportMenu, { CsvPayload } from '../components/ExportMenu';
import AttemptComparison, { ComparisonSubmission } from '../components/AttemptComparison';

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
  const [tab, setTab] = useState(0);
  // Real answers or staff trial runs — never the two added together, which is
  // the whole reason trial runs are flagged rather than kept in a separate
  // table. Every tab on this page (summary, per-answer, before/after) reads
  // whichever set is selected.
  const [scope, setScope] = useState<'real' | 'test'>('real');
  const [counts, setCounts] = useState<{ real: number; test: number }>({ real: 0, test: 0 });
  const [clearingTests, setClearingTests] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/survey-forms/${id}`),
      axios.get(`${API_BASE}/survey-forms/${id}/submissions`, { params: { scope } }),
    ]).then(([formRes, subsRes]) => {
      if (formRes.data.success) setForm(formRes.data.form);
      if (subsRes.data.success) {
        setSubmissions(subsRes.data.submissions);
        if (subsRes.data.counts) setCounts(subsRes.data.counts);
      }
    }).finally(() => setLoading(false));
  }, [id, scope]);

  const clearTestSubmissions = async () => {
    if (!id) return;
    setClearingTests(true);
    try {
      await axios.delete(`${API_BASE}/survey-forms/${id}/test-submissions`);
      setSubmissions([]);
      setCounts(c => ({ ...c, test: 0 }));
    } finally { setClearingTests(false); }
  };

  const fieldsByKey = new Map((form?.fields || []).map((f: any) => [f.field_key, f]));

  // answers_json is unpacked once here rather than inside the dashboard, so the
  // dashboard stays usable by registration forms too — they carry the same
  // answers map in a different envelope.
  const dashboardSubmissions: DashboardSubmission[] = useMemo(() => submissions.map(s => {
    let answers: Record<string, any> = {};
    try { answers = JSON.parse(s.answers_json || '{}'); } catch { /* a malformed row shouldn't drop the rest of the summary */ }
    return { id: s.id, created_at: s.created_at, answers, total_score: s.total_score, max_score: s.max_score };
  }), [submissions]);

  const respondentLabel = (s: any) => {
    if (s.user_id) {
      const name = `${s.user_first_name || ''} ${s.user_last_name || ''}`.trim();
      return `สมาชิก: ${s.respondent_name || name || `#${s.user_id}`}`;
    }
    return s.respondent_name || 'ไม่ระบุตัวตน (Guest)';
  };

  // Declared after respondentLabel because it calls it — a useMemo body runs
  // during render, so it can't sit above the const it depends on.
  const comparisonSubmissions: ComparisonSubmission[] = useMemo(() => submissions.map(s => ({
    // Members pair by account, guests by the phone they typed; anything else
    // is anonymous and gets dropped by the comparison.
    respondentKey: s.user_id ? `u${s.user_id}` : (s.respondent_phone ? `p${s.respondent_phone}` : ''),
    respondentName: respondentLabel(s),
    attemptNo: s.attempt_no ?? 1,
    attemptLabel: s.attempt_label,
    totalScore: s.total_score,
    maxScore: s.max_score,
    createdAt: s.created_at,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [submissions]);

  // Built on demand by ExportMenu — one row per submission, one column per
  // question, matching what the table shows.
  const buildCsv = (): CsvPayload => {
    const questionFields = (form?.fields || []).filter((f: any) => f.type !== 'heading' && f.type !== 'paragraph');
    return {
      fileName: `${form?.name || 'survey'}-responses`,
      headers: ['วันที่ตอบ', 'ผู้ตอบ', 'เบอร์โทร', 'รอบ', ...(form?.has_answer_key ? ['คะแนน'] : []), ...questionFields.map((f: any) => f.label)],
      rows: dashboardSubmissions.map((d, i) => {
        const s = submissions[i];
        return [
          formatDateTime(s.created_at),
          respondentLabel(s),
          s.respondent_phone || '',
          s.attempt_label || `ครั้งที่ ${s.attempt_no ?? 1}`,
          ...(form?.has_answer_key ? [s.total_score != null ? `${s.total_score}/${s.max_score}` : ''] : []),
          ...questionFields.map((f: any) => {
            const v = d.answers[f.field_key];
            return Array.isArray(v) ? v.join('; ') : (v ?? '');
          }),
        ];
      }),
    };
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate('/crm/surveys')} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}><BackIcon /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>คำตอบ: {form?.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {submissions.length} คำตอบ{scope === 'test' ? ' (ทดลองทำ)' : ''}
          </Typography>
        </Box>
        <ExportMenu
          disabled={submissions.length === 0}
          csv={buildCsv}
          pdf={{
            getElement: () => exportRef.current,
            fileName: `${form?.name || 'survey'}-${tab === 0 ? 'summary' : tab === 2 ? 'comparison' : 'responses'}`,
            reportTitle: `${tab === 0 ? 'สรุปผล' : tab === 2 ? 'เทียบก่อน-หลัง' : 'รายคำตอบ'}: ${form?.name || ''}`,
            periodLabel: `${submissions.length} คำตอบ`,
          }}
        />
      </Stack>

      {/* Shown only once a trial run exists, so a form nobody has tested
          carries no extra control. */}
      {counts.test > 0 && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Chip
            label={`ผลจริง (${counts.real})`}
            color={scope === 'real' ? 'primary' : 'default'}
            variant={scope === 'real' ? 'filled' : 'outlined'}
            onClick={() => setScope('real')}
            sx={{ fontWeight: 700 }}
          />
          <Chip
            label={`ทดลองทำ (${counts.test})`}
            color={scope === 'test' ? 'warning' : 'default'}
            variant={scope === 'test' ? 'filled' : 'outlined'}
            onClick={() => setScope('test')}
            sx={{ fontWeight: 700 }}
          />
          {scope === 'test' && (
            <Button size="small" color="error" onClick={clearTestSubmissions} disabled={clearingTests} sx={{ fontWeight: 700 }}>
              {clearingTests ? 'กำลังลบ…' : 'ล้างผลทดลองทั้งหมด'}
            </Button>
          )}
        </Stack>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: '1px solid #eef0f3' }}>
        <Tab label="สรุปผล" sx={{ fontWeight: 700 }} />
        <Tab label={`รายคำตอบ (${submissions.length})`} sx={{ fontWeight: 700 }} />
        {/* Only a graded form has scores to take a difference of. */}
        {form?.has_answer_key && <Tab label="เทียบก่อน–หลัง" sx={{ fontWeight: 700 }} />}
      </Tabs>

      {/* The PDF captures whatever this wrapper is currently showing, so the
          file matches the tab the user is looking at. */}
      <Box ref={exportRef}>
      {tab === 0 && (
        <FormResponseDashboard
          fields={form?.fields || []}
          submissions={dashboardSubmissions}
          hasAnswerKey={!!form?.has_answer_key}
        />
      )}

      {tab === 1 && (
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
      )}

      {tab === 2 && form?.has_answer_key && (
        <AttemptComparison submissions={comparisonSubmissions} />
      )}
      </Box>

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
                {(form?.fields || []).filter((f: any) => f.type !== 'heading' && f.type !== 'paragraph' && f.type !== 'identity').map((f: any) => {
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
