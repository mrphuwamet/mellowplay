// {{key}} substitution — unknown keys are left as-is rather than blanked
// out, so a typo'd placeholder is obvious in the sent message instead of
// silently disappearing.
export function renderSmsTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}

const THAI_MONTHS_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// scheduled_at is stored as plain "YYYY-MM-DD HH:mm" (or with a "T"
// separator), no timezone — parsed by regex instead of `new Date(...)` so
// this can't get shifted by the Worker's UTC runtime clock. Falls back to
// the raw string if the shape doesn't match rather than showing nothing.
export function formatThaiDateTime(raw: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(raw || '');
  if (!match) return raw || '';
  const [, y, m, d, hh, mm] = match;
  const buddhistYear = parseInt(y, 10) + 543;
  const monthAbbr = THAI_MONTHS_ABBR[parseInt(m, 10) - 1] || m;
  return `วันที่ ${parseInt(d, 10)} ${monthAbbr} ${buddhistYear} เวลา ${hh}:${mm}น.`;
}

// Every name-related variable a template can use — both a role's real name
// and nickname exposed separately (per-course/per-send choice of which to
// actually use) plus the nickname-preferred default each already had.
export function buildNameVariables(row: {
  child_name?: string | null; child_real_name?: string | null; child_nickname?: string | null;
  parent_name?: string | null; parent_real_name?: string | null; parent_nickname?: string | null;
}): Record<string, string> {
  return {
    child_name: row.child_name ?? '',
    child_real_name: row.child_real_name ?? '',
    child_nickname: row.child_nickname || row.child_real_name || '',
    parent_name: row.parent_name ?? '',
    parent_real_name: row.parent_real_name ?? '',
    parent_nickname: row.parent_nickname || row.parent_real_name || '',
  };
}

/**
 * A form's answers as template variables, with the name siblings filled in.
 *
 * A family_member_picker writes three keys — the display name, `__realname` and
 * `__nickname` — but only since the app started doing so. A submission made
 * before that, or through any path that wrote just the plain answer, leaves a
 * template referencing {{field__realname}} with nothing to resolve, and the
 * parent receives the raw token. The plain answer IS a name, so it stands in.
 */
export function expandFormAnswerVariables(answers: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    out[key] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }
  for (const [key, value] of Object.entries(out)) {
    if (key.endsWith('__realname') || key.endsWith('__nickname')) continue;
    if (!value) continue;
    if (out[`${key}__realname`] === undefined) out[`${key}__realname`] = value;
    if (out[`${key}__nickname`] === undefined) out[`${key}__nickname`] = value;
  }
  return out;
}

/**
 * Removes any {{token}} still standing after rendering.
 *
 * Only ever called on the way out to a real recipient. A template can outlive
 * the field it names — a form question renamed or deleted — and what the parent
 * then receives is "ผู้ปกครอง {{83b44ae9-...__realname}}". A gap reads as a
 * layout slip; a raw token reads as a broken system. Previews deliberately do
 * not do this, so whoever is writing the template still sees the mistake.
 */
export function stripUnresolvedTokens(text: string): string {
  return text.replace(/\{\{\s*[\w.-]+\s*\}\}/g, '').replace(/[ \t]{2,}/g, ' ');
}

/**
 * Where to go, for the confirmation and the reminder.
 *
 * Falls back to the branch address when the item does not name its own venue:
 * most classes happen at the branch, and only the ones held elsewhere bother
 * filling the field in. An empty {{location}} in a message that promises an
 * address is worse than the branch's.
 */
export function buildLocationVariables(row: {
  course_location?: string | null; course_location_link?: string | null;
  branch_address?: string | null; branch_name?: string | null;
}): Record<string, string> {
  const location = (row.course_location || '').trim()
    || (row.branch_address || '').trim()
    || (row.branch_name || '').trim();
  return {
    location,
    location_link: (row.course_location_link || '').trim(),
  };
}
