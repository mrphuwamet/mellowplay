import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  Box, Paper, Typography, Avatar, Chip, Button, Alert, CircularProgress,
  List, ListItem, ListItemText, Checkbox, Divider, Tabs, Tab, TextField,
} from '@mui/material';
import {
  QrCodeScanner as ScanIcon, CheckCircle as CheckIcon, Refresh as RescanIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material';
import { AxiosInstance } from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;
const SCANNER_ELEMENT_ID = 'qr-checkin-reader';

interface CheckinAction {
  id: number;
  label: string;
  sort_order: number;
  checked_at: string | null;
}

interface CheckinBooking {
  id: number;
  qr_token: string;
  course_name: string;
  is_event: boolean;
  is_service: boolean;
  scheduled_at: string;
  status: string;
  child_name?: string;
  child_nickname?: string;
  child_avatar?: string;
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  actions: CheckinAction[];
}

interface PhoneSearchResult {
  booking_id: number;
  qr_token: string;
  scheduled_at: string;
  status: string;
  course_name: string;
  child_name?: string;
  child_nickname?: string;
  child_avatar?: string;
}

interface Props {
  // Injected so this same UI can run under the CRM's global axios (with its
  // interceptor-attached CRM JWT) or under a bare instance carrying a
  // checkin-access session token instead — see CheckinAccessScanner.tsx.
  client: AxiosInstance;
  // Called on a 401/403 from any of the calls below — the public
  // PIN-gated page uses this to drop back to the PIN screen.
  onUnauthorized?: () => void;
}

// Camera-based scanner (html5-qrcode) rather than a QR-encoded deep link —
// staff/volunteers point the device's own camera at the attendee's QR,
// decoded entirely client-side. The scanner pauses itself once a code is
// found so it doesn't immediately re-trigger on the same QR still in
// frame; "สแกนใหม่" resumes it for the next attendee. A manual phone-number
// mode covers the case where scanning isn't practical.
const CheckinScannerCore: React.FC<Props> = ({ client, onUnauthorized }) => {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [booking, setBooking] = useState<CheckinBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingActionId, setTogglingActionId] = useState<number | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [phoneResults, setPhoneResults] = useState<PhoneSearchResult[] | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  const handleRequestError = (e: any, fallbackMessage: string) => {
    const status = e.response?.status;
    setError(e.response?.data?.message || fallbackMessage);
    if (status === 401 || status === 403) onUnauthorized?.();
  };

  const lookupToken = async (token: string) => {
    if (token === lastScannedRef.current) return; // same code still in frame
    lastScannedRef.current = token;
    scannerRef.current?.pause(true);
    setLoading(true);
    setError(null);
    try {
      const res = await client.get(`${API_BASE}/checkin/lookup/${encodeURIComponent(token)}`);
      if (res.data.success) setBooking(res.data.booking);
    } catch (e: any) {
      handleRequestError(e, 'ไม่พบข้อมูลการจองสำหรับ QR นี้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      SCANNER_ELEMENT_ID,
      { fps: 10, qrbox: 250 },
      false
    );
    scanner.render((decodedText) => lookupToken(decodedText), undefined);
    scannerRef.current = scanner;
    return () => {
      scanner.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (newMode: 'scan' | 'manual') => {
    setMode(newMode);
    setError(null);
    setPhoneResults(null);
    if (newMode === 'manual') {
      scannerRef.current?.pause(true);
    } else {
      lastScannedRef.current = null;
      scannerRef.current?.resume();
    }
  };

  const scanAgain = () => {
    setBooking(null);
    setError(null);
    setPhoneResults(null);
    setPhoneInput('');
    lastScannedRef.current = null;
    if (mode === 'scan') scannerRef.current?.resume();
  };

  const searchByPhone = async () => {
    const phone = phoneInput.trim();
    if (!phone) return;
    setPhoneSearchLoading(true);
    setError(null);
    setPhoneResults(null);
    try {
      const res = await client.get(`${API_BASE}/checkin/search-by-phone/${encodeURIComponent(phone)}`);
      if (res.data.success) {
        const results: PhoneSearchResult[] = res.data.bookings || [];
        if (results.length === 0) setError('ไม่พบข้อมูลการจองสำหรับเบอร์โทรนี้');
        else if (results.length === 1) await lookupToken(results[0].qr_token);
        else setPhoneResults(results);
      }
    } catch (e: any) {
      handleRequestError(e, 'ไม่สามารถค้นหาได้');
    } finally {
      setPhoneSearchLoading(false);
    }
  };

  const toggleAction = async (actionId: number) => {
    if (!booking) return;
    setTogglingActionId(actionId);
    try {
      const res = await client.post(`${API_BASE}/checkin/${booking.id}/actions/${actionId}/toggle`);
      if (res.data.success) {
        setBooking(prev => prev ? {
          ...prev,
          actions: prev.actions.map(a => a.id === actionId
            ? { ...a, checked_at: res.data.checked ? new Date().toISOString() : null }
            : a),
        } : prev);
      }
    } catch (e: any) {
      handleRequestError(e, 'ไม่สามารถบันทึกได้');
    } finally {
      setTogglingActionId(null);
    }
  };

  const attendeeName = booking?.child_nickname || booking?.child_name
    || [booking?.parent_first_name, booking?.parent_last_name].filter(Boolean).join(' ')
    || 'ผู้เข้าร่วม';

  return (
    <Box>
      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      {!booking && (
        <Tabs value={mode} onChange={(_, v) => switchMode(v)} sx={{ mb: 2, minHeight: 40 }}>
          <Tab value="scan" label="สแกน QR" icon={<ScanIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 40 }} />
          <Tab value="manual" label="กรอกเบอร์โทร" icon={<PhoneIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 40 }} />
        </Tabs>
      )}

      {/* Kept mounted at all times (just hidden via CSS once a result is
          showing or manual mode is active) — html5-qrcode's pause/resume
          act on this exact DOM element, so conditionally unmounting it
          would break resume(). */}
      <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 480, display: (booking || mode !== 'scan') ? 'none' : 'block' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          เปิดกล้องและส่อง QR Code ของผู้เข้าร่วมที่ได้รับหลังจองสำเร็จ
        </Typography>
        <div id={SCANNER_ELEMENT_ID} />
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      </Paper>

      {!booking && mode === 'manual' && (
        <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 480 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            กรอกเบอร์โทรศัพท์ของผู้ปกครองเพื่อค้นหาการจอง
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="เบอร์โทรศัพท์"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchByPhone()}
            />
            <Button
              variant="contained"
              onClick={searchByPhone}
              disabled={phoneSearchLoading || !phoneInput.trim()}
              sx={{ borderRadius: 2, px: 3 }}
            >
              {phoneSearchLoading ? <CircularProgress size={20} color="inherit" /> : 'ค้นหา'}
            </Button>
          </Box>

          {phoneResults && phoneResults.length > 1 && (
            <List dense sx={{ mt: 2 }}>
              {phoneResults.map((b) => {
                const name = b.child_nickname || b.child_name || 'ผู้เข้าร่วม';
                return (
                  <ListItem
                    key={b.booking_id}
                    onClick={() => lookupToken(b.qr_token)}
                    sx={{ borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <Avatar src={b.child_avatar || undefined} sx={{ mr: 2, width: 36, height: 36 }}>{name[0]}</Avatar>
                    <ListItemText
                      primary={`${name} · ${b.course_name}`}
                      secondary={new Date(b.scheduled_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Paper>
      )}

      {booking && (
        <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 480 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar src={booking.child_avatar || undefined} sx={{ width: 56, height: 56, bgcolor: 'primary.main' }}>
              {attendeeName[0]}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{attendeeName}</Typography>
              <Typography variant="body2" color="text.secondary">{booking.course_name}</Typography>
              <Chip
                size="small"
                label={new Date(booking.scheduled_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                sx={{ mt: 0.5 }}
              />
            </Box>
          </Box>

          {booking.parent_phone && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              ผู้ปกครอง: {[booking.parent_first_name, booking.parent_last_name].filter(Boolean).join(' ')} · {booking.parent_phone}
            </Typography>
          )}

          <Divider sx={{ mb: 1 }} />

          {booking.actions.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
              คลาส/กิจกรรมนี้ยังไม่ได้ตั้งค่ารายการเช็คอิน — ไปที่หน้าจัดการคลาส/กิจกรรมเพื่อเพิ่ม
            </Typography>
          ) : (
            <List dense>
              {booking.actions.map(action => (
                <ListItem
                  key={action.id}
                  onClick={() => togglingActionId === null && toggleAction(action.id)}
                  sx={{ borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Checkbox
                    checked={!!action.checked_at}
                    disabled={togglingActionId === action.id}
                    icon={<CheckIcon sx={{ color: 'action.disabled' }} />}
                    checkedIcon={<CheckIcon color="success" />}
                  />
                  <ListItemText
                    primary={action.label}
                    secondary={action.checked_at ? new Date(action.checked_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={<RescanIcon />}
            onClick={scanAgain}
            sx={{ mt: 2, borderRadius: 2, fontWeight: 700 }}
          >
            สแกนคนต่อไป
          </Button>
        </Paper>
      )}
    </Box>
  );
};

export default CheckinScannerCore;
