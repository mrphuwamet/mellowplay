import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Box, Typography, Paper, Grid, TextField, Button, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Chip, IconButton, Tooltip, InputAdornment, 
  Alert, CircularProgress, Card, CardContent, Stack
} from '@mui/material';
import { 
  Search as SearchIcon, 
  CheckCircle as CheckIcon, 
  CardGiftcard as GiftIcon,
  Refresh as RefreshIcon,
  Phone as PhoneIcon,
  Person as PersonIcon
} from '@mui/icons-material';

const API_BASE = 'http://localhost:8787/api/v1';

interface Redemption {
  id: number;
  child_id: number;
  reward_name: string;
  stamp_cost: number;
  status: 'pending' | 'claimed';
  claim_code: string;
  created_at: string;
  claimed_at?: string;
  child_name?: string;
  parent_name?: string;
  parent_phone?: string;
}

const RedemptionManagement = () => {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'claimed'>('all');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchRedemptions = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await axios.get(`${API_BASE}/admin/redemptions/pending`);
      if (response.data.success) {
        setRedemptions(response.data.redemptions);
      }
    } catch (err) {
      console.error('Failed to fetch pending redemptions:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการดึงข้อมูลตั๋วของรางวัล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRedemptions();
  }, []);

  const handleClaim = async (id: number, claimCode: string) => {
    if (!window.confirm(`ยืนยันการส่งมอบของรางวัลและตัดสิทธิ์โค้ด ${claimCode}?`)) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await axios.post(`${API_BASE}/admin/redemptions/${id}/claim`);
      if (response.data.success) {
        setSuccessMsg(`ส่งมอบของรางวัลรหัส ${claimCode} เรียบร้อยแล้ว!`);
        fetchRedemptions();
      }
    } catch (err) {
      console.error('Claim error:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการยืนยันการส่งมอบของรางวัล');
    }
  };

  // Filter redemptions
  const filteredRedemptions = redemptions.filter(r => {
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchesSearch = !searchCode.trim() || r.claim_code.toLowerCase().includes(searchCode.toLowerCase().trim());
    return matchesStatus && matchesSearch;
  });

  return (
    <Box sx={{ p: 4, bgcolor: '#fdfdfd', minHeight: '85vh' }}>
      {/* Title block */}
      <Box sx={{ display: 'flex', justifyContent: 'between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ p: 1.25, bgcolor: 'primary.light', color: 'primary.main', borderRadius: 2 }}>
            <GiftIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, color: 'text.primary' }}>
              ระบบสิทธิ์แลกรับของรางวัล (Redemption Control)
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              ค้นหาสิทธิ์ตั๋ว เคลมรหัส และจัดส่งของรางวัล
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchRedemptions} disabled={loading} sx={{ ml: 'auto' }}>
          <RefreshIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Messages */}
      {errorMsg && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{errorMsg}</Alert>}
      {successMsg && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{successMsg}</Alert>}

      <Grid container spacing={3}>
        {/* Statistics Cards */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                ตั๋วค้างส่งมอบ (Pending Claim)
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 900, mt: 1, color: 'warning.main' }}>
                {redemptions.filter(r => r.status === 'pending').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                เคลมสำเร็จแล้ว (Claimed Success)
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 900, mt: 1, color: 'success.main' }}>
                {redemptions.filter(r => r.status === 'claimed').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                แลกรางวัลทั้งหมด (Total Rewards)
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 900, mt: 1, color: 'primary.main' }}>
                {redemptions.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Filters and Table block */}
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mt: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="center">
              <TextField
                placeholder="ค้นหาด้วยรหัสรับของรางวัล (เช่น MP-RW-XXXXX)"
                size="small"
                value={searchCode}
                onChange={e => setSearchCode(e.target.value)}
                sx={{ width: { xs: '100%', md: 350 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                {(['all', 'pending', 'claimed'] as const).map(status => (
                  <Chip
                    key={status}
                    label={status === 'all' ? 'ทั้งหมด' : status === 'pending' ? 'รอยืนยันส่งมอบ' : 'ส่งมอบแล้ว'}
                    clickable
                    color={filterStatus === status ? 'primary' : 'default'}
                    onClick={() => setFilterStatus(status)}
                    sx={{ fontWeight: 700 }}
                  />
                ))}
              </Box>
            </Stack>

            {loading && redemptions.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : filteredRedemptions.length === 0 ? (
              <Box sx={{ textCenter: 'center', py: 8 }}>
                <Typography color="text.secondary" sx={{ fontWeight: 700 }}>
                  ไม่พบรายการตั๋วรับรางวัล
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>วันที่ทำรายการ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>รหัสรับของรางวัล</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>ผู้เรียน</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>ของรางวัล</TableCell>
                      <TableCell sx={{ fontWeight: 800 }} align="center">แสตมป์ที่ใช้</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>ผู้ปกครอง</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>สถานะ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }} align="right">การดำเนินการ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRedemptions.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          {new Date(row.created_at).toLocaleDateString('th-TH', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: 0.5 }}>
                          {row.claim_code}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{row.child_name || '-'}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{row.reward_name}</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 800, color: 'warning.dark' }}>
                          {row.stamp_cost} Stamps
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.parent_name || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PhoneIcon sx={{ fontSize: 12 }} /> {row.parent_phone || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.status === 'pending' ? 'รอยืนยันรับของ' : 'ส่งมอบแล้ว'}
                            size="small"
                            color={row.status === 'pending' ? 'warning' : 'success'}
                            sx={{ fontWeight: 700, fontSize: '11px' }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {row.status === 'pending' ? (
                            <Button
                              variant="contained"
                              size="small"
                              color="success"
                              onClick={() => handleClaim(row.id, row.claim_code)}
                              startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                              sx={{ fontWeight: 700, borderRadius: 2 }}
                            >
                              ส่งมอบของรางวัล
                            </Button>
                          ) : (
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                              เสร็จสิ้นเมื่อ {row.claimed_at ? new Date(row.claimed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default RedemptionManagement;
