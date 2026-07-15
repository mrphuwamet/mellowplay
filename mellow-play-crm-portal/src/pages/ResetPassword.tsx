import { API_URL } from '../config';
import React, { useState } from 'react';
import {
  Box, Paper, TextField, Button, Typography, Container,
  Alert, CircularProgress, InputAdornment, IconButton,
} from '@mui/material';
import {
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import axios from 'axios';
import logo from '../assets/logo.svg';

const API_BASE = `${API_URL}/api/v1/auth/crm`;

const ResetPassword: React.FC = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('กรุณาตั้งรหัสผ่านใหม่');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/reset-password`, { token, newPassword: password });
      setDone(true);
      setTimeout(() => { window.location.href = '/login'; }, 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc' }}>
      <Container maxWidth="xs">
        <Paper sx={{ p: 4, borderRadius: 4, boxShadow: '0 10px 40px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <img src={logo} alt="Mellow Play" style={{ height: 60, marginBottom: 16 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>ตั้งรหัสผ่านใหม่</Typography>
            <Typography variant="body2" color="text.secondary">สำหรับพนักงาน Mellow Play CRM</Typography>
          </Box>

          {!token && <Alert severity="error" sx={{ width: '100%' }}>ลิงก์ไม่ถูกต้อง — กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ</Alert>}

          {token && done && (
            <Alert severity="success" sx={{ width: '100%' }}>ตั้งรหัสผ่านใหม่สำเร็จแล้ว กำลังพาไปหน้าเข้าสู่ระบบ...</Alert>
          )}

          {token && !done && (
            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <TextField
                fullWidth
                label="รหัสผ่านใหม่"
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><LockIcon color="action" fontSize="small" /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="ยืนยันรหัสผ่านใหม่"
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><LockIcon color="action" fontSize="small" /></InputAdornment>,
                }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 4, py: 1.5, borderRadius: 3, fontWeight: 800, fontSize: '1rem', boxShadow: '0 8px 24px rgba(116, 82, 214, 0.2)' }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'ตั้งรหัสผ่านใหม่'}
              </Button>
            </Box>
          )}

          <Typography variant="caption" sx={{ mt: 4, color: 'text.disabled' }}>
            &copy; 2026 Mellow Play. All rights reserved.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default ResetPassword;
