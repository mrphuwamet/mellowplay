/**
 * The pass an invite link leaves behind.
 *
 * A CRM admin issues a link for one course and round, the visitor clears its
 * PIN once, and this is what says so afterwards — scoped per course, so an
 * invite to one class never speaks for another.
 *
 * Three screens read it and they must agree: InviteAccess writes it, and both
 * the class detail page and the booking flow send it to unlock the reserved
 * seats on the invited round — the detail page also uses it to let someone
 * register past a closed sign-up date.
 * It lived as a copy-pasted key builder in two of those before this file.
 */

const key = (courseId: number) => `mellow_invite_session_${courseId}`;

export interface InviteSession {
  sessionToken: string;
  expiresAt: number;
}

export const saveInviteSession = (courseId: number, sessionToken: string, expiresInSeconds: number): void => {
  try {
    localStorage.setItem(key(courseId), JSON.stringify({
      sessionToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    } satisfies InviteSession));
  } catch {
    // A private window with storage blocked. The booking still works; it just
    // cannot see the reserved seats, which is the safe direction to fail.
  }
};

/** The live token for this course, or null — expired counts as none. */
export const loadInviteSessionToken = (courseId: number | undefined | null): string | null => {
  if (!courseId) return null;
  try {
    const raw = localStorage.getItem(key(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InviteSession;
    if (!parsed.sessionToken || parsed.expiresAt < Date.now()) return null;
    return parsed.sessionToken;
  } catch {
    return null;
  }
};

/** Whether this visitor is holding an invite to this course. */
export const hasInviteSession = (courseId: number | undefined | null): boolean =>
  loadInviteSessionToken(courseId) !== null;
