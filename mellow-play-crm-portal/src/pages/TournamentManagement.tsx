import { API_URL } from '../config';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, Checkbox, ListItemText, OutlinedInput,
  FormHelperText,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, EmojiEvents as TrophyIcon,
  ArrowForward as MoveIcon, Groups as TeamIcon, FamilyRestroom as FamilyIcon,
  Person as PersonIcon, AutoAwesome as AutoIcon, Edit as EditIcon,
  AccountTree as BracketIcon, DoubleArrow as AdvanceIcon, SportsScore as FlagIcon,
  Print as PrintIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import axios from 'axios';
import HeatCanvas from '../components/HeatCanvas';
import { useStickyState } from '../utils/stickyState';
import {
  ExportTable, ExportTemplate, ExportFormat, BracketPrintOptions, BracketOrientation,
  exportTableXlsx, exportTableDoc, exportTablePdf, exportBracketPdf, exportBracketDoc,
} from '../utils/tournamentExport';

const API_BASE = `${API_URL}/api/v1/admin`;

type EntryType = 'team' | 'family' | 'person';

interface Member {
  fieldKey: string;
  fieldLabel: string;
  role: string | null;
  name: string;
}

interface EntryOption {
  entryType: EntryType;
  refKey: string;
  label: string;
  subLabel: string;
  members: Member[];
  people: { name: string; age: number | null; gender: string | null; phone: string | null }[];
  bookingIds: number[];
  slotDate: string | null;
  slotStartTime: string | null;
}

interface Round {
  slot_date: string | null;
  slot_start_time: string | null;
  booking_count: number;
}

interface Heat {
  id: number;
  name: string;
  /** Where the box sits on the canvas. null = never dragged, lay it out from the stage. */
  pos_x?: number | null;
  pos_y?: number | null;
  stage_index: number;
  stage_label: string | null;
  advance_count: number | null;
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

interface Stage {
  index: number;
  heats: Heat[];
  label: string;
  isFinal: boolean;
}

// The bracket, one column per round. The last column is the final whether or
// not anyone labelled it that — it is simply the round nothing follows.
const computeStages = (heats: Heat[]): Stage[] => {
  const byStage = new Map<number, Heat[]>();
  for (const h of heats) {
    const idx = h.stage_index ?? 0;
    if (!byStage.has(idx)) byStage.set(idx, []);
    byStage.get(idx)!.push(h);
  }
  const indexes = Array.from(byStage.keys()).sort((a, b) => a - b);
  return indexes.map((index, i) => ({
    index,
    heats: byStage.get(index)!,
    label: byStage.get(index)![0]?.stage_label || (indexes.length === 1 ? 'รอบแข่ง' : `รอบที่ ${index + 1}`),
    isFinal: i === indexes.length - 1,
  }));
};

// HD_Profiles stores whatever the signup form recorded; anything unexpected is
// shown as-is rather than dropped, because a start list should not silently
// lose a category it does not recognise.
const genderLabel = (g: string | null) => {
  if (!g) return null;
  const key = g.toLowerCase();
  if (key === 'male' || key === 'm' || key === 'ชาย') return 'ชาย';
  if (key === 'female' || key === 'f' || key === 'หญิง') return 'หญิง';
  return g;
};

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
  const [courseId, setCourseId] = useStickyState<number | ''>('tournaments.courseId', '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tournament, setTournament] = useState<any>(null);
  // A course can run several brackets — age bands, or a parents' draw beside
  // the children's — so the page tracks the list and which one is open.
  const [tournaments, setTournaments] = useState<any[]>([]);
  // Every bracket with its own heats and entries. Winners of separate brackets
  // meet each other, which cannot be planned one bracket at a time.
  const [brackets, setBrackets] = useState<{ tournament: any; heats: Heat[]; entries: Entry[]; links?: { from_heat_id: number; to_heat_id: number }[] }[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<any>(null);
  const [renameValue, setRenameValue] = useState('');
  const [genTarget, setGenTarget] = useState<number | null>(null);
  // Deleting anything on this page goes through one dialog: a browser confirm()
  // gives no room to say what is about to be lost.
  const [confirmAction, setConfirmAction] = useState<{ title: string; body: string; run: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [heats, setHeats] = useState<Heat[]>([]);
  // The lines between heats — the advancement rule, now that it is data rather
  // than arithmetic on stage numbers. Named apart from `links`, which is the
  // printed sheet's SVG paths.
  const [heatLinks, setHeatLinks] = useState<{ from_heat_id: number; to_heat_id: number }[]>([]);
  // Canvas or the stacked list. The list is what works on a phone at an event,
  // so it stays; the canvas is what the planning actually happens on.
  const [canvasMode, setCanvasMode] = useStickyState('tournaments.canvas', true);
  // The start list is needed while filling heats and is in the way once they
  // are full — so it folds instead of being a permanent third of the screen.
  const [rosterOpen, setRosterOpen] = useStickyState('tournaments.rosterOpen', true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [options, setOptions] = useState<Record<EntryType, EntryOption[]>>({ team: [], family: [], person: [] });
  const [teamFields, setTeamFields] = useState<{ field_key: string; label: string }[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [genOpen, setGenOpen] = useState(false);
  // 3 per heat with 1 going through — what these events are actually run as.
  // 4-and-2 was a placeholder that had to be corrected on every bracket.
  const [genForm, setGenForm] = useState({
    per_heat: 3, advance_per_heat: 1, slot_date: '', slot_start_time: '', replace: true,
    // 'round' by default: a competition is run round by round, and pooling
    // every round of an event into one draw puts Saturday and Sunday in the
    // same heat.
    entry_scope: 'round' as 'round' | 'all',
    entry_level: 'team' as EntryType,
    auto_fill: true,
    // Blank means "however many are actually in the pool". Typed only for an
    // event holding places for entrants who sign up on the day.
    entrant_count: '' as string,
  });
  const [registrantCount, setRegistrantCount] = useState(0);
  // Seats, not sign-ups. A bracket is planned before the room fills — that is
  // the point of planning it — so building it from who has registered so far
  // produces a bracket that is wrong by the day of the event.
  const [capacityCount, setCapacityCount] = useState(0);

  const [entryType, setEntryType] = useStickyState<EntryType>('tournaments.entryType', 'team');

  /**
   * How many the bracket is built for: every seat in the room, invited places
   * included, because an invited guest takes a place in a heat like anyone
   * else. Falls back to who has actually registered when a course has no
   * schedule behind it to read a capacity from.
   */
  const bracketEntrantCount = capacityCount || (options[entryType] || []).length || registrantCount;

  /**
   * Who the generator will actually draw from, at the level and round chosen
   * in the dialog.
   *
   * Counted here from the same options the server counts from, so the "8 → 4 →
   * 2 → 1" preview describes the bracket that is about to exist rather than one
   * based on a different grouping entirely.
   */
  const genPool = useMemo(() => (options[genForm.entry_level] || []).filter(o => {
    if (genForm.entry_scope !== 'round' || !genForm.slot_date) return true;
    if (o.slotDate !== genForm.slot_date) return false;
    if (!genForm.slot_start_time) return true;
    return String(o.slotStartTime || '').slice(0, 5) === genForm.slot_start_time.slice(0, 5);
  }), [options, genForm.entry_level, genForm.entry_scope, genForm.slot_date, genForm.slot_start_time]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targetHeat, setTargetHeat] = useState<number | ''>('');
  const [roundFilter, setRoundFilter] = useStickyState<string>('tournaments.roundFilter', 'all');

  const [heatDialog, setHeatDialog] = useState<{ open: boolean; editing: Heat | null; tournamentId: number | null }>({ open: false, editing: null, tournamentId: null });
  const [heatForm, setHeatForm] = useState({ name: '', slot_date: '', slot_start_time: '', capacity: '', note: '', advance_count: '' });
  const [resultEntry, setResultEntry] = useState<Entry | null>(null);
  const [resultForm, setResultForm] = useState<{ rank: number | ''; note: string; award: boolean }>({ rank: '', note: '', award: true });
  const [notice, setNotice] = useState<string>('');

  // Printing. The template decides what the document is; the format decides
  // what happens to it next — print it, edit it, or sort it.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportForm, setExportForm] = useState<{ template: ExportTemplate; format: ExportFormat }>({ template: 'start_list', format: 'pdf' });
  const [exportTarget, setExportTarget] = useState<number | null>(null);
  const [orientation, setOrientation] = useStickyState<BracketOrientation>('tournaments.printOrientation', 'horizontal');

  // Picking entrants straight into one heat, rather than via the pool on the
  // left — which is how staff work once the bracket exists and they are filling
  // it in one box at a time.
  const [pickerHeat, setPickerHeat] = useState<{ heat: Heat; tournamentId: number } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPicked, setPickerPicked] = useState<Set<string>>(new Set());

  // The tree's connector lines are drawn from where the boxes actually landed,
  // so they stay right whatever the heat names and counts do.
  const bracketRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const heatRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [links, setLinks] = useState<Record<number, { id: string; d: string }[]>>({});

  useEffect(() => {
    axios.get(`${API_BASE}/courses`).then(res => { if (res.data.success) setCourses(res.data.courses || []); });
  }, []);

  /**
   * Refetches the board.
   *
   * silent is the default for everything that happens after an action — adding
   * an entrant, moving one, recording a result. Blanking the whole screen to a
   * spinner for a change the person just made reads as the page reloading
   * itself, and loses the scroll position of a bracket they were working in.
   * The spinner is for the first load and for switching event, where there is
   * genuinely nothing to look at yet.
   */
  const load = async (id: number, tournamentId?: number | null, silent = true) => {
    if (!silent) setLoading(true);
    try {
      const wanted = tournamentId !== undefined ? tournamentId : selectedTournamentId;
      const { data } = await axios.get(
        `${API_BASE}/courses/${id}/tournament${wanted ? `?tournamentId=${wanted}` : ''}`,
      );
      if (!data.success) return;
      setTournament(data.tournament);
      setTournaments(data.tournaments || []);
      setBrackets(data.brackets || []);
      setSelectedTournamentId(data.tournament?.id ?? null);
      setHeats(data.heats || []);
      setHeatLinks(data.links || []);
      setEntries(data.entries || []);
      setOptions(data.options);
      setTeamFields(data.teamFields || []);
      setRounds(data.rounds || []);
      setRegistrantCount(data.registrantCount || 0);
      setCapacityCount(data.capacityCount || 0);
      setPicked(new Set());
      // No team field on this form means no team rows to show — start on the
      // grouping that always exists.
      if ((data.teamFields || []).length === 0 && entryType === 'team') setEntryType('family');
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { if (courseId) load(Number(courseId), undefined, false); }, [courseId]);

  const createTournament = async (name?: string) => {
    if (!courseId) return;
    setSaving(true);
    try {
      const course = courses.find(c => c.id === courseId);
      const { data } = await axios.put(`${API_BASE}/courses/${courseId}/tournament`, {
        name: name || course?.name || 'สายการแข่งขัน',
        team_field_key: teamFields[0]?.field_key ?? null,
      });
      await load(Number(courseId), data.id, false);
    } finally { setSaving(false); }
  };

  const renameTournament = async () => {
    const target = renameTarget || tournament;
    if (!courseId || !target) return;
    await axios.put(`${API_BASE}/courses/${courseId}/tournament`, {
      id: target.id, name: renameValue.trim() || target.name,
      description: target.description, team_field_key: target.team_field_key,
    });
    setRenameOpen(false);
    load(Number(courseId), target.id);
  };

  // Which bracket a heat belongs to, for the "move to" list — with several
  // brackets on screen, a bare heat name is ambiguous.
  const bracketNameOfHeat = (heatId: number) => {
    const owner = brackets.find(b => b.heats.some(h => h.id === heatId));
    return owner && brackets.length > 1 ? ` · ${owner.tournament.name}` : '';
  };

  const deleteTournament = (t: any) => setConfirmAction({
    title: `ลบ "${t.name}"?`,
    body: 'Heat และรายชื่อทั้งหมดในสายนี้จะหายไปจากหน้าจอ (ข้อมูลยังอยู่ในฐานข้อมูล กู้คืนได้)',
    run: async () => {
      await axios.delete(`${API_BASE}/tournaments/${t.id}`);
      await load(Number(courseId), null);
    },
  });

  const setTeamField = async (fieldKey: string) => {
    if (!courseId) return;
    await axios.put(`${API_BASE}/courses/${courseId}/tournament`, {
      id: tournament?.id, name: tournament?.name, description: tournament?.description, team_field_key: fieldKey || null,
    });
    load(Number(courseId), tournament?.id);
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

  // Straight from the course's bookings, so a round with nobody drawn into a
  // heat yet is still on the list — the previous version derived these from
  // whichever registrants happened to be showing and dropped the rest.
  const roundKeys = useMemo(
    () => rounds.map(r => ({ key: `${r.slot_date ?? ''}|${r.slot_start_time ?? ''}`, ...r })),
    [rounds],
  );

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

  const openHeatDialog = (heat: Heat | null, tournamentId?: number) => {
    setHeatForm(heat
      ? {
        name: heat.name, slot_date: heat.slot_date || '',
        slot_start_time: heat.slot_start_time || '', capacity: heat.capacity ? String(heat.capacity) : '',
        note: heat.note || '',
        advance_count: heat.advance_count ? String(heat.advance_count) : '',
      }
      : { name: `Heat ${heats.length + 1}`, slot_date: '', slot_start_time: '', capacity: '', note: '', advance_count: '' });
    setHeatDialog({ open: true, editing: heat, tournamentId: tournamentId ?? tournament?.id ?? null });
  };

  const saveHeat = async () => {
    if (!tournament) return;
    const payload = {
      name: heatForm.name.trim() || 'Heat',
      slot_date: heatForm.slot_date || null,
      slot_start_time: heatForm.slot_start_time || null,
      capacity: heatForm.capacity ? Number(heatForm.capacity) : null,
      note: heatForm.note.trim() || null,
      // Blank means "this is a final" — nobody advances out of it. Until now
      // this could only be set when the bracket was generated and never
      // afterwards, so a heat created by hand had no way to send anyone on.
      advance_count: heatForm.advance_count ? Number(heatForm.advance_count) : null,
    };
    if (heatDialog.editing) await axios.put(`${API_BASE}/tournament-heats/${heatDialog.editing.id}`, payload);
    else {
      const owner = heatDialog.tournamentId ?? tournament.id;
      const existing = brackets.find(b => b.tournament.id === owner)?.heats.length ?? 0;
      await axios.post(`${API_BASE}/tournaments/${owner}/heats`, { ...payload, sort_order: existing });
    }
    setHeatDialog({ open: false, editing: null, tournamentId: null });
    load(Number(courseId));
  };

  // Applied to local state first so the box stays where it was dropped, then
  // saved. A reload here would snap every box back for the length of a round
  // trip, which reads as the drag having failed.
  const saveHeatPositions = async (positions: { id: number; x: number; y: number }[]) => {
    if (!tournament) return;
    setHeats(prev => prev.map(h => {
      const moved = positions.find(pp => pp.id === h.id);
      return moved ? { ...h, pos_x: moved.x, pos_y: moved.y } : h;
    }));
    try { await axios.put(`${API_BASE}/tournaments/${tournament.id}/layout`, { positions }); }
    catch { /* the next load restores what the server has */ }
  };

  const addHeatLink = async (fromId: number, toId: number) => {
    const owner = heats.find(h => h.id === fromId);
    if (!owner) return;
    try {
      await axios.post(`${API_BASE}/tournaments/${tournament?.id}/links`, { from_heat_id: fromId, to_heat_id: toId });
      setHeatLinks(prev => prev.some(l => l.from_heat_id === fromId && l.to_heat_id === toId)
        ? prev : [...prev, { from_heat_id: fromId, to_heat_id: toId }]);
    } catch (e: any) {
      // A refused line is a normal outcome (it would loop), not a failure to
      // report as an error — the server explains and the canvas just does not
      // draw it.
      // No snackbar on this page — the confirm dialog is how it speaks, and a
      // refused line only needs saying once.
      setConfirmAction({
        title: 'เชื่อมเส้นนี้ไม่ได้',
        body: e?.response?.data?.message || 'เชื่อมเส้นไม่สำเร็จ',
        run: async () => {},
      });
    }
  };

  const removeHeatLink = async (fromId: number, toId: number) => {
    setHeatLinks(prev => prev.filter(l => !(l.from_heat_id === fromId && l.to_heat_id === toId)));
    try { await axios.delete(`${API_BASE}/tournaments/${tournament?.id}/links`, { data: { from_heat_id: fromId, to_heat_id: toId } }); }
    catch { load(Number(courseId)); }
  };

  /** Pulled out of an existing box, or dropped on empty canvas. */
  const createHeatAt = async (pos: { x: number; y: number }, fromHeatId: number | null, tournamentId: number) => {
    const existing = brackets.find(b => b.tournament.id === tournamentId)?.heats.length ?? 0;
    const { data } = await axios.post(`${API_BASE}/tournaments/${tournamentId}/heats`, {
      name: `Heat ${existing + 1}`, sort_order: existing, pos_x: pos.x, pos_y: pos.y,
    });
    const newId = data?.heatId ?? data?.id;
    if (newId) {
      await axios.put(`${API_BASE}/tournaments/${tournamentId}/layout`, { positions: [{ id: newId, x: pos.x, y: pos.y }] });
      if (fromHeatId) await axios.post(`${API_BASE}/tournaments/${tournamentId}/links`, { from_heat_id: fromHeatId, to_heat_id: newId }).catch(() => {});
    }
    load(Number(courseId));
  };

  const deleteHeat = (heat: Heat) => setConfirmAction({
    title: `ลบ "${heat.name}"?`,
    body: `รายชื่อ ${entriesOf(heat.id).length} รายการใน Heat นี้จะถูกเอาออกด้วย ผู้เข้าแข่งขันจะกลับไปอยู่ในรายชื่อที่ยังไม่ได้จัด`,
    run: async () => {
      await axios.delete(`${API_BASE}/tournament-heats/${heat.id}`);
      await load(Number(courseId));
    },
  });

  const removeEntry = (entry: Entry) => setConfirmAction({
    title: `เอา "${entry.label}" ออกจาก Heat?`,
    body: 'จะกลับไปอยู่ในรายชื่อที่ยังไม่ได้จัด และใส่ลง Heat อื่นได้',
    run: async () => {
      setBrackets(prev => prev.map(b => ({ ...b, entries: b.entries.filter(e => e.id !== entry.id) })));
      try {
        await axios.delete(`${API_BASE}/tournament-entries/${entry.id}`);
      } finally {
        await load(Number(courseId));
      }
    },
  });

  const moveEntry = async (entry: Entry, heatId: number) => {
    // The card jumps to its new heat as the menu closes; the refetch that
    // follows corrects the stage and bracket the server actually assigned.
    setBrackets(prev => prev.map(b => ({
      ...b,
      entries: b.entries.map(e => (e.id === entry.id ? { ...e, heat_id: heatId } : e)),
    })));
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

  const allEntries = useMemo(() => brackets.flatMap(b => b.entries), [brackets]);
  const allHeats = useMemo(() => brackets.flatMap(b => b.heats), [brackets]);
  const entriesOf = (heatId: number) => allEntries.filter(e => e.heat_id === heatId);

  // The bracket, one column per round. The last column is the final whether or
  // not anyone labelled it that — it is simply the round nothing follows.
  const bracketViews = useMemo(
    () => brackets.map(b => ({ ...b, stages: computeStages(b.heats) })),
    [brackets],
  );


  /**
   * Draws the trees.
   *
   * Which heat feeds which is not decoration — it is the same mapping the
   * advance action uses (winner j of heat i lands in next-stage heat i+j), so
   * the lines on screen are the route an entrant actually takes. Every bracket
   * on the page gets its own set, keyed by bracket, because they are separate
   * containers and a line must not be drawn from one into another.
   */
  useLayoutEffect(() => {
    const computeAll = () => {
      const next: Record<number, { id: string; d: string }[]> = {};

      for (const view of bracketViews) {
        const container = bracketRefs.current[view.tournament.id];
        if (!container || (view.links || []).length === 0) continue;
        const base = container.getBoundingClientRect();
        const lines: { id: string; d: string }[] = [];

        // The lines that actually exist, not a rule about which ones ought
        // to. Since migration 0097 a bracket's routes are rows in
        // Tournament_Heat_Links, drawn by hand on the canvas — deriving them
        // here from stage arithmetic drew a different bracket from the one
        // staff arranged, and did it convincingly.
        for (const link of (view.links || [])) {
          const a = heatRefs.current[link.from_heat_id]?.getBoundingClientRect();
          const b = heatRefs.current[link.to_heat_id]?.getBoundingClientRect();
          if (!a || !b) continue;
          const x1 = a.right - base.left;
          const y1 = a.top - base.top + a.height / 2;
          const x2 = b.left - base.left;
          const y2 = b.top - base.top + b.height / 2;
          const mid = x1 + (x2 - x1) / 2;
          // Square elbows rather than curves — a bracket is read as columns
          // and rails, and a diagonal makes two boxes look adjacent when they
          // are a whole round apart.
          lines.push({ id: `${link.from_heat_id}-${link.to_heat_id}`, d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}` });
        }
        next[view.tournament.id] = lines;
      }
      setLinks(next);
    };

    computeAll();
    const observer = new ResizeObserver(computeAll);
    Object.values(bracketRefs.current).forEach(el => el && observer.observe(el));
    Object.values(heatRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [bracketViews, allEntries]);


  const pickerRows = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return available.filter(o => {
      if (!q) return true;
      const hay = [o.label, o.subLabel, ...(o.people || []).map(p => `${p.name} ${p.phone ?? ''}`)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [available, pickerSearch]);

  const addPickedToPickerHeat = async () => {
    if (!pickerHeat || pickerPicked.size === 0) return;
    const chosen = pickerRows.filter(o => pickerPicked.has(o.refKey));
    // The heat carries its own bracket — with several on screen, "the selected
    // tournament" is not what the person clicked.
    const { data } = await axios.post(`${API_BASE}/tournament-heats/${pickerHeat.heat.id}/entries`, {
      tournament_id: pickerHeat.tournamentId,
      entries: chosen.map(o => ({
        entry_type: o.entryType, ref_key: o.refKey, label: o.label, sub_label: o.subLabel,
      })),
    });
    setNotice(data.skipped?.length ? `ข้ามไป ${data.skipped.length} รายการ (อยู่ในรอบนี้แล้ว)` : '');
    setPickerHeat(null);
    load(Number(courseId));
  };

  // The four documents this competition can produce, built from what is on
  // screen rather than a second fetch — the export should be exactly what the
  // person exporting is looking at.
  const buildTable = (which: 'start_list' | 'results'): ExportTable => {
    const courseName = courses.find(c => c.id === courseId)?.name || '';
    const stamp = new Date().toLocaleString('th-TH');

    if (which === 'start_list') {
      const rows: (string | number)[][] = [];
      bracketViews.forEach(view => view.stages.forEach(stage => stage.heats.forEach(heat => {
        const list = entriesOf(heat.id);
        if (list.length === 0) {
          rows.push([view.tournament.name, stage.label, heat.name, roundLabel(heat.slot_date, heat.slot_start_time), '-', '', '', heat.note || '']);
          return;
        }
        list.forEach((e, i) => rows.push([
          view.tournament.name,
          stage.label,
          heat.name,
          roundLabel(heat.slot_date, heat.slot_start_time),
          `${i + 1}. ${e.label}`,
          TYPE_LABEL[e.entry_type],
          e.sub_label || '',
          heat.note || '',
        ]));
      })));
      return {
        title: `รายชื่อและรอบการแข่งขัน — ${tournament?.name || courseName}`,
        subtitle: `${courseName} · พิมพ์เมื่อ ${stamp}`,
        headers: ['สาย', 'รอบ', 'Heat', 'วันเวลา', 'ผู้เข้าแข่งขัน', 'ประเภท', 'รายละเอียด', 'โน้ต'],
        rows,
      };
    }

    const rows = bracketViews.flatMap(view => view.stages.flatMap(stage => stage.heats.flatMap(heat =>
      entriesOf(heat.id)
        .filter(e => e.result_rank != null)
        .sort((a, b) => (a.result_rank || 0) - (b.result_rank || 0))
        .map(e => [
          view.tournament.name,
          stage.label,
          heat.name,
          roundLabel(heat.slot_date, heat.slot_start_time),
          e.result_rank ?? '',
          e.label,
          TYPE_LABEL[e.entry_type],
          e.sub_label || '',
        ]))));
    return {
      title: `ผลการแข่งขัน — ${tournament?.name || courseName}`,
      subtitle: `${courseName} · พิมพ์เมื่อ ${stamp}`,
      headers: ['สาย', 'รอบ', 'Heat', 'วันเวลา', 'อันดับ', 'ผู้เข้าแข่งขัน', 'ประเภท', 'รายละเอียด'],
      rows,
    };
  };

  const runExport = async () => {
    const isChart = exportForm.template === 'chart' || exportForm.template === 'chart_results';
    setExporting(true);
    try {
      if (isChart) {
        // Prints the bracket named in the dialog, defaulting to the first —
        // several are on screen and only one can go on a sheet of paper.
        const target = exportTarget ?? bracketViews[0]?.tournament.id;
        const view = bracketViews.find(v => v.tournament.id === target);
        if (!view || view.heats.length === 0) { setNotice('ยังไม่มีสายให้พิมพ์'); return; }

        const withResults = exportForm.template === 'chart_results';
        const sheet: BracketPrintOptions = {
          title: `${withResults ? 'ผลการแข่งขัน' : 'สายการแข่งขัน'} — ${view.tournament.name}`,
          subtitle: [courses.find(c => c.id === courseId)?.name, `พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}`]
            .filter(Boolean).join(' · '),
          withResults,
          orientation,
          // Same rows the canvas and the list view draw from — three pictures
          // of one bracket, or it is not one bracket.
          links: (view.links || []).map((l: any) => ({ from: l.from_heat_id, to: l.to_heat_id })),
          // Laid out from the data, not captured off the screen: the printed
          // sheet has no buttons on it and breaks where paper breaks.
          stages: view.stages.map(stage => ({
            label: stage.label,
            isFinal: stage.isFinal,
            heats: stage.heats.map(heat => ({
              id: heat.id,
              name: heat.name,
              when: heat.slot_date ? roundLabel(heat.slot_date, heat.slot_start_time) : null,
              note: heat.note,
              advance: stage.isFinal ? null : heat.advance_count,
              entries: entriesOf(heat.id)
                .slice()
                .sort((a, b) => (a.result_rank ?? 99) - (b.result_rank ?? 99))
                .map(e => ({ label: e.label, subLabel: e.sub_label, rank: e.result_rank })),
            })),
          })),
        };

        if (exportForm.format === 'doc') exportBracketDoc(sheet);
        else await exportBracketPdf(sheet);
        return;
      }

      const table = buildTable(exportForm.template === 'results' ? 'results' : 'start_list');
      if (table.rows.length === 0) {
        setNotice(exportForm.template === 'results' ? 'ยังไม่มีผลการแข่งขันให้พิมพ์' : 'ยังไม่มีรายชื่อใน Heat ให้พิมพ์');
        return;
      }
      if (exportForm.format === 'xlsx') exportTableXlsx(table);
      else if (exportForm.format === 'doc') exportTableDoc(table);
      else await exportTablePdf(table);
    } catch (e: any) {
      setNotice(`พิมพ์ไม่สำเร็จ: ${e.message}`);
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  };

  const advanceEntry = async (entry: Entry) => {
    try {
      const { data } = await axios.post(`${API_BASE}/tournament-entries/${entry.id}/advance`);
      setNotice(data.moved
        ? `${entry.label} ได้อันดับ ${data.rank} · เข้าไปอยู่ใน ${data.heatName} แล้ว`
        : `${entry.label} อยู่ในรอบถัดไปแล้ว`);
      load(Number(courseId));
    } catch (e: any) {
      setNotice(e.response?.data?.message || 'ส่งเข้ารอบถัดไปไม่สำเร็จ');
    }
  };

  const advanceHeat = async (heat: Heat) => {
    try {
      const { data } = await axios.post(`${API_BASE}/tournament-heats/${heat.id}/advance`);
      setNotice(data.moved > 0 ? `ส่งเข้ารอบถัดไป ${data.moved} รายการ` : 'ไม่มีรายการใหม่ที่ต้องส่ง (อาจส่งไปแล้ว)');
      load(Number(courseId));
    } catch (e: any) {
      setNotice(e.response?.data?.message || 'ส่งเข้ารอบถัดไปไม่สำเร็จ');
    }
  };

  const generateBracket = async () => {
    if (!tournament) return;
    setSaving(true);
    try {
      const { data } = await axios.post(`${API_BASE}/tournaments/${genTarget ?? tournament.id}/generate`, {
        // Blank means "as many as are really there" — the server counts the
        // pool itself, which is the only place that can get it right.
        entrant_count: genForm.entrant_count ? Number(genForm.entrant_count) : undefined,
        per_heat: genForm.per_heat,
        advance_per_heat: genForm.advance_per_heat,
        slot_date: genForm.slot_date || null,
        slot_start_time: genForm.slot_start_time || null,
        replace: genForm.replace,
        entry_level: genForm.entry_level,
        entry_scope: genForm.entry_scope,
        auto_fill: genForm.auto_fill,
      });
      setGenOpen(false);
      setNotice(
        `สร้างสายแล้ว ${data.created} Heat · ${data.stages.join(' → ')} Heat ต่อรอบ`
        + (data.filled ? ` · ใส่รายชื่อให้ ${data.filled} รายการ` : '')
      );
      load(Number(courseId));
    } catch (e: any) {
      setNotice(e.response?.data?.message || 'สร้างสายไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  // What the generator will produce, shown before it runs — a bracket is much
  // easier to agree with as "8 → 4 → 2 → 1" than as a paragraph of settings.
  const genPreview = useMemo(() => {
    const perHeat = Math.max(2, Number(genForm.per_heat) || 3);
    const advance = Math.min(Math.max(1, Number(genForm.advance_per_heat) || 1), perHeat - 1);
    const entrants = genForm.entrant_count ? Number(genForm.entrant_count) : (genPool.length || bracketEntrantCount);
    const out: number[] = [];
    let remaining = Math.max(2, entrants);
    while (out.length < 8) {
      const heatCount = Math.max(1, Math.ceil(remaining / perHeat));
      out.push(heatCount);
      if (heatCount === 1) break;
      const next = heatCount * advance;
      if (next >= remaining) break;
      remaining = next;
    }
    return { entrants, out };
  }, [genForm, bracketEntrantCount, genPool]);

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <TrophyIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>จัดการแข่งขัน</Typography>
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
              {capacityCount > 0 && ` · ที่นั่งรวมทุกรอบ ${capacityCount} ที่`}
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
          <Button variant="contained" onClick={() => createTournament()} disabled={saving} startIcon={<AddIcon />}>
            สร้างการแข่งขัน
          </Button>
        </Paper>
      )}

      {!loading && tournament && (
        <>
          {notice && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

          <Grid container spacing={2}>
            {/* Left: who is still unplaced, in whichever shape is being drawn.
                Folded to a thin strip rather than removed — a panel that
                vanishes leaves nothing to click to bring it back, and the
                count on the strip is worth seeing even while it is shut. */}
            {!rosterOpen && (
              <Grid item xs={12} md="auto">
                <Paper
                  onClick={() => setRosterOpen(true)}
                  sx={{
                    p: 1, borderRadius: 3, position: 'sticky', top: 16, cursor: 'pointer',
                    display: 'flex', md: { flexDirection: 'column' }, alignItems: 'center', gap: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Tooltip title="เปิดรายชื่อที่รอจัดการ">
                    <ChevronRightIcon fontSize="small" />
                  </Tooltip>
                  <Typography variant="caption" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                    รอจัดการ {available.length}
                  </Typography>
                </Paper>
              </Grid>
            )}
            <Grid item xs={12} md={4} sx={{ display: rosterOpen ? undefined : 'none' }}>
              <Paper sx={{ p: 2, borderRadius: 3, position: 'sticky', top: 16 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={800}>รอจัดการ</Typography>
                  <Tooltip title="ซ่อนรายชื่อ เพื่อให้ผังกว้างขึ้น">
                    <IconButton size="small" onClick={() => setRosterOpen(false)}><ChevronLeftIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Box>

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

                {roundKeys.length > 1 && (
                  <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                    <InputLabel>รอบ</InputLabel>
                    <Select label="รอบ" value={roundFilter} onChange={e => setRoundFilter(String(e.target.value))}>
                      <MenuItem value="all">ทุกรอบ</MenuItem>
                      {roundKeys.map(r => (
                        <MenuItem key={r.key} value={r.key}>
                          {roundLabel(r.slot_date, r.slot_start_time)} · {r.booking_count} คน
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <Box sx={{ maxHeight: 420, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  {available.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                      {/* "Nothing here" and "everything placed" are different
                          answers, and reading the second when the first is true
                          says the draw is done when it has not started. */}
                      {(options[entryType] || []).length === 0
                        ? (entryType === 'team' ? 'กิจกรรมนี้ยังไม่มีใครเลือกทีม' : 'ยังไม่มีผู้ลงทะเบียน')
                        : roundFilter !== 'all'
                          ? 'ไม่มีรายชื่อที่ยังว่างในรอบนี้'
                          : 'จัดลง Heat ครบทุกคนแล้ว'}
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
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{o.label}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {o.subLabel}{o.slotDate ? ` · ${roundLabel(o.slotDate, o.slotStartTime)}` : ''}
                        </Typography>
                        {/* Age, category and a phone number — what an age-banded
                            draw is made from, and how staff chase a no-show. */}
                        {(o.people || []).map((person, i) => (
                          <Typography key={i} variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>
                            {[
                              person.name,
                              person.age != null ? `${person.age} ปี` : null,
                              genderLabel(person.gender),
                              person.phone,
                            ].filter(Boolean).join(' · ')}
                          </Typography>
                        ))}
                      </Box>
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

            {/* Right: every bracket, each drawn as its own tree. Winners of
                separate brackets meet each other, so keeping them all on one
                page is the point — a chooser showing one at a time cannot say
                where a cross-bracket final happens. */}
            <Grid item xs={12} md={rosterOpen ? 8 : true} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => createTournament(`สายที่ ${tournaments.length + 1}`)}>
                  เพิ่มสาย
                </Button>
                <Button size="small" startIcon={<PrintIcon />} onClick={() => setExportOpen(true)}>
                  พิมพ์ / Export
                </Button>
              </Box>

              {bracketViews.map(view => (
                <Paper key={view.tournament.id} variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2" fontWeight={800}>{view.tournament.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {view.heats.length} Heat / {view.stages.length} รอบ
                      </Typography>
                      <Tooltip title="เปลี่ยนชื่อสาย">
                        <IconButton size="small" onClick={() => { setRenameTarget(view.tournament); setRenameValue(view.tournament.name || ''); setRenameOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="ลบสายนี้">
                        <IconButton size="small" color="error" onClick={() => deleteTournament(view.tournament)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant={canvasMode ? 'contained' : 'outlined'} color="secondary"
                        onClick={() => setCanvasMode(v => !v)}>
                        {canvasMode ? 'ดูเป็นรายการ' : 'ดูเป็นผัง'}
                      </Button>
                      <Button size="small" variant="contained" startIcon={<BracketIcon />} onClick={() => { setGenTarget(view.tournament.id); setGenOpen(true); }}>
                        สร้างสายอัตโนมัติ
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => openHeatDialog(null, view.tournament.id)}>
                        เพิ่ม Heat
                      </Button>
                    </Stack>
                  </Box>

                  {canvasMode && (
                    <HeatCanvas
                      heats={view.heats as any}
                      links={view.tournament.id === tournament?.id ? heatLinks : []}
                      entries={view.entries as any}
                      onMoveHeats={saveHeatPositions}
                      onAddLink={addHeatLink}
                      onDeleteLink={removeHeatLink}
                      onCreateHeatAt={(pos, fromId) => createHeatAt(pos, fromId, view.tournament.id)}
                      onEditHeat={id => { const h = view.heats.find((x: any) => x.id === id); if (h) openHeatDialog(h, view.tournament.id); }}
                      onDeleteHeat={id => { const h = view.heats.find((x: any) => x.id === id); if (h) deleteHeat(h); }}
                      onPickEntries={id => { const h = view.heats.find((x: any) => x.id === id); if (h) { setPickerHeat({ heat: h, tournamentId: view.tournament.id }); setPickerPicked(new Set()); setPickerSearch(''); } }}
                    />
                  )}
                  {!canvasMode && (<>

              {view.heats.length === 0 && (
                <Alert severity="info">
                  ยังไม่มี Heat — กด "สร้างสายอัตโนมัติ" เพื่อวางรอบคัดเลือก รอบรอง และรอบชิงให้ทั้งหมด หรือกด "เพิ่ม Heat" เพื่อสร้างทีละอัน
                </Alert>
              )}

              {/* Horizontal because a bracket is: the eye follows one entrant
                  left to right through the rounds. */}
              <Box ref={(el: HTMLDivElement | null) => { bracketRefs.current[view.tournament.id] = el; }} sx={{ position: 'relative', display: 'flex', gap: 6, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
                <Box
                  component="svg"
                  sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
                >
                  {(links[view.tournament.id] || []).map(l => (
                    <path key={l.id} d={l.d} fill="none" stroke="#cbd5e1" strokeWidth={2} />
                  ))}
                </Box>
                {view.stages.map(stage => (
                  <Box key={stage.index} sx={{ minWidth: 300, flex: '0 0 auto' }}>
                    <Box
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 1.5, py: 0.75, mb: 1.5, borderRadius: 2,
                        bgcolor: stage.isFinal ? 'warning.light' : 'action.hover',
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        {stage.isFinal && <TrophyIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'text-bottom' }} />}
                        {stage.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {stage.heats.length} Heat
                      </Typography>
                    </Box>

                    <Stack spacing={1.5}>
                      {stage.heats.map(heat => {
                        const list = entriesOf(heat.id);
                        const over = heat.capacity != null && list.length > heat.capacity;
                        const ranked = list.filter(e => e.result_rank != null).length;
                        return (
                          <Paper
                            key={heat.id}
                            ref={(el: HTMLDivElement | null) => { heatRefs.current[heat.id] = el; }}
                            variant="outlined"
                            sx={{
                              p: 1.5, borderRadius: 3, position: 'relative', bgcolor: 'background.paper',
                              borderColor: heat.status === 'done' ? 'success.light' : 'divider',
                              borderWidth: heat.status === 'done' ? 2 : 1,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 800, fontSize: 14 }} noWrap>{heat.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {heat.slot_date ? `${roundLabel(heat.slot_date, heat.slot_start_time)} · ` : ''}
                                  {heat.capacity != null ? `${list.length}/${heat.capacity}` : `${list.length} รายการ`}
                                  {heat.advance_count ? ` · ผ่าน ${heat.advance_count}` : ''}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', flexShrink: 0 }}>
                                <IconButton size="small" onClick={() => openHeatDialog(heat, view.tournament.id)}><EditIcon fontSize="small" /></IconButton>
                                <IconButton size="small" color="error" onClick={() => deleteHeat(heat)}><DeleteIcon fontSize="small" /></IconButton>
                              </Box>
                            </Box>

                            {over && <Alert severity="warning" sx={{ mb: 1, py: 0, fontSize: 12 }}>เกินจำนวนที่ตั้งไว้</Alert>}

                            {/* Whatever the day needs written down, beside the
                                box it belongs to. Line breaks are kept — a note
                                is usually a short list, not a sentence. */}
                            {heat.note && (
                              <Typography
                                variant="caption"
                                sx={{
                                  display: 'block', whiteSpace: 'pre-wrap', mb: 1, p: 1,
                                  borderRadius: 1.5, bgcolor: 'warning.light', color: 'text.primary',
                                }}
                              >
                                {heat.note}
                              </Typography>
                            )}

                            <Divider sx={{ mb: 1 }} />

                            {list.length === 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 1.5, textAlign: 'center' }}>
                                {stage.index === 0 ? 'ยังไม่มีใครใน Heat นี้' : 'รอผู้ชนะจากรอบก่อนหน้า'}
                              </Typography>
                            )}

                            <Stack spacing={0.5}>
                              {list.map(e => (
                                <Box
                                  key={e.id}
                                  sx={{
                                    display: 'flex', alignItems: 'center', gap: 0.75, p: 0.75, borderRadius: 2,
                                    bgcolor: e.result_rank && e.result_rank <= 3 ? `${RANK_COLOR[e.result_rank]}1f` : 'action.hover',
                                    borderLeft: '3px solid',
                                    borderColor: e.result_rank && e.result_rank <= 3 ? RANK_COLOR[e.result_rank] : 'transparent',
                                  }}
                                >
                                  {e.result_rank ? (
                                    <Box
                                      sx={{
                                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        bgcolor: RANK_COLOR[e.result_rank] || 'grey.400',
                                        color: '#fff', fontWeight: 900, fontSize: 12,
                                      }}
                                    >
                                      {e.result_rank}
                                    </Box>
                                  ) : (
                                    <Tooltip title={TYPE_LABEL[e.entry_type]}>
                                      <Box sx={{ color: 'text.disabled', display: 'flex' }}>{TYPE_ICON[e.entry_type]}</Box>
                                    </Tooltip>
                                  )}
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }} noWrap>{e.label}</Typography>
                                    {/* The form's own question is the role — "ผู้ปกครอง: สมชาย ·
                                        เด็ก: น้องเอ๋" says who is who without guessing. */}
                                    {e.sub_label && (
                                      <Tooltip title={e.sub_label}>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                          {e.sub_label}
                                        </Typography>
                                      </Tooltip>
                                    )}
                                  </Box>
                                  {/* Calling one winner as it happens, rather
                                      than recording the whole heat and then
                                      advancing it — the next free placing is
                                      assigned and they move up a round. */}
                                  {!stage.isFinal && (
                                    <Tooltip title="ให้ผ่านเข้ารอบถัดไป">
                                      <IconButton size="small" color="success" onClick={() => advanceEntry(e)}>
                                        <TrophyIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Tooltip title="บันทึกผล / มอบเหรียญ">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setResultEntry(e);
                                        setResultForm({ rank: e.result_rank ?? '', note: '', award: true });
                                      }}
                                    >
                                      <FlagIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  {allHeats.length > 1 && (
                                    <Select
                                      size="small" value="" displayEmpty variant="standard" disableUnderline
                                      onChange={ev => moveEntry(e, Number(ev.target.value))}
                                      renderValue={() => <MoveIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
                                      sx={{ '& .MuiSelect-select': { p: 0, pr: '0 !important' } }}
                                    >
                                      {allHeats.filter(h => h.id !== heat.id).map(h => (
                                        <MenuItem key={h.id} value={h.id}>ย้ายไป {h.name}{bracketNameOfHeat(h.id)}</MenuItem>
                                      ))}
                                    </Select>
                                  )}
                                  <IconButton size="small" color="error" onClick={() => removeEntry(e)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              ))}
                            </Stack>

                            <Button
                              fullWidth size="small" startIcon={<AddIcon />} sx={{ mt: 1, fontWeight: 700 }}
                              onClick={() => { setPickerHeat({ heat, tournamentId: view.tournament.id }); setPickerPicked(new Set()); setPickerSearch(''); }}
                            >
                              เลือกผู้เข้าแข่งขัน
                            </Button>

                            {!stage.isFinal && list.length > 0 && (
                              <Button
                                fullWidth size="small" sx={{ mt: 1, fontWeight: 700 }}
                                startIcon={<AdvanceIcon />}
                                disabled={ranked === 0}
                                onClick={() => advanceHeat(heat)}
                              >
                                {ranked === 0 ? 'บันทึกผลก่อนจึงส่งเข้ารอบได้' : `ส่ง ${heat.advance_count ?? 1} อันดับแรกเข้ารอบถัดไป`}
                              </Button>
                            )}
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Box>
                ))}
              </Box>
                  </>)}
                </Paper>
              ))}
            </Grid>
          </Grid>
        </>
      )}

      {/* Printing. Template first, because it decides which formats make
          sense — a chart has no spreadsheet form. */}
      <Dialog open={exportOpen} onClose={() => !exporting && setExportOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>พิมพ์ / Export</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>รูปแบบเอกสาร</InputLabel>
              <Select
                label="รูปแบบเอกสาร" value={exportForm.template}
                onChange={e => {
                  const template = e.target.value as ExportTemplate;
                  const isChart = template === 'chart' || template === 'chart_results';
                  setExportForm(f => ({
                    template,
                    // Silently keeping xlsx selected for a chart would produce
                    // a file that cannot exist; fall back to the printable one.
                    format: isChart && f.format === 'xlsx' ? 'pdf' : f.format,
                  }));
                }}
              >
                <MenuItem value="start_list">ตารางรายชื่อ และรอบการแข่งขัน</MenuItem>
                <MenuItem value="chart">Tournament Chart (จัดการแข่งขัน)</MenuItem>
                <MenuItem value="chart_results">Tournament Chart (ผลการแข่งขัน)</MenuItem>
                <MenuItem value="results">ตารางผลการแข่งขัน</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>ไฟล์</InputLabel>
              <Select
                label="ไฟล์" value={exportForm.format}
                onChange={e => setExportForm(f => ({ ...f, format: e.target.value as ExportFormat }))}
              >
                <MenuItem value="pdf">PDF — สำหรับพิมพ์</MenuItem>
                <MenuItem value="doc">DOC — เปิดแก้ไขต่อใน Word</MenuItem>
                <MenuItem
                  value="xlsx"
                  disabled={exportForm.template === 'chart' || exportForm.template === 'chart_results'}
                >
                  XLSX — เฉพาะแบบตาราง
                </MenuItem>
              </Select>
            </FormControl>

            {(exportForm.template === 'chart' || exportForm.template === 'chart_results') && (
              <FormControl fullWidth>
                <InputLabel>ทิศทางของสาย</InputLabel>
                <Select
                  label="ทิศทางของสาย" value={orientation}
                  onChange={e => setOrientation(e.target.value as BracketOrientation)}
                >
                  <MenuItem value="horizontal">แนวนอน — ซ้ายไปขวา (กระดาษแนวนอน)</MenuItem>
                  <MenuItem value="vertical">แนวตั้ง — พีระมิดหัวกลับ (กระดาษแนวตั้ง)</MenuItem>
                </Select>
              </FormControl>
            )}

            {(exportForm.template === 'chart' || exportForm.template === 'chart_results') && bracketViews.length > 1 && (
              <FormControl fullWidth>
                <InputLabel>สายที่จะพิมพ์</InputLabel>
                <Select
                  label="สายที่จะพิมพ์" value={exportTarget ?? bracketViews[0]?.tournament.id ?? ''}
                  onChange={e => setExportTarget(Number(e.target.value))}
                >
                  {bracketViews.map(v => <MenuItem key={v.tournament.id} value={v.tournament.id}>{v.tournament.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}

            {(exportForm.template === 'chart' || exportForm.template === 'chart_results') && (
              <Alert severity="info">
                PDF พิมพ์เป็นผังพร้อมเส้นโยงระหว่างรอบ · Heat ที่ยังไม่มีรายชื่อจะเป็นบรรทัดว่างให้กรอกด้วยปากกา ·
                ไฟล์ DOC จะเป็นตารางรายรอบ (แก้ไขข้อความได้ แต่ไม่มีเส้นโยง)
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={exporting}>ยกเลิก</Button>
          <Button variant="contained" onClick={runExport} disabled={exporting}>
            {exporting ? <CircularProgress size={20} /> : 'สร้างไฟล์'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* One dialog for every destructive action on this page. It names what
          goes with it, which a browser confirm() has no room to do. */}
      <Dialog open={!!confirmAction} onClose={() => !confirmBusy && setConfirmAction(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>{confirmAction?.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">{confirmAction?.body}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)} disabled={confirmBusy}>ยกเลิก</Button>
          <Button
            variant="contained" color="error" disabled={confirmBusy}
            onClick={async () => {
              if (!confirmAction) return;
              setConfirmBusy(true);
              try { await confirmAction.run(); setConfirmAction(null); }
              finally { setConfirmBusy(false); }
            }}
          >
            {confirmBusy ? <CircularProgress size={20} /> : 'ลบ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>ชื่อสายการแข่งขัน</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth sx={{ mt: 1 }} label="ชื่อสาย"
            value={renameValue} onChange={e => setRenameValue(e.target.value)}
            helperText="เช่น รุ่นอายุ 3-4 ปี / รุ่นผู้ปกครอง"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={renameTournament}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      {/* Filling one box of the bracket. Shows age, category and a phone number
          beside every name — an age-banded heat is drawn on exactly those, and
          the phone is what staff reach for when someone is not at the line. */}
      <Dialog open={!!pickerHeat} onClose={() => setPickerHeat(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          เลือกผู้เข้าแข่งขัน
          <Typography variant="body2" color="text.secondary">{pickerHeat?.heat.name}</Typography>
        </DialogTitle>
        <DialogContent dividers>
          <ToggleButtonGroup
            exclusive size="small" fullWidth value={entryType} sx={{ mb: 1.5 }}
            onChange={(_, v) => { if (v) { setEntryType(v); setPickerPicked(new Set()); } }}
          >
            {(['team', 'family', 'person'] as EntryType[]).map(t => (
              <ToggleButton key={t} value={t} disabled={t === 'team' && teamFields.length === 0} sx={{ fontWeight: 700, textTransform: 'none' }}>
                {TYPE_LABEL[t]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <TextField
            size="small" fullWidth placeholder="ค้นหาชื่อ ทีม หรือเบอร์โทร" sx={{ mb: 1.5 }}
            value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
          />

          <Stack spacing={0.75}>
            {pickerRows.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                ไม่พบรายชื่อที่ยังว่างอยู่
              </Typography>
            )}
            {pickerRows.map(o => (
              <Paper
                key={o.refKey}
                variant="outlined"
                onClick={() => setPickerPicked(prev => {
                  const next = new Set(prev);
                  if (next.has(o.refKey)) next.delete(o.refKey); else next.add(o.refKey);
                  return next;
                })}
                sx={{
                  p: 1, borderRadius: 2, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'flex-start',
                  borderColor: pickerPicked.has(o.refKey) ? 'primary.main' : 'divider',
                  bgcolor: pickerPicked.has(o.refKey) ? 'action.selected' : 'transparent',
                }}
              >
                <Checkbox size="small" checked={pickerPicked.has(o.refKey)} sx={{ p: 0.5 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{o.label}</Typography>
                  {o.subLabel && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{o.subLabel}</Typography>
                  )}
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {(o.people || []).map((person, i) => (
                      <Chip
                        key={i}
                        size="small"
                        variant="outlined"
                        label={[
                          person.name,
                          person.age != null ? `${person.age} ปี` : null,
                          genderLabel(person.gender),
                          person.phone,
                        ].filter(Boolean).join(' · ')}
                        sx={{ fontWeight: 600, maxWidth: '100%' }}
                      />
                    ))}
                  </Stack>
                </Box>
                {o.slotDate && (
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {roundLabel(o.slotDate, o.slotStartTime)}
                  </Typography>
                )}
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerHeat(null)}>ปิด</Button>
          <Button variant="contained" disabled={pickerPicked.size === 0} onClick={addPickedToPickerHeat}>
            ใส่ลง {pickerHeat?.heat.name} ({pickerPicked.size})
          </Button>
        </DialogActions>
      </Dialog>

      {/* The template: two numbers, and a preview of the bracket they make. */}
      <Dialog open={genOpen} onClose={() => setGenOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>สร้างสายการแข่งขัน</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* What the draw is a draw OF. The count differs enormously between
                these — twenty-four bookings can be six teams — which is why the
                generator counts the pool itself rather than being told. */}
            <FormControl fullWidth size="small">
              <InputLabel>แข่งกันในระดับ</InputLabel>
              <Select
                label="แข่งกันในระดับ" value={genForm.entry_level}
                onChange={e => setGenForm(f => ({ ...f, entry_level: e.target.value as EntryType }))}
              >
                <MenuItem value="team" disabled={teamFields.length === 0}>
                  ทีม{teamFields.length === 0 ? ' (ฟอร์มนี้ไม่มีช่องทีม)' : ''}
                </MenuItem>
                <MenuItem value="family">ครอบครัว (1 ใบลงทะเบียน = 1 รายการ)</MenuItem>
                <MenuItem value="person">รายคน (1 การจอง = 1 รายการ)</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>ขอบเขต</InputLabel>
              <Select
                label="ขอบเขต" value={genForm.entry_scope}
                onChange={e => setGenForm(f => ({ ...f, entry_scope: e.target.value as 'round' | 'all' }))}
              >
                <MenuItem value="round">เฉพาะรอบที่เลือก</MenuItem>
                <MenuItem value="all">รวมทุกรอบของกิจกรรมนี้</MenuItem>
              </Select>
              <FormHelperText>
                {genForm.entry_scope === 'round'
                  ? 'ปกติใช้อันนี้ — แข่งกันเป็นรอบ ๆ'
                  : 'คนละวันจะมาอยู่ Heat เดียวกันได้ ใช้เมื่อรวมทุกรอบเป็นสายเดียวจริง ๆ'}
              </FormHelperText>
            </FormControl>

            <TextField
              label="จำนวนต่อ Heat" type="number" fullWidth
              value={genForm.per_heat}
              onChange={e => setGenForm(f => ({ ...f, per_heat: Number(e.target.value) }))}
            />
            <TextField
              label="ผ่านเข้ารอบต่อ Heat" type="number" fullWidth
              value={genForm.advance_per_heat}
              onChange={e => setGenForm(f => ({ ...f, advance_per_heat: Number(e.target.value) }))}
              helperText="เช่น 2 = ที่ 1 กับที่ 2 ของแต่ละ Heat ได้ไปต่อ"
            />
            <FormControl fullWidth size="small">
              <InputLabel>รอบ</InputLabel>
              <Select
                label="รอบ"
                value={genForm.slot_date ? `${genForm.slot_date}|${genForm.slot_start_time}` : ''}
                onChange={e => {
                  const [d, t] = String(e.target.value).split('|');
                  setGenForm(f => ({ ...f, slot_date: d || '', slot_start_time: t || '' }));
                }}
              >
                <MenuItem value="">ไม่ระบุรอบ</MenuItem>
                {rounds.map((r: any) => (
                  <MenuItem
                    key={`${r.slot_date}|${r.slot_start_time}`}
                    value={`${r.slot_date}|${String(r.slot_start_time ?? '').slice(0, 5)}`}
                  >
                    {r.slot_date} · {String(r.slot_start_time ?? '').slice(0, 5) || 'ทั้งวัน'}
                    {' '}
                    <Box component="span" sx={{ color: 'text.secondary', ml: 0.5 }}>
                      ({r.booking_count} การจอง)
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="จำนวนผู้เข้าแข่ง (เว้นว่าง = ตามจริง)" type="number" fullWidth
              value={genForm.entrant_count}
              onChange={e => setGenForm(f => ({ ...f, entrant_count: e.target.value }))}
              helperText={`ตอนนี้มีจริง ${genPool.length} รายการ — กรอกเองเมื่อกันที่ไว้ให้คนสมัครหน้างาน`}
            />

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.5 }}>
                จะได้สายแบบนี้ (จาก {genPreview.entrants} รายการที่จะลงแข่ง)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {genPreview.out.map(n => `${n} Heat`).join('  →  ')}
              </Typography>
            </Paper>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox checked={genForm.auto_fill} onChange={e => setGenForm(f => ({ ...f, auto_fill: e.target.checked }))} />
              <Box>
                <Typography variant="body2">ใส่รายชื่อลง Heat ให้เลย</Typography>
                <Typography variant="caption" color="text.secondary">
                  แจกวนทีละคนไปทุก Heat ไม่ใช่เติมทีละ Heat จนเต็ม — คนที่จัดมือไว้แล้วจะไม่ถูกย้าย
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox checked={genForm.replace} onChange={e => setGenForm(f => ({ ...f, replace: e.target.checked }))} />
              <Typography variant="body2">ลบ Heat และรายชื่อเดิมทั้งหมดก่อนสร้างใหม่</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={generateBracket} disabled={saving}>สร้าง</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={heatDialog.open} onClose={() => setHeatDialog({ open: false, editing: null, tournamentId: null })} fullWidth maxWidth="xs">
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
            {/* This is the "ผ่าน 2" on the canvas box. It could only be set
                when a bracket was generated and never afterwards, so a heat
                added by hand had no way to send anyone onward at all. */}
            <TextField
              label="ผ่านเข้ารอบถัดไปกี่อันดับ" type="number" fullWidth
              value={heatForm.advance_count}
              onChange={e => setHeatForm(f => ({ ...f, advance_count: e.target.value }))}
              inputProps={{ min: 1, max: 20 }}
              helperText="เช่น 2 = ที่ 1 และที่ 2 ของ Heat นี้ได้ไปต่อ · เว้นว่างถ้าเป็นรอบสุดท้าย ไม่มีใครไปต่อ"
            />
            <TextField
              label="โน้ต" fullWidth multiline minRows={3}
              value={heatForm.note} onChange={e => setHeatForm(f => ({ ...f, note: e.target.value }))}
              helperText="เช่น เวลาเรียกตัว ลู่ที่ใช้ กติกาเฉพาะรอบนี้ — จะแสดงอยู่ในกล่อง Heat"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHeatDialog({ open: false, editing: null, tournamentId: null })}>ยกเลิก</Button>
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
