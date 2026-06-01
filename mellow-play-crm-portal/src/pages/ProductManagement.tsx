import React, { useState, useMemo, useEffect } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem,
  Paper, Select, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Inventory as ProductIcon, QrCode as SkuIcon,
} from '@mui/icons-material';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  sku: string;
  name: string;
  categoryId: number;
  description: string;
  sellPrice: number;
  costPrice: number;
  unit: string;
  minStock: number;
  active: boolean;
}

interface ProductCategory {
  id: number;
  name: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8787/api/v1/admin';

const UNITS = ['ชิ้น', 'กล่อง', 'ขวด', 'แพ็ค', 'หลอด', 'ถุง', 'อัน', 'ชุด'];
const CAT_COLORS = ['#7c3aed','#0284c7','#059669','#d97706','#dc2626','#db2777'];

const genSku = (categoryId: number, products: Product[]) => {
  const cat = categoryId === 1 ? 'SH' : categoryId === 2 ? 'SC' : categoryId === 3 ? 'SK' : 'PR';
  const num = products.filter(p => p.sku.startsWith(cat)).length + 1;
  return `${cat}-${String(num).padStart(3, '0')}`;
};

const EMPTY_FORM: Omit<Product, 'id'> = {
  sku: '', name: '', categoryId: 1, description: '',
  sellPrice: 0, costPrice: 0, unit: 'ชิ้น', minStock: 5, active: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

const ProductManagement: React.FC = () => {
  const [products, setProducts]     = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterCat, setFilterCat]   = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId]     = useState<number | null>(null);
  const [form, setForm]         = useState<Omit<Product, 'id'>>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catEditId, setCatEditId]         = useState<number | null>(null);
  const [catForm, setCatForm]             = useState({ name: '', color: '#7c3aed' });
  const [catDeleteId, setCatDeleteId]     = useState<number | null>(null);

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/products`);
      const mapped: Product[] = (res.data.products || []).map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryId: p.category_id,
        description: p.description ?? '',
        sellPrice: p.sell_price,
        costPrice: p.cost_price,
        unit: p.unit,
        minStock: p.min_stock,
        active: Boolean(p.active),
      }));
      setProducts(mapped);
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API_BASE}/product-categories`);
      setCategories(res.data.categories || res.data.productCategories || []);
    } catch (err) {
      console.error('Failed to fetch product categories', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchProducts(), fetchCategories()]);
      setLoading(false);
    };
    init();
  }, []);

  const filtered = useMemo(() => products.filter(p => {
    const matchCat    = !filterCat    || p.categoryId === parseInt(filterCat);
    const matchSearch = !filterSearch || p.name.toLowerCase().includes(filterSearch.toLowerCase()) || p.sku.toLowerCase().includes(filterSearch.toLowerCase());
    return matchCat && matchSearch;
  }), [products, filterCat, filterSearch]);

  const openCreate = () => {
    setEditId(null);
    const catId = categories[0]?.id || 1;
    setForm({ ...EMPTY_FORM, categoryId: catId, sku: genSku(catId, products) });
    setFormOpen(true);
  };
  const openEdit = (p: Product) => { setEditId(p.id); const { id, ...rest } = p; setForm(rest); setFormOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.sku.trim()) return;
    try {
      const payload = {
        sku: form.sku,
        name: form.name,
        category_id: form.categoryId,
        description: form.description,
        sell_price: form.sellPrice,
        cost_price: form.costPrice,
        unit: form.unit,
        min_stock: form.minStock,
        active: form.active ? 1 : 0,
      };
      if (editId !== null) {
        await axios.put(`${API_BASE}/products/${editId}`, payload);
        showSuccess('แก้ไขสินค้าเรียบร้อย');
      } else {
        await axios.post(`${API_BASE}/products`, payload);
        showSuccess('เพิ่มสินค้าใหม่เรียบร้อย');
      }
      setFormOpen(false);
      await fetchProducts();
    } catch (err) {
      console.error('Failed to save product', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/products/${id}`);
      setDeleteId(null);
      showSuccess('ลบสินค้าเรียบร้อย');
      await fetchProducts();
    } catch (err) {
      console.error('Failed to delete product', err);
    }
  };

  const toggleActive = async (id: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    try {
      await axios.put(`${API_BASE}/products/${id}`, {
        sku: prod.sku,
        name: prod.name,
        category_id: prod.categoryId,
        description: prod.description,
        sell_price: prod.sellPrice,
        cost_price: prod.costPrice,
        unit: prod.unit,
        min_stock: prod.minStock,
        active: prod.active ? 0 : 1,
      });
      await fetchProducts();
    } catch (err) {
      console.error('Failed to toggle product active', err);
    }
  };

  const openCreateCat = () => { setCatEditId(null); setCatForm({ name: '', color: CAT_COLORS[categories.length % CAT_COLORS.length] }); setCatDialogOpen(true); };
  const openEditCat   = (c: ProductCategory) => { setCatEditId(c.id); setCatForm({ name: c.name, color: c.color }); setCatDialogOpen(true); };

  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    try {
      if (catEditId !== null) {
        await axios.put(`${API_BASE}/product-categories/${catEditId}`, catForm);
      } else {
        await axios.post(`${API_BASE}/product-categories`, catForm);
      }
      setCatDialogOpen(false);
      await fetchCategories();
    } catch (err) {
      console.error('Failed to save product category', err);
    }
  };

  const deleteCat = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/product-categories/${id}`);
      setCatDeleteId(null);
      await fetchCategories();
    } catch (err) {
      console.error('Failed to delete product category', err);
    }
  };

  const catOf = (id: number) => categories.find(c => c.id === id);
  const margin = (p: Pick<Product, 'sellPrice' | 'costPrice'>) => p.sellPrice > 0 ? Math.round(((p.sellPrice - p.costPrice) / p.sellPrice) * 100) : 0;

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ProductIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จัดการรายการสินค้า</Typography>
            <Typography variant="body2" color="text.secondary">สินค้าในร้าน พร้อมราคาทุน-ขาย และหน่วยนับ</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" onClick={() => openCreateCat()} sx={{ borderRadius: 3, fontWeight: 700 }}>
            จัดการหมวดหมู่
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 3, fontWeight: 700 }}>
            เพิ่มสินค้า
          </Button>
        </Box>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="ค้นหาชื่อหรือ SKU..." value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)} sx={{ minWidth: 220 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SkuIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>หมวดหมู่</InputLabel>
          <Select value={filterCat} label="หมวดหมู่" onChange={e => setFilterCat(e.target.value as string)}>
            <MenuItem value="">ทั้งหมด</MenuItem>
            {categories.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ชื่อสินค้า</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>หมวดหมู่</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">ราคาทุน</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">ราคาขาย</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Margin</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>หน่วย</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">สต๊อกขั้นต่ำ</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">สถานะ</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(p => {
                const cat = catOf(p.categoryId);
                const mg  = margin(p);
                return (
                  <TableRow key={p.id} hover sx={{ opacity: p.active ? 1 : 0.55 }}>
                    <TableCell>
                      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontFamily: 'monospace' }}>{p.sku}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{p.name}</Typography>
                      {p.description && <Typography variant="caption" color="text.secondary">{p.description}</Typography>}
                    </TableCell>
                    <TableCell>
                      {cat && <Chip size="small" label={cat.name} sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: cat.color + '18', color: cat.color }} />}
                    </TableCell>
                    <TableCell align="right"><Typography variant="body2">฿{p.costPrice.toLocaleString()}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" fontWeight={800}>฿{p.sellPrice.toLocaleString()}</Typography></TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={`${mg}%`}
                        sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: mg >= 30 ? '#dcfce7' : mg >= 15 ? '#fef9c3' : '#fee2e2', color: mg >= 30 ? '#16a34a' : mg >= 15 ? '#b45309' : '#dc2626' }} />
                    </TableCell>
                    <TableCell><Typography variant="body2">{p.unit}</Typography></TableCell>
                    <TableCell align="center"><Typography variant="body2">{p.minStock} {p.unit}</Typography></TableCell>
                    <TableCell align="center"><Switch size="small" checked={p.active} onChange={() => toggleActive(p.id)} /></TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="แก้ไข"><IconButton size="small" onClick={() => openEdit(p)} sx={{ color: 'primary.main' }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="ลบ"><IconButton size="small" onClick={() => setDeleteId(p.id)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่มีสินค้าในหมวดนี้</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Product Form Dialog */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>{editId !== null ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <TextField label="รหัสสินค้า (SKU)" fullWidth value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </Grid>
            <Grid item xs={8}>
              <TextField label="ชื่อสินค้า" fullWidth value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>หมวดหมู่</InputLabel>
                <Select value={form.categoryId} label="หมวดหมู่"
                  onChange={e => setForm(f => ({ ...f, categoryId: Number(e.target.value), sku: editId ? f.sku : genSku(Number(e.target.value), products) }))}>
                  {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={3}>
              <FormControl fullWidth>
                <InputLabel>หน่วย</InputLabel>
                <Select value={form.unit} label="หน่วย" onChange={e => setForm(f => ({ ...f, unit: e.target.value as string }))}>
                  {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={3}>
              <TextField label="สต๊อกขั้นต่ำ" type="number" fullWidth
                value={form.minStock || ''} onChange={e => setForm(f => ({ ...f, minStock: parseInt(e.target.value) || 0 }))}
                inputProps={{ min: 0 }} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="คำอธิบาย" fullWidth multiline rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="ราคาทุน (฿)" type="number" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                value={form.costPrice || ''} onChange={e => setForm(f => ({ ...f, costPrice: parseFloat(e.target.value) || 0 }))}
                inputProps={{ min: 0 }} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="ราคาขาย (฿)" type="number" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }}
                value={form.sellPrice || ''} onChange={e => setForm(f => ({ ...f, sellPrice: parseFloat(e.target.value) || 0 }))}
                inputProps={{ min: 0 }} />
            </Grid>
            {form.sellPrice > 0 && form.costPrice > 0 && (
              <Grid item xs={12}>
                <Alert severity={margin(form) >= 30 ? 'success' : margin(form) >= 15 ? 'warning' : 'error'}>
                  Margin: {margin(form)}% (กำไรต่อชิ้น ฿{(form.sellPrice - form.costPrice).toLocaleString()})
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim() || !form.sku.trim()} sx={{ borderRadius: 3, fontWeight: 700 }}>
            {editId !== null ? 'บันทึก' : 'เพิ่มสินค้า'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Category Form */}
      <Dialog open={catDialogOpen} onClose={() => setCatDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{catEditId !== null ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="ชื่อหมวดหมู่" fullWidth value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {CAT_COLORS.map(color => (
              <Box key={color} onClick={() => setCatForm(f => ({ ...f, color }))}
                sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: color, cursor: 'pointer', border: catForm.color === color ? '3px solid #333' : '3px solid transparent' }} />
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCatDialogOpen(false)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveCat} disabled={!catForm.name.trim()} sx={{ borderRadius: 3, fontWeight: 700 }}>บันทึก</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบสินค้า</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>สินค้า <strong>"{products.find(p => p.id === deleteId)?.name}"</strong> จะถูกลบออกถาวร</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => handleDelete(deleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบ</Button>
        </DialogActions>
      </Dialog>

      {/* Category Delete */}
      <Dialog open={catDeleteId !== null} onClose={() => setCatDeleteId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>ลบหมวดหมู่</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography>หมวดหมู่ <strong>"{categories.find(c => c.id === catDeleteId)?.name}"</strong> จะถูกลบออกถาวร</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCatDeleteId(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={() => deleteCat(catDeleteId!)} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductManagement;
