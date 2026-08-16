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
// Just the URL, for a template author who wants to build their own button, put
// the QR behind their own wording, or drop it into a layout of their own — the
// {{qr_code}} block below is opinionated markup and not always what is wanted.
//
// ONE url covering everyone in the checkout, not one per child: a sibling booking
// sends a single email while qr_token is per booking, and a bare URL cannot carry
// two destinations. Returning only the first child's link would look like it
// worked and leave the second child unable to check in. The page splits the tokens
// and shows a QR for each.
export function buildCheckinQrLink(consumerAppUrl: string, qrTokens: string[]): string {
  const usable = qrTokens.filter(Boolean);
  if (usable.length === 0) return '';
  return `${consumerAppUrl}/checkin/${usable.map(t => encodeURIComponent(t)).join(',')}`;
}

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
/**
 * How the frame around an email looks. Loaded from System_Settings by
 * loadEmailTheme below; every field has a default so a missing row renders
 * the plain frame rather than nothing.
 */
export interface EmailTheme {
  mode: 'plain' | 'branded';
  headerImage: string;
  /** Header image width in px. The card is 600 wide, so 600 is edge to edge. */
  headerWidth: number;
  headerBg: string;
  pageBg: string;
  cardBg: string;
  textColor: string;
  footerHtml: string;
  footerBg: string;
}

export const DEFAULT_EMAIL_THEME: EmailTheme = {
  mode: 'plain',
  headerImage: '',
  headerWidth: 240,
  headerBg: '#ffffff',
  pageBg: '#f4f5f7',
  cardBg: '#ffffff',
  textColor: '#1f2937',
  footerHtml: '',
  footerBg: '#f8fafc',
};

/**
 * Reads the theme a super admin configured in the CRM.
 *
 * Defaults to the plain frame on anything missing or unreadable: an email that
 * looks unstyled still gets read, an email that fails to render does not.
 */
// A width outside the card is not a width — it is a broken layout in every
// client that honours it. Anything unparseable falls back to the default.
function clampHeaderWidth(raw: string | null): number {
  const n = parseInt(raw || '', 10);
  if (!Number.isFinite(n)) return DEFAULT_EMAIL_THEME.headerWidth;
  return Math.min(600, Math.max(60, n));
}

export async function loadEmailTheme(settings: { getSetting(key: string): Promise<string | null> }): Promise<EmailTheme> {
  try {
    const [mode, headerImage, headerWidth, headerBg, pageBg, cardBg, textColor, footerHtml, footerBg] = await Promise.all([
      settings.getSetting('email_template_mode'),
      settings.getSetting('email_header_image'),
      settings.getSetting('email_header_width'),
      settings.getSetting('email_header_bg'),
      settings.getSetting('email_page_bg'),
      settings.getSetting('email_card_bg'),
      settings.getSetting('email_text_color'),
      settings.getSetting('email_footer_html'),
      settings.getSetting('email_footer_bg'),
    ]);
    return {
      mode: mode === 'branded' ? 'branded' : 'plain',
      headerImage: headerImage || DEFAULT_EMAIL_THEME.headerImage,
      headerWidth: clampHeaderWidth(headerWidth),
      headerBg: headerBg || DEFAULT_EMAIL_THEME.headerBg,
      pageBg: pageBg || DEFAULT_EMAIL_THEME.pageBg,
      cardBg: cardBg || DEFAULT_EMAIL_THEME.cardBg,
      textColor: textColor || DEFAULT_EMAIL_THEME.textColor,
      footerHtml: footerHtml || DEFAULT_EMAIL_THEME.footerHtml,
      footerBg: footerBg || DEFAULT_EMAIL_THEME.footerBg,
    };
  } catch {
    return DEFAULT_EMAIL_THEME;
  }
}

export function wrapEmailHtml(bodyHtml: string, theme: EmailTheme = DEFAULT_EMAIL_THEME): string {
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml;

  // Header and footer exist only in branded mode, and only when there is
  // something to put in them — a branded email with no header configured gets
  // the plain card rather than an empty band of colour.
  const header = theme.mode === 'branded' && theme.headerImage
    ? `<tr><td align="center" style="background-color:${theme.headerBg};padding:20px 24px;border-radius:12px 12px 0 0;">
<img src="${theme.headerImage}" alt="" width="${theme.headerWidth}" style="display:block;width:${theme.headerWidth}px;max-width:100%;height:auto;border:0;" />
</td></tr>`
    : '';

  const footer = theme.mode === 'branded' && theme.footerHtml
    ? `<tr><td style="background-color:${theme.footerBg};padding:20px 28px;border-radius:0 0 12px 12px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:12px;line-height:1.7;color:#64748b;">
${theme.footerHtml}
</td></tr>`
    : '';

  const pageBg = theme.mode === 'branded' ? theme.pageBg : DEFAULT_EMAIL_THEME.pageBg;
  const cardBg = theme.mode === 'branded' ? theme.cardBg : DEFAULT_EMAIL_THEME.cardBg;
  const textColor = theme.mode === 'branded' ? theme.textColor : DEFAULT_EMAIL_THEME.textColor;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:${pageBg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${pageBg};">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${cardBg};border-radius:12px;">
${header}
<tr>
<td style="padding:32px 28px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:${textColor};">
${bodyHtml}
</td>
</tr>
${footer}
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
