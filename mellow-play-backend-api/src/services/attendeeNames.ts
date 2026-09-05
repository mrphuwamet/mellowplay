/**
 * Who is actually coming, according to the registration form.
 *
 * A form-based registration can ask outright who will attend — a
 * family_member_picker with `config.role` of 'child' or 'adult'. When it does,
 * that answer is the attendee, not the child the seat happens to be booked
 * under. The two are often the same person and quietly diverge when they are
 * not: on live data, four bookings had been corrected in the registration and
 * one of them had the check-in roster calling out the MOTHER's nickname while
 * the child who came was somebody else entirely.
 *
 * The booking list and the scanner card already led with the form's answer.
 * The roster on the check-in screen did not, because it read HD_Profiles and
 * nothing else — so an edit changed one screen and not the other. This is that
 * resolution written once, for every screen to share.
 *
 * Bulk on purpose: a roster asks about a whole round at once, and one query per
 * row would be sixty round trips to render one list.
 */

export interface FormNames {
  child_name?: string;
  child_real_name?: string;
  child_nickname?: string;
  parent_name?: string;
  parent_real_name?: string;
  parent_nickname?: string;
}

/** D1 caps bound parameters per statement; the roster can exceed it on its own. */
const PARAM_CHUNK = 90;

export async function resolveFormNames(
  db: D1Database,
  submissionIds: (number | null | undefined)[],
): Promise<Map<number, FormNames>> {
  const ids = Array.from(new Set(submissionIds.map(Number).filter(id => Number.isFinite(id) && id > 0)));
  const out = new Map<number, FormNames>();
  if (ids.length === 0) return out;

  const submissions: { id: number; form_id: number; answers_json: string }[] = [];
  for (let i = 0; i < ids.length; i += PARAM_CHUNK) {
    const chunk = ids.slice(i, i + PARAM_CHUNK);
    const { results } = await db.prepare(
      `SELECT id, form_id, answers_json FROM Form_Submissions WHERE id IN (${chunk.map(() => '?').join(',')})`
    ).bind(...chunk).all<any>();
    submissions.push(...(results as any[]));
  }
  if (submissions.length === 0) return out;

  // Field definitions once per form, not once per submission — a whole round
  // usually shares a single form.
  const fieldsByForm = new Map<number, { field_key: string; config_json: string | null }[]>();
  for (const formId of Array.from(new Set(submissions.map(s => s.form_id)))) {
    const { results } = await db.prepare(
      `SELECT field_key, config_json FROM Registration_Form_Fields
        WHERE form_id = ? AND type = 'family_member_picker'
        ORDER BY page_index ASC, field_index ASC`
    ).bind(formId).all<any>();
    fieldsByForm.set(formId, results as any[]);
  }

  for (const s of submissions) {
    const fields = fieldsByForm.get(s.form_id) || [];
    if (fields.length === 0) continue;

    let answers: Record<string, any> = {};
    try { answers = JSON.parse(s.answers_json || '{}'); } catch { /* one bad row must not blank a whole roster */ }

    const names: FormNames = {};
    for (const f of fields) {
      let role: string | undefined;
      try { role = JSON.parse(f.config_json || '{}').role; } catch { /* ignore malformed config */ }
      const value = answers[f.field_key];
      if (value == null || String(value).trim() === '') continue;

      // The real name rides in a sibling key; submissions predating it have
      // none, and the caller then keeps whatever it already had.
      const realName = answers[`${f.field_key}__realname`];

      // The NICKNAME is the display value itself, not the __nickname sibling.
      //
      // The consumer writes the two identically, so the sibling never carried
      // anything extra — but the CRM's edit path updated __realname and left
      // __nickname alone, so on a corrected booking it holds the PREVIOUS
      // person's nickname. Four live bookings had exactly that: display
      // "ขวัญข้าว", __realname "ขวัญชนก ชั่งทอง", and __nickname still "แม่นก".
      // Reading the display value cannot go stale, because it is the answer
      // itself rather than a copy of it.
      if (role === 'child') {
        names.child_name = String(value);
        names.child_nickname = String(value);
        if (realName) names.child_real_name = String(realName);
      } else if (role === 'adult') {
        names.parent_name = String(value);
        names.parent_nickname = String(value);
        if (realName) names.parent_real_name = String(realName);
      }
    }
    if (Object.keys(names).length > 0) out.set(s.id, names);
  }

  return out;
}
