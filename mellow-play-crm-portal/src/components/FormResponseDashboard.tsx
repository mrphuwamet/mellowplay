import React, { useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Chip, Button, Divider,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LabelList,
} from 'recharts';

/**
 * Shared response dashboard for any form built out of the survey/registration
 * field model. It takes fields + already-parsed submissions and picks the chart
 * for each question from its own type — so a new field type only has to be
 * handled here once, and both the survey pages and the registration-form pages
 * get it.
 *
 * Submissions arrive with `answers` already parsed rather than as raw
 * `answers_json` rows, because the two form families store the envelope
 * differently while the answers map itself is identical.
 */

export interface DashboardField {
  field_key: string;
  type: string;
  label: string;
  options_json?: string | null;
  config_json?: string | null;
}

export interface DashboardSubmission {
  id: number | string;
  created_at?: string;
  answers: Record<string, any>;
  total_score?: number | null;
  max_score?: number | null;
}

// One hue, not a palette. "How many people picked each option" is a magnitude
// comparison within a single question, so every bar is the same series — a
// per-bar rainbow would encode nothing and is the thing that breaks colour-blind
// readability. #7452d6 is the CRM's existing chart primary (Dashboard.tsx,
// SalesDashboard.tsx) and clears 3:1 on the white Paper surface.
const SERIES = '#7452d6';
const GRID = '#eef0f3';
const AXIS_INK = '#898781';

// Fields that carry no answer to summarise.
const NON_QUESTION_TYPES = new Set(['heading', 'image', 'identity']);

const isChoice = (type: string) => type === 'select' || type === 'radio' || type === 'checkbox';

const isAnswered = (v: any): boolean =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

const parseOptions = (f: DashboardField): string[] => {
  try {
    const parsed = f.options_json ? JSON.parse(f.options_json) : [];
    return Array.isArray(parsed) ? parsed.map((o: any) => String(o?.label ?? o)) : [];
  } catch {
    return []; // a malformed field shouldn't take the whole dashboard down
  }
};

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

const StatTile = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid #eef0f3', boxShadow: 'none', flex: '1 1 140px', minWidth: 140 }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>{label}</Typography>
    <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.3 }}>{value}</Typography>
    {hint && <Typography variant="caption" color="text.disabled">{hint}</Typography>}
  </Paper>
);

const QuestionCard = ({
  label, typeLabel, answered, total, children,
}: {
  label: string; typeLabel: string; answered: number; total: number; children: React.ReactNode;
}) => (
  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
    <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ mb: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          ตอบแล้ว {answered} จาก {total} คน ({pct(answered, total)}%)
        </Typography>
      </Box>
      <Chip label={typeLabel} size="small" sx={{ fontWeight: 700, flexShrink: 0 }} />
    </Stack>
    {children}
  </Paper>
);

// Y-axis ticks for the horizontal bars. Thai option text runs long, so it is
// truncated to fit the gutter and the full text is carried by the tooltip —
// never clipped mid-glyph by the SVG.
const CAT_AXIS_WIDTH = 200;

const CategoryTick = ({ x, y, payload }: any) => (
  <text x={x} y={y} dy={4} textAnchor="end" fill={AXIS_INK} fontSize={12}>
    {truncate(String(payload.value), 24)}
  </text>
);

const CountTooltip = ({ active, payload, respondents }: any) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <Paper sx={{ px: 1.5, py: 1, borderRadius: 2, border: '1px solid #eef0f3', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: 320 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.label}</Typography>
      <Typography variant="caption" color="text.secondary">
        {row.count} คน{respondents > 0 ? ` (${pct(row.count, respondents)}%)` : ''}
      </Typography>
    </Paper>
  );
};

/** Horizontal bars: one row per option, value at the tip. */
const CountBars = ({ rows, respondents }: { rows: { label: string; count: number }[]; respondents: number }) => (
  <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 40 + 24)}>
    {/* right margin holds the tip labels ("12 (100%)") outside the plot area
        so they never get clipped by the container edge */}
    <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 76, bottom: 4, left: 8 }}>
      <CartesianGrid stroke={GRID} horizontal={false} />
      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: AXIS_INK }} axisLine={false} tickLine={false} />
      <YAxis type="category" dataKey="label" width={CAT_AXIS_WIDTH} tick={<CategoryTick />} axisLine={false} tickLine={false} interval={0} />
      <RechartsTooltip cursor={{ fill: 'rgba(116,82,214,0.06)' }} content={<CountTooltip respondents={respondents} />} />
      <Bar dataKey="count" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={24}>
        <LabelList
          dataKey="count"
          position="right"
          formatter={(v: any) => (respondents > 0 ? `${v} (${pct(Number(v), respondents)}%)` : String(v))}
          style={{ fill: '#52514e', fontSize: 12, fontWeight: 700 }}
        />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

/** Vertical columns: for ordered buckets (number bins, months) where order carries meaning. */
const BucketColumns = ({ rows, respondents }: { rows: { label: string; count: number }[]; respondents: number }) => (
  <ResponsiveContainer width="100%" height={240}>
    <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      {/* past ~10 buckets every tick can't fit side by side; thin them out
          rather than letting the labels overlap into mush */}
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: AXIS_INK }}
        axisLine={false}
        tickLine={false}
        interval={rows.length > 10 ? 'preserveStartEnd' : 0}
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: AXIS_INK }} axisLine={false} tickLine={false} width={32} />
      <RechartsTooltip cursor={{ fill: 'rgba(116,82,214,0.06)' }} content={<CountTooltip respondents={respondents} />} />
      <Bar dataKey="count" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24}>
        <LabelList dataKey="count" position="top" style={{ fill: '#52514e', fontSize: 12, fontWeight: 700 }} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const TextAnswers = ({ answers }: { answers: string[] }) => {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? answers : answers.slice(0, 5);
  if (answers.length === 0) return <Typography variant="body2" color="text.disabled">ยังไม่มีคำตอบ</Typography>;
  return (
    <Box>
      <Stack divider={<Divider flexItem />} spacing={0}>
        {shown.map((a, i) => (
          <Typography key={i} variant="body2" sx={{ py: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a}</Typography>
        ))}
      </Stack>
      {answers.length > 5 && (
        <Button size="small" onClick={() => setExpanded(v => !v)} sx={{ mt: 1, fontWeight: 700 }}>
          {expanded ? 'ย่อ' : `แสดงทั้งหมด (${answers.length})`}
        </Button>
      )}
    </Box>
  );
};

/**
 * Buckets numeric answers. Few distinct values (a 1–5 rating, a headcount) read
 * better as exact values than as ranges, so binning only kicks in past that.
 */
const numberBuckets = (values: number[]): { label: string; count: number }[] => {
  const distinct = Array.from(new Set(values)).sort((a, b) => a - b);
  if (distinct.length <= 10) {
    return distinct.map(v => ({ label: String(v), count: values.filter(x => x === v).length }));
  }
  const min = distinct[0];
  const max = distinct[distinct.length - 1];
  const binCount = 8;
  const width = (max - min) / binCount || 1;
  return Array.from({ length: binCount }, (_, i) => {
    const lo = min + i * width;
    const hi = i === binCount - 1 ? max : lo + width;
    const count = values.filter(v => (i === binCount - 1 ? v >= lo && v <= hi : v >= lo && v < hi)).length;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    return { label: `${fmt(lo)}–${fmt(hi)}`, count };
  });
};

const monthBuckets = (values: string[]): { label: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const month = String(v).slice(0, 7); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ label, count }));
};

const TYPE_LABEL: Record<string, string> = {
  text: 'ข้อความสั้น',
  textarea: 'ข้อความยาว',
  number: 'ตัวเลข',
  date: 'วันที่',
  select: 'ตัวเลือก',
  radio: 'ตัวเลือก',
  checkbox: 'เลือกได้หลายข้อ',
};

const FormResponseDashboard = ({
  fields, submissions, hasAnswerKey = false,
}: {
  fields: DashboardField[];
  submissions: DashboardSubmission[];
  hasAnswerKey?: boolean;
}) => {
  const total = submissions.length;

  const questions = useMemo(
    () => (fields || []).filter(f => !NON_QUESTION_TYPES.has(f.type)),
    [fields]
  );

  const scoreStats = useMemo(() => {
    const scored = submissions.filter(s => s.total_score != null);
    if (!hasAnswerKey || scored.length === 0) return null;
    const scores = scored.map(s => Number(s.total_score));
    const maxScore = Number(scored[0].max_score) || 0;
    const sum = scores.reduce((a, b) => a + b, 0);
    return {
      count: scored.length,
      avg: sum / scored.length,
      min: Math.min(...scores),
      max: Math.max(...scores),
      maxScore,
      buckets: numberBuckets(scores),
    };
  }, [submissions, hasAnswerKey]);

  if (total === 0) {
    return (
      <Paper sx={{ p: 6, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none', textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">ยังไม่มีคนตอบ — กราฟสรุปผลจะขึ้นเมื่อมีคำตอบเข้ามา</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Hero figure — the one number this view leads with. */}
      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>คำตอบทั้งหมด</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 48, lineHeight: 1.1 }}>{total}</Typography>
          </Box>
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={2} sx={{ flex: 1 }}>
            <StatTile label="จำนวนคำถาม" value={questions.length} />
            {scoreStats && (
              <>
                <StatTile
                  label="คะแนนเฉลี่ย"
                  value={scoreStats.avg.toFixed(1)}
                  hint={scoreStats.maxScore > 0 ? `จากเต็ม ${scoreStats.maxScore}` : undefined}
                />
                <StatTile label="คะแนนต่ำสุด–สูงสุด" value={`${scoreStats.min}–${scoreStats.max}`} />
              </>
            )}
          </Stack>
        </Stack>
      </Paper>

      {scoreStats && (
        <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>การกระจายของคะแนน</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            จำนวนคนในแต่ละช่วงคะแนน ({scoreStats.count} คนที่มีคะแนน)
          </Typography>
          <BucketColumns rows={scoreStats.buckets} respondents={scoreStats.count} />
        </Paper>
      )}

      {questions.map(f => {
        const values = submissions.map(s => s.answers?.[f.field_key]);
        const answeredValues = values.filter(isAnswered);
        const answered = answeredValues.length;
        const typeLabel = TYPE_LABEL[f.type] || f.type;

        let body: React.ReactNode;

        if (isChoice(f.type)) {
          // Seed from the form's own options so a zero-pick option still shows,
          // then append anything answered that no longer matches an option (the
          // field was edited after those answers came in).
          const counts = new Map<string, number>(parseOptions(f).map(o => [o, 0]));
          for (const v of answeredValues) {
            const picks: string[] = Array.isArray(v) ? v.map(String) : [String(v)];
            for (const p of picks) counts.set(p, (counts.get(p) || 0) + 1);
          }
          const rows = Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
          body = rows.length > 0
            ? <CountBars rows={rows} respondents={answered} />
            : <Typography variant="body2" color="text.disabled">คำถามนี้ยังไม่มีตัวเลือก</Typography>;
        } else if (f.type === 'number') {
          const nums = answeredValues.map(Number).filter(n => !isNaN(n));
          if (nums.length === 0) {
            body = <Typography variant="body2" color="text.disabled">ยังไม่มีคำตอบที่เป็นตัวเลข</Typography>;
          } else {
            const sum = nums.reduce((a, b) => a + b, 0);
            body = (
              <Stack spacing={2}>
                <Stack direction="row" useFlexGap flexWrap="wrap" gap={2}>
                  <StatTile label="ค่าเฉลี่ย" value={(sum / nums.length).toFixed(1)} />
                  <StatTile label="ต่ำสุด" value={Math.min(...nums)} />
                  <StatTile label="สูงสุด" value={Math.max(...nums)} />
                </Stack>
                <BucketColumns rows={numberBuckets(nums)} respondents={nums.length} />
              </Stack>
            );
          }
        } else if (f.type === 'date') {
          const rows = monthBuckets(answeredValues.map(String));
          body = rows.length > 0
            ? <BucketColumns rows={rows} respondents={answered} />
            : <Typography variant="body2" color="text.disabled">ยังไม่มีคำตอบที่เป็นวันที่</Typography>;
        } else {
          body = <TextAnswers answers={answeredValues.map(v => (Array.isArray(v) ? v.join(', ') : String(v)))} />;
        }

        return (
          <QuestionCard key={f.field_key} label={f.label} typeLabel={typeLabel} answered={answered} total={total}>
            {body}
          </QuestionCard>
        );
      })}
    </Stack>
  );
};

export default FormResponseDashboard;
