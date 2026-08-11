// Email counterpart to smsTemplateService.ts. Same {{key}} placeholders and
// the same "leave unknown keys as-is so a typo is visible" rule, with one
// critical difference: values are HTML-escaped before substitution.
//
// SMS templates drop raw text into a plain-text message where nothing can be
// misread as markup. An email body is HTML, and the values substituted into it
// include customer-supplied form answers (see the answers_json loop in
// bookingNotificationService). An unescaped "&" or "<" from a customer answer
// would corrupt the message at best; an answer containing a tag would inject
// arbitrary markup into mail sent from our own domain. Escaping the values
// while leaving the staff-authored template untouched keeps the CRM's
// formatting working and makes the customer data inert.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// `rawVariables` are substituted without escaping. The escaping above exists to
// neutralise CUSTOMER-supplied values (form answers, names); a raw variable is
// markup this server generated itself — the check-in QR block, which is a table
// of buttons and cannot survive being escaped. Nothing reaching rawVariables may
// come from a request body.
export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>,
  rawVariables: Record<string, string> = {},
): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    if (key in rawVariables) return rawVariables[key];
    const value = variables[key];
    return value != null ? escapeHtml(value) : match;
  });
}

// The check-in block for a confirmation email: one button per booking, because a
// sibling checkout sends ONE email to the shared parent while qr_token is per
// booking. Rendering only the first would leave the second child unable to check
// in — the kind of thing that only shows up at the venue.
//
// A link rather than the QR image itself: an inlined data: URI is stripped by
// Gmail and Outlook, and a QR drawn as an HTML table gets inverted by those
// clients' dark modes (which stops many scanners reading it) and mis-rounded by
// Outlook's Word renderer. A button always works, and the page it opens shows the
// QR full-size on the phone the attendee is holding at the door anyway.
export function buildCheckinQrBlock(
  consumerAppUrl: string,
  entries: { childName: string; qrToken: string }[],
): string {
  const usable = entries.filter(e => e.qrToken);
  if (usable.length === 0) return '';

  const buttons = usable.map(e => {
    const url = `${consumerAppUrl}/checkin/${encodeURIComponent(e.qrToken)}`;
    const label = e.childName ? `QR เช็คอินของ ${escapeHtml(e.childName)}` : 'QR เช็คอิน';
    return `<tr><td style="padding:4px 0;"><a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:800;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none;">${label}</a></td></tr>`;
  }).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td style="font-size:14px;color:#475569;padding-bottom:8px;">กรุณาแสดง QR Code นี้ให้เจ้าหน้าที่ที่จุดลงทะเบียน</td></tr>${buttons}</table>`;
}

// The subject line is plain text, so it takes the raw value — escaping here
// would show a literal "&amp;" in the recipient's inbox list.
export function renderEmailSubject(template: string, variables: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
      const value = variables[key];
      return value != null ? value : match;
    })
    // RFC 5322 caps a subject at 998 characters, and a newline in a header
    // would end it early and let the rest be parsed as more headers.
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 998);
}

// The CRM edits a body fragment (TipTap emits `<p>…</p>`, not a document), but
// a mail client needs a full document with a declared charset — without it
// Thai text renders as mojibake in several clients. The wrapper stays
// deliberately plain: inline styles on a single centred container, no external
// CSS and no flex/grid, because Outlook's Word-based renderer supports
// neither. `wrapEmailHtml` is idempotent-ish: a body that already looks like a
// full document is passed through so a hand-written HTML template still works.
export function wrapEmailHtml(bodyHtml: string): string {
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;">
<tr>
<td style="padding:32px 28px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">
${bodyHtml}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
