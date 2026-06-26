import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputLabel, MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Inventory2 as MaterialIcon } from '@mui/icons-material';
import axios from 'axios';

interface Props { courses: any[]; apiBase: string; }

const CourseMaterialsTab: React.FC<Props> = ({ courses, apiBase }) => {
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [materials, setMaterials] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', quantity: '', unit: '', note: '' });

  const show = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  useEffect(() => {
    axios.get(`${apiBase}/products`).then(r => setProducts(r.data.products ?? []));
  }, []);

  useEffect(() => {
    if (selectedCourseId) fetchMaterials();
  }, [selectedCourseId]);

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${apiBase}/courses/${selectedCourseId}/materials`);
      setMaterials(res.data.materials ?? []);
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.productId || !form.quantity) return;
    await axios.post(`${apiBase}/courses/${selectedCourseId}/materials`, {
      productId: parseInt(form.productId),
      quantity: parseFloat(form.quantity),
      unit: form.unit || null,
      note: form.note || null,
    });
    setAddOpen(false);
    setForm({ productId: '', quantity: '', unit: '', note: '' });
    await fetchMaterials();
    show('เพิ่มวัสดุสำเร็จ');
  };

  const handleDelete = async (id: number) => {
    await axios.delete(`${apiBase}/course-materials/${id}`);
    await fetchMaterials();
    show('ลบวัสดุสำเร็จ');
  };

  const selectedCourse = courses.find(c => String(c.id) === selectedCourseId);

  return (
    <Box>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>วัสดุ/อุปกรณ์ที่ใช้ในแต่ละคลาส</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        กำหนดวัสดุที่ใช้ต่อ session — ระบบจะ <strong>จองสต็อก</strong> อัตโนมัติเมื่อมีการจองคลาส และ <strong>ตัดสต็อกจริง</strong> เมื่อเรียนเสร็จสิ้น
      </Typography>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      <Grid container spacing={3}>
        {/* Left: Course list */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography fontWeight={700}>เลือกคลาส</Typography>
            </Box>
            {courses.map(course => (
              <Box key={course.id} onClick={() => setSelectedCourseId(String(course.id))}
                sx={{ p: 2, cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider',
                  bgcolor: selectedCourseId === String(course.id) ? 'primary.50' : 'transparent',
                  '&:hover': { bgcolor: 'grey.50' } }}>
                <Typography variant="body2" fontWeight={700}>{course.name}</Typography>
                <Typography variant="caption" color="text.secondary">{course.category_name ?? ''}</Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Right: Materials */}
        <Grid item xs={12} md={8}>
          {!selectedCourseId ? (
            <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }}>
              <MaterialIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">เลือกคลาสทางซ้ายเพื่อจัดการวัสดุ</Typography>
            </Paper>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography fontWeight={700}>{selectedCourse?.name} — วัสดุที่ใช้</Typography>
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  เพิ่มวัสดุ
                </Button>
              </Box>

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 700 }}>สินค้า/วัสดุ</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">จำนวน/session</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>หน่วย</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>สต็อกคงเหลือ</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {materials.map(m => (
                        <TableRow key={m.id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{m.product_name}</TableCell>
                          <TableCell align="center">{m.quantity}</TableCell>
                          <TableCell>{m.unit || m.product_unit || '—'}</TableCell>
                          <TableCell>
                            <Chip label={m.current_stock} size="small"
                              color={m.current_stock > m.quantity * 5 ? 'success' : m.current_stock > 0 ? 'warning' : 'error'}
                              sx={{ fontWeight: 700 }} />
                          </TableCell>
                          <TableCell><Typography variant="caption" color="text.secondary">{m.note || '—'}</Typography></TableCell>
                          <TableCell>
                            <IconButton size="small" color="error" onClick={() => handleDelete(m.id)}><DeleteIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {materials.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>ยังไม่มีวัสดุ — กด "เพิ่มวัสดุ"</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Add Material Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>เพิ่มวัสดุ</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>สินค้า/วัสดุ</InputLabel>
            <Select value={form.productId} label="สินค้า/วัสดุ" onChange={(e) => setForm(f => ({ ...f, productId: e.target.value }))}>
              {products.map(p => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name} <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>(สต็อก: {p.current_stock})</Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="จำนวน/session *" type="number" fullWidth inputProps={{ min: 0.01, step: 0.01 }}
              value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} />
            <TextField label="หน่วย" fullWidth placeholder="เช่น ชิ้น, แผ่น"
              value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} />
          </Box>
          <TextField label="หมายเหตุ" fullWidth value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.productId || !form.quantity} sx={{ borderRadius: 3, fontWeight: 700 }}>เพิ่ม</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CourseMaterialsTab;
