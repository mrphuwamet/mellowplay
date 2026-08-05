import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Container, TextField, Button, Alert, CircularProgress,
} from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';
import CheckinScannerCore from '../components/CheckinScannerCore';
import logo from '../assets/logo.svg';

const API_BASE = `${API_URL}/api/v1/admin`;

// A bare instance, deliberately not the app-wide `axios` singleton — that
// singleton has a global interceptor (axiosSetup.ts) which redirects to
// /login and wipes any CRM session on a 401. A wrong PIN here also returns
// 401, and this page has no CRM login to redirect to, so it must never go
// through that interceptor.
const bareAxios = axios.create();

interface StoredSession {
  sessionToken: string;
  expiresAt: number; // epoch ms
}

const storageKey = (token: string) => `checkin_access_session_${token}`;

const loadStoredSession = (token: string): StoredSession | null => {
  try {
    const raw = localStorage.getItem(storageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.sessionToken || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};

// Public page (no CRM login) opened from a link a CRM admin generated in
// CheckinScanner.tsx. First visit on a device requires the link's PIN; on
// success a 24h session is cached in localStorage so the same device skips
// the PIN on later visits until it lapses (or the link itself is revoked —
// checked server-side on every scanner call via requireCrmAuth, since 401
// /403 here drops the cached session and re-shows this PIN screen).
const CheckinAccessScanner = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession(token));
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const client = useMemo(() => {
    const instance = axios.create();
    if (session) instance.defaults.headers.common.Authorization = `Bearer ${session.sessionToken}`;
    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionToken]);

  // Scanner calls (`client`, above) go through this same bare pattern —
  // any 401/403 they hit is handled locally via onUnauthorized, not the
  // global interceptor.

  const handleUnauthorized = () => {
    localStorage.removeItem(storageKey(token));
    setSession(null);
    setError('เซสชันหมดอายุหรือลิงก์ถูกยกเลิก กรุณาใส่ PIN อีกครั้ง');
  };

  const verifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await bareAxios.post(`${API_BASE}/checkin-access/${encodeURIComponent(token)}/verify-pin`, { pin });
      if (res.data.success) {
        const stored: StoredSession = {
          sessionToken: res.data.sessionToken,
          expiresAt: Date.now() + res.data.expiresIn * 1000,
        };
        localStorage.setItem(storageKey(token), JSON.stringify(stored));
        setLabel(res.data.label || null);
        setSession(stored);
        setPin('');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setVerifying(false);
    }
  };

  if (!session) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc' }}>
        <Container maxWidth="xs">
          <Paper sx={{ p: 4, borderRadius: 4, boxShadow: '0 10px 40px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src={logo} alt="Mellow Play" style={{ height: 60, marginBottom: 16 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>ใส่ PIN เพื่อเข้าใช้งาน</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
              ระบบสแกน QR เช็คอินสำหรับผู้ช่วยหน้างาน
            </Typography>

            {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={verifyPin} sx={{ width: '100%' }}>
              <TextField
                fullWidth
                autoFocus
                label="PIN"
                type="tel"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                InputProps={{ startAdornment: <LockIcon color="action" fontSize="small" sx={{ mr: 1 }} /> }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={verifying || !pin.trim()}
                sx={{ mt: 3, py: 1.5, borderRadius: 3, fontWeight: 800 }}
              >
                {verifying ? <CircularProgress size={24} color="inherit" /> : 'เข้าใช้งาน'}
              </Button>
            </Box>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <img src={logo} alt="Mellow Play" style={{ height: 32 }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{label || 'สแกน QR เช็คอิน'}</Typography>
        </Box>
        <CheckinScannerCore client={client} onUnauthorized={handleUnauthorized} />
      </Box>
    </Box>
  );
};

export default CheckinAccessScanner;
