import React, { useState } from 'react';
import {
  Box, Grid, Typography, Switch, FormControlLabel, Button, TextField, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Alert,
} from '@mui/material';
import SmsTemplateEditor from './SmsTemplateEditor';
import SmsPreviewBubble from './SmsPreviewBubble';
import RichTextEditor from './RichTextEditor';

// Mirrors the backend's renderSmsTemplate / renderEmailTemplate /wrapEmailHtml so
// both previews render locally with no round-trip, the same way
// CourseManagement and SmsNotifications already keep a copy of the SMS renderer.
// Kept in step with mellow-play-backend-api/src/services/emailTemplateService.ts.
function renderSmsTemplateLocal(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Variable values are escaped, the staff-authored template is not — the same
// split the backend makes, and the reason the preview has to use this instead of
// the SMS renderer: a customer's form answer containing "<" would otherwise
// look fine here and corrupt the real email.
function renderEmailTemplateLocal(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value != null ? value.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]) : match;
  });
}

function wrapEmailHtmlLocal(bodyHtml: string): string {
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml;
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>`
    + `<body style="margin:0;padding:0;background-color:#f4f5f7;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;"><tr>`
    + `<td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;"><tr>`
    + `<td style="padding:32px 28px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">`
    + bodyHtml
    + `</td></tr></table></td></tr></table></body></html>`;
}

const DEFAULT_SUBJECT = 'ยืนยันการลงทะเบียน {{course_name}}';

export interface CourseNotificationsValue {
  smsSuccessEnabled: boolean;
  smsSuccessTemplate: string;
  smsReminderTemplate: string;
  emailSuccessEnabled: boolean;
  emailSuccessSubject: string;
  emailSuccessTemplate: string;
}

interface CourseNotificationsTabProps {
  value: CourseNotificationsValue;
  onChange: (patch: Partial<CourseNotificationsValue>) => void;
  builtins: React.ComponentProps<typeof SmsTemplateEditor>['builtins'];
  formFields: React.ComponentProps<typeof SmsTemplateEditor>['formFields'];
  /** Sample values for both previews, built by the page from the course's form. */
  sampleVariables: Record<string, string>;
}

// SMS and email live in one place because they are two channels for the same
// event — a booking confirmation. Split across separate screens it is easy to
// configure email and not notice SMS is still on, and send a parent both.
const CourseNotificationsTab: React.FC<CourseNotificationsTabProps> = ({
  value, onChange, builtins, formFields, sampleVariables,
}) => {
  const [smsPreviewField, setSmsPreviewField] = useState<'smsSuccessTemplate' | 'smsReminderTemplate' | null>(null);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailBodyTab, setEmailBodyTab] = useState<'wysiwyg' | 'html'>('wysiwyg');

  const bothOn = value.smsSuccessEnabled && value.emailSuccessEnabled;
  const noneOn = !value.smsSuccessEnabled && !value.emailSuccessEnabled;

  const previewHtml = wrapEmailHtmlLocal(renderEmailTemplateLocal(value.emailSuccessTemplate, sampleVariables));
  const previewSubject = renderSmsTemplateLocal(value.emailSuccessSubject || DEFAULT_SUBJECT, sampleVariables);

  return (
    <Box>
      {/* Stating the combination out loud, because the two switches are
          independent and "both" is a valid but easy-to-miss configuration. */}
      {bothOn && (
        <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
          เปิดทั้ง SMS และอีเมล — ผู้ปกครองจะได้รับทั้งสองช่องทางเมื่อจองสำเร็จ
        </Alert>
      )}
      {noneOn && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2 }}>
          ยังไม่เปิดช่องทางใดเลย — จองสำเร็จแล้วผู้ปกครองจะไม่ได้รับการยืนยันอัตโนมัติ
        </Alert>
      )}

      <Grid container spacing={2.5}>
        {/* ── SMS ─────────────────────────────────────────────────────────── */}
        <Grid item xs={12}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 0.5 }}>SMS</Typography>
          {/* Fires from the same place the system already sends its "booking
              confirmed" Discord notice (both the pay-now path and the Beam
              webhook). Templates can reference the builtin variables and every
              field on the registration form attached to this course — click a
              chip to insert at the cursor. The reminder box is only a default;
              it can be edited again when actually sending from the
              "ส่งแจ้งเตือน" page. */}
          <FormControlLabel
            control={
              <Switch
                checked={value.smsSuccessEnabled}
                onChange={e => onChange({ smsSuccessEnabled: e.target.checked })}
              />
            }
            label="เปิดใช้งาน SMS แจ้งจองสำเร็จ"
          />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>ข้อความ SMS จองสำเร็จ</Typography>
          <SmsTemplateEditor
            value={value.smsSuccessTemplate}
            onChange={text => onChange({ smsSuccessTemplate: text })}
            placeholder="เช่น สวัสดีคุณ [ชื่อผู้ปกครอง] การจอง [ชื่อคอร์ส/กิจกรรม] สำหรับ [ชื่อเด็ก] วันที่ [วันเวลานัดหมาย] สำเร็จแล้วค่ะ"
            builtins={builtins}
            formFields={formFields}
          />
          <Button size="small" onClick={() => setSmsPreviewField('smsSuccessTemplate')} disabled={!value.smsSuccessTemplate.trim()} sx={{ mt: 1, textTransform: 'none' }}>
            Preview
          </Button>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>ข้อความ SMS แจ้งเตือนล่วงหน้า (ค่าเริ่มต้น)</Typography>
          <SmsTemplateEditor
            value={value.smsReminderTemplate}
            onChange={text => onChange({ smsReminderTemplate: text })}
            placeholder="ใช้เป็นข้อความตั้งต้นที่หน้า ส่งแจ้งเตือน แก้ไขได้อีกครั้งก่อนส่งจริงทุกครั้ง"
            builtins={builtins}
            formFields={formFields}
          />
          <Button size="small" onClick={() => setSmsPreviewField('smsReminderTemplate')} disabled={!value.smsReminderTemplate.trim()} sx={{ mt: 1, textTransform: 'none' }}>
            Preview
          </Button>
        </Grid>

        <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>

        {/* ── Email ───────────────────────────────────────────────────────── */}
        <Grid item xs={12}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 0.5 }}>อีเมล</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={value.emailSuccessEnabled}
                onChange={e => onChange({ emailSuccessEnabled: e.target.checked })}
              />
            }
            label="เปิดใช้งานอีเมลแจ้งจองสำเร็จ"
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            ใช้ตัวแปรชุดเดียวกับ SMS ({'{{'}parent_name{'}}'}, {'{{'}course_name{'}}'} ฯลฯ)
            ถ้าผู้ปกครองไม่มีอีเมลในระบบ ระบบจะส่ง SMS ให้แทนอัตโนมัติ
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="หัวเรื่องอีเมล (Subject)"
            fullWidth
            size="small"
            value={value.emailSuccessSubject}
            onChange={e => onChange({ emailSuccessSubject: e.target.value })}
            placeholder={DEFAULT_SUBJECT}
            helperText={`เว้นว่างไว้จะใช้ "${DEFAULT_SUBJECT}"`}
          />
        </Grid>

        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>เนื้อหาอีเมล</Typography>
            <Tabs
              value={emailBodyTab}
              onChange={(_, v) => setEmailBodyTab(v)}
              sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0, textTransform: 'none', fontSize: 12, fontWeight: 700 } }}
            >
              <Tab value="wysiwyg" label="แก้แบบเห็นภาพ" />
              <Tab value="html" label="HTML" />
            </Tabs>
          </Box>

          {/* Two views over one field. The visual editor covers everyone; the raw
              tab is there because an email body sometimes has to be pasted in
              from a designed template, which a WYSIWYG would mangle. */}
          {emailBodyTab === 'wysiwyg' ? (
            <RichTextEditor
              value={value.emailSuccessTemplate}
              onChange={html => onChange({ emailSuccessTemplate: html })}
              placeholder="เช่น สวัสดีคุณ {{parent_name}} การลงทะเบียน {{course_name}} สำหรับ {{child_name}} เสร็จสมบูรณ์แล้วค่ะ"
              uploadFolder="course-email"
            />
          ) : (
            <TextField
              fullWidth
              multiline
              minRows={10}
              value={value.emailSuccessTemplate}
              onChange={e => onChange({ emailSuccessTemplate: e.target.value })}
              placeholder="<p>สวัสดีคุณ {{parent_name}}</p>"
              InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
            />
          )}

          <Button
            size="small"
            onClick={() => setEmailPreviewOpen(true)}
            disabled={!value.emailSuccessTemplate.trim()}
            sx={{ mt: 1, textTransform: 'none' }}
          >
            Preview อีเมล
          </Button>
        </Grid>
      </Grid>

      {/* SMS preview — unchanged from the course form it moved out of. */}
      <Dialog open={!!smsPreviewField} onClose={() => setSmsPreviewField(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Preview ข้อความ SMS</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, textAlign: 'center' }}>
            แสดงด้วยข้อมูลตัวอย่าง (ไม่มีการจองจริงให้อ้างอิงในหน้านี้)
          </Typography>
          <SmsPreviewBubble
            message={renderSmsTemplateLocal((smsPreviewField && value[smsPreviewField]) || '', sampleVariables)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSmsPreviewField(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={emailPreviewOpen} onClose={() => setEmailPreviewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Preview อีเมล</DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            แสดงด้วยข้อมูลตัวอย่าง — หัวเรื่องและเนื้อหาถูกแทนค่าตัวแปรแล้ว
          </Typography>
          <Box sx={{ p: 1.5, bgcolor: 'grey.100', borderRadius: 1.5, mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>หัวเรื่อง</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{previewSubject}</Typography>
          </Box>
          {/* An iframe, not dangerouslySetInnerHTML: the body is a full document
              with its own <table> layout and inline styles, and rendering it
              inline would let the CRM's own stylesheet reach into it and show a
              layout the recipient will not get. sandbox="" also stops anything
              in a pasted HTML template from executing here. */}
          <Box
            component="iframe"
            title="email-preview"
            sandbox=""
            srcDoc={previewHtml}
            sx={{ width: '100%', height: 420, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#f4f5f7' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailPreviewOpen(false)}>ปิด</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CourseNotificationsTab;
