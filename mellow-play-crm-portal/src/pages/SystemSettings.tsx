import { API_URL } from '../config';
import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Paper, Grid, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Stack, CircularProgress, Divider, List, ListItem, ListItemButton, ListItemText, ListItemAvatar,
  Avatar, Card, CardContent, Switch, FormControlLabel, Alert, Chip,
  ToggleButton, ToggleButtonGroup, Slider,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Store as BranchIcon,
  AccessTime as TimeIcon,
  Settings as SettingsIcon,
  VpnKey as KeyIcon,
  PlayCircleOutline as TestIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import axios from 'axios';
import RichTextEditor from '../components/RichTextEditor';
import { uploadEditorImage } from '../utils/imageUpload';
import {
  EmailTheme, DEFAULT_EMAIL_THEME, themeFromSettings, themeToSettings, wrapEmailHtml, clampHeaderWidth,
} from '../utils/emailFrame';

const API_BASE = `${API_URL}/api/v1/admin`;

// Stands in for a real message in the theme preview. Deliberately ordinary —
// what is being previewed is the frame, not the copy.
const EMAIL_PREVIEW_BODY = [
  '<p>สวัสดีค่ะ คุณผู้ปกครอง</p>',
  '<p>นี่คือตัวอย่างอีเมลที่ระบบจะส่งออกไป เนื้อหาส่วนนี้มาจากเครื่องมือเขียนข้อความของแต่ละกิจกรรม',
  'ส่วนพื้นหลัง หัวกระดาษ และท้ายกระดาษมาจากการตั้งค่าทางซ้าย</p>',
  '<p style="margin:0;"><a href="#" style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:800;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none;">ดูรายละเอียด</a></p>',
].join(' ');

// Everything sendWelcomeEmail knows about the person who just signed up —
// there is nothing else to offer, so the list is the whole set.
const WELCOME_VARIABLES: { key: string; label: string }[] = [
  { key: 'name', label: 'ชื่อผู้สมัคร' },
  { key: 'email', label: 'อีเมล' },
  { key: 'phone', label: 'เบอร์โทร' },
];

const WELCOME_SAMPLE: Record<string, string> = {
  name: 'คุณสมชาย ศรีสุข',
  email: 'somchai.s@example.com',
  phone: '081-234-5678',
};

interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  open_time?: string;
  close_time?: string;
}


type IntegrationService = 'beam' | 'sms' | 'discord' | 'claude' | 'gemini' | 'line';

// sensitive: true fields use the "type a new value to change it" masked
// pattern; non-sensitive ones (just a display label, not a credential) are
// pre-filled with their real current value and edited directly.
const INTEGRATION_KEY_FIELDS: { key: string; label: string; sensitive: boolean; hint?: string; service: IntegrationService }[] = [
  { key: 'beam_api_key', label: 'Beam API Key', sensitive: true, service: 'beam' },
  { key: 'beam_merchant_id', label: 'Beam Merchant ID', sensitive: true, service: 'beam' },
  { key: 'sms_api_key', label: 'SMS API Key (ThaiBulkSMS)', sensitive: true, service: 'sms' },
  { key: 'sms_api_secret', label: 'SMS API Secret (ThaiBulkSMS)', sensitive: true, service: 'sms' },
  { key: 'sms_sender_name', label: 'SMS Sender Name (ชื่อผู้ส่ง ที่ลงทะเบียนกับ ThaiBulkSMS)', sensitive: false, service: 'sms' },
  {
    key: 'discord_webhook_url', label: 'Discord Webhook URL — แจ้งเตือน Error', sensitive: true, service: 'discord',
    hint: 'วิธีสร้าง: เปิด Discord → เข้า server/channel ที่จะรับแจ้งเตือน → คลิกฟันเฟือง (Edit Channel) → Integrations → Webhooks → New Webhook → ตั้งชื่อ (เช่น "Mellow Play Alerts") → กด Copy Webhook URL แล้วมาวางที่นี่',
  },
  {
    key: 'discord_notify_webhook_url', label: 'Discord Webhook URL — แจ้งเตือนสมาชิกใหม่/การจองใหม่', sensitive: true, service: 'discord',
    hint: 'ใช้ channel แยกจาก error ด้านบน (สร้าง webhook ใหม่ในอีก channel ด้วยวิธีเดียวกัน) เพื่อไม่ให้แจ้งเตือน error กับแจ้งเตือนสมาชิก/การจองปนกัน',
  },
  { key: 'anthropic_api_key', label: 'Anthropic API Key (Claude)', sensitive: true, service: 'claude' },
  { key: 'google_ai_api_key', label: 'Google AI API Key (Gemini)', sensitive: true, service: 'gemini' },
  {
    key: 'line_liff_id', label: 'LINE LIFF ID', sensitive: false, service: 'line',
    hint: 'จาก LINE Developers Console → LIFF app ที่สร้างไว้ → คัดลอกค่า "LIFF ID" (ไม่ใช่ Channel Secret) มาวางที่นี่ ไม่ใช่ความลับ ใช้ฝั่งเว็บแอปได้เลย',
  },
];

const SERVICE_GROUPS: { service: IntegrationService; label: string; hideTest?: boolean }[] = [
  { service: 'beam', label: 'Beam Checkout (จ่ายเงิน)' },
  { service: 'sms', label: 'SMS (ThaiBulkSMS)' },
  { service: 'discord', label: 'Discord Webhook (แจ้งเตือน — แยก channel error กับ สมาชิกใหม่/การจอง)' },
  { service: 'claude', label: 'Claude (Anthropic) — สำหรับแปลภาษาอัตโนมัติ' },
  { service: 'gemini', label: 'Gemini (Google AI) — สำหรับแปลภาษาอัตโนมัติ' },
  { service: 'line', label: 'LINE LIFF (แชร์ไป LINE จากในแอปลูกค้า)', hideTest: true },
];

const SystemSettings = () => {
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; onConfirm: () => void }>({ open: false, title: '', onConfirm: () => {} });

  const [branchOpen, setBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState<Partial<Branch>>({});
  const [isEditBranch, setIsEditBranch] = useState(false);
  const [systemSettings, setSystemSettings] = useState<{ [key: string]: string }>({});
  const [welcomeSubject, setWelcomeSubject] = useState('');
  const [welcomeBody, setWelcomeBody] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeBodyTab, setWelcomeBodyTab] = useState<'wysiwyg' | 'html'>('wysiwyg');
  // Which field a variable chip should land in. Tracked on focus because the
  // chip itself steals focus the moment it is clicked.
  const [welcomeFocus, setWelcomeFocus] = useState<'subject' | 'body'>('body');
  const welcomeSubjectRef = useRef<HTMLInputElement | null>(null);
  const welcomeBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const welcomeEditorRef = useRef<any>(null);

  // The frame around every outgoing email (plain vs custom). Edited as a draft
  // and saved on a button — the preview beside it renders the draft, so the
  // effect is visible before anything reaches a real inbox.
  const [emailTheme, setEmailTheme] = useState<EmailTheme>(DEFAULT_EMAIL_THEME);
  const [savingTheme, setSavingTheme] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);

  // Beam/SMS credentials — super_admin only. GET returns a masked preview
  // only; typing into a field stages a NEW value, an untouched field is
  // never sent back so the masked placeholder can't overwrite the real secret.
  const [integrationKeys, setIntegrationKeys] = useState<{ [key: string]: { masked: string; isSet: boolean } }>({});
  const [keyEdits, setKeyEdits] = useState<{ [key: string]: string }>({});
  // Keyed per section (service name, or 'translation_provider') so saving
  // one section's keys doesn't spinner/lock the others.
  const [savingKeys, setSavingKeys] = useState<{ [group: string]: boolean }>({});

  // "Test Connection" — always tests whatever is currently SAVED (DB
  // override or Cloudflare secret fallback), not unsaved text still sitting
  // in the fields above, so remind the admin to save first if they've typed
  // a new value that hasn't been saved yet.
  const [testStatus, setTestStatus] = useState<{ [service: string]: { loading: boolean; success?: boolean; message?: string } }>({});
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTestDialogOpen, setSmsTestDialogOpen] = useState(false);

  const runTest = async (service: IntegrationService, phone?: string) => {
    setTestStatus(prev => ({ ...prev, [service]: { loading: true } }));
    try {
      const { data } = await axios.post(`${API_BASE}/integration-keys/test`, { service, phone });
      setTestStatus(prev => ({ ...prev, [service]: { loading: false, success: data.success, message: data.message } }));
    } catch (e: any) {
      setTestStatus(prev => ({ ...prev, [service]: { loading: false, success: false, message: e.response?.data?.message || e.message } }));
    }
  };

  const handleTestClick = (service: IntegrationService) => {
    if (service === 'sms') {
      setSmsTestPhone('');
      setSmsTestDialogOpen(true);
      return;
    }
    runTest(service);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [branchRes, settingsRes] = await Promise.all([
        axios.get(`${API_BASE}/branches`),
        axios.get(`${API_BASE}/system/settings`),
      ]);

      if (branchRes.data.success) {
        setBranches(branchRes.data.branches);
        if (branchRes.data.branches.length > 0) {
          setSelectedBranchId(branchRes.data.branches[0].id);
        }
      }
      if (settingsRes.data.success) {
        const settingsMap: { [key: string]: string } = {};
        settingsRes.data.settings.forEach((s: any) => settingsMap[s.key] = s.value);
        setSystemSettings(settingsMap);
        setWelcomeSubject(settingsMap['welcome_email_subject'] || '');
        setWelcomeBody(settingsMap['welcome_email_template'] || '');
        setEmailTheme(themeFromSettings(settingsMap));
      }
      if (isSuperAdmin) {
        const keysRes = await axios.get(`${API_BASE}/integration-keys`);
        if (keysRes.data.success) {
          setIntegrationKeys(keysRes.data.keys);
          prefillNonSensitive(keysRes.data.keys);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Non-sensitive fields (e.g. SMS sender name) show their real current
  // value directly in the editable field, unlike the masked secret fields.
  const prefillNonSensitive = (keys: { [key: string]: { masked: string; isSet: boolean } }) => {
    const prefill: { [key: string]: string } = {};
    for (const { key, sensitive } of INTEGRATION_KEY_FIELDS) {
      if (!sensitive && keys[key]?.isSet) prefill[key] = keys[key].masked;
    }
    setKeyEdits(prev => ({ ...prev, ...prefill }));
  };

  // Saves only the given keys' staged edits, under its own group id — so
  // e.g. saving the Beam section never touches SMS/Discord/AI fields, and
  // each section gets its own independent loading state.
  const handleSaveIntegrationKeys = async (groupId: string, keys: string[]) => {
    const payload: { [key: string]: string } = {};
    for (const key of keys) {
      if (keyEdits[key]?.trim()) payload[key] = keyEdits[key].trim();
    }
    if (Object.keys(payload).length === 0) return;
    setSavingKeys(prev => ({ ...prev, [groupId]: true }));
    try {
      await axios.put(`${API_BASE}/integration-keys`, payload);
      setKeyEdits(prev => {
        const next = { ...prev };
        for (const key of keys) delete next[key];
        return next;
      });
      const keysRes = await axios.get(`${API_BASE}/integration-keys`);
      if (keysRes.data.success) {
        setIntegrationKeys(keysRes.data.keys);
        prefillNonSensitive(keysRes.data.keys);
      }
    } catch (e: any) {
      alert('บันทึกคีย์ไม่สำเร็จ: ' + (e.response?.data?.message || e.message));
    } finally {
      setSavingKeys(prev => ({ ...prev, [groupId]: false }));
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveBranch = async () => {
    try {
      if (isEditBranch) {
        await axios.patch(`${API_BASE}/branches/${branchForm.id}`, branchForm);
      } else {
        await axios.post(`${API_BASE}/branches`, branchForm);
      }
      setBranchOpen(false);
      fetchData();
    } catch (e: any) {
      alert('Failed to save branch: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleDeleteBranch = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmDialog({
      open: true,
      title: 'ลบสาขานี้?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await axios.delete(`${API_BASE}/branches/${id}`);
          fetchData();
        } catch (e: any) { alert('Error: ' + e.message); }
      }
    });
  };

  const handleToggleSetting = async (key: string, value: string) => {
    try {
      await axios.put(`${API_BASE}/system/settings`, { key, value });
      setSystemSettings(prev => ({ ...prev, [key]: value }));
    } catch (e: any) {
      alert('Error updating setting: ' + e.message);
    }
  };

  // Subject and body are edited together and saved on a button rather than on
  // every keystroke like the toggles — a half-typed template must not be what
  // the next signup receives.
  const saveWelcomeEmail = async () => {
    setSavingWelcome(true);
    try {
      await axios.put(`${API_BASE}/system/settings`, { key: 'welcome_email_subject', value: welcomeSubject });
      await axios.put(`${API_BASE}/system/settings`, { key: 'welcome_email_template', value: welcomeBody });
      setSystemSettings(prev => ({ ...prev, welcome_email_subject: welcomeSubject, welcome_email_template: welcomeBody }));
    } catch (e: any) {
      alert('บันทึกไม่สำเร็จ: ' + e.message);
    } finally {
      setSavingWelcome(false);
    }
  };

  // Inserts at the cursor of whichever field was last focused, falling back to
  // appending — a chip that silently does nothing is worse than one that puts
  // the token somewhere obvious.
  const insertWelcomeVariable = (key: string) => {
    const token = `{{${key}}}`;

    if (welcomeFocus === 'subject') {
      const el = welcomeSubjectRef.current;
      const at = el?.selectionStart ?? welcomeSubject.length;
      setWelcomeSubject(welcomeSubject.slice(0, at) + token + welcomeSubject.slice(at));
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(at + token.length, at + token.length);
      });
      return;
    }

    if (welcomeBodyTab === 'html') {
      const el = welcomeBodyRef.current;
      const at = el?.selectionStart ?? welcomeBody.length;
      setWelcomeBody(welcomeBody.slice(0, at) + token + welcomeBody.slice(at));
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(at + token.length, at + token.length);
      });
      return;
    }

    const editor = welcomeEditorRef.current;
    if (editor) editor.chain().focus().insertContent(token).run();
    else setWelcomeBody(welcomeBody + token);
  };

  // Sample values for the preview, matching what sendWelcomeEmail fills in.
  const renderWelcomePreview = (template: string) =>
    template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => WELCOME_SAMPLE[key] ?? match);

  const patchTheme = (patch: Partial<EmailTheme>) => setEmailTheme(prev => ({ ...prev, ...patch }));

  const uploadHeaderImage = async (file: File) => {
    setUploadingHeader(true);
    try {
      const { url } = await uploadEditorImage(file, 'email-theme');
      patchTheme({ headerImage: url });
    } catch (e: any) {
      alert('อัปโหลดรูปไม่สำเร็จ: ' + (e.response?.data?.message || e.message));
    } finally {
      setUploadingHeader(false);
    }
  };

  const saveEmailTheme = async () => {
    setSavingTheme(true);
    try {
      const map = themeToSettings(emailTheme);
      // Sequential, not Promise.all: eight writes into the same table and D1
      // takes one writer at a time.
      for (const [key, value] of Object.entries(map)) {
        await axios.put(`${API_BASE}/system/settings`, { key, value });
      }
      setSystemSettings(prev => ({ ...prev, ...map }));
    } catch (e: any) {
      alert('บันทึกไม่สำเร็จ: ' + e.message);
    } finally {
      setSavingTheme(false);
    }
  };

  const isBranded = emailTheme.mode === 'branded';

  // One colour control: a swatch to pick with, and a hex field to paste a
  // brand colour into.
  const colorField = (label: string, key: 'headerBg' | 'pageBg' | 'cardBg' | 'textColor' | 'footerBg') => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box
        component="input" type="color" disabled={!isBranded}
        value={emailTheme[key] || '#ffffff'}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchTheme({ [key]: e.target.value })}
        sx={{
          width: 44, height: 44, p: 0, flexShrink: 0, borderRadius: 1.5,
          border: '1px solid', borderColor: 'divider', bgcolor: 'transparent',
          cursor: isBranded ? 'pointer' : 'not-allowed', opacity: isBranded ? 1 : 0.5,
        }}
      />
      <TextField
        size="small" label={label} disabled={!isBranded} fullWidth
        value={emailTheme[key] || ''}
        onChange={e => patchTheme({ [key]: e.target.value })}
      />
    </Box>
  );

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>ตั้งค่าระบบและสาขา</Typography>
        <Typography variant="body2" color="text.secondary">จัดการค่าเริ่มต้นสำหรับแต่ละสาขา (Super Admin Only)</Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={12}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SettingsIcon color="primary" /> ตั้งค่าระบบ
              </Typography>
            </Box>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch 
                    checked={systemSettings['otp_enabled'] === '1'} 
                    onChange={(e) => handleToggleSetting('otp_enabled', e.target.checked ? '1' : '0')}
                  />
                }
                label="เปิดใช้งานการส่ง SMS OTP จริง (ThaiBulkSMS)"
              />
              <FormControlLabel
                control={
                  <Switch 
                    checked={systemSettings['payment_enabled'] !== '0'} // default true if undefined
                    onChange={(e) => handleToggleSetting('payment_enabled', e.target.checked ? '1' : '0')}
                  />
                }
                label="เปิดใช้งานระบบจ่ายเงินจริง (Beam Payment)"
              />
            </Stack>
          </Paper>

          {/* Welcome mail lives here, not on a course: there is one signup
              flow, so a per-anything template would be a setting with a single
              possible value. */}
          <Paper sx={{ p: 3, borderRadius: 4, mb: 4 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <SettingsIcon color="primary" /> อีเมลต้อนรับสมาชิกใหม่
            </Typography>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={systemSettings['welcome_email_enabled'] === '1'}
                    onChange={(e) => handleToggleSetting('welcome_email_enabled', e.target.checked ? '1' : '0')}
                  />
                }
                label="ส่งอีเมลต้อนรับอัตโนมัติเมื่อมีคนสมัครสมาชิก"
              />
              <Alert severity="info">
                ส่งเฉพาะคนที่กรอกอีเมลตอนสมัคร (อีเมลไม่บังคับ) · เปิดแล้วจะเริ่มส่งทันทีกับคนที่สมัครใหม่
                แนะนำให้เขียนเนื้อหาและกดบันทึกก่อนค่อยเปิด · เนื้อหานี้จะถูกวางในกรอบตาม "รูปแบบอีเมล" ด้านล่าง
              </Alert>
              <TextField
                fullWidth label="หัวเรื่อง"
                value={welcomeSubject}
                onChange={(e) => setWelcomeSubject(e.target.value)}
                inputRef={welcomeSubjectRef}
                onFocus={() => setWelcomeFocus('subject')}
              />

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>เนื้อหาอีเมล</Typography>
                  {/* Two views over one field, same as the course notification
                      editor: the visual one covers everyone, the raw one is for
                      a body pasted in from a designed template. */}
                  <ToggleButtonGroup
                    exclusive size="small" value={welcomeBodyTab}
                    onChange={(_, v) => v && setWelcomeBodyTab(v)}
                  >
                    <ToggleButton value="wysiwyg" sx={{ px: 1.5, py: 0.25, fontSize: 12, fontWeight: 700, textTransform: 'none' }}>แก้แบบเห็นภาพ</ToggleButton>
                    <ToggleButton value="html" sx={{ px: 1.5, py: 0.25, fontSize: 12, fontWeight: 700, textTransform: 'none' }}>HTML</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {welcomeBodyTab === 'wysiwyg' ? (
                  <Box onFocus={() => setWelcomeFocus('body')}>
                    <RichTextEditor
                      value={welcomeBody}
                      onChange={html => setWelcomeBody(html)}
                      uploadFolder="welcome-email"
                      placeholder="เช่น สวัสดีคุณ {{name}} ยินดีต้อนรับสู่ Mellow Play"
                      onEditorReady={editor => { welcomeEditorRef.current = editor; }}
                    />
                  </Box>
                ) : (
                  <TextField
                    fullWidth multiline minRows={8}
                    value={welcomeBody}
                    onChange={(e) => setWelcomeBody(e.target.value)}
                    inputRef={welcomeBodyRef}
                    onFocus={() => setWelcomeFocus('body')}
                    placeholder="<p>สวัสดีคุณ {{name}}</p>"
                    InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
                  />
                )}

                {/* Click to insert, rather than a sentence telling people what to
                    type: the variable names are exact strings and retyping one
                    is how a template silently ships with {{ name }} that never
                    resolves. */}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25, mb: 0.5 }}>
                  กดเพื่อแทรกตัวแปร (ใส่ได้ทั้งหัวเรื่องและเนื้อหา — คลิกช่องที่ต้องการก่อน)
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {WELCOME_VARIABLES.map(v => (
                    <Chip
                      key={v.key} size="small" label={v.label} onClick={() => insertWelcomeVariable(v.key)}
                      sx={{ fontWeight: 700 }}
                    />
                  ))}
                </Stack>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                  ตัวอย่างที่ผู้สมัครจะได้รับ (กรอบมาจากรูปแบบอีเมลที่บันทึกไว้)
                </Typography>
                <Box
                  component="iframe" title="welcome-preview"
                  srcDoc={wrapEmailHtml(renderWelcomePreview(welcomeBody), emailTheme)}
                  sx={{ width: '100%', height: 360, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#fff' }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  หัวเรื่อง: {renderWelcomePreview(welcomeSubject) || '(ยังไม่ได้ตั้ง)'}
                </Typography>
              </Box>

              <Box>
                <Button variant="contained" onClick={saveWelcomeEmail} disabled={savingWelcome}>
                  {savingWelcome ? 'กำลังบันทึก...' : 'บันทึกอีเมลต้อนรับ'}
                </Button>
              </Box>
            </Stack>
          </Paper>

          {/* The frame every outgoing email is wrapped in — booking
              confirmations, broadcasts and the welcome mail alike. The body of
              each message still comes from its own editor; this decides what
              surrounds it. */}
          <Paper sx={{ p: 3, borderRadius: 4, mb: 4 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <SettingsIcon color="primary" /> รูปแบบอีเมล (Template)
            </Typography>

            <ToggleButtonGroup
              exclusive size="small" color="primary" value={emailTheme.mode} sx={{ mb: 2 }}
              onChange={(_, v) => v && patchTheme({ mode: v })}
            >
              <ToggleButton value="plain" sx={{ px: 2.5, fontWeight: 700 }}>แบบปกติ</ToggleButton>
              <ToggleButton value="branded" sx={{ px: 2.5, fontWeight: 700 }}>แบบกำหนดเอง</ToggleButton>
            </ToggleButtonGroup>

            <Alert severity="info" sx={{ mb: 2 }}>
              แบบปกติ = การ์ดขาวบนพื้นเทา ไม่มีหัว/ท้ายกระดาษ (ค่าเริ่มต้นเดิม) ·
              แบบกำหนดเองจะใช้ค่าด้านล่างกับอีเมลทุกฉบับที่ระบบส่ง ·
              ค่าที่ตั้งไว้จะไม่ถูกลบเมื่อสลับกลับไปแบบปกติ
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                      หัวกระดาษ (โลโก้/แบนเนอร์) — ไม่ใส่ = ไม่มีแถบหัว
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <Button component="label" variant="outlined" size="small" disabled={!isBranded || uploadingHeader}>
                        {uploadingHeader ? 'กำลังอัปโหลด...' : 'อัปโหลดรูป'}
                        <input
                          hidden type="file" accept="image/*"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadHeaderImage(f); e.target.value = ''; }}
                        />
                      </Button>
                      {emailTheme.headerImage && (
                        <Button size="small" color="error" disabled={!isBranded} onClick={() => patchTheme({ headerImage: '' })}>
                          เอารูปออก
                        </Button>
                      )}
                    </Stack>
                    <TextField
                      fullWidth size="small" label="URL รูปหัวกระดาษ" disabled={!isBranded}
                      value={emailTheme.headerImage}
                      onChange={e => patchTheme({ headerImage: e.target.value })}
                    />
                    {emailTheme.headerImage && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block' }}>
                          ความกว้างรูปหัวกระดาษ: {emailTheme.headerWidth}px {emailTheme.headerWidth >= 600 ? '(เต็มความกว้างอีเมล)' : ''}
                        </Typography>
                        {/* The card is 600px wide, so the slider stops there —
                            anything wider is a broken layout, not a bigger logo. */}
                        <Slider
                          size="small" min={60} max={600} step={10} disabled={!isBranded}
                          value={emailTheme.headerWidth}
                          onChange={(_, v) => patchTheme({ headerWidth: clampHeaderWidth(v as number) })}
                          valueLabelDisplay="auto"
                          marks={[{ value: 240, label: 'ปกติ' }, { value: 600, label: 'เต็ม' }]}
                        />
                      </Box>
                    )}
                  </Box>

                  {colorField('พื้นหลังแถบหัว', 'headerBg')}
                  {colorField('พื้นหลังอีเมล (นอกการ์ด)', 'pageBg')}
                  {colorField('พื้นหลังการ์ดเนื้อหา', 'cardBg')}
                  {colorField('สีตัวอักษร', 'textColor')}

                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                      ท้ายกระดาษ (ที่อยู่ ช่องทางติดต่อ ฯลฯ) — ปล่อยว่าง = ไม่มีแถบท้าย
                    </Typography>
                    {/* Same editor as everywhere else in the CRM, so a footer
                        can carry a logo, links and formatting without anyone
                        writing HTML. */}
                    <Box sx={{ opacity: isBranded ? 1 : 0.5, pointerEvents: isBranded ? 'auto' : 'none' }}>
                      <RichTextEditor
                        value={emailTheme.footerHtml}
                        onChange={html => patchTheme({ footerHtml: html })}
                        uploadFolder="email-theme"
                        placeholder="เช่น Mellow Play · โทร 09x-xxx-xxxx · ยกเลิกรับข่าวสารได้ที่..."
                      />
                    </Box>
                  </Box>
                  {colorField('พื้นหลังแถบท้าย', 'footerBg')}

                  <Box>
                    <Button variant="contained" onClick={saveEmailTheme} disabled={savingTheme}>
                      {savingTheme ? 'กำลังบันทึก...' : 'บันทึกรูปแบบอีเมล'}
                    </Button>
                  </Box>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                  ตัวอย่าง (อัปเดตทันทีตามที่แก้ ยังไม่ต้องกดบันทึก)
                </Typography>
                <Box
                  component="iframe" title="email-preview"
                  srcDoc={wrapEmailHtml(EMAIL_PREVIEW_BODY, emailTheme)}
                  sx={{ width: '100%', height: 520, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#fff' }}
                />
              </Grid>
            </Grid>
          </Paper>

          {isSuperAdmin && (
            <Paper sx={{ p: 3, borderRadius: 4, mb: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <KeyIcon color="primary" /> คีย์เชื่อมต่อระบบ (Beam / SMS / AI / LINE)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                เห็นได้เฉพาะ Super Admin — พิมพ์ค่าใหม่เพื่อเปลี่ยน ถ้าไม่พิมพ์อะไรจะไม่มีผลกับค่าที่ตั้งไว้เดิม
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                  ผู้ให้บริการ AI แปลภาษา (ใช้กับปุ่ม "แปลอัตโนมัติ" ในเครื่องมือเขียนข่าว)
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                  <FormControl size="small" sx={{ minWidth: 240 }}>
                    <Select
                      value={keyEdits['translation_provider'] ?? integrationKeys['translation_provider']?.masked ?? 'claude'}
                      onChange={(e) => setKeyEdits(prev => ({ ...prev, translation_provider: e.target.value as string }))}
                    >
                      <MenuItem value="claude">Claude (Anthropic)</MenuItem>
                      <MenuItem value="gemini">Gemini (Google AI)</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => handleSaveIntegrationKeys('translation_provider', ['translation_provider'])}
                    disabled={savingKeys['translation_provider'] || !keyEdits['translation_provider']?.trim()}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    {savingKeys['translation_provider'] ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'บันทึก'}
                  </Button>
                </Stack>
              </Box>
              <Divider sx={{ mb: 3 }} />

              <Stack spacing={3}>
                {SERVICE_GROUPS.map(({ service, label: serviceLabel, hideTest }) => {
                  const status = testStatus[service];
                  return (
                    <Box key={service}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                        {serviceLabel}
                      </Typography>
                      <Stack spacing={2}>
                        {INTEGRATION_KEY_FIELDS.filter(f => f.service === service).map(({ key, label, sensitive, hint }) => (
                          <Box key={key}>
                            <TextField
                              label={label}
                              fullWidth
                              size="small"
                              value={keyEdits[key] ?? ''}
                              onChange={(e) => setKeyEdits(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={sensitive ? (integrationKeys[key]?.isSet ? `ตั้งค่าไว้แล้ว (${integrationKeys[key].masked})` : 'ยังไม่ได้ตั้งค่า') : undefined}
                              helperText={
                                sensitive
                                  ? (integrationKeys[key]?.isSet ? `ปัจจุบัน: ${integrationKeys[key].masked}` : (!hint ? 'ยังไม่ได้ตั้งค่า — ระบบจะ fallback ไปใช้ค่าจาก Cloudflare secret แทน' : undefined))
                                  : (integrationKeys[key]?.isSet
                                      ? undefined
                                      : key === 'sms_sender_name'
                                        ? 'ยังไม่ได้ตั้งค่า — ระบบจะใช้ค่าเริ่มต้น "Demo" ไปก่อน'
                                        : 'ยังไม่ได้ตั้งค่า')
                              }
                            />
                            {hint && !integrationKeys[key]?.isSet && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, pl: 1.5, lineHeight: 1.6 }}>
                                💡 {hint}
                              </Typography>
                            )}
                          </Box>
                        ))}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          {(() => {
                            const groupKeys = INTEGRATION_KEY_FIELDS.filter(f => f.service === service).map(f => f.key);
                            const hasEdits = groupKeys.some(k => keyEdits[k]?.trim());
                            return (
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => handleSaveIntegrationKeys(service, groupKeys)}
                                disabled={savingKeys[service] || !hasEdits}
                                sx={{ borderRadius: 2, fontWeight: 700 }}
                              >
                                {savingKeys[service] ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'บันทึก'}
                              </Button>
                            );
                          })()}
                          {!hideTest && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={status?.loading ? <CircularProgress size={14} /> : <TestIcon />}
                              onClick={() => handleTestClick(service)}
                              disabled={status?.loading}
                              sx={{ borderRadius: 2, fontWeight: 700 }}
                            >
                              ทดสอบการเชื่อมต่อ
                            </Button>
                          )}
                          {!hideTest && status && !status.loading && status.success !== undefined && (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              {status.success ? <SuccessIcon color="success" fontSize="small" /> : <ErrorIcon color="error" fontSize="small" />}
                              <Typography variant="caption" sx={{ fontWeight: 700, color: status.success ? 'success.main' : 'error.main' }}>
                                {status.message}
                              </Typography>
                            </Stack>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          )}

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <BranchIcon color="primary" /> สาขา
              </Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => { setBranchForm({}); setIsEditBranch(false); setBranchOpen(true); }} sx={{ borderRadius: 2 }}>
                เพิ่ม
              </Button>
            </Box>
            <List>
              {branches.map(b => (
                <ListItem key={b.id} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton 
                    selected={selectedBranchId === b.id}
                    onClick={() => setSelectedBranchId(b.id)}
                    sx={{ borderRadius: 2 }}
                  >
                    <ListItemText primary={b.name} secondary={b.address || 'ไม่มีข้อมูลที่อยู่'} primaryTypographyProps={{ fontWeight: 700 }} />
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setBranchForm(b); setIsEditBranch(true); setBranchOpen(true); }}><SettingsIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={(e) => handleDeleteBranch(e, b.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
      </Grid>
      </Grid>

      <Dialog open={branchOpen} onClose={() => setBranchOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{isEditBranch ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField label="ชื่อสาขา *" fullWidth value={branchForm.name || ''} onChange={e => setBranchForm({...branchForm, name: e.target.value})} />
            <TextField label="ที่อยู่" fullWidth value={branchForm.address || ''} onChange={e => setBranchForm({...branchForm, address: e.target.value})} />
            <Grid container spacing={2}>
              <Grid item xs={6}><TextField label="เบอร์โทร" fullWidth value={branchForm.phone || ''} onChange={e => setBranchForm({...branchForm, phone: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="อีเมล" fullWidth value={branchForm.email || ''} onChange={e => setBranchForm({...branchForm, email: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="เวลาเปิด" type="time" InputLabelProps={{ shrink: true }} fullWidth value={branchForm.open_time || ''} onChange={e => setBranchForm({...branchForm, open_time: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="เวลาปิด" type="time" InputLabelProps={{ shrink: true }} fullWidth value={branchForm.close_time || ''} onChange={e => setBranchForm({...branchForm, close_time: e.target.value})} /></Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setBranchOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSaveBranch} variant="contained">บันทึก</Button>
        </DialogActions>
      </Dialog>
      
      {/* SMS test — the only way to verify a live SMS provider key is to
          actually send a message (costs money), so ask for a target phone
          number rather than sending to some hardcoded default. */}
      <Dialog open={smsTestDialogOpen} onClose={() => setSmsTestDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ทดสอบส่ง SMS</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            ระบบจะส่ง SMS จริงไปที่เบอร์นี้เพื่อทดสอบการเชื่อมต่อ (มีค่าใช้จ่ายตามปกติ)
          </Typography>
          <TextField
            label="เบอร์โทรศัพท์"
            fullWidth
            autoFocus
            placeholder="08XXXXXXXX"
            value={smsTestPhone}
            onChange={(e) => setSmsTestPhone(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSmsTestDialogOpen(false)}>ยกเลิก</Button>
          <Button
            variant="contained"
            disabled={!smsTestPhone.trim()}
            onClick={() => { setSmsTestDialogOpen(false); runTest('sms', smsTestPhone.trim()); }}
          >
            ส่งทดสอบ
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.title}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>ยกเลิก</Button>
          <Button variant="contained" color="error" onClick={confirmDialog.onConfirm} sx={{ borderRadius: 3, fontWeight: 700 }}>ลบข้อมูล</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SystemSettings;
