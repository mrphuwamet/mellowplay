import React, { useMemo } from 'react';
import {
  Paper, Typography, Stack, Chip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LabelList, Cell, ReferenceLine,
} from 'recharts';

/**
 * Session A vs Session B — three levels, because a single average hides which
 * question moved and which person moved.
 *
 * Sessions may not hold the same forms, so everything is computed over the
 * forms they share. Comparing a question only one side asked would be
 * comparing an answer with nothing.
 */

export interface SessionSubmission {
  id: number;
  form_id: number;
  session_run_id: string | null;
  respondent_name: string | null;
  total_score: number | null;
  max_score: number | null;
  answers_json: string;
  has_answer_key?: number | boolean;
}

export interface SessionBundle {
  session: { id: number; name: string; forms: { form_id: number; name: string }[] };
  submissions: SessionSubmission[];
}

export interface FormFields {
  [formId: number]: { field_key: string; type: string; label: string; options_json?: string | null; config_json?: string | null }[];
}

const UP = '#10b981';
const DOWN = '#ef4444';
const FLAT = '#c3c2b7';
const GRID = '#eef0f3';
const AXIS_INK = '#898781';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// Same normalisation the server uses to enforce one-answer-per-person, so a
// person matches across sessions on exactly the rule they were checked against.
const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const parseAnswers = (raw: string): Record<string, any> => {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
};

const isChoice = (type: string) => type === 'select' || type === 'radio' || type === 'checkbox';

const optionPoints = (optionsJson?: string | null): Map<string, number> => {
  const map = new Map<string, number>();
  try {
    for (const o of JSON.parse(optionsJson || '[]')) map.set(String(o.label), Number(o.points) || 0);
  } catch { /* malformed options score as nothing rather than break the page */ }
  return map;
};

const isScored = (configJson?: string | null) => {
  try { return !!(configJson && JSON.parse(configJson).scored); } catch { return false; }
};

const StatTile = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid #eef0f3', boxShadow: 'none', flex: '1 1 150px', minWidth: 150 }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>{label}</Typography>
    <Typography sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.3 }}>{value}</Typography>
    {hint && <Typography variant="caption" color="text.disabled">{hint}</Typography>}
  </Paper>
);

const DeltaBars = ({ rows, height }: { rows: { name: string; delta: number; a: number; b: number }[]; height: number }) => {
  const bound = Math.max(1, ...rows.map(r => Math.abs(r.delta)));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" domain={[-bound, bound]} tick={{ fontSize: 12, fill: AXIS_INK }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={210} tick={{ fontSize: 12, fill: AXIS_INK }} axisLine={false} tickLine={false} interval={0} />
        <RechartsTooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          formatter={(v: any, _n: any, p: any) => [`A ${round1(p.payload.a)} → B ${round1(p.payload.b)} (${signed(round1(Number(v)))})`, '']}
        />
        <ReferenceLine x={0} stroke="#c3c2b7" />
        <Bar dataKey="delta" maxBarSize={24} radius={[4, 4, 4, 4]}>
          {rows.map((r, i) => <Cell key={i} fill={r.delta > 0 ? UP : r.delta < 0 ? DOWN : FLAT} />)}
          <LabelList dataKey="delta" position="right" formatter={(v: any) => signed(round1(Number(v)))}
            style={{ fill: '#52514e', fontSize: 12, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const SessionComparison = ({ a, b, fields }: { a: SessionBundle; b: SessionBundle; fields: FormFields }) => {
  const sharedFormIds = useMemo(() => {
    const bIds = new Set(b.session.forms.map(f => f.form_id));
    return a.session.forms.filter(f => bIds.has(f.form_id)).map(f => f.form_id);
  }, [a, b]);

  // A "person" is one run of the session. Score is summed across whichever
  // shared forms they completed, so both sides are measured on the same papers.
  const peopleOf = (bundle: SessionBundle) => {
    const runs = new Map<string, { name: string; score: number; max: number; graded: boolean }>();
    for (const s of bundle.submissions) {
      if (!sharedFormIds.includes(s.form_id)) continue;
      const key = s.session_run_id || `sub_${s.id}`;
      const entry = runs.get(key) || { name: s.respondent_name || '(ไม่ระบุชื่อ)', score: 0, max: 0, graded: false };
      if (s.total_score != null) {
        entry.score += Number(s.total_score);
        entry.max += Number(s.max_score) || 0;
        entry.graded = true;
      }
      if (s.respondent_name) entry.name = s.respondent_name;
      runs.set(key, entry);
    }
    return [...runs.values()];
  };

  const peopleA = useMemo(() => peopleOf(a), [a, sharedFormIds]);
  const peopleB = useMemo(() => peopleOf(b), [b, sharedFormIds]);

  const avgOf = (people: ReturnType<typeof peopleOf>) => {
    const graded = people.filter(p => p.graded);
    return graded.length ? graded.reduce((sum, p) => sum + p.score, 0) / graded.length : null;
  };
  const avgA = avgOf(peopleA);
  const avgB = avgOf(peopleB);

  // Per question: average points earned on each side. Only scored choice
  // questions have a number to average; the rest have no comparable measure.
  const perQuestion = useMemo(() => {
    const rows: { name: string; a: number; b: number; delta: number }[] = [];
    for (const formId of sharedFormIds) {
      for (const f of fields[formId] || []) {
        if (!isChoice(f.type) || !isScored(f.config_json)) continue;
        const points = optionPoints(f.options_json);
        const avgFor = (bundle: SessionBundle) => {
          const subs = bundle.submissions.filter(s => s.form_id === formId);
          if (!subs.length) return null;
          const scores = subs.map(s => {
            const v = parseAnswers(s.answers_json)[f.field_key];
            const picks: string[] = Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : [];
            return picks.reduce((sum, p) => sum + (points.get(p) ?? 0), 0);
          });
          return scores.reduce((x, y) => x + y, 0) / scores.length;
        };
        const qa = avgFor(a);
        const qb = avgFor(b);
        if (qa == null || qb == null) continue;
        rows.push({ name: f.label, a: qa, b: qb, delta: qb - qa });
      }
    }
    return rows.sort((x, y) => y.delta - x.delta);
  }, [a, b, fields, sharedFormIds]);

  // Per person: same human in both sessions, matched on their normalised name.
  const perPerson = useMemo(() => {
    const bByName = new Map<string, { name: string; score: number; graded: boolean }>();
    for (const p of peopleB) if (p.graded) bByName.set(normalizeName(p.name), p);
    return peopleA
      .filter(p => p.graded && bByName.has(normalizeName(p.name)))
      .map(p => {
        const other = bByName.get(normalizeName(p.name))!;
        return { name: p.name, a: p.score, b: other.score, delta: other.score - p.score };
      })
      .sort((x, y) => y.delta - x.delta);
  }, [peopleA, peopleB]);

  if (sharedFormIds.length === 0) {
    return (
      <Alert severity="warning">
        สอง Session นี้ไม่มีแบบฟอร์มร่วมกันเลย จึงเทียบกันไม่ได้ — คะแนนจากคนละชุดคำถามเอามาลบกันไม่ได้
        กรุณาเลือก Session ที่ใช้แบบฟอร์มเดียวกันอย่างน้อย 1 อัน
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 2 }}>
          เทียบบนแบบฟอร์มที่ใช้ร่วมกัน {sharedFormIds.length} ชุด
          {sharedFormIds.length < a.session.forms.length || sharedFormIds.length < b.session.forms.length
            ? ' (แบบฟอร์มที่มีแค่ฝั่งเดียวถูกตัดออกจากการเทียบ)' : ''}
        </Typography>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={2}>
          <StatTile label="คนตอบ A" value={peopleA.length} hint={a.session.name} />
          <StatTile label="คนตอบ B" value={peopleB.length} hint={b.session.name} />
          <StatTile label="คะแนนเฉลี่ย A" value={avgA == null ? '-' : round1(avgA)} />
          <StatTile label="คะแนนเฉลี่ย B" value={avgB == null ? '-' : round1(avgB)} />
          <StatTile
            label="ผลต่างเฉลี่ย"
            value={avgA == null || avgB == null ? '-' : signed(round1(avgB - avgA))}
            hint="B ลบ A"
          />
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>รายคำถาม</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          คะแนนเฉลี่ยที่ได้ในแต่ละข้อ · แท่งขวาคือ B ทำได้ดีกว่า
        </Typography>
        {perQuestion.length === 0 ? (
          <Typography variant="body2" color="text.disabled">แบบฟอร์มที่ใช้ร่วมกันยังไม่มีคำถามที่ให้คะแนน</Typography>
        ) : (
          <DeltaBars rows={perQuestion} height={Math.max(140, perQuestion.length * 40 + 24)} />
        )}
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>รายคน</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          เฉพาะคนที่ทำทั้งสอง Session (จับคู่จากชื่อ) {perPerson.length} คน
        </Typography>
        {perPerson.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            ยังไม่มีใครทำครบทั้งสอง Session — หรือชื่อที่กรอกไว้ไม่ตรงกันจนจับคู่ไม่ได้
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>ผู้ตอบ</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{a.session.name}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{b.session.name}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">ผลต่าง</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perPerson.map(p => (
                  <TableRow key={p.name} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{p.name}</TableCell>
                    <TableCell align="right">{round1(p.a)}</TableCell>
                    <TableCell align="right">{round1(p.b)}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={signed(round1(p.delta))} sx={{
                        fontWeight: 800,
                        color: p.delta > 0 ? '#047857' : p.delta < 0 ? '#b91c1c' : 'text.secondary',
                        bgcolor: p.delta > 0 ? 'rgba(16,185,129,0.12)' : p.delta < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(0,0,0,0.05)',
                      }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  );
};

export default SessionComparison;
