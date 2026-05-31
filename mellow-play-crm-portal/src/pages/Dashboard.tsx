import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, Card, CardContent, CircularProgress } from '@mui/material';
import {
  People as PeopleIcon,
  ChildCare as ChildIcon,
  CalendarToday as CalendarIcon,
  AssignmentTurnedIn as RequestIcon
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = 'http://localhost:8787/api/v1/admin';

interface DashboardStats {
  activeMembers: number;
  totalChildren: number;
  upcomingBookings: number;
  pendingRequests: number;
}

const StatCard = ({ title, value, icon, color }: { title: string, value: number, icon: React.ReactNode, color: string }) => (
  <Card sx={{ height: '100%', boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ 
          p: 1.5, 
          borderRadius: 3, 
          bgcolor: `${color}.main`, 
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '& svg': { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }
        }}>
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 900 }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const userJson = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const branchName = currentUser?.selectedBranchName;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get(`${API_BASE}/stats`);
        if (response.data.success) {
          setStats(response.data.stats);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
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
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>ภาพรวมระบบ ({branchName})</Typography>
        <Typography variant="body2" color="text.secondary">ข้อมูลสรุปและสถานะการทำงานของสาขา {branchName}</Typography>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 6 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="สมาชิกที่ใช้งานอยู่" value={stats?.activeMembers || 0} icon={<PeopleIcon />} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="จำนวนเด็กทั้งหมด" value={stats?.totalChildren || 0} icon={<ChildIcon />} color="secondary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="รายการจองเรียน" value={stats?.upcomingBookings || 0} icon={<CalendarIcon />} color="info" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="คำขอที่รออนุมัติ" value={stats?.pendingRequests || 0} icon={<RequestIcon />} color="warning" />
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 3 }}>สถานะแพลตฟอร์ม</Typography>
      <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #e0e0e0', boxShadow: 'none' }}>
        <Typography variant="body1" color="text.secondary">
          ยินดีต้อนรับสู่ระบบจัดการหลังบ้าน Mellow Play ข้อมูลที่แสดงอยู่นี้เป็นข้อมูลจำลองเพื่อทดสอบระบบ 
          คุณสามารถใช้เมนูด้านซ้ายเพื่อจัดการรายชื่อผู้ใช้งาน ตรวจสอบรายการจองเรียน และติดตามพัฒนาการของเด็กๆ ได้ทันที
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;
