import React from 'react';
import {
  Box, Paper, Typography, Button, IconButton, TextField, MenuItem, Select,
  FormControl, InputLabel, Stack, Tooltip, Chip,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, ArrowUpward as UpIcon, ArrowDownward as DownIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import {
  CertField, CertRule, CertValueMap, RuleCondition, RuleOp, RULE_OPS,
  applyRules, displayValue,
} from '../utils/certificateLayout';

/**
 * Conditional text for one field, as a list of rules read top to bottom.
 *
 * Deliberately not a formula box. The thing staff actually need — "ถ้าเพศเป็น
 * ชาย ให้ขึ้นต้นว่า เด็กชาย" — is a condition and a sentence, and a list of
 * those is something anyone can read back and check. A formula language would
 * be more powerful and would be used by nobody.
 *
 * First match wins, and a rule with no condition is the default that ends the
 * list — the order every rule list anyone has used already works in.
 *
 * A rule may carry SEVERAL conditions, all of which must hold: families
 * register in whichever script they think of themselves in, so "ถ้าเป็นผู้ชาย
 * และชื่อเป็นภาษาอังกฤษ" is an ordinary thing to need and not an advanced one.
 */

/** Always a list, whatever shape the rule was saved in. */
const conditionsOf = (rule: CertRule): RuleCondition[] => {
  if (!rule.when) return [];
  return Array.isArray(rule.when) ? rule.when : [rule.when];
};

const RuleEditor = ({ field, variables, values, onChange }: {
  field: CertField;
  variables: { key: string; label: string }[];
  values: CertValueMap;
  onChange: (rules: CertRule[]) => void;
}) => {
  const rules = field.rules || [];

  const setRule = (i: number, patch: Partial<CertRule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  /** Conditions are always written back as a list, so the two shapes stop
   *  multiplying the moment anything is edited. */
  const setConditions = (i: number, list: RuleCondition[]) =>
    setRule(i, { when: list.length > 0 ? list : null });

  const setCondition = (i: number, ci: number, patch: Partial<RuleCondition>) => {
    const list = conditionsOf(rules[i]);
    setConditions(i, list.map((c, idx) => (idx === ci ? { ...c, ...patch } : c)));
  };

  const addCondition = (i: number) =>
    setConditions(i, [...conditionsOf(rules[i]), { variable: field.value, op: 'eq', value: '' }]);

  const move = (i: number, by: number) => {
    const next = [...rules];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const addRule = () => onChange([
    ...rules,
    // Pre-filled against the field's own variable and printing it back
    // unchanged: a new rule that already works is easier to edit into shape
    // than a blank one that prints nothing.
    { when: [{ variable: field.value, op: 'eq', value: '' }], text: `{{${field.value}}}` },
  ]);

  const addDefault = () => onChange([...rules, { text: `{{${field.value}}}` }]);

  const hasDefault = rules.some(r => conditionsOf(r).length === 0);
  const preview = applyRules(rules, values, displayValue(field.value, values), false,
    { dateFormat: field.dateFormat, dateLang: field.dateLang });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', flex: 1 }}>
          เงื่อนไขการแสดงข้อความ
        </Typography>
        <Tooltip title="เพิ่มเงื่อนไข">
          <IconButton size="small" onClick={addRule}><AddIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      {rules.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          ยังไม่มีเงื่อนไข — ช่องนี้จะพิมพ์ค่าตัวแปรตามที่เป็น เช่น ถ้าต้องการให้ขึ้นต้นว่า
          “เด็กชาย/เด็กหญิง” ตามเพศ ให้กด + เพื่อเพิ่มเงื่อนไข
        </Typography>
      )}

      <Stack spacing={1}>
        {rules.map((rule, i) => {
          const conds = conditionsOf(rule);
          return (
            <Paper key={i} variant="outlined" sx={{ p: 1, borderRadius: 2, bgcolor: conds.length > 0 ? 'transparent' : '#fbfaff' }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
                <Chip
                  size="small"
                  label={conds.length > 0 ? (i === 0 ? 'ถ้า' : 'ไม่งั้น ถ้า') : 'นอกนั้น'}
                  color={conds.length > 0 ? 'default' : 'primary'}
                  sx={{ fontWeight: 700 }}
                />
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}><UpIcon fontSize="small" /></IconButton>
                <IconButton size="small" disabled={i === rules.length - 1} onClick={() => move(i, 1)}><DownIcon fontSize="small" /></IconButton>
                <IconButton size="small" color="error" onClick={() => onChange(rules.filter((_, idx) => idx !== i))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>

              {conds.map((cond, ci) => (
                <Stack key={ci} spacing={1} sx={{ mb: 1 }}>
                  {ci > 0 && (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Chip size="small" label="และ" sx={{ fontWeight: 800, height: 20 }} />
                      <Box sx={{ flex: 1, borderBottom: '1px dashed #e4e6f0' }} />
                      <Tooltip title="เอาเงื่อนไขนี้ออก">
                        <IconButton size="small" onClick={() => setConditions(i, conds.filter((_, idx) => idx !== ci))}>
                          <CloseIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  )}
                  <FormControl size="small" fullWidth>
                    <InputLabel>ดูจากตัวแปร</InputLabel>
                    <Select
                      label="ดูจากตัวแปร" value={cond.variable}
                      onChange={e => setCondition(i, ci, { variable: String(e.target.value) })}
                    >
                      {variables.map(v => <MenuItem key={v.key} value={v.key}>{v.label}</MenuItem>)}
                      {!variables.some(v => v.key === cond.variable) && (
                        <MenuItem value={cond.variable}>{cond.variable}</MenuItem>
                      )}
                    </Select>
                  </FormControl>
                  <Stack direction="row" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 148 }}>
                      <InputLabel>เงื่อนไข</InputLabel>
                      <Select
                        label="เงื่อนไข" value={cond.op}
                        onChange={e => setCondition(i, ci, { op: e.target.value as RuleOp })}
                      >
                        {RULE_OPS.map(o => <MenuItem key={o.op} value={o.op}>{o.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                    {RULE_OPS.find(o => o.op === cond.op)?.needsValue && (
                      <TextField
                        size="small" fullWidth label="ค่า"
                        value={cond.value || ''}
                        onChange={e => setCondition(i, ci, { value: e.target.value })}
                        placeholder="เช่น male"
                      />
                    )}
                  </Stack>
                </Stack>
              ))}

              {conds.length > 0 && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => addCondition(i)} sx={{ mb: 1 }}>
                  เพิ่มเงื่อนไข “และ”
                </Button>
              )}

              <TextField
                size="small" fullWidth multiline minRows={1} label="ให้พิมพ์ว่า"
                value={rule.text}
                onChange={e => setRule(i, { text: e.target.value })}
                helperText="ใส่ตัวแปรด้วย {{ชื่อตัวแปร}} เช่น เด็กชาย{{recipient_name}}"
              />
            </Paper>
          );
        })}
      </Stack>

      {rules.length > 0 && !hasDefault && (
        <Button size="small" sx={{ mt: 1 }} startIcon={<AddIcon />} onClick={addDefault}>
          เพิ่มกรณี “นอกนั้น”
        </Button>
      )}

      {rules.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 1, p: 1, borderRadius: 2, bgcolor: '#f7f8fb' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
            ผลลัพธ์ตอนนี้
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
            {preview || '(ว่าง)'}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default RuleEditor;
