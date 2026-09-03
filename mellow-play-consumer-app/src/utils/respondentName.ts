// Who is answering a survey, and how the two name boxes become the one name
// that gets stored.
//
// The form asks for ชื่อ and สกุล separately — one box got first names only,
// which cannot be matched back to a person. The stored answer stays a single
// string, because that is what the submission column holds and what the CRM's
// response table and exports read; the join happens once, here, rather than in
// each of the three screens that collect it.

export interface RespondentIdentity {
  mode: 'prefill' | 'manual';
  firstName: string;
  lastName: string;
  phone: string;
}

export const emptyIdentity = (isLoggedIn: boolean): RespondentIdentity => ({
  mode: isLoggedIn ? 'prefill' : 'manual',
  firstName: '',
  lastName: '',
  phone: '',
});

/**
 * The logged-in account as a survey respondent, read once from localStorage.
 *
 * The login API stores the user camelCase (displayName/firstName/lastName),
 * but this object has been reshaped over time and older sessions may still
 * hold snake_case keys — reading only one shape is exactly the bug that made
 * "ใช้ข้อมูลของฉัน" show "-" instead of a name, so both are accepted here and
 * every survey screen reads through this one function.
 */
export const accountIdentity = (): { name: string; phone: string } => {
  try {
    const user = JSON.parse(localStorage.getItem('mellow_user') || 'null');
    if (!user) return { name: '', phone: '' };
    const name =
      user.displayName || user.display_name ||
      [user.firstName || user.first_name, user.lastName || user.last_name]
        .filter(Boolean).join(' ').trim();
    return { name: name || '', phone: user.phone || '' };
  } catch { return { name: '', phone: '' }; }
};

/** The two boxes as one name. Blank when either half is missing. */
export const fullNameOf = (identity: RespondentIdentity): string => {
  const first = identity.firstName.trim();
  const last = identity.lastName.trim();
  if (!first || !last) return '';
  return `${first} ${last}`;
};

/**
 * Whether the typed identity is complete enough to submit.
 *
 * Both halves are required: asking for ชื่อ-สกุล and then accepting one word
 * would put us back where we started. `phoneRequired` follows the survey
 * field's own setting.
 */
export const identityIsComplete = (
  identity: RespondentIdentity,
  opts: { phoneRequired?: boolean } = {}
): boolean => {
  if (!fullNameOf(identity)) return false;
  return !opts.phoneRequired || identity.phone.trim() !== '';
};
