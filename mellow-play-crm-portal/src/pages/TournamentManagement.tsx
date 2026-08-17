import { API_URL } from '../config';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, Checkbox, ListItemText, OutlinedInput,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, EmojiEvents as TrophyIcon,
  ArrowForward as MoveIcon, Groups as TeamIcon, FamilyRestroom as FamilyIcon,
  Person as PersonIcon, AutoAwesome as AutoIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

type EntryType = 'team' | 'family' | 'person';

interface EntryOption {
  entryType: EntryType;
  refKey: string;
  label: string;
  subLabel: string;
  bookingIds: number[];
  slotDate: string | null;
  slotStartTime: string | null;
}

interface Heat {
  id: number;
  name: string;
  slot_date: string | null;
  slot_start_time: string | null;
  capacity: number | null;
  status: string;
  note: string | null;
}

interface Entry {
  id: number;
  heat_id: number;
  entry_type: EntryType;
  ref_key: string;
  label: string;
  sub_label: string | null;
  result_rank: number | null;
  booking_ids: number[];
}

const TYPE_LABEL: Record<EntryType, string> = {
  team: 'ทั้งทีม',
  family: 'ทั้งครอบครัว',
  person: 'รายคน',
};

const TYPE_ICON: Record<EntryType, React.ReactNode> = {
  team: <TeamIcon fontSize="small" />,
  family: <FamilyIcon fontSize="small" />,
  person: <PersonIcon fontSize="small" />,
};

const RANK_COLOR: Record<number, string> = { 1: '#f2b418', 2: '#a8b3c1', 3: '#c98a5e' };

/**
 * Building the start list for a competition.
 *
 * The screen is the draw itself: everyone who registered on the left, the heats
 * on the right, and one control deciding what a "row" on the left means —
 * a whole team, a whole family, or one person. That choice is the feature:
 * registrations arrive in all three shapes and a heat can mix them.
 */
const TournamentManagement: React.FC = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tournament, setTournament] = useState<any>(null);
  const [heats, setHeats] = useState<Heat[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [options, setOptions] = useState<Record<EntryType, EntryOption[]>>({ team: [], family: [], person: [] });
  const [teamFields, setTeamFields] = useState<{ field_key: string; label: string }[]>([]);
  const [registrantCount, setRegistrantCount] = useState(0);

  const [entryType, setEntryType] = useState<EntryType>('team');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targetHeat, setTargetHeat] = useState<number | ''>('');
  const [roundFilter, setRoundFilter] = useState<string>('all');

  const [heatDialog, setHeatDialog] = useState<{ open: boolean; editing: Heat | null }>({ open: false, editing: null });
  const [heatForm, setHeatForm] = useState({ name: '', slot_date: '', slot_start_time: '', capacity: '' });
  const [resultEntry, setResultEntry] = useState<Entry | null>(null);
  const [resultForm, setResultForm] = useState<{ rank: number | ''; note: string; award: boolean }>({ rank: '', note: '', award: true });
  const [notice, setNotice] = useState<string>('');

  useEffect(() => {
    axios.get(`${API_BASE}/courses`).then(res => { if (res.data.success) setCourses(res.data.courses || []); });
  }, []);

  const load = async (id: number) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/courses/${id}/tournament`);
      if (!data.success) return;
      setTournament(data.tournament);
      setHeats(data.heats || []);
      setEntries(data.entries || []);
      setOptions(data.options);
      setTeamFields(data.teamFields || []);
      setRegistrantCount(data.registrantCount || 0);
      setPicked(new Set());
      // No team field on this form means no team rows to show — start on the
      // grouping that always exists.
      if ((data.teamFields || []).length === 0 && entryType === 'team') setEntryType('family');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (courseId) load(Number(courseId)); }, [courseId]);

  const createTournament = async () => {
    if (!courseId) return;
    setSaving(true);
    try {
      const course = courses.find(c => c.id === courseId);
      await axios.put(`${API_BASE}/courses/${courseId}/tournament`, {
        name: course?.name || 'การแข่งขัน',
        team_field_key: teamFields[0]?.field_key ?? null,
      });
      await load(Number(courseId));
    } finally { setSaving(false); }
  };

  const setTeamField = async (fieldKey: string) => {
    if (!courseId) return;
    await axios.put(`${API_BASE}/courses/${courseId}/tournament`, {
      name: tournament?.name, description: tournament?.description, team_field_key: fieldKey || null,
    });
    load(Number(courseId));
  };

  // Which registrants are already placed. An entry can cover several bookings,
  // so a team is "used" once its own row is in a heat — matching by ref_key,
  // not by person, is what lets the same child appear in a team entry and be
  // hidden from the person list at the same time.
  const usedKeys = useMemo(() => {
    const used = new Set<string>();
    const usedBookings = new Set<number>();
    for (const e of entries) {
      used.add(`${e.entry_type}:${e.ref_key}`);
      e.booking_ids?.forEach(id => usedBookings.add(id));
    }
    return { used, usedBookings };
  }, [entries]);

  const rounds = useMemo(() => {
    const set = new Set<string>();
    Object.values(options).flat().forEach(o => { if (o.slotDate) set.add(`${o.slotDate}|${o.slotStartTime ?? ''}`); });
    return Array.from(set).sort();
  }, [options]);

  const available = useMemo(() => {
    return (options[entryType] || []).filter(o => {
      if (usedKeys.used.has(`${o.entryType}:${o.refKey}`)) return false;
      // Someone already racing as part of a team should not also be offered as
      // an individual — that is the double-entry the unique index would reject.
      if (o.bookingIds.every(id => usedKeys.usedBookings.has(id))) return false;
      if (roundFilter !== 'all') {
        const key = `${o.slotDate ?? ''}|${o.slotStartTime ?? ''}`;
        if (key !== roundFilter) return false;
      }
      return true;
    });
  }, [options, entryType, usedKeys, roundFilter]);

  const togglePick = (refKey: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(refKey)) next.delete(refKey); else next.add(refKey);
    return next;
  });

  const addPickedToHeat = async () => {
    if (!targetHeat || picked.size === 0 || !tournament) return;
    const chosen = available.filter(o => picked.has(o.refKey));
    const { data } = await axios.post(`${API_BASE}/tournament-heats/${targetHeat}/entries`, {
      tournament_id: tournament.id,
      entries: chosen.map(o => ({
        entry_type: o.entryType, ref_key: o.refKey, label: o.label, sub_label: o.subLabel,
      })),
    });
    if (data.skipped?.length) setNotice(`ข้ามไป ${data.skipped.length} รายการ (อยู่ใน Heat อื่นแล้ว): ${data.skipped.join(', ')}`);
    else setNotice('');
    load(Number(courseId));
  };

  // Spreads whatever is left evenly across the heats of the same round —
  // the first draft of a draw is almost always "just split them up".
  const autoFill = async () => {
    if (!tournament || available.length === 0) return;
    const targets = heats.filter(h => roundFilter === 'all' || `${h.slot_date ?? ''}|${h.slot_start_time ?? ''}` === roundFilter);
    if (targets.length === 0) { setNotice('ยังไม่มี Heat ในรอบนี้'); return; }

    const buckets: Record<number, EntryOption[]> = {};
    available.forEach((o, i) => {
      const heat = targets[i % targets.length];
      (buckets[heat.id] ||= []).push(o);
    });
    for (const [heatId, list] of Object.entries(buckets)) {
      await axios.post(`${API_BASE}/tournament-heats/${heatId}/entries`, {
        tournament_id: tournament.id,
        entries: list.map(o => ({ entry_type: o.entryType, ref_key: o.refKey, label: o.label, sub_label: o.subLabel })),
      });
    }
    setNotice('');
    load(Number(courseId));
  };

  const openHeatDialog = (heat: Heat | null) => {
    setHeatForm(heat
      ? {
        name: heat.name, slot_date: heat.slot_date || '',
        slot_start_time: heat.slot_start_time || '', capacity: heat.capacity ? String(heat.capacity) : '',
      }
      : { name: `Heat ${heats.length + 1}`, slot_date: '', slot_start_time: '', capacity: '' });
    setHeatDialog({ open: true, editing: heat });
  };

  const saveHeat = async () => {
    if (!tournament) return;
    const payload = {
      name: heatForm.name.trim() || 'Heat',
      slot_date: heatForm.slot_date || null,
      slot_start_time: heatForm.slot_start_time || null,
      capacity: heatForm.capacity ? Number(heatForm.capacity) : null,
    };
    if (heatDialog.editing) await axios.put(`${API_BASE}/tournament-heats/${heatDialog.editing.id}`, payload);
    else await axios.post(`${API_BASE}/tournaments/${tournament.id}/heats`, { ...payload, sort_order: heats.length });
    setHeatDialog({ open: false, editing: null });
    load(Number(courseId));
  };

  const deleteHeat = async (heat: Heat) => {
    if (!window.confirm(`ลบ "${heat.name}" และรายชื่อใน Heat นี้?`)) return;
    await axios.delete(`${API_BASE}/tournament-heats/${heat.id}`);
    load(Number(courseId));
  };

  const removeEntry = async (entry: Entry) => {
    await axios.delete(`${API_BASE}/tournament-entries/${entry.id}`);
    load(Number(courseId));
  };

  const moveEntry = async (entry: Entry, heatId: number) => {
    await axios.put(`${API_BASE}/tournament-entries/${entry.id}/move`, { heat_id: heatId });
    load(Number(courseId));
  };

  const saveResult = async () => {
    if (!resultEntry) return;
    const { data } = await axios.put(`${API_BASE}/tournament-entries/${resultEntry.id}/result`, {
      rank: resultForm.rank === '' ? null : Number(resultForm.rank),
      note: resultForm.note || null,
      award: resultForm.award,
    });
    setResultEntry(null);
    if (data.awarded > 0) setNotice(`มอบเหรียญให้ ${data.awarded} คนแล้ว`);
    load(Number(courseId));
  };

  const roundLabel = (date: string | null, time: string | null) =>
    date ? `${date}${time ? ` · ${String(time).slice(0, 5)}` : ''}` : 'ไม่ระบุรอบ';

  const entriesOf = (heatId: number) => entries.filter(e => e.heat_id === heatId);

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <TrophyIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>จัดการแข่งขัน (Heat)</Typography>
          <Typography variant="body2" color="text.secondary">
            แบ่งผู้เข้าร่วมลง Heat ตามรอบของกิจกรรม · เลือกใส่ทีละทีม ทั้งครอบครัว หรือรายคนก็ได้ · บันทึกผลแล้วมอบเหรียญได้จากตรงนี้เลย
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 320 }}>
            <InputLabel>กิจกรรม</InputLabel>
            <Select label="กิจกรรม" value={courseId} onChange={e => setCourseId(Number(e.target.value))}>
              {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          {courseId !== '' && (
            <Typography variant="body2" color="text.secondary">
              ผู้ลงทะเบียน {registrantCount} คน
            </Typography>
          )}
          {tournament && teamFields.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>ฟิลด์ทีม</InputLabel>
              <Select
                label="ฟิลด์ทีม" value={tournament.team_field_key || ''}
                onChange={e => setTeamField(String(e.target.value))}
              >
                {teamFields.map(f => <MenuItem key={f.field_key} value={f.field_key}>{f.label}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </Stack>
      </Paper>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}

      {!loading && courseId !== '' && !tournament && (
        <Paper sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>กิจกรรมนี้ยังไม่ได้ตั้งการแข่งขัน</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            สร้างแล้วจะเพิ่ม Heat และจัดคนลงแต่ละ Heat ได้
          </Typography>
          <Button variant="contained" onClick={createTournament} disabled={saving} startIcon={<AddIcon />}>
            สร้างการแข่งขัน
          </Button>
        </Paper>
      )}

      {!loading && tournament && (
        <>
          {notice && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

          <Grid container spacing={2}>
            {/* Left: who is still unplaced, in whichever shape is being drawn. */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, borderRadius: 3, position: 'sticky', top: 16 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>ยังไม่ได้จัด Heat</Typography>

                <ToggleButtonGroup
                  exclusive size="small" fullWidth value={entryType} sx={{ mb: 1.5 }}
                  onChange={(_, v) => { if (v) { setEntryType(v); setPicked(new Set()); } }}
                >
                  {(['team', 'family', 'person'] as EntryType[]).map(t => (
                    <ToggleButton key={t} value={t} disabled={t === 'team' && teamFields.length === 0} sx={{ fontWeight: 700, textTransform: 'none' }}>
                      {TYPE_LABEL[t]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {rounds.length > 1 && (
                  <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                    <InputLabel>รอบ</InputLabel>
                    <Select label="รอบ" value={roundFilter} onChange={e => setRoundFilter(String(e.target.value))}>
                      <MenuItem value="all">ทุกรอบ</MenuItem>
                      {rounds.map(r => {
                        const [d, t] = r.split('|');
                        return <MenuItem key={r} value={r}>{roundLabel(d, t)}</MenuItem>;
                      })}
                    </Select>
                  </FormControl>
                )}

                <Box sx={{ maxHeight: 420, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  {available.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                      จัดครบแล้ว
                    </Typography>
                  )}
                  {available.map(o => (
                    <Box
                      key={o.refKey}
                      onClick={() => togglePick(o.refKey)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, cursor: 'pointer',
                        borderBottom: '1px solid', borderColor: 'divider',
                        bgcolor: picked.has(o.refKey) ? 'action.selected' : 'transparent',
                      }}
                    >
                      <Checkbox size="small" checked={picked.has(o.refKey)} sx={{ p: 0.5 }} />
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 700 }}>{o.label}</Typography>}
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {o.subLabel}{o.slotDate ? ` · ${roundLabel(o.slotDate, o.slotStartTime)}` : ''}
                          </Typography>
                        }
                      />
                    </Box>
                  ))}
                </Box>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>ใส่ลง Heat</InputLabel>
                    <Select label="ใส่ลง Heat" value={targetHeat} onChange={e => setTargetHeat(Number(e.target.value))}>
                      {heats.map(h => (
                        <MenuItem key={h.id} value={h.id}>
                          {h.name} · {roundLabel(h.slot_date, h.slot_start_time)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button variant="contained" disabled={!targetHeat || picked.size === 0} onClick={addPickedToHeat}>
                    ใส่ ({picked.size})
                  </Button>
                </Stack>

                <Button
                  fullWidth size="small" startIcon={<AutoIcon />} sx={{ mt: 1, fontWeight: 700 }}
                  disabled={available.length === 0 || heats.length === 0}
                  onClick={autoFill}
                >
                  แบ่งอัตโนมัติให้ทุก Heat
                </Button>
              </Paper>
            </Grid>

            {/* Right: the heats themselves, grouped by the round they run in. */}
            <Grid item xs={12} md={8}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={800}>
                  Heat ทั้งหมด ({heats.length})
                </Typography>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => openHeatDialog(null)}>
                  เพิ่ม Heat
                </Button>
              </Box>

              {heats.length === 0 && (
                <Alert severity="info">ยังไม่มี Heat — กด "เพิ่ม Heat" แล้วระบุรอบ (วันที่/เวลา) ของกิจกรรม</Alert>
              )}

              <Grid container spacing={2}>
                {heats.map(heat => {
                  const list = entriesOf(heat.id);
                  const over = heat.capacity != null && list.length > heat.capacity;
                  return (
                    <Grid item xs={12} sm={6} key={heat.id}>
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                          <Box>
                            <Typography sx={{ fontWeight: 800 }}>{heat.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {roundLabel(heat.slot_date, heat.slot_start_time)}
                              {heat.capacity != null ? ` · ${list.length}/${heat.capacity}` : ` · ${list.length} รายการ`}
                            </Typography>
                          </Box>
                          <Box>
                            <IconButton size="small" onClick={() => openHeatDialog(heat)}><MoveIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} /></IconButton>
                            <IconButton size="small" color="error" onClick={() => deleteHeat(heat)}><DeleteIcon fontSize="small" /></IconButton>
                          </Box>
                        </Box>

                        {over && <Alert severity="warning" sx={{ mb: 1, py: 0 }}>เกินจำนวนที่ตั้งไว้</Alert>}

                        <Divider sx={{ mb: 1 }} />

                        {list.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                            ยังไม่มีใครใน Heat นี้
                          </Typography>
                        )}

                        <Stack spacing={0.75}>
                          {list.map(e => (
                            <Box
                              key={e.id}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 2,
                                bgcolor: e.result_rank ? `${RANK_COLOR[e.result_rank] || '#e2e8f0'}22` : 'action.hover',
                              }}
                            >
                              <Tooltip title={TYPE_LABEL[e.entry_type]}>
                                <Box sx={{ color: 'text.secondary', display: 'flex' }}>{TYPE_ICON[e.entry_type]}</Box>
                              </Tooltip>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{e.label}</Typography>
                                {e.sub_label && (
                                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                    {e.sub_label}
                                  </Typography>
                                )}
                              </Box>
                              {e.result_rank && (
                                <Chip
                                  size="small" label={`อันดับ ${e.result_rank}`}
                                  sx={{ fontWeight: 800, bgcolor: RANK_COLOR[e.result_rank], color: '#fff' }}
                                />
                              )}
                              <Button
                                size="small"
                                onClick={() => {
                                  setResultEntry(e);
                                  setResultForm({ rank: e.result_rank ?? '', note: '', award: true });
                                }}
                              >
                                ผล
                              </Button>
                              {heats.length > 1 && (
                                <Select
                                  size="small" value="" displayEmpty variant="standard" disableUnderline
                                  onChange={ev => moveEntry(e, Number(ev.target.value))}
                                  renderValue={() => <MoveIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
                                  sx={{ '& .MuiSelect-select': { p: 0, pr: '0 !important' } }}
                                >
                                  {heats.filter(h => h.id !== heat.id).map(h => (
                                    <MenuItem key={h.id} value={h.id}>ย้ายไป {h.name}</MenuItem>
                                  ))}
                                </Select>
                              )}
                              <IconButton size="small" color="error" onClick={() => removeEntry(e)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ))}
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>
          </Grid>
        </>
      )}

      <Dialog open={heatDialog.open} onClose={() => setHeatDialog({ open: false, editing: null })} fullWidth maxWidth="xs">
        <DialogTitle>{heatDialog.editing ? 'แก้ไข Heat' : 'เพิ่ม Heat'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="ชื่อ Heat" fullWidth value={heatForm.name} onChange={e => setHeatForm(f => ({ ...f, name: e.target.value }))} />
            <TextField
              label="วันที่ของรอบ" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={heatForm.slot_date} onChange={e => setHeatForm(f => ({ ...f, slot_date: e.target.value }))}
            />
            <TextField
              label="เวลาของรอบ" type="time" fullWidth InputLabelProps={{ shrink: true }}
              value={heatForm.slot_start_time} onChange={e => setHeatForm(f => ({ ...f, slot_start_time: e.target.value }))}
            />
            <TextField
              label="จำนวนที่รับ (ไม่บังคับ)" type="number" fullWidth
              value={heatForm.capacity} onChange={e => setHeatForm(f => ({ ...f, capacity: e.target.value }))}
              helperText="ใส่ไว้เพื่อเตือนเมื่อจัดเกิน — ระบบไม่ได้ห้ามใส่เกิน"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHeatDialog({ open: false, editing: null })}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveHeat}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!resultEntry} onClose={() => setResultEntry(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          บันทึกผล
          <Typography variant="body2" color="text.secondary">{resultEntry?.label}</Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>อันดับ</InputLabel>
              <Select
                label="อันดับ" value={resultForm.rank}
                onChange={e => setResultForm(f => ({ ...f, rank: e.target.value === '' ? '' : Number(e.target.value) }))}
              >
                <MenuItem value="">ไม่ระบุ / ล้างผล</MenuItem>
                <MenuItem value={1}>อันดับ 1</MenuItem>
                <MenuItem value={2}>อันดับ 2</MenuItem>
                <MenuItem value={3}>อันดับ 3</MenuItem>
                <MenuItem value={4}>เข้าร่วม (ไม่ได้เหรียญ)</MenuItem>
              </Select>
            </FormControl>
            <TextField label="หมายเหตุ" fullWidth value={resultForm.note} onChange={e => setResultForm(f => ({ ...f, note: e.target.value }))} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                checked={resultForm.award}
                onChange={e => setResultForm(f => ({ ...f, award: e.target.checked }))}
              />
              <Typography variant="body2">
                มอบเหรียญให้ทุกคนในรายการนี้ทันที ({resultEntry?.booking_ids?.length || 0} คน)
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultEntry(null)}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveResult}>บันทึก</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TournamentManagement;
