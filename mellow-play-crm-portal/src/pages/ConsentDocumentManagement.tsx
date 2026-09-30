import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, List, ListItem, ListItemText, Paper, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Save as SaveIcon, Gavel as ConsentIcon,
  History as HistoryIcon, Visibility as PreviewIcon, Archive as RetireIcon, Unarchive as RestoreIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL, CONSUMER_APP_URL } from '../config';
import RichTextEditor from '../components/RichTextEditor';
import { copyText } from '../utils/clipboard';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * Consent documents — the wording families are asked to agree to.
 *
 * Written once here and attached to any number of registration forms, rather
 * than retyped into each. That is not only convenience: consent has to be
 * provable, and wording pasted into six forms is six wordings that drift.
 *
 * Editing the words publishes a new version and keeps the old one. A consent
 * given in March stays attached to March's wording, so "what exactly did this
 * family agree to" has an answer after the text has moved on. Nothing here
 * deletes: a retired document is hidden from the form builder and still
 * readable, because consents already collected point at it.
 */

interface ConsentDoc {
  id: number;
  doc_key: string;
  title: string;
  summary: string;
  body_html: string;
  version: number;
  is_active: number;
  show_on_policy_page: number;
  is_required_default: number;
  display_order: number;
  version_count?: number;
  updated_at?: string;
}

interface DocVersion { id: number; version: number; title: string; summary: string; published_at: string }

const emptyDraft = () => ({
  id: 0,
  docKey: '',
  title: '',
  summary: '',
  bodyHtml: '',
  isActive: true,
  showOnPolicyPage: true,
  isRequiredDefault: false,
  displayOrder: 0,
});

type Draft = ReturnType<typeof emptyDraft>;

const ConsentDocumentManagement: React.FC = () => {
  const [docs, setDocs] = useState<ConsentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  /** The wording as it was when the dialog opened — what "changed" is measured against. */
  const [openedWith, setOpenedWith] = useState<{ summary: string; bodyHtml: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [versionsOf, setVersionsOf] = useState<ConsentDoc | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [preview, setPreview] = useState<ConsentDoc | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/consent-documents`);
      setDocs(res.data.documents || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'โหลดเอกสารไม่สำเร็จ');
    } finally { setLoading(false); }
  };
  useEffect(() => { void fetchDocs(); }, []);

  const openCreate = () => {
    setDraft(emptyDraft());
    setOpenedWith(null);
    setEditOpen(true);
  };

  const openEdit = (d: ConsentDoc) => {
    setDraft({
      id: d.id,
      docKey: d.doc_key,
      title: d.title,
      summary: d.summary || '',
      bodyHtml: d.body_html || '',
      isActive: d.is_active !== 0,
      showOnPolicyPage: d.show_on_policy_page !== 0,
      isRequiredDefault: d.is_required_default !== 0,
      displayOrder: d.display_order ?? 0,
    });
    setOpenedWith({ summary: d.summary || '', bodyHtml: d.body_html || '' });
    setEditOpen(true);
  };

  // Shown live while editing, because publishing a version is not undoable and
  // staff should know which kind of save they are about to make before they
  // make it — not from a message afterwards.
  const willPublish = !!openedWith
    && (draft.summary !== openedWith.summary || draft.bodyHtml !== openedWith.bodyHtml);

  const save = async () => {
    if (!draft.title.trim() || !draft.docKey.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (draft.id) {
        const res = await axios.put(`${API_BASE}/consent-documents/${draft.id}`, draft);
        setNotice(willPublish
          ? `บันทึกแล้ว — เผยแพร่เป็นฉบับที่ ${res.data.version} (ผู้ที่เคยยินยอมยังผูกกับฉบับเดิม)`
          : 'บันทึกแล้ว — ข้อความไม่เปลี่ยน จึงยังเป็นฉบับเดิม');
      } else {
        await axios.post(`${API_BASE}/consent-documents`, draft);
        setNotice('สร้างเอกสารแล้ว');
      }
      setEditOpen(false);
      await fetchDocs();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const setActive = async (d: ConsentDoc, active: boolean) => {
    try {
      await axios.post(`${API_BASE}/consent-documents/${d.id}/${active ? 'restore' : 'retire'}`);
      setNotice(active
        ? 'นำกลับมาใช้แล้ว'
        : 'เลิกใช้แล้ว — ฟอร์มใหม่จะเลือกเอกสารนี้ไม่ได้ ส่วนที่เคยยินยอมไว้ยังอยู่ครบ');
      await fetchDocs();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const openVersions = async (d: ConsentDoc) => {
    setVersionsOf(d);
    setVersions([]);
    try {
      const res = await axios.get(`${API_BASE}/consent-documents/${d.id}/versions`);
      setVersions(res.data.versions || []);
    } catch { /* the dialog shows an empty list rather than blocking */ }
  };

  const policyUrl = `${CONSUMER_APP_URL}/pdpa`;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ConsentIcon color="primary" />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>เอกสารความยินยอม (PDPA)</Typography>
            <Typography variant="body2" color="text.secondary">
              เขียนข้อความครั้งเดียว แล้วเลือกใช้ในแบบฟอร์มลงทะเบียนใดก็ได้
            </Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 700 }}>
          สร้างเอกสารใหม่
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        แก้ข้อความแล้วระบบจะเก็บฉบับเดิมไว้ และบันทึกว่าแต่ละคนยินยอมกับฉบับที่เท่าไหร่ จึงย้อนดูได้เสมอว่าใครเห็นข้อความแบบไหน
        · เอกสารที่เปิด "แสดงบนหน้านโยบาย" จะอยู่ที่{' '}
        <Box component="span" sx={{ fontWeight: 700, wordBreak: 'break-all' }}>{policyUrl}</Box>{' '}
        <Button size="small" onClick={() => void copyText(policyUrl).then(() => setNotice('คัดลอกลิงก์แล้ว'))}>คัดลอกลิงก์</Button>
      </Alert>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : docs.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>ยังไม่มีเอกสาร — กด "สร้างเอกสารใหม่"</Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {docs.map(d => (
            <Paper key={d.id} sx={{ p: 2, borderRadius: 3, opacity: d.is_active ? 1 : 0.6 }}>
              <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap">
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 800 }}>{d.title}</Typography>
                    <Chip size="small" label={`ฉบับที่ ${d.version}`} sx={{ fontWeight: 700 }} />
                    {!d.is_active && <Chip size="small" color="default" label="เลิกใช้แล้ว" sx={{ fontWeight: 700 }} />}
                    {!!d.is_required_default && <Chip size="small" color="warning" label="บังคับติ๊ก" sx={{ fontWeight: 700 }} />}
                    {!!d.show_on_policy_page && <Chip size="small" variant="outlined" label="อยู่บนหน้านโยบาย" sx={{ fontWeight: 700 }} />}
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', display: 'block', mb: 0.5 }}>
                    {d.doc_key}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{d.summary}</Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <Tooltip title="ดูตัวอย่างข้อความฉบับเต็ม">
                    <IconButton size="small" onClick={() => setPreview(d)}><PreviewIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title={`ประวัติฉบับ (${d.version_count ?? d.version})`}>
                    <IconButton size="small" onClick={() => void openVersions(d)}><HistoryIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="แก้ไข">
                    <IconButton size="small" color="primary" onClick={() => openEdit(d)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  {/* Retire, never delete — consents already collected point at
                      this document, and a row removed from under them is a
                      consent nobody can produce the wording for. */}
                  <Tooltip title={d.is_active ? 'เลิกใช้ (ฟอร์มใหม่จะเลือกไม่ได้)' : 'นำกลับมาใช้'}>
                    <IconButton size="small" onClick={() => void setActive(d, !d.is_active)}>
                      {d.is_active ? <RetireIcon fontSize="small" /> : <RestoreIcon fontSize="small" color="success" />}
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {/* ── create / edit ── */}
      <Dialog open={editOpen} onClose={() => !saving && setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{draft.id ? 'แก้ไขเอกสารความยินยอม' : 'สร้างเอกสารความยินยอม'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="ชื่อเอกสาร" fullWidth value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              helperText="เช่น การถ่ายภาพ บันทึกวีดิทัศน์ และการเผยแพร่" />

            <TextField label="รหัสเอกสาร (ภาษาอังกฤษ)" fullWidth value={draft.docKey}
              onChange={e => setDraft({ ...draft, docKey: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              helperText="ใช้อ้างอิงในแบบฟอร์มและในลิงก์ เปลี่ยนชื่อเอกสารได้โดยไม่กระทบรหัสนี้ เช่น photography" />

            <TextField label="ข้อความสั้น (แสดงข้างช่องติ๊ก)" fullWidth multiline minRows={2} value={draft.summary}
              onChange={e => setDraft({ ...draft, summary: e.target.value })}
              helperText="บรรทัดเดียวที่คนอ่านแน่ ๆ — ต้องบอกให้ครบว่ากำลังยินยอมเรื่องอะไร" />

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                ข้อความฉบับเต็ม
              </Typography>
              <RichTextEditor
                value={draft.bodyHtml}
                onChange={html => setDraft({ ...draft, bodyHtml: html })}
                uploadFolder="consent-documents"
                placeholder="รายละเอียดว่าเก็บข้อมูลอะไร ใช้ทำอะไร เก็บนานแค่ไหน และถอนความยินยอมได้อย่างไร"
              />
            </Box>

            <Divider />

            <FormControlLabel
              control={<Switch checked={draft.isRequiredDefault}
                onChange={e => setDraft({ ...draft, isRequiredDefault: e.target.checked })} />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>บังคับติ๊กจึงจะส่งฟอร์มได้</Typography>
                  <Typography variant="caption" color="text.secondary">
                    เปิดเฉพาะข้อมูลที่ไม่มีก็ให้บริการไม่ได้จริง ๆ — ความยินยอมที่ปฏิเสธไม่ได้ ไม่ถือเป็นความยินยอม
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={<Switch checked={draft.showOnPolicyPage}
                onChange={e => setDraft({ ...draft, showOnPolicyPage: e.target.checked })} />}
              label={<Typography variant="body2" sx={{ fontWeight: 700 }}>แสดงบนหน้านโยบายสาธารณะ (/pdpa)</Typography>}
            />

            {willPublish && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                ข้อความเปลี่ยน — บันทึกแล้วจะเผยแพร่เป็น <b>ฉบับที่ {(docs.find(d => d.id === draft.id)?.version ?? 1) + 1}</b>{' '}
                ฉบับเดิมจะถูกเก็บไว้ และผู้ที่เคยยินยอมยังคงผูกกับฉบับที่เขาเห็นตอนนั้น
              </Alert>
            )}
            {!!draft.id && !willPublish && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                ยังไม่ได้แก้ข้อความ — บันทึกแล้วจะยังเป็นฉบับเดิม ไม่ต้องขอความยินยอมใหม่
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={() => void save()} disabled={saving || !draft.title.trim() || !draft.docKey.trim()}
            sx={{ fontWeight: 700, borderRadius: 2 }}>
            บันทึก
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── version history ── */}
      <Dialog open={!!versionsOf} onClose={() => setVersionsOf(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>ประวัติฉบับ — {versionsOf?.title}</DialogTitle>
        <DialogContent>
          {versions.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>ยังไม่มีประวัติ</Typography>
          ) : (
            <List dense>
              {versions.map(v => (
                <ListItem key={v.id} divider>
                  <ListItemText
                    primary={<Typography variant="body2" sx={{ fontWeight: 800 }}>
                      ฉบับที่ {v.version}{v.version === versionsOf?.version ? ' (ใช้อยู่)' : ''}
                    </Typography>}
                    secondary={<>
                      <Typography variant="caption" sx={{ display: 'block' }}>{v.summary}</Typography>
                      <Typography variant="caption" color="text.disabled">เผยแพร่ {v.published_at}</Typography>
                    </>}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setVersionsOf(null)} sx={{ fontWeight: 700 }}>ปิด</Button></DialogActions>
      </Dialog>

      {/* ── preview ── */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{preview?.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>{preview?.summary}</Typography>
          <Divider sx={{ mb: 2 }} />
          {/* Admin-authored rich text from the editor above, same as a course
              description — rendered as the markup it is. */}
          <Box sx={{ fontSize: 14, lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: preview?.body_html || '' }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setPreview(null)} sx={{ fontWeight: 700 }}>ปิด</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default ConsentDocumentManagement;
