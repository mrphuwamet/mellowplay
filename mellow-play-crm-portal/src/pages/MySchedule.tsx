import React, { useEffect, useState } from 'react';
import {
  Box, Chip, CircularProgress, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { CalendarMonth as ScheduleIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

const STATUS_LABEL: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'รอชำระ', color: 'warning' },
  confirmed_paid: { label: 'ยืนยันแล้ว', color: 'info' },
  awaiting_report: { label: 'รอบันทึกรายงาน', color: 'warning' },
  completed: { label: 'เรียนจบแล้ว', color: 'success' },
  cancelled: { label: 'ยกเลิก', color: 'error' },
};

const MySchedule: React.FC = () => {
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.email) { setLoading(false); return; }
    axios.get(`${API_BASE}/my-schedule`, { params: { email: currentUser.email } })
      .then(res => setBookings(res.data.bookings ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ScheduleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>ตารางงานของฉัน</Typography>
          <Typography variant="body2" color="text.secondary">คลาสที่คุณเป็นผู้สอน (Teaching Staff)</Typography>
        </Box>
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>วันที่ / เวลา</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>คลาส</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>เด็ก</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>สาขา</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.disabled', py: 4 }}>
                  ยังไม่มีคลาสที่คุณเป็นผู้สอน
                </TableCell></TableRow>
              )}
              {bookings.map((b) => {
                const status = STATUS_LABEL[b.status] ?? { label: b.status, color: 'default' as const };
                return (
                  <TableRow key={b.id} hover>
                    <TableCell>{b.slot_date ?? b.scheduled_at} {b.slot_start_time ?? ''}</TableCell>
                    <TableCell>{b.course_name}</TableCell>
                    <TableCell>{b.child_name}</TableCell>
                    <TableCell>{b.branch_name}</TableCell>
                    <TableCell><Chip label={status.label} color={status.color} size="small" sx={{ fontWeight: 700 }} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default MySchedule;
