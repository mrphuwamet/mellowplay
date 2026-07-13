import React, { useState } from 'react';
import {
  Box, Typography, Avatar, Paper, Grid, Chip, Divider,
  TextField, Button, Alert, InputAdornment, IconButton, Snackbar,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  Badge as BadgeIcon,
  Store as StoreIcon,
  Person as PersonIcon,
  Pin as PinIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';

const getPinKey = (userId: string | number) => `crm_pin_${userId}`;

const getRoleInfo = (role: string) => {
  switch (role) {
    case 'super_admin': return { label: 'Super Admin', color: 'error' as const };
    case 'play_facilitator': return { label: 'Facilitator', color: 'success' as const };
    case 'operator': return { label: 'Operator', color: 'info' as const };
    default: return { label: 'User', color: 'default' as const };
  }
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0, fontWeight: 500 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{value || '—'}</Typography>
  </Box>
);

const MyProfile = () => {
  const userJson = localStorage.getItem('crm_user');
  const storedUser = userJson ? JSON.parse(userJson) : null;

  const userId = storedUser?.id;
  const roleInfo = getRoleInfo(storedUser?.role || '');

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(storedUser?.fullName || storedUser?.name || '');
  const [email, setEmail] = useState(storedUser?.email || '');
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // PIN state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  const handleSave = () => {
    setProfileError(null);
    if (!name.trim()) {
      setProfileError('กรุณากรอกชื่อ');
      return;
    }
    setSaved(true);
    setEditMode(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCancel = () => {
    setName(storedUser?.fullName || storedUser?.name || '');
    setEmail(storedUser?.email || '');
    setProfileError(null);
    setEditMode(false);
  };

  const handleChangePIN = () => {
    const stored = localStorage.getItem(getPinKey(userId)) || '00000';
    if (currentPin !== stored) {
      setPinError('PIN ปัจจุบันไม่ถูกต้อง');
      return;
    }
    if (!/^\d{5}$/.test(newPin)) {
      setPinError('PIN ใหม่ต้องเป็นตัวเลข 5 หลักเท่านั้น');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('ยืนยัน PIN ไม่ตรงกัน');
      return;
    }
    localStorage.setItem(getPinKey(userId), newPin);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
    setPinSuccess(true);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>โปรไฟล์ของฉัน</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>ดูและแก้ไขข้อมูลบัญชีของคุณ</Typography>
        </Box>
        {!editMode ? (
          <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditMode(true)}>
            แก้ไขข้อมูล
          </Button>
        ) : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<CancelIcon />} onClick={handleCancel}>ยกเลิก</Button>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>บันทึก</Button>
          </Box>
        )}
      </Box>

      {saved && <Alert severity="success" sx={{ mb: 3 }}>บันทึกข้อมูลเรียบร้อยแล้ว</Alert>}
      {profileError && <Alert severity="error" sx={{ mb: 3 }}>{profileError}</Alert>}

      <Grid container spacing={3}>
        {/* Avatar card */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ borderRadius: 4, p: 4, boxShadow: '0 4px 20px 0 rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <Avatar sx={{ width: 96, height: 96, mx: 'auto', mb: 2, bgcolor: 'secondary.main', fontSize: '2.4rem', fontWeight: 700 }}>
              {(storedUser?.fullName || storedUser?.name || 'A')[0]}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{email}</Typography>
            <Chip label={roleInfo.label} color={roleInfo.color} size="small" sx={{ fontWeight: 700, mt: 1.5 }} />

            <Divider sx={{ my: 3 }} />

            <Box sx={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BadgeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">{roleInfo.label}</Typography>
              </Box>
              {(storedUser?.role === 'super_admin' || storedUser?.selectedBranchName) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">{storedUser?.role === 'super_admin' ? 'ทุกสาขา' : storedUser?.selectedBranchName}</Typography>
                </Box>
              )}
              {email && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">{email}</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Info / Edit forms */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ borderRadius: 4, p: 4, boxShadow: '0 4px 20px 0 rgba(0,0,0,0.06)', mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="primary" /> ข้อมูลส่วนตัว
            </Typography>

            {!editMode ? (
              <>
                <InfoRow label="ชื่อ-นามสกุล" value={name} />
                <InfoRow label="อีเมล" value={email} />
                <InfoRow label="สิทธิ์การใช้งาน" value={roleInfo.label} />
                {(storedUser?.role === 'super_admin' || storedUser?.selectedBranchName) && <InfoRow label="สาขา" value={storedUser?.role === 'super_admin' ? 'ทุกสาขา' : storedUser?.selectedBranchName} />}
              </>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                <TextField
                  label="ชื่อ-นามสกุล" fullWidth value={name}
                  onChange={(e) => setName(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon sx={{ color: 'text.disabled', fontSize: 18 }} /></InputAdornment> }}
                />
                <TextField
                  label="อีเมล" type="email" fullWidth value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ color: 'text.disabled', fontSize: 18 }} /></InputAdornment> }}
                />
              </Box>
            )}
          </Paper>

          {/* PIN Section */}
          <Paper sx={{ borderRadius: 4, p: 4, boxShadow: '0 4px 20px 0 rgba(0,0,0,0.06)' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LockIcon fontSize="small" color="primary" /> PIN สลับโหมด POS → CRM
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              PIN 5 หลักสำหรับยืนยันตัวตนเฉพาะบัญชีนี้ (ค่าเริ่มต้น: 00000)
            </Typography>

            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} sm={4}>
                <TextField
                  label="PIN ปัจจุบัน" fullWidth
                  type={showCurrentPin ? 'text' : 'password'}
                  value={currentPin}
                  onChange={(e) => { setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 5)); setPinError(''); }}
                  inputProps={{ maxLength: 5, inputMode: 'numeric' }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowCurrentPin(v => !v)}>
                          {showCurrentPin ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="PIN ใหม่ (5 หลัก)" fullWidth
                  type={showNewPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 5)); setPinError(''); }}
                  inputProps={{ maxLength: 5, inputMode: 'numeric' }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowNewPin(v => !v)}>
                          {showNewPin ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="ยืนยัน PIN ใหม่" fullWidth type="password"
                  value={confirmPin}
                  onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 5)); setPinError(''); }}
                  inputProps={{ maxLength: 5, inputMode: 'numeric' }}
                />
              </Grid>
            </Grid>

            {pinError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{pinError}</Alert>}

            <Button
              variant="contained"
              onClick={handleChangePIN}
              disabled={!currentPin || !newPin || !confirmPin}
              sx={{ mt: 3, borderRadius: 3, fontWeight: 800 }}
            >
              เปลี่ยน PIN
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={pinSuccess}
        autoHideDuration={3000}
        onClose={() => setPinSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ borderRadius: 3, fontWeight: 700 }}>
          เปลี่ยน PIN สำเร็จแล้ว
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MyProfile;
