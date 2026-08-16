import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

// The frame the worker wraps every outgoing email in, ported from the backend's
// emailTemplateService.wrapEmailHtml. It lives here so a preview in the CRM
// shows what actually gets sent — the previous copy in CourseNotificationsTab
// had the old frame hard-coded and would have drifted the moment a theme was
// configured.
//
// Keep in sync with mellow-play-backend-api/src/services/emailTemplateService.ts.

export interface EmailTheme {
  mode: 'plain' | 'branded';
  headerImage: string;
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
  headerBg: '#ffffff',
  pageBg: '#f4f5f7',
  cardBg: '#ffffff',
  textColor: '#1f2937',
  footerHtml: '',
  footerBg: '#f8fafc',
};

/** Maps a System_Settings key/value map onto a theme, defaults filling the gaps. */
export function themeFromSettings(map: Record<string, string>): EmailTheme {
  return {
    mode: map['email_template_mode'] === 'branded' ? 'branded' : 'plain',
    headerImage: map['email_header_image'] || DEFAULT_EMAIL_THEME.headerImage,
    headerBg: map['email_header_bg'] || DEFAULT_EMAIL_THEME.headerBg,
    pageBg: map['email_page_bg'] || DEFAULT_EMAIL_THEME.pageBg,
    cardBg: map['email_card_bg'] || DEFAULT_EMAIL_THEME.cardBg,
    textColor: map['email_text_color'] || DEFAULT_EMAIL_THEME.textColor,
    footerHtml: map['email_footer_html'] || DEFAULT_EMAIL_THEME.footerHtml,
    footerBg: map['email_footer_bg'] || DEFAULT_EMAIL_THEME.footerBg,
  };
}

export const EMAIL_THEME_KEYS = [
  'email_template_mode', 'email_header_image', 'email_header_bg', 'email_page_bg',
  'email_card_bg', 'email_text_color', 'email_footer_html', 'email_footer_bg',
] as const;

export function themeToSettings(theme: EmailTheme): Record<string, string> {
  return {
    email_template_mode: theme.mode,
    email_header_image: theme.headerImage,
    email_header_bg: theme.headerBg,
    email_page_bg: theme.pageBg,
    email_card_bg: theme.cardBg,
    email_text_color: theme.textColor,
    email_footer_html: theme.footerHtml,
    email_footer_bg: theme.footerBg,
  };
}

export function wrapEmailHtml(bodyHtml: string, theme: EmailTheme = DEFAULT_EMAIL_THEME): string {
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml;

  // Header and footer exist only in branded mode, and only when there is
  // something to put in them — a branded email with no header configured gets
  // the plain card rather than an empty band of colour.
  const header = theme.mode === 'branded' && theme.headerImage
    ? `<tr><td align="center" style="background-color:${theme.headerBg};padding:20px 24px;border-radius:12px 12px 0 0;">`
      + `<img src="${theme.headerImage}" alt="" width="240" style="display:block;max-width:100%;height:auto;border:0;" />`
      + `</td></tr>`
    : '';

  const footer = theme.mode === 'branded' && theme.footerHtml
    ? `<tr><td style="background-color:${theme.footerBg};padding:20px 28px;border-radius:0 0 12px 12px;`
      + `font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:12px;line-height:1.7;color:#64748b;">`
      + theme.footerHtml
      + `</td></tr>`
    : '';

  const pageBg = theme.mode === 'branded' ? theme.pageBg : DEFAULT_EMAIL_THEME.pageBg;
  const cardBg = theme.mode === 'branded' ? theme.cardBg : DEFAULT_EMAIL_THEME.cardBg;
  const textColor = theme.mode === 'branded' ? theme.textColor : DEFAULT_EMAIL_THEME.textColor;

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>`
    + `<body style="margin:0;padding:0;background-color:${pageBg};">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${pageBg};"><tr>`
    + `<td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${cardBg};border-radius:12px;">`
    + header
    + `<tr>`
    + `<td style="padding:32px 28px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:${textColor};">`
    + bodyHtml
    + `</td></tr>`
    + footer
    + `</table></td></tr></table></body></html>`;
}

/**
 * The saved theme, for previews outside the settings page. Falls back to the
 * plain frame while loading or on error — a preview that fails to fetch should
 * show the default look, not nothing.
 */
export function useEmailTheme(): EmailTheme {
  const [theme, setTheme] = useState<EmailTheme>(DEFAULT_EMAIL_THEME);
  useEffect(() => {
    axios.get(`${API_URL}/api/v1/admin/system/settings`)
      .then(({ data }) => {
        if (!data?.settings) return;
        const map: Record<string, string> = {};
        data.settings.forEach((s: any) => { map[s.key] = s.value; });
        setTheme(themeFromSettings(map));
      })
      .catch(() => { /* keep the plain default */ });
  }, []);
  return theme;
}
