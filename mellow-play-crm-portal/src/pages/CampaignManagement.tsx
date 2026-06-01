import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Campaign as CampaignIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Storefront as SalesIcon,
  School as TeacherIcon,
  CheckCircle as AchievedIcon,
  EmojiEvents as TrophyIcon,
  Star as DiligenceIcon,
  AccessTime as LateIcon,
  EventBusy as AbsenceIcon,
  Timelapse as OTIcon,
} from '@mui/icons-material';

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignType = 'sales' | 'teaching_hours';
type CampaignStatus = 'draft' | 'active' | 'ended';
type BonusType = 'fixed' | 'percent';

type DiligenceCondType = 'late_count' | 'absence_count' | 'ot_hours';
type DiligenceOperator = 'lte' | 'gte' | 'eq';

interface DiligenceCond {
  type: DiligenceCondType;
  operator: DiligenceOperator;
  value: number;
}

interface DiligenceRule {
  id: number;
  name: string;
  description: string;
  conditions: DiligenceCond[];
  bonusAmount: number;
  forRoles: string[];
  active: boolean;
}

const DILIGENCE_COND_CONFIG: Record<DiligenceCondType, { label: string; unit: string; icon: React.ReactNode; color: string }> = {
  late_count:     { label: 'จำนวนครั้งที่มาสาย', unit: 'ครั้ง', icon: <LateIcon sx={{ fontSize: 16 }} />,    color: '#d97706' },
  absence_count:  { label: 'จำนวนวันที่ขาด/ลา',   unit: 'วัน',   icon: <AbsenceIcon sx={{ fontSize: 16 }} />, color: '#dc2626' },
  ot_hours:       { label: 'ชั่วโมง OT สะสม',    unit: 'ชม.',   icon: <OTIcon sx={{ fontSize: 16 }} />,     color: '#0284c7' },
};

const OPERATOR_LABEL: Record<DiligenceOperator, string> = {
  lte: '≤ ไม่เกิน',
  gte: '≥ อย่างน้อย',
  eq:  '= เท่ากับ',
};

const API_BASE = 'http://localhost:8787/api/v1/admin';

const EMPTY_DILIGENCE_FORM: Omit<DiligenceRule, 'id'> = {
  name: '', description: '',
  conditions: [{ type: 'late_count', operator: 'eq', value: 0 }],
  bonusAmount: 0, forRoles: [], active: true,
};

interface Campaign {
  id: number;
  name: string;
  description: string;
  type: CampaignType;
  targetValue: number;
  bonusType: BonusType;
  bonusValue: number;
  month: number;
  year: number;
  forRoles: string[];  // [] = all roles
  status: CampaignStatus;
}

interface StaffProgress {
  staffId: string;
  staffName: string;
  staffRole: string;
  currentValue: number;
  achieved: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TH_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];
const TH_MONTHS_SHORT = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
];

const TYPE_CONFIG: Record<CampaignType, { label: string; unit: string; icon: React.ReactNode; color: string; bg: string }> = {
  sales:           { label: 'ยอดขาย',      unit: 'บาท',  icon: <SalesIcon />,   color: '#7c3aed', bg: '#f5f3ff' },
  teaching_hours:  { label: 'ชั่วโมงสอน',  unit: 'ชม.',  icon: <TeacherIcon />, color: '#0284c7', bg: '#eff6ff' },
};

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  draft:  { label: 'แบบร่าง',       color: 'default' },
  active: { label: 'กำลังใช้งาน',  color: 'success'  },
  ended:  { label: 'สิ้นสุดแล้ว',  color: 'default'  },
};

const ALL_ROLES = [
  { key: 'super_admin',     label: 'Super Admin' },
  { key: 'operator',        label: 'Operator' },
  { key: 'play_facilitator', label: 'Play Facilitator' },
];

// ─── Mock staff progress (no API yet) ────────────────────────────────────────

const MOCK_STAFF_PROGRESS: Record<number, StaffProgress[]> = {
  1: [
    { staffId: '1', staffName: 'นายสมชาย ใจดี',        staffRole: 'Play Facilitator', currentValue: 22, achieved: true  },
    { staffId: '2', staffName: 'นางสาวมณี รักดี',      staffRole: 'Play Facilitator', currentValue: 18, achieved: false },
    { staffId: '3', staffName: 'นายประเสริฐ ทำงานดี',  staffRole: 'Operator',          currentValue: 25, achieved: true  },
    { staffId: '4', staffName: 'นางสาวกนกวรรณ สมใจ',  staffRole: 'Play Facilitator', currentValue: 10, achieved: false },
    { staffId: '5', staffName: 'นายวิชัย มั่นคง',      staffRole: 'Play Facilitator', currentValue: 20, achieved: true  },
  ],
  2: [
    { staffId: '1', staffName: 'นายสมชาย ใจดี',        staffRole: 'Play Facilitator', currentValue: 38000, achieved: false },
    { staffId: '3', staffName: 'นายประเสริฐ ทำงานดี',  staffRole: 'Operator',          currentValue: 52000, achieved: true  },
    { staffId: '5', staffName: 'นายวิชัย มั่นคง',      staffRole: 'Play Facilitator', currentValue: 45000, achieved: false },
  ],
  3: [
    { staffId: '1', staffName: 'นายสมชาย ใจดี',        staffRole: 'Play Facilitator', currentValue: 35000, achieved: true  },
    { staffId: '2', staffName: 'นางสาวมณี รักดี',      staffRole: 'Play Facilitator', currentValue: 28000, achieved: false },
    { staffId: '3', staffName: 'นายประเสริฐ ทำงานดี',  staffRole: 'Operator',          currentValue: 41000, achieved: true  },
    { staffId: '4', staffName: 'นางสาวกนกวรรณ สมใจ',  staffRole: 'Play Facilitator', currentValue: 30500, achieved: true  },
  ],
  4: [
    { staffId: '1', staffName: 'นายสมชาย ใจดี',        staffRole: 'Play Facilitator', currentValue: 20, achieved: true  },
    { staffId: '2', staffName: 'นางสาวมณี รักดี',      staffRole: 'Play Facilitator', currentValue: 19, achieved: true  },
    { staffId: '3', staffName: 'นายประเสริฐ ทำงานดี',  staffRole: 'Operator',          currentValue: 22, achieved: true  },
  ],
};

const EMPTY_FORM: Omit<Campaign, 'id'> = {
  name: '', description: '', type: 'teaching_hours',
  targetValue: 0, bonusType: 'fixed', bonusValue: 0,
  month: new Date().getMonth() + 1, year: new Date().getFullYear(),
  forRoles: [], status: 'active',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPeriod = (c: Campaign) =>
  `${TH_MONTHS_SHORT[c.month - 1]} ${c.year + 543}`;

const fmtBonus = (c: Campaign) =>
  c.bonusType === 'fixed' ? `฿${c.bonusValue.toLocaleString()}` : `${c.bonusValue}% ของยอด`;

// ─── Component ────────────────────────────────────────────────────────────────

const CampaignManagement: React.FC = () => {
  const [mainTab, setMainTab] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<'all' | CampaignStatus>('all');
  const [successMsg, setSuccessMsg] = useState('');

  // Diligence rules state
  const [diligenceRules, setDiligenceRules]       = useState<DiligenceRule[]>([]);
  const [diligenceFormOpen, setDiligenceFormOpen] = useState(false);
  const [diligenceEditId, setDiligenceEditId]     = useState<number | null>(null);
  const [diligenceForm, setDiligenceForm]         = useState<Omit<DiligenceRule, 'id'>>(EMPTY_DILIGENCE_FORM);
  const [diligenceDeleteId, setDiligenceDeleteId] = useState<number | null>(null);

  // Dialogs
  const [formOpen, setFormOpen]       = useState(false);
  const [editId, setEditId]           = useState<number | null>(null);
  const [form, setForm]               = useState<Omit<Campaign, 'id'>>(EMPTY_FORM);
  const [detailId, setDetailId]       = useState<number | null>(null);
  const [deleteId, setDeleteId]       = useState<number | null>(null);

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); };

  // ── API fetch ──────────────────────────────────────────────────────────────
  const fetchCampaigns = async () => {
    try {
      const res = await axios.get(`${API_BASE}/campaign-bonuses`);
      const data = res.data.campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type as CampaignType,
        targetValue: c.target_value,
        bonusType: c.bonus_type as BonusType,
        bonusValue: c.bonus_value,
        month: c.month,
        year: c.year,
        forRoles: JSON.parse(c.for_roles_json ?? '[]'),
        status: c.status as CampaignStatus,
      }));
      setCampaigns(data);
    } catch (err) {
      console.error('fetchCampaigns error:', err);
    }
  };

  const fetchDiligenceRules = async () => {
    try {
      const res = await axios.get(`${API_BASE}/diligence-rules`);
      const data = res.data.rules.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        conditions: JSON.parse(r.conditions_json ?? '[]'),
        bonusAmount: r.bonus_amount,
        forRoles: JSON.parse(r.for_roles_json ?? '[]'),
        active: Boolean(r.active),
      }));
      setDiligenceRules(data);
    } catch (err) {
      console.error('fetchDiligenceRules error:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCampaigns(), fetchDiligenceRules()]);
      setLoading(false);
    };
    init();
  }, []);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    campaigns.filter(c => statusTab === 'all' || c.status === statusTab),
  [campaigns, statusTab]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  };
  const openEdit = (c: Campaign) => {
    setEditId(c.id);
    const { id, ...rest } = c;
    setForm(rest);
    setFormOpen(true);
  };
  const handleSave = async () => {
    if (!form.name.trim() || form.targetValue <= 0 || form.bonusValue <= 0) return;
    try {
      const body = {
        name: form.name,
        description: form.description,
        type: form.type,
        targetValue: form.targetValue,
        bonusType: form.bonusType,
        bonusValue: form.bonusValue,
        month: form.month,
        year: form.year,
        forRoles: form.forRoles,
        status: form.status,
      };
      if (editId !== null) {
        await axios.put(`${API_BASE}/campaign-bonuses/${editId}`, body);
        showSuccess('แก้ไขแคมเปญเรียบร้อย');
      } else {
        await axios.post(`${API_BASE}/campaign-bonuses`, body);
        showSuccess('สร้างแคมเปญใหม่เรียบร้อย');
      }
      await fetchCampaigns();
    } catch (err) {
      console.error('handleSave error:', err);
    }
    setFormOpen(false);
  };
  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/campaign-bonuses/${id}`);
      await fetchCampaigns();
      setDeleteId(null);
      showSuccess('ลบแคมเปญเรียบร้อย');
    } catch (err) {
      console.error('handleDelete error:', err);
    }
  };
  const toggleStatus = (id: number) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next: CampaignStatus = c.status === 'active' ? 'ended' : c.status === 'ended' ? 'active' : 'active';
      return { ...c, status: next };
    }));
  };

  // ── Detail data ───────────────────────────────────────────────────────────
  const detailCampaign = campaigns.find(c => c.id === detailId);
  const detailProgress = detailId ? (MOCK_STAFF_PROGRESS[detailId] ?? []) : [];
  const achievedCount  = detailProgress.filter(s => s.achieved).length;
  const totalBonusPayout = detailProgress.filter(s => s.achieved).reduce((sum, s) => {
    if (!detailCampaign) return sum;
    if (detailCampaign.bonusType === 'fixed') return sum + detailCampaign.bonusValue;
    return sum + (detailCampaign.targetValue * detailCampaign.bonusValue / 100);
  }, 0);

  // ── Tab counts ────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all:    campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    ended:  campaigns.filter(c => c.status === 'ended').length,
    draft:  campaigns.filter(c => c.status === 'draft').length,
  }), [campaigns]);

  // ── Diligence handlers ───────────────────────────────────────────────────
  const openCreateDiligence = () => {
    setDiligenceEditId(null);
    setDiligenceForm({ ...EMPTY_DILIGENCE_FORM, conditions: [{ type: 'late_count', operator: 'eq', value: 0 }] });
    setDiligenceFormOpen(true);
  };
  const openEditDiligence = (r: DiligenceRule) => {
    setDiligenceEditId(r.id);
    const { id, ...rest } = r;
    setDiligenceForm({ ...rest, conditions: rest.conditions.map(c => ({ ...c })) });
    setDiligenceFormOpen(true);
  };
  const saveDiligence = async () => {
    if (!diligenceForm.name.trim() || diligenceForm.bonusAmount <= 0) return;
    try {
      const body = {
        name: diligenceForm.name,
        description: diligenceForm.description,
        conditions: diligenceForm.conditions,
        bonusAmount: diligenceForm.bonusAmount,
        forRoles: diligenceForm.forRoles,
        active: diligenceForm.active,
      };
      if (diligenceEditId !== null) {
        await axios.put(`${API_BASE}/diligence-rules/${diligenceEditId}`, body);
        showSuccess('แก้ไขกฎโบนัสขยันเรียบร้อย');
      } else {
        await axios.post(`${API_BASE}/diligence-rules`, body);
        showSuccess('สร้างกฎโบนัสขยันใหม่เรียบร้อย');
      }
      await fetchDiligenceRules();
    } catch (err) {
      console.error('saveDiligence error:', err);
    }
    setDiligenceFormOpen(false);
  };
  const deleteDiligence = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/diligence-rules/${id}`);
      await fetchDiligenceRules();
      setDiligenceDeleteId(null);
      showSuccess('ลบกฎโบนัสขยันเรียบร้อย');
    } catch (err) {
      console.error('deleteDiligence error:', err);
    }
  };
  const toggleDiligenceActive = async (id: number) => {
    const rule = diligenceRules.find(r => r.id === id);
    if (!rule) return;
    try {
      await axios.put(`${API_BASE}/diligence-rules/${id}`, {
        name: rule.name,
        description: rule.description,
        conditions: rule.conditions,
        bonusAmount: rule.bonusAmount,
        forRoles: rule.forRoles,
        active: !rule.active,
      });
      await fetchDiligenceRules();
    } catch (err) {
      console.error('toggleDiligenceActive error:', err);
    }
  };

  const addCondition = () =>
    setDiligenceForm(f => ({ ...f, conditions: [...f.conditions, { type: 'late_count', operator: 'eq', value: 0 }] }));
  const removeCondition = (i: number) =>
    setDiligenceForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
  const updateCondition = (i: number, patch: Partial<DiligenceCond>) =>
    setDiligenceForm(f => ({ ...f, conditions: f.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));

  const conditionText = (c: DiligenceCond) => {
    const cfg = DILIGENCE_COND_CONFIG[c.type];
    const op  = OPERATOR_LABEL[c.operator];
    return `${cfg.label} ${op} ${c.value} ${cfg.unit}`;
  };

  // ── Campaign card ─────────────────────────────────────────────────────────
  const renderCard = (c: Campaign) => {
    const cfg = TYPE_CONFIG[c.type];
    const sc = STATUS_CONFIG[c.status];
    const progress = MOCK_STAFF_PROGRESS[c.id] ?? [];
    const total = progress.length;
    const achieved = progress.filter(s => s.achieved).length;
    const pct = total > 0 ? (achieved / total) * 100 : 0;

    return (
      <Grid item xs={12} sm={6} lg={4} key={c.id}>
        <Paper
          sx={{
            p: 2.5, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column',
            border: '1px solid', borderColor: c.status === 'active' ? cfg.color + '40' : 'divider',
            opacity: c.status === 'draft' ? 0.75 : 1,
          }}
        >
          {/* Header chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Chip
              size="small"
              label={cfg.label}
              icon={<Box sx={{ color: `${cfg.color} !important`, display: 'flex', '& svg': { fontSize: '14px !important' } }}>{cfg.icon}</Box>}
              sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}
            />
            <Chip size="small" label={sc.label} color={sc.color} sx={{ fontWeight: 700, fontSize: '0.65rem' }} />
            <Chip size="small" label={fmtPeriod(c)} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.65rem', ml: 'auto' }} />
          </Box>

          {/* Name + description */}
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5, lineHeight: 1.3 }}>{c.name}</Typography>
          {c.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, flex: 1, lineHeight: 1.5 }}>{c.description}</Typography>
          )}

          {/* Target + bonus */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, p: 1.5, bgcolor: cfg.bg, borderRadius: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>เป้าหมาย</Typography>
              <Typography variant="body2" fontWeight={800} color={cfg.color}>
                {c.targetValue.toLocaleString()} {cfg.unit}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>โบนัส</Typography>
              <Typography variant="body2" fontWeight={800} color="success.main">{fmtBonus(c)}</Typography>
            </Box>
          </Box>

          {/* For roles */}
          {c.forRoles.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
              สำหรับ: {c.forRoles.map(r => ALL_ROLES.find(x => x.key === r)?.label ?? r).join(', ')}
            </Typography>
          )}
          {c.forRoles.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>สำหรับ: ทุกตำแหน่ง</Typography>
          )}

          {/* Staff progress (if has data) */}
          {total > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">ความคืบหน้าพนักงาน</Typography>
                <Typography variant="caption" fontWeight={700} color={pct === 100 ? 'success.main' : 'text.primary'}>
                  {achieved}/{total} คน บรรลุเป้า
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate" value={pct}
                color={pct === 100 ? 'success' : pct >= 50 ? 'primary' : 'warning'}
                sx={{ height: 6, borderRadius: 99 }}
              />
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 'auto', pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
              size="small" variant="outlined" startIcon={<ViewIcon />}
              onClick={() => setDetailId(c.id)}
              sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.72rem', flex: 1 }}
            >
              รายละเอียด
            </Button>
            <Tooltip title="แก้ไข">
              <IconButton size="small" onClick={() => openEdit(c)} sx={{ color: 'primary.main' }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="ลบ">
              <IconButton size="small" onClick={() => setDeleteId(c.id)} sx={{ color: 'error.main' }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>
      </Grid>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CampaignIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จัดการโบนัส</Typography>
            <Typography variant="body2" color="text.secondary">
              แคมเปญเป้าหมาย และกฎโบนัสขยันสำหรับพนักงาน
            </Typography>
          </Box>
        </Box>
        {mainTab === 0 && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 3, fontWeight: 700 }}>
            สร้างแคมเปญ
          </Button>
        )}
        {mainTab === 1 && (
          <Button variant="contained" color="warning" startIcon={<AddIcon />} onClick={openCreateDiligence} sx={{ borderRadius: 3, fontWeight: 700 }}>
            สร้างกฎโบนัสขยัน
          </Button>
        )}
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Main tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)}>
          <Tab label="แคมเปญโบนัส" icon={<CampaignIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab label="โบนัสขยัน" icon={<DiligenceIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* ── Tab 0: Campaign content ──────────────────────────────────────────── */}
      {mainTab === 0 && (
        <>
          {/* Status filter tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={statusTab} onChange={(_, v) => setStatusTab(v)} textColor="secondary" indicatorColor="secondary">
              <Tab value="all"    label={`ทั้งหมด (${counts.all})`} />
              <Tab value="active" label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>กำลังใช้งาน <Chip label={counts.active} size="small" color="success" sx={{ height: 18, fontSize: '0.6rem' }} /></Box>} />
              <Tab value="ended"  label={`สิ้นสุดแล้ว (${counts.ended})`} />
              <Tab value="draft"  label={`แบบร่าง (${counts.draft})`} />
            </Tabs>
          </Box>

          <Grid container spacing={2.5}>
            {filtered.map(renderCard)}
            {filtered.length === 0 && (
              <Grid item xs={12}>
                <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center', border: '2px dashed', borderColor: 'divider' }}>
                  <CampaignIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary" fontWeight={600}>ไม่มีแคมเปญในหมวดนี้</Typography>
                </Paper>
              </Grid>
            )}
          </Grid>
        </>
      )}

      {/* ── Tab 1: Diligence rules ───────────────────────────────────────────── */}
      {mainTab === 1 && (
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={700}>วิธีคำนวณโบนัสขยัน</Typography>
            <Typography variant="body2">
              ระบบตรวจสอบข้อมูลการเข้างานของพนักงานแต่ละคนในรอบเดือน — ถ้าตรงตามเงื่อนไขของกฎข้อใด จะได้รับโบนัสตามกฎนั้น
              (ถ้าตรงหลายกฎ จะได้รับ<strong>ทุกกฎที่ตรง</strong>)
            </Typography>
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {diligenceRules.map(r => (
              <Paper
                key={r.id}
                sx={{
                  p: 2.5, borderRadius: 3,
                  border: '1px solid', borderColor: r.active ? 'warning.light' : 'divider',
                  opacity: r.active ? 1 : 0.55,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                      <DiligenceIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                      <Typography variant="subtitle2" fontWeight={800}>{r.name}</Typography>
                      <Chip
                        size="small" label={r.active ? 'ใช้งาน' : 'ปิด'}
                        color={r.active ? 'warning' : 'default'}
                        sx={{ fontWeight: 700, fontSize: '0.62rem' }}
                      />
                      {r.forRoles.length > 0 && (
                        <Chip
                          size="small" variant="outlined"
                          label={r.forRoles.map(k => ALL_ROLES.find(x => x.key === k)?.label ?? k).join(', ')}
                          sx={{ fontWeight: 700, fontSize: '0.62rem' }}
                        />
                      )}
                      {r.forRoles.length === 0 && (
                        <Chip size="small" variant="outlined" label="ทุกตำแหน่ง" sx={{ fontWeight: 700, fontSize: '0.62rem' }} />
                      )}
                    </Box>

                    {r.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{r.description}</Typography>
                    )}

                    {/* Conditions */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      {r.conditions.map((c, i) => {
                        const cfg = DILIGENCE_COND_CONFIG[c.type];
                        return (
                          <Chip
                            key={i}
                            size="small"
                            icon={<Box sx={{ color: `${cfg.color} !important`, display: 'flex', ml: '6px !important' }}>{cfg.icon}</Box>}
                            label={conditionText(c)}
                            sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: cfg.color + '12', color: cfg.color }}
                          />
                        );
                      })}
                    </Box>

                    <Typography variant="body2" fontWeight={700} color="success.main">
                      โบนัส ฿{r.bonusAmount.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
                    <Tooltip title={r.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}>
                      <Chip
                        size="small" clickable
                        label={r.active ? 'ปิด' : 'เปิด'}
                        color={r.active ? 'default' : 'warning'}
                        onClick={() => toggleDiligenceActive(r.id)}
                        sx={{ fontWeight: 700, fontSize: '0.65rem' }}
                      />
                    </Tooltip>
                    <Tooltip title="แก้ไข">
                      <IconButton size="small" onClick={() => openEditDiligence(r)} sx={{ color: 'primary.main' }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="ลบ">
                      <IconButton size="small" onClick={() => setDiligenceDeleteId(r.id)} sx={{ color: 'error.main' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Paper>
            ))}

            {diligenceRules.length === 0 && (
              <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center', border: '2px dashed', borderColor: 'divider' }}>
                <DiligenceIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary" fontWeight={600}>ยังไม่มีกฎโบนัสขยัน — กด "สร้างกฎโบนัสขยัน" เพื่อเริ่มต้น</Typography>
              </Paper>
            )}
          </Box>
        </Box>
      )}

      {/* ── Detail Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={detailId !== null} onClose={() => setDetailId(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        {detailCampaign && (() => {
          const cfg = TYPE_CONFIG[detailCampaign.type];
          const sc  = STATUS_CONFIG[detailCampaign.status];
          return (
            <>
              <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ color: cfg.color }}>{cfg.icon}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" fontWeight={800}>{detailCampaign.name}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Chip size="small" label={sc.label} color={sc.color} sx={{ fontWeight: 700, fontSize: '0.62rem' }} />
                      <Chip size="small" label={fmtPeriod(detailCampaign)} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.62rem' }} />
                    </Box>
                  </Box>
                </Box>
              </DialogTitle>
              <Divider />
              <DialogContent sx={{ pt: 2 }}>
                {detailCampaign.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{detailCampaign.description}</Typography>
                )}

                {/* Summary */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">เป้าหมาย</Typography>
                    <Typography variant="h6" fontWeight={800} color={cfg.color}>
                      {detailCampaign.targetValue.toLocaleString()} {cfg.unit}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">โบนัส/คน</Typography>
                    <Typography variant="h6" fontWeight={800} color="success.main">{fmtBonus(detailCampaign)}</Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">โบนัสรวมที่ต้องจ่าย</Typography>
                    <Typography variant="h6" fontWeight={800} color="warning.main">฿{totalBonusPayout.toLocaleString()}</Typography>
                  </Paper>
                </Box>

                {/* Achievement summary */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <TrophyIcon sx={{ color: '#f59e0b' }} />
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={700}>บรรลุเป้าหมาย</Typography>
                      <Typography variant="body2" fontWeight={800} color="success.main">
                        {achievedCount} / {detailProgress.length} คน
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={detailProgress.length > 0 ? (achievedCount / detailProgress.length) * 100 : 0}
                      color="success" sx={{ height: 8, borderRadius: 99 }}
                    />
                  </Box>
                </Box>

                <Divider sx={{ mb: 2 }} />

                {/* Staff list */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>ความคืบหน้ารายคน</Typography>
                {detailProgress.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                    ยังไม่มีข้อมูลความคืบหน้า
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {detailProgress.map(s => {
                      const pct = Math.min((s.currentValue / detailCampaign.targetValue) * 100, 100);
                      return (
                        <Box key={s.staffId}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: s.achieved ? 'success.main' : 'grey.400' }}>
                              {s.staffName[2] || 'A'}
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                  <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>{s.staffName}</Typography>
                                  <Typography variant="caption" color="text.secondary">{s.staffRole}</Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant="body2" fontWeight={700} color={s.achieved ? 'success.main' : 'text.secondary'}>
                                    {s.currentValue.toLocaleString()} / {detailCampaign.targetValue.toLocaleString()} {cfg.unit}
                                  </Typography>
                                  {s.achieved
                                    ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'flex-end' }}>
                                        <AchievedIcon sx={{ fontSize: 12, color: 'success.main' }} />
                                        <Typography variant="caption" color="success.main" fontWeight={700}>บรรลุแล้ว</Typography>
                                      </Box>
                                    : <Typography variant="caption" color="text.disabled">ยังไม่บรรลุ</Typography>
                                  }
                                </Box>
                              </Box>
                            </Box>
                          </Box>
                          <LinearProgress
                            variant="determinate" value={pct}
                            color={s.achieved ? 'success' : pct >= 70 ? 'primary' : 'warning'}
                            sx={{ height: 5, borderRadius: 99 }}
                          />
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Button onClick={() => { setDetailId(null); openEdit(detailCampaign); }} variant="outlined" startIcon={<EditIcon />} sx={{ fontWeight: 700, borderRadius: 3 }}>
                  แก้ไข
                </Button>
                <Button onClick={() => setDetailId(null)} variant="contained" sx={{ fontWeight: 700, borderRadius: 3 }}>ปิด</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
          {editId !== null ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญโบนัสใหม่'}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {/* Name */}
          <TextField
            label="ชื่อแคมเปญ" fullWidth value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="คำอธิบาย (ถ้ามี)" fullWidth multiline rows={2} value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            sx={{ mb: 2 }}
          />

          {/* Type */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>ประเภทเป้าหมาย</InputLabel>
            <Select value={form.type} label="ประเภทเป้าหมาย"
              onChange={e => setForm(f => ({ ...f, type: e.target.value as CampaignType }))}>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v.label} ({v.unit})</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Target + Period */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <TextField
                label={`เป้าหมาย (${TYPE_CONFIG[form.type].unit})`}
                type="number" fullWidth
                value={form.targetValue || ''}
                onChange={e => setForm(f => ({ ...f, targetValue: parseFloat(e.target.value) || 0 }))}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <FormControl fullWidth>
                <InputLabel>เดือน</InputLabel>
                <Select value={form.month} label="เดือน"
                  onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}>
                  {TH_MONTHS.map((m, i) => <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                label="ปี (พ.ศ.)" type="number" fullWidth
                value={form.year + 543}
                onChange={e => setForm(f => ({ ...f, year: (parseInt(e.target.value) || 2569) - 543 }))}
              />
            </Grid>
          </Grid>

          {/* Bonus */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>โบนัสที่ได้รับเมื่อบรรลุเป้า</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            <ToggleButtonGroup exclusive size="small"
              value={form.bonusType}
              onChange={(_, v) => v && setForm(f => ({ ...f, bonusType: v }))}
              sx={{ height: 40 }}>
              <ToggleButton value="fixed"   sx={{ fontWeight: 700, px: 1.5 }}>฿ คงที่</ToggleButton>
              <ToggleButton value="percent" sx={{ fontWeight: 700, px: 1.5 }}>% ของยอด</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              size="small" type="number" fullWidth
              label={form.bonusType === 'fixed' ? 'จำนวนเงิน (฿)' : 'เปอร์เซ็นต์ (%)'}
              value={form.bonusValue || ''}
              onChange={e => setForm(f => ({ ...f, bonusValue: parseFloat(e.target.value) || 0 }))}
              inputProps={{ min: 0 }}
            />
          </Box>

          {/* For roles */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>ใช้กับตำแหน่ง</InputLabel>
            <Select
              multiple value={form.forRoles}
              label="ใช้กับตำแหน่ง"
              onChange={e => setForm(f => ({ ...f, forRoles: typeof e.target.value === 'string' ? [] : e.target.value as string[] }))}
              renderValue={selected =>
                selected.length === 0
                  ? 'ทุกตำแหน่ง'
                  : selected.map(r => ALL_ROLES.find(x => x.key === r)?.label ?? r).join(', ')
              }
            >
              {ALL_ROLES.map(r => (
                <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status */}
          <FormControl fullWidth>
            <InputLabel>สถานะ</InputLabel>
            <Select value={form.status} label="สถานะ"
              onChange={e => setForm(f => ({ ...f, status: e.target.value as CampaignStatus }))}>
              <MenuItem value="draft">แบบร่าง (ยังไม่เปิดใช้)</MenuItem>
              <MenuItem value="active">เปิดใช้งาน</MenuItem>
              <MenuItem value="ended">สิ้นสุดแล้ว</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={!form.name.trim() || form.targetValue <= 0 || form.bonusValue <= 0}
            sx={{ borderRadius: 3, fontWeight: 700 }}>
            {editId !== null ? 'บันทึกการแก้ไข' : 'สร้างแคมเปญ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบแคมเปญ</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            แคมเปญ <strong>"{campaigns.find(c => c.id === deleteId)?.name}"</strong> จะถูกลบออกจากระบบถาวร
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => handleDelete(deleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบแคมเปญ</Button>
        </DialogActions>
      </Dialog>

      {/* ── Diligence Rule Form Dialog ───────────────────────────────────────── */}
      <Dialog open={diligenceFormOpen} onClose={() => setDiligenceFormOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
          {diligenceEditId !== null ? 'แก้ไขกฎโบนัสขยัน' : 'สร้างกฎโบนัสขยันใหม่'}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <TextField
            label="ชื่อกฎ" fullWidth value={diligenceForm.name}
            onChange={e => setDiligenceForm(f => ({ ...f, name: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="คำอธิบาย (ถ้ามี)" fullWidth multiline rows={2} value={diligenceForm.description}
            onChange={e => setDiligenceForm(f => ({ ...f, description: e.target.value }))}
            sx={{ mb: 2.5 }}
          />

          {/* Conditions */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700}>เงื่อนไข (ต้องตรงทุกข้อ)</Typography>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addCondition} sx={{ borderRadius: 2, fontWeight: 700 }}>
              เพิ่มเงื่อนไข
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {diligenceForm.conditions.map((c, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl size="small" sx={{ flex: 2 }}>
                  <InputLabel>ประเภท</InputLabel>
                  <Select value={c.type} label="ประเภท"
                    onChange={e => updateCondition(i, { type: e.target.value as DiligenceCondType })}>
                    {Object.entries(DILIGENCE_COND_CONFIG).map(([k, v]) => (
                      <MenuItem key={k} value={k}>{v.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1.5 }}>
                  <InputLabel>เงื่อนไข</InputLabel>
                  <Select value={c.operator} label="เงื่อนไข"
                    onChange={e => updateCondition(i, { operator: e.target.value as DiligenceOperator })}>
                    <MenuItem value="eq">= เท่ากับ</MenuItem>
                    <MenuItem value="lte">≤ ไม่เกิน</MenuItem>
                    <MenuItem value="gte">≥ อย่างน้อย</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small" type="number" label={DILIGENCE_COND_CONFIG[c.type].unit}
                  value={c.value === 0 ? '' : c.value}
                  onChange={e => updateCondition(i, { value: parseFloat(e.target.value) || 0 })}
                  inputProps={{ min: 0, step: c.type === 'ot_hours' ? 0.5 : 1 }}
                  sx={{ width: 90 }}
                />
                <IconButton size="small" color="error" onClick={() => removeCondition(i)}
                  disabled={diligenceForm.conditions.length <= 1}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>

          {/* Bonus + Roles */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="โบนัส (฿)" type="number" fullWidth
                value={diligenceForm.bonusAmount || ''}
                onChange={e => setDiligenceForm(f => ({ ...f, bonusAmount: parseFloat(e.target.value) || 0 }))}
                InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>ใช้กับตำแหน่ง</InputLabel>
                <Select
                  multiple value={diligenceForm.forRoles}
                  label="ใช้กับตำแหน่ง"
                  onChange={e => setDiligenceForm(f => ({
                    ...f,
                    forRoles: typeof e.target.value === 'string' ? [] : e.target.value as string[],
                  }))}
                  renderValue={sel =>
                    sel.length === 0 ? 'ทุกตำแหน่ง' : sel.map(r => ALL_ROLES.find(x => x.key === r)?.label ?? r).join(', ')
                  }
                >
                  {ALL_ROLES.map(r => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDiligenceFormOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="warning" onClick={saveDiligence}
            disabled={!diligenceForm.name.trim() || diligenceForm.bonusAmount <= 0}
            sx={{ borderRadius: 3, fontWeight: 700 }}>
            {diligenceEditId !== null ? 'บันทึกการแก้ไข' : 'สร้างกฎ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Diligence Delete confirm ─────────────────────────────────────────── */}
      <Dialog open={diligenceDeleteId !== null} onClose={() => setDiligenceDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบกฎโบนัสขยัน</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            กฎ <strong>"{diligenceRules.find(r => r.id === diligenceDeleteId)?.name}"</strong> จะถูกลบออกจากระบบถาวร
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDiligenceDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => deleteDiligence(diligenceDeleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบกฎ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CampaignManagement;
