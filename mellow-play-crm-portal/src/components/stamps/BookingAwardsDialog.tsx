import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Chip, CircularProgress, Alert, Stack, TextField,
} from '@mui/material';
import axios from 'axios';
import { API_URL } from '../../config';

const API_BASE = `${API_URL}/api/v1/admin`;

const TIER_COLOR: Record<number, string> = { 1: '#f2b418', 2: '#a8b3c1', 3: '#c98a5e' };
const TIER_LABEL: Record<number, string> = { 1: 'อันดับ 1', 2: 'อันดับ 2', 3: 'อันดับ 3' };

interface Props {
  bookingId: number | null;
  childName?: string;
  courseName?: string;
  onClose: () => void;
}

/**
 * What one booking has been awarded, and the buttons to change it.
 *
 * This is the path for competition results (อันดับ 1/2 are never automatic) and
 * for restoring a day that was never recorded — the same reason bookings can be
 * back-dated by hand.
 */
const BookingAwardsDialog: React.FC<Props> = ({ bookingId, childName, courseName, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ stamp: any; badges: any[]; points: number } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const fetch = async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const { data: res } = await axios.get(`${API_BASE}/bookings/${bookingId}/awards`);
      if (res.success) setData({ stamp: res.stamp, badges: res.badges || [], points: res.points || 0 });
    } catch (e: any) {
      setError(e.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (bookingId) { setError(''); setNote(''); fetch(); } }, [bookingId]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await fetch();
    } catch (e: any) {
      setError(e.response?.data?.message || 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const grantStamp = () => run(() => axios.post(`${API_BASE}/bookings/${bookingId}/stamp`, { note }));
  const revokeStamp = () => run(() => axios.delete(`${API_BASE}/bookings/${bookingId}/stamp`));
  const grantBadge = (tier: number) => run(() => axios.post(`${API_BASE}/bookings/${bookingId}/badge`, { tier, note }));
  const revokeBadge = (tier: number) => run(() => axios.delete(`${API_BASE}/bookings/${bookingId}/badge/${tier}`));

  const heldTiers = new Set((data?.badges || []).map((b: any) => b.tier));

  return (
    <Dialog open={!!bookingId} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>
        แสตมป์ & เหรียญรางวัล
        <Typography variant="body2" color="text.secondary">
          {childName}{courseName ? ` · ${courseName}` : ''}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && data && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>แสตมป์การเข้าร่วม</Typography>
              {data.stamp ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                      bgcolor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {data.stamp.design_image
                      ? <Box component="img" src={data.stamp.design_image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Typography sx={{ fontWeight: 900, color: '#7452d6' }}>#{data.stamp.visit_number || 1}</Typography>}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={700}>
                      {data.stamp.design_name || 'แสตมป์ทั่วไป'} · ครั้งที่ {data.stamp.visit_number || 1}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      บันทึกจาก {data.stamp.source === 'checkin' ? 'การเช็คอิน' : data.stamp.source === 'completion' ? 'การจบคลาส' : 'การมอบเอง'}
                      {' · '}แต้มที่ได้ {data.points}
                    </Typography>
                  </Box>
                  <Button color="error" disabled={busy} onClick={revokeStamp}>ยกเลิก</Button>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    ยังไม่มีแสตมป์สำหรับการจองนี้
                  </Typography>
                  <Button variant="contained" disabled={busy} onClick={grantStamp}>มอบแสตมป์</Button>
                </Box>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>เหรียญรางวัล</Typography>
              <Stack direction="row" spacing={1.5}>
                {[1, 2, 3].map(tier => {
                  const held = heldTiers.has(tier);
                  return (
                    <Box key={tier} sx={{ textAlign: 'center' }}>
                      <Box
                        sx={{
                          width: 60, height: 60, borderRadius: '50%', mx: 'auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: held ? TIER_COLOR[tier] : '#e2e8f0',
                          color: held ? '#fff' : '#94a3b8', fontWeight: 900, fontSize: 24,
                        }}
                      >
                        {tier}
                      </Box>
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{TIER_LABEL[tier]}</Typography>
                      <Button
                        size="small" disabled={busy}
                        color={held ? 'error' : 'primary'}
                        onClick={() => held ? revokeBadge(tier) : grantBadge(tier)}
                      >
                        {held ? 'ยกเลิก' : 'มอบ'}
                      </Button>
                    </Box>
                  );
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                อันดับ 3 มักถูกมอบอัตโนมัติเมื่อเข้าร่วม (ตั้งค่าได้ที่กิจกรรม) · อันดับ 1-2 มอบที่นี่หลังจบการแข่ง
              </Typography>
            </Box>

            <TextField
              size="small" fullWidth label="หมายเหตุ (ไม่บังคับ)" value={note}
              onChange={e => setNote(e.target.value)}
              helperText="เช่น รอบชิงชนะเลิศ 3 ก.ย. — บันทึกไว้กับเหรียญ/แสตมป์ที่มอบครั้งนี้"
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookingAwardsDialog;
