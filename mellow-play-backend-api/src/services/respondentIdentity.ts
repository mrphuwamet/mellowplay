/**
 * Who is "the same person" across several survey submissions.
 *
 * A before/after comparison lives or dies on this. The obvious keys both fail
 * on real data:
 *   - user_id: a parent account answers once per child, so one account is
 *     several people;
 *   - phone: siblings type the parent's number, so one phone is several
 *     people — and most guests type no phone at all.
 * The one thing every submission carries is the name the respondent typed,
 * and a session already treats that name as the identity (require_unique_name
 * blocks a second run under the same name). So the name is the primary key
 * here, and the account or phone only steps in to forgive a typo: two names
 * a couple of letters apart under the same phone or account are one person
 * who mistyped, not two.
 *
 * The CRM keeps a copy of this file (crm-portal/src/utils/respondentIdentity.ts);
 * the two must agree or the round numbers the server stores will not match
 * the pairs the comparison view draws.
 */

export interface RespondentRow {
  id: number | string;
  user_id?: number | null;
  respondent_name?: string | null;
  respondent_phone?: string | null;
  /** One sitting of a session. Two rows from one sitting are one attempt, not two. */
  session_run_id?: string | null;
  created_at?: string | null;
}

// Same normalisation the session's unique-name rule uses: "สมชาย  ใจดี" and
// "สมชาย ใจดี" are one person.
export const normalizeName = (name: string | null | undefined): string =>
  (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizePhone = (phone: string | null | undefined): string => (phone ?? '').replace(/\D/g, '');

/** How many typed characters may differ before two names stop being a typo of each other. */
export const TYPO_DISTANCE = 2;

// Levenshtein, small inputs only (names), so the plain O(n·m) table is fine.
export const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
};

const shareContact = (a: RespondentRow, b: RespondentRow): boolean => {
  if (a.user_id != null && b.user_id != null) return a.user_id === b.user_id;
  const pa = normalizePhone(a.respondent_phone);
  return pa !== '' && pa === normalizePhone(b.respondent_phone);
};

/** True when two submissions were made by the same respondent. */
export const sameRespondent = (a: RespondentRow, b: RespondentRow): boolean => {
  const na = normalizeName(a.respondent_name);
  const nb = normalizeName(b.respondent_name);
  if (na && nb) {
    if (na === nb) return true;
    // A different name under the same contact is a sibling unless it is
    // nearly the same name, in which case it is a typo.
    return shareContact(a, b) && editDistance(na, nb) <= TYPO_DISTANCE;
  }
  // No name on either side: the account or phone is all there is to go on.
  if (!na && !nb) return shareContact(a, b);
  // A name on one side only — nothing says they are the same person.
  return false;
};

/**
 * Partitions submissions into respondents. Returns, per row id, a key shared
 * by every row of the same person (the smallest id in the group). Pairwise
 * over a form's rows — a few hundred at most — so the quadratic pass is fine.
 */
export const groupRespondents = <T extends RespondentRow>(rows: T[]): Map<T['id'], string> => {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (find(i) !== find(j) && sameRespondent(rows[i], rows[j])) parent[find(j)] = find(i);
    }
  }
  const keyOfRoot = new Map<number, string>();
  const out = new Map<T['id'], string>();
  rows.forEach((row, i) => {
    const root = find(i);
    let key = keyOfRoot.get(root);
    if (!key) {
      const ids = rows.filter((_, k) => find(k) === root).map(r => Number(r.id)).filter(n => !isNaN(n));
      key = `r${ids.length ? Math.min(...ids) : row.id}`;
      keyOfRoot.set(root, key);
    }
    out.set(row.id, key);
  });
  return out;
};

const sittingOf = (row: RespondentRow): string => row.session_run_id || `row:${row.id}`;

/**
 * Which round each submission is, for its respondent: 1 for the first sitting,
 * 2 for the next, and so on, in time order. Rows from one sitting (a session
 * run that submitted twice) share a number.
 */
export const attemptNumbers = <T extends RespondentRow>(rows: T[]): Map<T['id'], number> => {
  const group = groupRespondents(rows);
  const ordered = [...rows].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '') || Number(a.id) - Number(b.id));
  const sittingsSeen = new Map<string, Map<string, number>>(); // group → sitting → attempt
  const out = new Map<T['id'], number>();
  for (const row of ordered) {
    const g = group.get(row.id)!;
    const seen = sittingsSeen.get(g) ?? new Map<string, number>();
    const sitting = sittingOf(row);
    if (!seen.has(sitting)) seen.set(sitting, seen.size + 1);
    sittingsSeen.set(g, seen);
    out.set(row.id, seen.get(sitting)!);
  }
  return out;
};
