import React, { useEffect, useState } from 'react';
import { 
  Paper, Typography, Box, CircularProgress, 
  Grid, Card, CardContent, Divider
} from '@mui/material';
import { 
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingIcon,
  EmojiEvents as TrophyIcon
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = 'http://localhost:8787/api/v1/admin';

const IncentiveTracking = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // Simulating fetching incentive data based on schedule
    const fetchIncentives = async () => {
      try {
        const response = await axios.get(`${API_BASE}/my-schedule`);
        if (response.data.success) {
          const completedCount = response.data.bookings.filter((b: any) => b.status === 'completed').length;
          const upcomingCount = response.data.bookings.filter((b: any) => b.status === 'pending').length;
          
          setData({
            totalEarned: completedCount * 500, // Mock 500 THB per session
            projectedEarned: (completedCount + upcomingCount) * 500,
            completedSessions: completedCount,
            upcomingSessions: upcomingCount,
            bonus: completedCount >= 2 ? 1000 : 0 // Simple bonus logic
          });
        }
      } catch (error) {
        console.error('Failed to fetch incentives', error);
      } finally {
        setLoading(false);
      }
    };
    fetchIncentives();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 4 }}>ข้อมูลรายได้ (Incentive)</Typography>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'primary.main', color: 'white', borderRadius: 4 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <WalletIcon />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>รายได้สะสมเดือนนี้</Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 900 }}>฿{data?.totalEarned.toLocaleString()}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>คำนวณจาก {data?.completedSessions} เซสชันที่สอนแล้ว</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'secondary.main', color: 'white', borderRadius: 4 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <TrendingIcon />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>รายได้คาดการณ์</Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 900 }}>฿{data?.projectedEarned.toLocaleString()}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>รวม {data?.upcomingSessions} เซสชันที่เหลือในเดือนนี้</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'success.main', color: 'white', borderRadius: 4 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <TrophyIcon />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>โบนัสสะสม</Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 900 }}>฿{data?.bonus.toLocaleString()}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>จากผลงานตามเป้าหมาย (KPI)</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 4, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>รายละเอียดการคำนวณ</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body1">ค่าตอบแทนต่อเซสชัน (Base Rate)</Typography>
          <Typography variant="body1" sx={{ fontWeight: 800 }}>฿500</Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body1">จำนวนเซสชันที่เสร็จสิ้น</Typography>
          <Typography variant="body1" sx={{ fontWeight: 800 }}>{data?.completedSessions} ครั้ง</Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body1" sx={{ fontWeight: 800, color: 'primary.main' }}>รวมรายได้สุทธิ (ยังไม่รวมภาษี)</Typography>
          <Typography variant="h6" sx={{ fontWeight: 900, color: 'primary.main' }}>฿{(data?.totalEarned + data?.bonus).toLocaleString()}</Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default IncentiveTracking;
