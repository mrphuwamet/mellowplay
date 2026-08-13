import { API_URL } from '../config';
import TimeField24 from '../components/TimeField24';
import React, { useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, InputLabel, MenuItem,
  Paper, Select, TextField, Typography,
} from '@mui/material';
import {
  QueuePlayNext as QueueIcon, Add as AddIcon, PersonPin as CustomerIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

const STATUS_CONFIG = {
  waiting:    { label: 'รอ',               color: 'warning'  as const, bg: '#fffbeb' },
  in_service: { label: 'กำลังให้บริการ',   color: 'info'     as const, bg: '#eff6ff' },
  completed:  { label: 'เสร็จแล้ว',        color: 'success'  as const, bg: '#f0fdf4' },
  cancelled:  { label: 'ยกเลิก',           color: 'default'  as const, bg: '#f9fafb' },
};

const ServiceQueueBoard: React.FC = () => {
  const [calendars, setCalendars] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', serviceId: '', slotTime: '', staffId: '', notes: '' });

  const show = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/calendars`).then(r => setCalendars((r.data.calendars ?? []).filter((c: any) => c.type === 'service'))),
      axios.get(`${API_BASE}/crm-users`).then(r => setStaffList(r.data.users ?? [])),
      axios.get(`${API_BASE}/services`).then(r => setServices(r.data.services ?? [])),
    ]);
  }, []);

  useEffect(() => {
    if (selectedCalendarId) fetchQueue();
  }, [selectedCalendarId, selectedDate]);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/queue?calendarId=${selectedCalendarId}&date=${selectedDate}`);
      setItems(res.data.items ?? []);
    } finally { setLoading(false); }
  };

  const handleAddQueue = async () => {
    if (!form.customerName.trim()) return;
    await axios.post(`${API_BASE}/queue`, {
      calendarId: parseInt(selectedCalendarId),
      slotDate: selectedDate,
      slotTime: form.slotTime || null,
      serviceId: form.serviceId ? parseInt(form.serviceId) : null,
      serviceName: services.find(s => s.id === parseInt(form.serviceId))?.name ?? null,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone || null,
      staffId: form.staffId ? parseInt(form.staffId) : null,
      notes: form.notes || null,
    });
    setAddOpen(false);
    setForm({ customerName: '', customerPhone: '', serviceId: '', slotTime: '', staffId: '', notes: '' });
    await fetchQueue();
    show('เพิ่มคิวสำเร็จ');
  };

  const handleStatus = async (id: number, status: string) => {
    await axios.put(`${API_BASE}/queue/${id}/status`, { status });
    await fetchQueue();
    show('อัปเดตสถานะสำเร็จ');
  };

  const handleDelete = async (id: number) => {
    await axios.delete(`${API_BASE}/queue/${id}`);
    await fetchQueue();
    show('ลบคิวสำเร็จ');
  };

  const grouped: Record<string, any[]> = { waiting: [], in_service: [], completed: [], cancelled: [] };
  items.forEach(item => { grouped[item.status]?.push(item); });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <QueueIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>จองคิวบริการ</Typography>
            <Typography variant="body2" color="text.secondary">จัดการคิวบริการหน้าร้าน</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} disabled={!selectedCalendarId} sx={{ borderRadius: 3, fontWeight: 700 }}>
          เพิ่มคิว
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* Filter bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>ปฏิทินบริการ</InputLabel>
          <Select value={selectedCalendarId} label="ปฏิทินบริการ" onChange={(e) => setSelectedCalendarId(e.target.value)}>
            {calendars.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField type="date" label="วันที่" InputLabelProps={{ shrink: true }} value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)} />
        <Typography variant="body2" color="text.secondary">
          รวม {items.length} คิว • รอ {grouped.waiting.length} • กำลังให้บริการ {grouped.in_service.length}
        </Typography>
      </Paper>

      {!selectedCalendarId && (
        <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">เลือกปฏิทินบริการเพื่อดูคิว</Typography>
        </Paper>
      )}

      {selectedCalendarId && loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}

      {selectedCalendarId && !loading && (
        <Grid container spacing={2}>
          {(Object.keys(STATUS_CONFIG) as (keyof typeof STATUS_CONFIG)[]).map((status) => (
            <Grid item xs={12} sm={6} md={3} key={status}>
              <Paper sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
                <Box sx={{ p: 1.5, bgcolor: STATUS_CONFIG[status].bg, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={STATUS_CONFIG[status].label} color={STATUS_CONFIG[status].color} size="small" sx={{ fontWeight: 800 }} />
                  <Typography variant="caption" fontWeight={700} color="text.secondary">{grouped[status].length} คิว</Typography>
                </Box>
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {grouped[status].map((item) => (
                    <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.75rem', fontWeight: 800 }}>
                            {item.queue_number}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>{item.customer_name}</Typography>
                            {item.service_name_ref && <Typography variant="caption" color="text.secondary">{item.service_name_ref}</Typography>}
                            {item.slot_time && <Typography variant="caption" color="primary.main" sx={{ display: 'block' }}>{item.slot_time}</Typography>}
                          </Box>
                        </Box>
                      </Box>
                      {item.staff_name && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <CustomerIcon sx={{ fontSize: 12 }} />{item.staff_name}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                        {status === 'waiting' && (
                          <>
                            <Button size="small" variant="contained" color="info" onClick={() => handleStatus(item.id, 'in_service')} sx={{ fontSize: '10px', py: 0.3, borderRadius: 2 }}>เริ่มให้บริการ</Button>
                            <Button size="small" variant="outlined" color="error" onClick={() => handleStatus(item.id, 'cancelled')} sx={{ fontSize: '10px', py: 0.3, borderRadius: 2 }}>ยกเลิก</Button>
                          </>
                        )}
                        {status === 'in_service' && (
                          <Button size="small" variant="contained" color="success" onClick={() => handleStatus(item.id, 'completed')} sx={{ fontSize: '10px', py: 0.3, borderRadius: 2 }}>เสร็จสิ้น</Button>
                        )}
                        {(status === 'completed' || status === 'cancelled') && (
                          <Button size="small" variant="text" color="error" onClick={() => handleDelete(item.id)} sx={{ fontSize: '10px', py: 0.3, borderRadius: 2 }}>ลบ</Button>
                        )}
                      </Box>
                    </Paper>
                  ))}
                  {grouped[status].length === 0 && (
                    <Typography variant="caption" color="text.disabled" sx={{ p: 1, textAlign: 'center', display: 'block' }}>ไม่มีคิว</Typography>
                  )}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add Queue Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>เพิ่มคิวบริการ</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="ชื่อลูกค้า *" fullWidth value={form.customerName} onChange={(e) => setForm(f => ({ ...f, customerName: e.target.value }))} />
          <TextField label="เบอร์โทร" fullWidth value={form.customerPhone} onChange={(e) => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
          <FormControl fullWidth>
            <InputLabel>บริการ</InputLabel>
            <Select value={form.serviceId} label="บริการ" onChange={(e) => setForm(f => ({ ...f, serviceId: e.target.value }))}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {services.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TimeField24 label="เวลานัด (ถ้ามี)" fullWidth value={form.slotTime} onChange={(v) => setForm(f => ({ ...f, slotTime: v }))} />
          <FormControl fullWidth>
            <InputLabel>พนักงานที่รับผิดชอบ</InputLabel>
            <Select value={form.staffId} label="พนักงานที่รับผิดชอบ" onChange={(e) => setForm(f => ({ ...f, staffId: e.target.value }))}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {staffList.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.full_name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="หมายเหตุ" fullWidth multiline rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAddQueue} disabled={!form.customerName.trim()} sx={{ borderRadius: 3, fontWeight: 700 }}>เพิ่มคิว</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ServiceQueueBoard;
