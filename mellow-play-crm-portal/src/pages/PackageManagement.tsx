import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Inventory2 as PackageIcon,
  WorkspacePremium as PremiumIcon,
  Percent as PercentIcon,
  AttachMoney as FixedIcon,
} from '@mui/icons-material';
import { CircularProgress } from '@mui/material';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackageCoupon {
  typeId: string;
  quantity: number;
}

interface PackageItem {
  id: number;
  name: string;
  description: string;
  price: number;
  coupons: PackageCoupon[];
  premiumDays: number;
  sellerCommission: { type: 'percent' | 'fixed'; value: string };
  active: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// COUPON_TYPES will be fetched dynamically

const EMPTY_FORM: Omit<PackageItem, 'id'> = {
  name: '',
  description: '',
  price: 0,
  coupons: [],
  premiumDays: 0,
  sellerCommission: { type: 'percent', value: '' },
  active: true,
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PACKAGES: PackageItem[] = [
  {
    id: 1,
    name: 'Starter Pack',
    description: 'แพ็คเกจเริ่มต้นสำหรับสมาชิกใหม่ คุ้มค่า เริ่มเล่นได้ทันที',
    price: 1200,
    coupons: [{ typeId: 'blue', quantity: 5 }, { typeId: 'yellow', quantity: 2 }, { typeId: 'red', quantity: 0 }],
    premiumDays: 0,
    sellerCommission: { type: 'percent', value: '5' },
    active: true,
  },
  {
    id: 2,
    name: 'Premium 30 วัน',
    description: 'สมาชิก Premium 30 วัน พร้อมคูปองมูลค่าสูง',
    price: 2500,
    coupons: [{ typeId: 'blue', quantity: 8 }, { typeId: 'yellow', quantity: 0 }, { typeId: 'red', quantity: 3 }],
    premiumDays: 30,
    sellerCommission: { type: 'fixed', value: '150' },
    active: true,
  },
  {
    id: 3,
    name: 'Family Bundle',
    description: 'แพ็คเกจสำหรับครอบครัว ครอบคลุมทุกคลาส พร้อม Premium 90 วัน',
    price: 4500,
    coupons: [{ typeId: 'blue', quantity: 15 }, { typeId: 'yellow', quantity: 5 }, { typeId: 'red', quantity: 5 }],
    premiumDays: 90,
    sellerCommission: { type: 'percent', value: '8' },
    active: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCommission = (c: PackageItem['sellerCommission']) => {
  if (!c.value) return '—';
  return c.type === 'percent' ? `${c.value}%` : `฿${c.value}`;
};

const totalCoupons = (coupons: PackageCoupon[]) =>
  coupons.reduce((s, c) => s + (c.quantity || 0), 0);

// ─── Component ────────────────────────────────────────────────────────────────

const PackageManagement: React.FC = () => {
  const [packages, setPackages]       = useState<PackageItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editId, setEditId]           = useState<number | null>(null);
  const [form, setForm]               = useState<Omit<PackageItem, 'id'>>(EMPTY_FORM);
  const [formError, setFormError]     = useState('');
  const [deleteId, setDeleteId]       = useState<number | null>(null);
  const [successMsg, setSuccessMsg]   = useState('');
  const [couponTypes, setCouponTypes] = useState<any[]>([]);

  const fetchCouponTypes = async () => {
    try {
      const res = await axios.get(`${API_BASE}/coupon-types`);
      if (res.data.success) {
        setCouponTypes(res.data.couponTypes.map((c: any) => ({
          id: String(c.id),
          label: c.name,
          color: c.color,
          icon_url: c.icon_url,
          bg: `${c.color}20` // simple hex opacity
        })));
      }
    } catch (e) { console.error('Failed to fetch coupon types', e); }
  };

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/packages`);
      if (res.data.success) {
        setPackages(res.data.packages.map((p: any) => ({
          id: p.id, name: p.name, description: p.description ?? '',
          price: p.price, coupons: p.coupons ?? [],
          premiumDays: p.premium_days ?? 0,
          sellerCommission: { type: p.seller_commission_type ?? 'percent', value: String(p.seller_commission_value ?? '') },
          active: Boolean(p.active),
        })));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPackages(); fetchCouponTypes(); }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // ── Open create / edit ───────────────────────────────────────────────────
  const openCreate = () => {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      coupons: couponTypes.map(t => ({ typeId: t.id, quantity: 0 }))
    });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (pkg: PackageItem) => {
    setEditId(pkg.id);
    const coupons = couponTypes.map(t => {
      const matched = pkg.coupons.find(c => String(c.typeId) === t.id);
      return { typeId: t.id, quantity: matched ? matched.quantity : 0 };
    });
    setForm({ ...pkg, coupons });
    setFormError('');
    setDialogOpen(true);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('กรุณาระบุชื่อแพ็คเกจ'); return; }
    if (!form.price || form.price <= 0) { setFormError('กรุณาระบุราคาที่ถูกต้อง'); return; }
    if (totalCoupons(form.coupons) === 0) { setFormError('กรุณาระบุจำนวนคูปองอย่างน้อย 1 ประเภท'); return; }
    try {
      if (editId !== null) {
        await axios.put(`${API_BASE}/packages/${editId}`, form);
        showSuccess('แก้ไขแพ็คเกจเรียบร้อย');
      } else {
        await axios.post(`${API_BASE}/packages`, form);
        showSuccess('สร้างแพ็คเกจใหม่เรียบร้อย');
      }
      await fetchPackages();
      setDialogOpen(false);
    } catch (e: any) { setFormError(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/packages/${id}`);
      setDeleteId(null);
      showSuccess('ลบแพ็คเกจเรียบร้อย');
      await fetchPackages();
    } catch { showSuccess('เกิดข้อผิดพลาดในการลบ'); }
  };

  const toggleActive = async (id: number) => {
    const pkg = packages.find(p => p.id === id);
    if (!pkg) return;
    try {
      await axios.put(`${API_BASE}/packages/${id}`, { ...pkg, active: !pkg.active });
      await fetchPackages();
    } catch (e) { console.error(e); }
  };

  // ── Coupon quantity helpers ───────────────────────────────────────────────
  const setCouponQty = (typeId: string, qty: number) => {
    setForm((f) => ({
      ...f,
      coupons: f.coupons.map((c) => c.typeId === typeId ? { ...c, quantity: Math.max(0, qty) } : c),
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PackageIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จัดการแพ็คเกจ</Typography>
            <Typography variant="body2" color="text.secondary">
              กำหนดแพ็คเกจสำหรับขาย — คูปอง, สมาชิก Premium, ค่าคอมมิชชัน
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 3, fontWeight: 700 }}>
          สร้างแพ็คเกจ
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Package cards */}
      <Grid container spacing={2.5}>
        {packages.map((pkg) => (
          <Grid item xs={12} sm={6} md={4} key={pkg.id}>
            <Paper
              sx={{
                borderRadius: 3, p: 2.5, height: '100%', display: 'flex', flexDirection: 'column',
                border: '2px solid', borderColor: pkg.active ? 'primary.light' : 'divider',
                opacity: pkg.active ? 1 : 0.6,
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Active ribbon */}
              {!pkg.active && (
                <Chip label="ปิดใช้งาน" size="small" color="default"
                  sx={{ position: 'absolute', top: 12, right: 12, fontWeight: 700, fontSize: '0.65rem' }} />
              )}

              {/* Name + price */}
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={800} sx={{ pr: pkg.active ? 0 : 8 }}>
                  {pkg.name}
                </Typography>
                <Typography variant="h5" fontWeight={900} color="primary.main">
                  ฿{pkg.price.toLocaleString()}
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 36, lineHeight: 1.5 }}>
                {pkg.description || '—'}
              </Typography>

              {/* Coupons */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                {couponTypes.map(ct => {
                  const q = pkg.coupons?.find(c => String(c.typeId) === String(ct.id))?.quantity || 0;
                  if (q === 0) return null;
                  return (
                    <Chip
                      key={ct.id}
                      size="small"
                      icon={ct.icon_url ? <img src={ct.icon_url} alt="icon" style={{width: 14, height: 14, objectFit: 'contain', marginLeft: 4}} /> : undefined}
                      label={`${ct.label} ${q} ใบ`}
                      sx={{ bgcolor: ct.bg, color: ct.color, fontWeight: 700, fontSize: '0.75rem' }}
                    />
                  );
                })}
                {totalCoupons(pkg.coupons) === 0 && (
                  <Typography variant="caption" color="text.disabled">ไม่มีคูปอง</Typography>
                )}
              </Box>

              {/* Premium badge */}
              {pkg.premiumDays > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                  <PremiumIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                  <Typography variant="caption" fontWeight={700} color="#b45309">
                    Premium Member {pkg.premiumDays} วัน
                  </Typography>
                </Box>
              )}

              <Box sx={{ mt: 'auto', pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">
                    ค่าคอมฯ ผู้ขาย: <strong style={{ color: '#0f172a' }}>{formatCommission(pkg.sellerCommission)}</strong>
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title={pkg.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}>
                      <Switch size="small" checked={pkg.active} onChange={() => toggleActive(pkg.id)} color="primary" />
                    </Tooltip>
                    <Tooltip title="แก้ไข">
                      <IconButton size="small" onClick={() => openEdit(pkg)} sx={{ color: 'primary.main' }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="ลบ">
                      <IconButton size="small" onClick={() => setDeleteId(pkg.id)} sx={{ color: 'error.main' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}

        {packages.length === 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center', border: '2px dashed', borderColor: 'divider' }}>
              <PackageIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" fontWeight={600}>ยังไม่มีแพ็คเกจ — กด "สร้างแพ็คเกจ" เพื่อเริ่มต้น</Typography>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
          {editId !== null ? 'แก้ไขแพ็คเกจ' : 'สร้างแพ็คเกจใหม่'}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

          {/* Basic info */}
          <TextField
            label="ชื่อแพ็คเกจ" fullWidth value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="คำอธิบาย (ถ้ามี)" fullWidth multiline rows={2} value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            sx={{ mb: 2 }}
          />

          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={6}>
              <TextField
                label="ราคา" type="number" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                inputProps={{ min: 0 }}
                value={form.price || ''}
                onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Premium Member (วัน)" type="number" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start"><PremiumIcon sx={{ fontSize: 18, color: '#f59e0b' }} /></InputAdornment> }}
                inputProps={{ min: 0 }}
                value={form.premiumDays || ''}
                onChange={(e) => setForm((f) => ({ ...f, premiumDays: parseInt(e.target.value) || 0 }))}
                helperText="0 = ไม่มีสิทธิ์ Premium"
              />
            </Grid>
          </Grid>

          {/* Coupons */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            คูปองที่ลูกค้าจะได้รับ
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {couponTypes.map((ct) => {
              const coupon = form.coupons.find((c) => c.typeId === ct.id) ?? { typeId: ct.id, quantity: 0 };
              return (
                <Box key={ct.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: ct.color, flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={600}>{ct.label}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                      size="small"
                      onClick={() => setCouponQty(ct.id, coupon.quantity - 1)}
                      disabled={coupon.quantity <= 0}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    >
                      <Typography fontWeight={800} sx={{ lineHeight: 1, px: 0.5 }}>−</Typography>
                    </IconButton>
                    <TextField
                      size="small" type="number"
                      value={coupon.quantity === 0 ? '' : coupon.quantity}
                      onChange={(e) => setCouponQty(ct.id, parseInt(e.target.value) || 0)}
                      inputProps={{ min: 0, style: { textAlign: 'center', width: 48 } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setCouponQty(ct.id, coupon.quantity + 1)}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    >
                      <Typography fontWeight={800} sx={{ lineHeight: 1, px: 0.5 }}>+</Typography>
                    </IconButton>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 16 }}>ใบ</Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Seller commission */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            ค่าคอมมิชชันพนักงานขาย
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <ToggleButtonGroup
              exclusive size="small"
              value={form.sellerCommission.type}
              onChange={(_, v) => v && setForm((f) => ({ ...f, sellerCommission: { ...f.sellerCommission, type: v } }))}
              sx={{ height: 40 }}
            >
              <ToggleButton value="percent" sx={{ fontWeight: 700, px: 1.5 }}>
                <PercentIcon sx={{ fontSize: 16, mr: 0.5 }} /> %
              </ToggleButton>
              <ToggleButton value="fixed" sx={{ fontWeight: 700, px: 1.5 }}>
                <FixedIcon sx={{ fontSize: 16, mr: 0.5 }} /> ฿
              </ToggleButton>
            </ToggleButtonGroup>
            <TextField
              size="small" type="number" fullWidth
              label={form.sellerCommission.type === 'percent' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (฿)'}
              inputProps={{ min: 0, step: form.sellerCommission.type === 'percent' ? 0.5 : 1 }}
              value={form.sellerCommission.value}
              onChange={(e) => setForm((f) => ({ ...f, sellerCommission: { ...f.sellerCommission, value: e.target.value } }))}
            />
          </Box>

          {/* Active */}
          <Box sx={{ mt: 2.5 }}>
            <FormControlLabel
              control={
                <Switch checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} color="primary" />
              }
              label={<Typography fontWeight={700}>เปิดใช้งาน (แสดงในระบบ POS)</Typography>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSave} sx={{ borderRadius: 3, fontWeight: 700 }}>
            {editId !== null ? 'บันทึกการแก้ไข' : 'สร้างแพ็คเกจ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ยืนยันการลบแพ็คเกจ</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            แพ็คเกจ <strong>"{packages.find((p) => p.id === deleteId)?.name}"</strong> จะถูกลบออกจากระบบ ไม่สามารถกู้คืนได้
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => handleDelete(deleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>
            ลบแพ็คเกจ
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PackageManagement;
