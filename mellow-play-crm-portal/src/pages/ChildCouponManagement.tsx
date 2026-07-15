import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField, CircularProgress
} from '@mui/material';
import { LocalActivity as TicketIcon, Save as SaveIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

interface ChildCouponManagementProps {
  childId: number;
  childName: string;
  open: boolean;
  onClose: () => void;
}

export default function ChildCouponManagement({ childId, childName, open, onClose }: ChildCouponManagementProps) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Record<number, number>>({});

  useEffect(() => {
    if (open && childId) {
      fetchCoupons();
    }
  }, [open, childId]);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/children/${childId}/coupons`);
      if (data.success) {
        setCoupons(data.childCoupons);
        const initBals: Record<number, number> = {};
        data.childCoupons.forEach((c: any) => {
          initBals[c.coupon_type_id] = c.balance;
        });
        setBalances(initBals);
      }
    } catch (error) {
      console.error('Failed to fetch child coupons', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (couponTypeId: number) => {
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/children/${childId}/coupons/${couponTypeId}/balance`, {
        amount: balances[couponTypeId] || 0,
        type: 'set',
      });
      fetchCoupons();
    } catch (error) {
      console.error('Failed to save coupon balance', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TicketIcon size={20} />
          <Typography variant="h6" fontWeight="bold">จัดการคูปอง (Coupon Balance)</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          ปรับปรุงยอดคูปองคงเหลือสำหรับ {childName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table>
              <TableHead sx={{ bgcolor: 'grey.50' }}>
                <TableRow>
                  <TableCell>ประเภทคูปอง</TableCell>
                  <TableCell align="center">ยอดคงเหลือ</TableCell>
                  <TableCell align="center">จัดการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {coupons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      <Typography variant="body2" color="textSecondary" py={2}>ไม่พบข้อมูลคูปอง กรุณาเพิ่มประเภทคูปองในระบบ</Typography>
                    </TableCell>
                  </TableRow>
                ) : coupons.map((c) => (
                  <TableRow key={c.coupon_type_id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: c.color || '#ccc' }} />
                        <Typography variant="body2" fontWeight="bold">{c.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <TextField
                        type="number"
                        size="small"
                        sx={{ width: 80 }}
                        value={balances[c.coupon_type_id] !== undefined ? balances[c.coupon_type_id] : c.balance}
                        onChange={(e) => setBalances(prev => ({ ...prev, [c.coupon_type_id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<SaveIcon size={16} />}
                        onClick={() => handleSave(c.coupon_type_id)}
                        disabled={saving || balances[c.coupon_type_id] === c.balance}
                      >
                        บันทึก
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined">ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}
