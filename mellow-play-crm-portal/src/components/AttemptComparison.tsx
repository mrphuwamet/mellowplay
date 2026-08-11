import React, { useMemo } from 'react';
import {
  Box, Paper, Typography, Stack, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LabelList, Cell, ReferenceLine,
} from 'recharts';

/**
 * Before → after per respondent, for a graded form answered more than once.
 *
 * Pairing is by attempt_no on the submission (see migration 0075), not by the
 * form's pretest/posttest label — those are two different forms with two
 * different question sets, and a score delta across different questions means
 * nothing.
 */

export interface ComparisonSubmission {
  /** Stable per-respondent key; '' for anonymous rows that can't be paired. */
  respondentKey: string;
  respondentName: string;
  attemptNo: number;
  attemptLabel?: string | null;
  totalScore: number | null;
  maxScore: number | null;
  createdAt?: string;
}

// Diverging pair: improvement vs decline are opposite directions of one
// measure, so they get two opposed hues around a neutral zero — not two
// arbitrary categorical slots. Both carry a signed number label as well, since
// the green sits under 3:1 on white and must not be the only channel.
const UP = '#10b981';
const DOWN = '#ef4444';
const FLAT = '#c3c2b7';
const GRID = '#eef0f3';
const AXIS_INK = '#898781';

const CHART_LIMIT = 20;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

interface Pair {
  key: string;
  name: string;
  first: ComparisonSubmission;
  last: ComparisonSubmission;
  delta: number;
  attempts: number;
}

const StatTile = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid #eef0f3', boxShadow: 'none', flex: '1 1 140px', minWidth: 140 }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>{label}</Typography>
    <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.3 }}>{value}</Typography>
    {hint && <Typography variant="caption" color="text.disabled">{hint}</Typography>}
  </Paper>
);

const roundLabel = (s: ComparisonSubmission) => s.attemptLabel || `ครั้งที่ ${s.attemptNo}`;

const DeltaTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p: Pair = payload[0].payload.pair;
  return (
    <Paper sx={{ px: 1.5, py: 1, borderRadius: 2, border: '1px solid #eef0f3', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: 320 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.name}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {roundLabel(p.first)}: {p.first.totalScore} → {roundLabel(p.last)}: {p.last.totalScore}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>ผลต่าง {signed(p.delta)} คะแนน</Typography>
    </Paper>
  );
};

const AttemptComparison = ({ submissions }: { submissions: ComparisonSubmission[] }) => {
  const pairs = useMemo<Pair[]>(() => {
    const byRespondent = new Map<string, ComparisonSubmission[]>();
    for (const s of submissions) {
      if (!s.respondentKey) continue; // anonymous — nothing to pair it with
      const list = byRespondent.get(s.respondentKey);
      if (list) list.push(s); else byRespondent.set(s.respondentKey, [s]);
    }

    const out: Pair[] = [];
    for (const [key, list] of byRespondent) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => a.attemptNo - b.attemptNo);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      // A delta needs both ends graded; an ungraded round is not a zero.
      if (first.totalScore == null || last.totalScore == null) continue;
      out.push({
        key,
        name: last.respondentName || first.respondentName,
        first,
        last,
        delta: Number(last.totalScore) - Number(first.totalScore),
        attempts: sorted.length,
      });
    }
    return out.sort((a, b) => b.delta - a.delta);
  }, [submissions]);

  const summary = useMemo(() => {
    if (pairs.length === 0) return null;
    const deltas = pairs.map(p => p.delta);
    return {
      people: pairs.length,
      avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      improved: deltas.filter(d => d > 0).length,
      same: deltas.filter(d => d === 0).length,
      declined: deltas.filter(d => d < 0).length,
    };
  }, [pairs]);

  if (pairs.length === 0) {
    return (
      <Paper sx={{ p: 6, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none', textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled" sx={{ mb: 1 }}>
          ยังไม่มีใครตอบแบบฟอร์มนี้ครบ 2 รอบ
        </Typography>
        <Typography variant="caption" color="text.disabled">
          ส่งลิงก์เดิมให้ตอบอีกครั้งหลังเรียนจบ ระบบจะนับรอบให้เอง — ถ้าอยากตั้งชื่อรอบ ให้เติม
          {' '}<code>?attempt=หลังเรียน</code>{' '}ท้ายลิงก์<br />
          (ผู้ตอบต้องล็อกอิน หรือกรอกเบอร์โทรเดิม ระบบจึงจะรู้ว่าเป็นคนเดียวกัน)
        </Typography>
      </Paper>
    );
  }

  // Cap the chart so 300 respondents don't render 300 unreadable rows — the
  // table below is always complete, and the caption says what was cut.
  const charted = [...pairs]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, CHART_LIMIT)
    .sort((a, b) => b.delta - a.delta)
    .map(p => ({ name: p.name, delta: p.delta, pair: p }));

  const bound = Math.max(1, ...charted.map(r => Math.abs(r.delta)));

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={2}>
          <StatTile label="ตอบครบ 2 รอบ" value={summary!.people} hint="คน" />
          <StatTile label="ผลต่างเฉลี่ย" value={signed(Number(summary!.avg.toFixed(1)))} hint="คะแนน" />
          <StatTile label="ดีขึ้น" value={summary!.improved} hint="คน" />
          <StatTile label="เท่าเดิม / แย่ลง" value={`${summary!.same} / ${summary!.declined}`} hint="คน" />
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>ผลต่างคะแนนรายคน</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          รอบแรกเทียบรอบล่าสุด · แท่งขวาคือดีขึ้น แท่งซ้ายคือแย่ลง
          {pairs.length > CHART_LIMIT && ` · แสดง ${CHART_LIMIT} คนที่เปลี่ยนแปลงมากที่สุดจาก ${pairs.length} คน (ครบทุกคนในตารางด้านล่าง)`}
        </Typography>
        <ResponsiveContainer width="100%" height={Math.max(140, charted.length * 40 + 24)}>
          <BarChart data={charted} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis
              type="number"
              domain={[-bound, bound]}
              allowDecimals={false}
              tick={{ fontSize: 12, fill: AXIS_INK }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 12, fill: AXIS_INK }} axisLine={false} tickLine={false} interval={0} />
            <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<DeltaTooltip />} />
            <ReferenceLine x={0} stroke="#c3c2b7" />
            <Bar dataKey="delta" maxBarSize={24} radius={[4, 4, 4, 4]}>
              {charted.map((r, i) => (
                <Cell key={i} fill={r.delta > 0 ? UP : r.delta < 0 ? DOWN : FLAT} />
              ))}
              <LabelList
                dataKey="delta"
                position="right"
                formatter={(v: any) => signed(Number(v))}
                style={{ fill: '#52514e', fontSize: 12, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>ผู้ตอบ</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>รอบแรก</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>รอบล่าสุด</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">ผลต่าง</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">จำนวนรอบ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pairs.map(p => (
              <TableRow key={p.key} hover>
                <TableCell sx={{ fontWeight: 700 }}>{p.name}</TableCell>
                <TableCell>
                  {p.first.totalScore}{p.first.maxScore != null ? ` / ${p.first.maxScore}` : ''}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{roundLabel(p.first)}</Typography>
                </TableCell>
                <TableCell>
                  {p.last.totalScore}{p.last.maxScore != null ? ` / ${p.last.maxScore}` : ''}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{roundLabel(p.last)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Chip
                    size="small"
                    label={signed(p.delta)}
                    sx={{
                      fontWeight: 800,
                      color: p.delta > 0 ? '#047857' : p.delta < 0 ? '#b91c1c' : 'text.secondary',
                      bgcolor: p.delta > 0 ? 'rgba(16,185,129,0.12)' : p.delta < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(0,0,0,0.05)',
                    }}
                  />
                </TableCell>
                <TableCell align="right">{p.attempts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box />
    </Stack>
  );
};

export default AttemptComparison;
