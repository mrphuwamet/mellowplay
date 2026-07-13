import { API_URL } from '../config';
import React, { useState } from 'react';
import { 
  Box, Paper, TextField, Button, Typography, 
  Alert, CircularProgress, InputAdornment, IconButton,
  MenuItem, Stack, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { 
  Email as EmailIcon, 
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import axios from 'axios';
import logo from '../assets/logo.svg';

const API_BASE = `${API_URL}/api/v1/auth/admin`;

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  const [step, setStep] = useState(1); // 1: Credentials, 2: Branch Selection
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [tempUser, setTempUser] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/login`, { email, password });
      
      if (response.data.success) {
        const { token, user, branches } = response.data;
        
        if (branches && branches.length > 0) {
          setBranches(branches);
          setTempToken(token);
          setTempUser(user);
          setSelectedBranchId(branches[0].id);
          setStep(2);
        } else {
          // No branches available for this user
          setError('คุณยังไม่ได้รับมอบหมายให้ดูแลสาขาใด กรุณาติดต่อผู้ดูแลระบบ');
        }
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.response?.data?.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = () => {
    if (!selectedBranchId) {
      setError('กรุณาเลือกสาขาที่ต้องการจัดการ');
      return;
    }

    const branch = branches.find(b => b.id === selectedBranchId);
    
    // Store in localStorage
    localStorage.setItem('crm_token', tempToken);
    localStorage.setItem('crm_user', JSON.stringify({
      ...tempUser,
      selectedBranchId,
      selectedBranchName: branch?.name
    }));
    
    // Redirect to dashboard
    window.location.href = '/';
  };

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      bgcolor: '#f8fafc'
    }}>
      <Container maxWidth="xs">
        <Paper sx={{ 
          p: 4, 
          borderRadius: 4, 
          boxShadow: '0 10px 40px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <img src={logo} alt="Mellow Play" style={{ height: 60, marginBottom: 16 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>
              Mellow Play CRM
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ลงชื่อเข้าใช้งานสำหรับพนักงานและผู้ดูแลระบบ
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3, width: '100%' }}>{error}</Alert>}

          {step === 1 ? (
            <Box component="form" onSubmit={handleLogin} sx={{ width: '100%' }}>
              <TextField
                fullWidth
                label="อีเมล"
                margin="normal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon color="action" fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="รหัสผ่าน"
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon color="action" fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ 
                  mt: 4, 
                  py: 1.5, 
                  borderRadius: 3, 
                  fontWeight: 800,
                  fontSize: '1rem',
                  boxShadow: '0 8px 24px rgba(116, 82, 214, 0.2)'
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'ถัดไป'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ width: '100%' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, textAlign: 'center' }}>
                ยินดีต้อนรับคุณ {tempUser?.fullName}
              </Typography>
              <Typography variant="body2" sx={{ mb: 3, textAlign: 'center', color: 'text.secondary' }}>
                กรุณาเลือกสาขาที่ต้องการเข้าจัดการ
              </Typography>
              
              <TextField
                select
                fullWidth
                label="เลือกสาขา"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                sx={{ mb: 4 }}
              >
                {branches.map((branch) => (
                  <MenuItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </MenuItem>
                ))}
              </TextField>

              <Stack direction="row" spacing={2}>
                <Button 
                  fullWidth 
                  variant="outlined" 
                  onClick={() => setStep(1)}
                  sx={{ borderRadius: 3, fontWeight: 700 }}
                >
                  ย้อนกลับ
                </Button>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleSelectBranch}
                  sx={{ 
                    borderRadius: 3, 
                    fontWeight: 800,
                    boxShadow: '0 8px 24px rgba(116, 82, 214, 0.2)'
                  }}
                >
                  เข้าสู่ระบบ
                </Button>
              </Stack>
            </Box>
          )}
          
          <Typography variant="caption" sx={{ mt: 4, color: 'text.disabled' }}>
            &copy; 2026 Mellow Play. All rights reserved.
          </Typography>
        </Paper>
      </Container>
      <Dialog 
        open={showErrorModal} 
        onClose={() => setShowErrorModal(false)}
        PaperProps={{
          sx: { borderRadius: 4, p: 2, maxWidth: 320 }
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 800, px: 2, pb: 1 }}>
          เข้าสู่ระบบไม่สำเร็จ
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {error || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 1, px: 2 }}>
          <Button 
            fullWidth 
            variant="contained" 
            onClick={() => {
              setShowErrorModal(false);
              setPassword('');
            }}
            sx={{ borderRadius: 3, fontWeight: 700 }}
          >
            ลองอีกครั้ง
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Need to import Container
import { Container } from '@mui/material';

export default Login;
