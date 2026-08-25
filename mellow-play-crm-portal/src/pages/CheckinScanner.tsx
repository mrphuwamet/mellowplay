import React, { useEffect, useState } from 'react';
import { copyText } from '../utils/clipboard';
import {
  Box, Paper, Typography, Button, Alert, CircularProgress, Chip,
  List, ListItem, ListItemText, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Tooltip,
} from '@mui/material';
import {
  QrCodeScanner as ScanIcon, Link as LinkIcon, ContentCopy as CopyIcon,
  Block as RevokeIcon, Add as AddIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';
import CheckinScannerCore from '../components/CheckinScannerCore';

const API_BASE = `${API_URL}/api/v1/admin`;

interface AccessLink {
  id: number;
  token: string;
  label: string | null;
  expires_at: string | null;
  is_revoked: number;
  created_at: string;
}

const linkUrl = (token: string) => `${window.location.origin}/checkin-access/${token}`;

// Lets a CRM admin generate PIN-protected links to hand to volunteers who
// shouldn't get a real CRM login — see CheckinAccessScanner.tsx for the
// public page those links open, and CheckinScannerCore.tsx for the scanner
// UI shared between this CRM page and that public one.
const AccessLinkPanel = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/checkin-access-links`);
      if (res.data.success) setLinks(res.data.links);
    } catch (e: any) {
      setError(e.response?.data?.message || 'โหลดรายการลิงก์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) loadLinks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const openDialog = () => {
    setLabel('');
    setPin('');
    setExpiresAt('');
    setError(null);
    setDialogOpen(true);
  };

  const createLink = async () => {
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN ต้องเป็นตัวเลข 4-8 หลัก');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE}/checkin-access-links`, {
        label: label.trim() || null,
        pin,
        expiresAt: expiresAt || null,
      });
      if (res.data.success) {
        setDialogOpen(false);
        await loadLinks();
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'สร้างลิงก์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const revokeLink = async (id: number) => {
    try {
      await axios.post(`${API_BASE}/checkin-access-links/${id}/revoke`);
      await loadLinks();
    } catch (e: any) {
      setError(e.response?.data?.message || 'ยกเลิกลิงก์ไม่สำเร็จ');
    }
  };

  const copyLink = async (token: string) => {
    await copyText(linkUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const linkStatus = (l: AccessLink) => {
    if (l.is_revoked) return { label: 'ยกเลิกแล้ว', color: 'default' as const };
    if (l.expires_at && new Date(l.expires_at).getTime() < Date.now()) return { label: 'หมดอายุ', color: 'default' as const };
    return { label: 'ใช้งานได้', color: 'success' as const };
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800 }}>
        <LinkIcon sx={{ color: 'primary.main' }} fontSize="small" />
        ลิงก์แจกจ่ายให้ผู้ช่วยเช็คอิน
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon />} onClick={openDialog}>สร้างลิงก์ใหม่</Button>
      </DialogTitle>
      <DialogContent dividers>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        แจกให้ผู้ช่วยหน้างานได้ ไม่ต้องมีบัญชี CRM ใส่ PIN ครั้งแรกแล้วใช้ได้ 24 ชม.
      </Typography>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
      ) : links.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>ยังไม่มีลิงก์ที่สร้างไว้</Typography>
      ) : (
        <List dense>
          {links.map((l) => {
            const status = linkStatus(l);
            return (
              <ListItem
                key={l.id}
                sx={{ borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title={copiedToken === l.token ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}>
                      <IconButton size="small" onClick={() => copyLink(l.token)}><CopyIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    {!l.is_revoked && (
                      <Tooltip title="ยกเลิกลิงก์">
                        <IconButton size="small" color="error" onClick={() => revokeLink(l.id)}><RevokeIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{l.label || 'ลิงก์ไม่มีชื่อ'}</span>
                      <Chip size="small" label={status.label} color={status.color} />
                    </Box>
                  }
                  secondary={l.expires_at
                    ? `หมดอายุ ${new Date(l.expires_at).toLocaleDateString('th-TH')}`
                    : 'ไม่มีวันหมดอายุ'}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>สร้างลิงก์เช็คอินใหม่</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            fullWidth margin="dense" label="ชื่อลิงก์ (ไม่บังคับ)"
            placeholder="เช่น งานวันเด็ก 2569"
            value={label} onChange={(e) => setLabel(e.target.value)}
          />
          <TextField
            fullWidth margin="dense" label="PIN (4-8 หลัก)" type="tel"
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <TextField
            fullWidth margin="dense" label="วันหมดอายุลิงก์ (ไม่บังคับ)" type="date"
            InputLabelProps={{ shrink: true }}
            value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={createLink} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'สร้างลิงก์'}
          </Button>
        </DialogActions>
      </Dialog>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
};

const CheckinScanner = () => {
  const [linksOpen, setLinksOpen] = useState(false);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ScanIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>สแกน QR เช็คอิน</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small" variant="outlined" startIcon={<LinkIcon />}
          onClick={() => setLinksOpen(true)}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          ลิงก์ผู้ช่วย
        </Button>
      </Box>

      <AccessLinkPanel open={linksOpen} onClose={() => setLinksOpen(false)} />

      <CheckinScannerCore client={axios} canCloseRound />
    </Box>
  );
};

export default CheckinScanner;
