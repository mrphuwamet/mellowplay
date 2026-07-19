import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Skeleton, Button, IconButton,
  TextField, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
  Drawer, LinearProgress, Checkbox, Divider,
} from '@mui/material';
import {
  Handshake as SponsorIcon,
  AttachMoney as ValueIcon,
  WarningAmber as ExpiringIcon,
  HourglassEmpty as PendingIcon,
  PictureAsPdf as PdfIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import DashboardTabs from '../components/DashboardTabs';
import {
  MOCK_SPONSORS, SPONSORSHIP_REVENUE_TREND, Sponsor, SponsorCategory, Deliverable,
} from '../mocks/sponsorshipData';
import { exportDashboardPdf } from '../utils/pdfExport';

const todayISO = () => new Date().toISOString().slice(0, 10);
const formatThb = (n: number) => `฿${Math.round(n).toLocaleString()}`;
const daysUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86400000);

type Status = 'active' | 'pending' | 'expired';
const getStatus = (s: Sponsor): Status => {
  if (s.contractStatus === 'pending') return 'pending';
  if (s.endDate < todayISO()) return 'expired';
  return 'active';
};
const STATUS_META: Record<Status, { label: string; color: 'success' | 'warning' | 'default' }> = {
  active: { label: 'Active', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  expired: { label: 'Expired', color: 'default' },
};

const CATEGORIES: SponsorCategory[] = ['การศึกษา', 'อาหารและเครื่องดื่ม', 'ค้าปลีก', 'เทคโนโลยี', 'สุขภาพ', 'อื่นๆ'];

const StatCard = ({
  title, value, icon, color, loading,
}: { title: string; value: string; icon: React.ReactNode; color: string; loading: boolean }) => {
  if (loading) return <Skeleton variant="rounded" height={110} sx={{ borderRadius: 4 }} />;
  return (
    <Card sx={{ height: '100%', boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{
            p: 1.5, borderRadius: 3, bgcolor: `${color}.main`, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            '& svg': { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' },
          }}>
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>{title}</Typography>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>{value}</Typography>
      </CardContent>
    </Card>
  );
};

const emptyForm = () => ({
  companyName: '', contactName: '', contactPhone: '', contactEmail: '',
  category: 'อื่นๆ' as SponsorCategory, value: 0, startDate: todayISO(), endDate: todayISO(),
  notes: '', deliverableLabels: [''] as string[],
});

const SponsorshipDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [sponsors, setSponsors] = useState<Sponsor[]>(MOCK_SPONSORS);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [drawerSponsorId, setDrawerSponsorId] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState(false);
  const [exportingProposal, setExportingProposal] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const proposalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  const kpis = useMemo(() => {
    const active = sponsors.filter((s) => getStatus(s) === 'active');
    const pending = sponsors.filter((s) => getStatus(s) === 'pending');
    const expiringSoon = active.filter((s) => daysUntil(s.endDate) <= 30);
    const totalValue = active.reduce((sum, s) => sum + s.value, 0);
    return {
      activeCount: active.length,
      totalValue,
      expiringSoonCount: expiringSoon.length,
      pendingCount: pending.length,
    };
  }, [sponsors]);

  const filteredSponsors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sponsors;
    return sponsors.filter((s) =>
      s.companyName.toLowerCase().includes(q) || s.contactName.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [sponsors, search]);

  const drawerSponsor = sponsors.find((s) => s.id === drawerSponsorId) || null;

  const openAddDialog = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEditDialog = (s: Sponsor) => {
    setEditingId(s.id);
    setForm({
      companyName: s.companyName, contactName: s.contactName, contactPhone: s.contactPhone, contactEmail: s.contactEmail,
      category: s.category, value: s.value, startDate: s.startDate, endDate: s.endDate,
      notes: s.notes, deliverableLabels: s.deliverables.length > 0 ? s.deliverables.map((d) => d.label) : [''],
    });
    setDialogOpen(true);
  };

  const handleDeliverableChange = (i: number, text: string) => {
    setForm((f) => {
      const next = [...f.deliverableLabels];
      next[i] = text;
      return { ...f, deliverableLabels: next };
    });
  };
  const addDeliverableRow = () => setForm((f) => ({ ...f, deliverableLabels: [...f.deliverableLabels, ''] }));
  const removeDeliverableRow = (i: number) => setForm((f) => ({ ...f, deliverableLabels: f.deliverableLabels.filter((_, idx) => idx !== i) }));

  const handleSave = () => {
    const cleanLabels = form.deliverableLabels.map((l) => l.trim()).filter(Boolean);
    const existing = editingId ? sponsors.find((s) => s.id === editingId) : null;
    const deliverables: Deliverable[] = cleanLabels.map((label, i) => {
      const prev = existing?.deliverables[i];
      return { id: prev?.id || `d${i}`, label, done: prev?.label === label ? prev.done : false };
    });

    if (editingId) {
      setSponsors((prev) => prev.map((s) => (s.id === editingId ? {
        ...s,
        companyName: form.companyName, contactName: form.contactName, contactPhone: form.contactPhone, contactEmail: form.contactEmail,
        category: form.category, value: Number(form.value), startDate: form.startDate, endDate: form.endDate,
        notes: form.notes, deliverables,
      } : s)));
    } else {
      const newSponsor: Sponsor = {
        id: `SPN-NEW-${Date.now() % 100000}`,
        companyName: form.companyName, contactName: form.contactName, contactPhone: form.contactPhone, contactEmail: form.contactEmail,
        category: form.category, value: Number(form.value), startDate: form.startDate, endDate: form.endDate,
        contractStatus: 'pending', deliverables,
        timeline: [{ date: todayISO(), note: 'สร้างรายการสปอนเซอร์ใหม่' }],
        notes: form.notes,
      };
      setSponsors((prev) => [newSponsor, ...prev]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('คุณต้องการลบสปอนเซอร์รายนี้ใช่หรือไม่?')) return;
    setSponsors((prev) => prev.filter((s) => s.id !== id));
    if (drawerSponsorId === id) setDrawerSponsorId(null);
  };

  const toggleDeliverable = (sponsorId: string, deliverableId: string) => {
    setSponsors((prev) => prev.map((s) => (s.id !== sponsorId ? s : {
      ...s,
      deliverables: s.deliverables.map((d) => (d.id === deliverableId ? { ...d, done: !d.done } : d)),
    })));
  };

  const handleExportReport = async () => {
    if (!reportRef.current) return;
    setExportingReport(true);
    try {
      await exportDashboardPdf({
        element: reportRef.current,
        fileName: `sponsorship-report-${todayISO()}.pdf`,
        reportTitle: 'รายงานสปอนเซอร์ (ฉบับภายใน)',
        periodLabel: `ข้อมูล ณ วันที่ ${todayISO()}`,
        branchLabel: 'ทุกสาขา',
      });
    } finally {
      setExportingReport(false);
    }
  };

  const handleExportProposal = async () => {
    if (!proposalRef.current || !drawerSponsor) return;
    setExportingProposal(true);
    try {
      await exportDashboardPdf({
        element: proposalRef.current,
        fileName: `sponsor-proposal-${drawerSponsor.companyName}.pdf`,
        reportTitle: `ข้อเสนอสปอนเซอร์ — ${drawerSponsor.companyName}`,
        periodLabel: `${drawerSponsor.startDate} ถึง ${drawerSponsor.endDate}`,
        branchLabel: drawerSponsor.companyName,
      });
    } finally {
      setExportingProposal(false);
    }
  };

  return (
    <Box>
      <DashboardTabs />

      <Box sx={{
        position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default', py: 1.5, mb: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
      }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>สปอนเซอร์</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<PdfIcon />} onClick={handleExportReport} disabled={exportingReport || loading}>
            {exportingReport ? 'กำลังสร้าง PDF...' : 'Export รายงานภายใน'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAddDialog}>เพิ่มสปอนเซอร์</Button>
        </Box>
      </Box>

      <Box ref={reportRef}>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="สปอนเซอร์ที่ Active" value={kpis.activeCount.toLocaleString()} icon={<SponsorIcon />} color="primary" loading={loading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="มูลค่าสปอนเซอร์รวม" value={formatThb(kpis.totalValue)} icon={<ValueIcon />} color="success" loading={loading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="ใกล้หมดอายุ (30 วัน)" value={kpis.expiringSoonCount.toLocaleString()} icon={<ExpiringIcon />} color="warning" loading={loading} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="รอดำเนินการ" value={kpis.pendingCount.toLocaleString()} icon={<PendingIcon />} color="info" loading={loading} />
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>แนวโน้มรายได้จากสปอนเซอร์รายเดือน</Typography>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={SPONSORSHIP_REVENUE_TREND}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(v: number) => formatThb(v)} />
                  <Line type="monotone" dataKey="revenue" name="รายได้สปอนเซอร์" stroke="#7452d6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #eef0f3', boxShadow: 'none' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>รายชื่อสปอนเซอร์</Typography>
                <TextField
                  size="small" placeholder="ค้นหา (บริษัท / ผู้ติดต่อ / หมวดหมู่)" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ width: { xs: '100%', sm: 300 } }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> }}
                />
              </Box>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 780 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>บริษัท</TableCell>
                      <TableCell>หมวดหมู่</TableCell>
                      <TableCell align="right">มูลค่า</TableCell>
                      <TableCell>ระยะเวลา</TableCell>
                      <TableCell>สถานะ</TableCell>
                      <TableCell align="right">จัดการ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSponsors.length === 0 && (
                      <TableRow><TableCell colSpan={6} align="center">
                        <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ไม่พบสปอนเซอร์ที่ตรงกับคำค้นหา</Typography>
                      </TableCell></TableRow>
                    )}
                    {filteredSponsors.map((s) => {
                      const status = getStatus(s);
                      return (
                        <TableRow key={s.id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{s.companyName}</TableCell>
                          <TableCell><Chip label={s.category} size="small" sx={{ height: 20, fontSize: 11 }} /></TableCell>
                          <TableCell align="right">{formatThb(s.value)}</TableCell>
                          <TableCell>{s.startDate} - {s.endDate}</TableCell>
                          <TableCell>
                            <Chip label={STATUS_META[status].label} color={STATUS_META[status].color} size="small" sx={{ fontWeight: 700 }} />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => setDrawerSponsorId(s.id)} title="ดูรายละเอียด"><ViewIcon fontSize="small" /></IconButton>
                            <IconButton size="small" color="primary" onClick={() => openEditDialog(s)} title="แก้ไข"><EditIcon fontSize="small" /></IconButton>
                            <IconButton size="small" color="error" onClick={() => handleDelete(s.id)} title="ลบ"><DeleteIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Add/Edit Sponsor Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'แก้ไขสปอนเซอร์' : 'เพิ่มสปอนเซอร์ใหม่'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="ชื่อบริษัท" fullWidth value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="ชื่อผู้ติดต่อ" fullWidth value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <TextField label="เบอร์โทร" fullWidth value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </Box>
            <TextField label="อีเมล" fullWidth value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>หมวดหมู่</InputLabel>
                <Select value={form.category} label="หมวดหมู่" onChange={(e) => setForm({ ...form, category: e.target.value as SponsorCategory })}>
                  {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                label="มูลค่าสปอนเซอร์ (บาท)" type="number" fullWidth value={form.value}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                type="date" label="วันที่เริ่มสัญญา" fullWidth value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="date" label="วันที่สิ้นสุดสัญญา" fullWidth value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} InputLabelProps={{ shrink: true }}
                inputProps={{ min: form.startDate }}
              />
            </Box>

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>รายการที่ต้องส่งมอบ (Deliverables)</Typography>
            {form.deliverableLabels.map((label, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small" fullWidth placeholder={`รายการที่ ${i + 1}`} value={label}
                  onChange={(e) => handleDeliverableChange(i, e.target.value)}
                />
                <IconButton size="small" onClick={() => removeDeliverableRow(i)} disabled={form.deliverableLabels.length === 1}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addDeliverableRow} sx={{ alignSelf: 'flex-start' }}>เพิ่มรายการ</Button>

            <TextField label="หมายเหตุ" fullWidth multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSave} variant="contained" disabled={!form.companyName}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      {/* Fulfillment Tracker Drawer */}
      <Drawer anchor="right" open={!!drawerSponsor} onClose={() => setDrawerSponsorId(null)}>
        <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 3 }}>
          {drawerSponsor && (() => {
            const status = getStatus(drawerSponsor);
            const doneCount = drawerSponsor.deliverables.filter((d) => d.done).length;
            const total = drawerSponsor.deliverables.length;
            const progress = total > 0 ? (doneCount / total) * 100 : 0;
            return (
              <Box ref={proposalRef}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{drawerSponsor.companyName}</Typography>
                    <Typography variant="body2" color="text.secondary">{drawerSponsor.contactName} · {drawerSponsor.contactPhone}</Typography>
                  </Box>
                  <IconButton size="small" onClick={() => setDrawerSponsorId(null)}><CloseIcon fontSize="small" /></IconButton>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Chip label={drawerSponsor.category} size="small" />
                  <Chip label={STATUS_META[status].label} color={STATUS_META[status].color} size="small" sx={{ fontWeight: 700 }} />
                </Box>
                <Typography variant="body2" color="text.secondary">มูลค่าสปอนเซอร์</Typography>
                <Typography variant="h5" sx={{ fontWeight: 900, mb: 2 }}>{formatThb(drawerSponsor.value)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  ระยะสัญญา: {drawerSponsor.startDate} ถึง {drawerSponsor.endDate}
                </Typography>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  ความคืบหน้า ({doneCount}/{total})
                </Typography>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4, mb: 2 }} />

                <Box sx={{ mb: 2 }}>
                  {drawerSponsor.deliverables.map((d) => (
                    <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Checkbox
                        checked={d.done} size="small"
                        onChange={() => toggleDeliverable(drawerSponsor.id, d.id)}
                      />
                      <Typography variant="body2" sx={{ textDecoration: d.done ? 'line-through' : 'none', color: d.done ? 'text.disabled' : 'text.primary' }}>
                        {d.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>ไทม์ไลน์การดำเนินงาน</Typography>
                <Box sx={{ mb: 2 }}>
                  {drawerSponsor.timeline.map((entry, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                        {i < drawerSponsor.timeline.length - 1 && <Box sx={{ width: 2, flexGrow: 1, bgcolor: '#eef0f3', mt: 0.5 }} />}
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">{entry.date}</Typography>
                        <Typography variant="body2">{entry.note}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>

                {drawerSponsor.notes && (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>หมายเหตุ</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{drawerSponsor.notes}</Typography>
                  </>
                )}
              </Box>
            );
          })()}
          <Button
            fullWidth variant="contained" startIcon={<PdfIcon />} onClick={handleExportProposal}
            disabled={exportingProposal} sx={{ mt: 1 }}
          >
            {exportingProposal ? 'กำลังสร้าง PDF...' : 'Export ข้อเสนอสำหรับสปอนเซอร์ (PDF)'}
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
};

export default SponsorshipDashboard;
