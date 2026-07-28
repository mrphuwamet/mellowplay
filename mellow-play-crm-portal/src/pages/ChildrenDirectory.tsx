import { API_URL } from '../config';
import { formatBirthDate } from '../utils/dateFormat';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Chip, Avatar, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, InputAdornment, CircularProgress, Alert, Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  ManageAccounts as ManageIcon,
  WorkspacePremium as PremiumIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

interface ChildRow {
  child_id: number;
  full_name: string;
  full_name_en?: string;
  nickname?: string;
  gender?: string;
  date_of_birth?: string;
  is_hd: number;
  membership_type?: string;
  membership_expires_at?: string | null;
  user_id: number;
  parent_name: string;
  parent_name_en?: string;
  parent_phone?: string;
  parent_email?: string;
}

const calculateAge = (birthDateStr: string | undefined) => {
  if (!birthDateStr) return '-';
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return '-';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age} ปี` : '0 ปี';
};

const getGenderLabel = (gender: string | undefined): string => {
  if (gender === 'Boy') return 'ชาย';
  if (gender === 'Girl') return 'หญิง';
  if (gender === 'Other') return 'อื่นๆ';
  return '-';
};

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
};

const ChildrenDirectory = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    axios.get(`${API_BASE}/children-directory`)
      .then(res => {
        if (res.data.success) setRows(res.data.children ?? []);
        else setError(res.data.message || 'ไม่สามารถโหลดรายชื่อเด็กได้');
      })
      .catch(e => setError(e?.response?.data?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.full_name_en?.toLowerCase().includes(q) ||
      r.nickname?.toLowerCase().includes(q) ||
      r.parent_name?.toLowerCase().includes(q) ||
      r.parent_name_en?.toLowerCase().includes(q) ||
      (r.parent_phone || '').includes(q) ||
      r.parent_email?.toLowerCase().includes(q)
    );
  });
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const goToParent = (userId: number) => navigate(`/crm/parents?openUserId=${userId}`);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>รายชื่อเด็ก + ผู้ปกครอง</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        ค้นหาเด็กหรือผู้ปกครองจากชื่อ ชื่อเล่น เบอร์โทร หรืออีเมล แล้วกด "จัดการ" เพื่อไปยังหน้าจัดการผู้ใช้งานของผู้ปกครองคนนั้น
      </Typography>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      <TextField
        placeholder="ค้นหาชื่อเด็ก, ชื่อเล่น, ชื่อผู้ปกครอง, เบอร์โทร, อีเมล..."
        size="small"
        fullWidth
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(0); }}
        sx={{ mb: 2, bgcolor: 'white' }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }}
      />

      <TableContainer component={Paper} sx={{ boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f9fafb' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>เด็ก</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>เพศ / วันเกิด</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>สมาชิก</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ผู้ปกครอง</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ติดต่อ</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800 }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                  <Typography variant="body2" color="text.secondary">
                    {search ? 'ไม่พบข้อมูลที่ตรงกับการค้นหา' : 'ไม่พบข้อมูลเด็ก'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : paged.map(r => (
              <TableRow key={`${r.is_hd}-${r.child_id}`} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(116, 82, 214, 0.12)', color: 'rgb(116, 82, 214)', fontWeight: 800, fontSize: '13px' }}>
                      {(r.nickname || r.full_name || '?').charAt(0)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                        {r.full_name || '-'}{r.nickname ? ` (${r.nickname})` : ''}
                      </Typography>
                      {r.full_name_en && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {r.full_name_en}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{getGenderLabel(r.gender)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBirthDate(r.date_of_birth)}{r.date_of_birth ? ` · ${calculateAge(r.date_of_birth)}` : ''}
                  </Typography>
                </TableCell>
                <TableCell>
                  {r.membership_type === 'premium' ? (
                    <Chip icon={<PremiumIcon sx={{ fontSize: '14px !important' }} />} label="Premium" size="small" color="warning" sx={{ fontWeight: 700 }} />
                  ) : (
                    <Chip label={r.is_hd ? 'ทั่วไป' : 'ลูกค้า CRM'} size="small" variant="outlined" />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.parent_name || '-'}</Typography>
                  {r.parent_name_en && (
                    <Typography variant="caption" color="text.secondary">{r.parent_name_en}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatPhone(r.parent_phone)}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.parent_email || '-'}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="ไปที่หน้าจัดการผู้ใช้งาน">
                    <IconButton size="small" onClick={() => goToParent(r.user_id)} sx={{ color: 'primary.main' }}>
                      <ManageIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="แถวต่อหน้า"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
        />
      </TableContainer>
    </Box>
  );
};

export default ChildrenDirectory;
