/**
 * Thai phone numbers, as this app stores and checks them.
 *
 * One rule everywhere: the stored value is digits and nothing else. A number
 * typed as "081-234-5678", pasted from a contact card as "081 234 5678", or
 * filled in from the account as "0812345678" all have to come out identical,
 * because staff look a family up by that string and an SMS is addressed with
 * it. Formatting is a display choice; it must never reach the database.
 */

/** Digits only, capped at 10 — the longest a Thai number gets. */
export const digitsOnly = (raw: unknown): string =>
  String(raw ?? '').replace(/\D/g, '').slice(0, 10);

/**
 * Whether this is a number someone could actually be rung on.
 *
 * Ten digits for a mobile (08x, 09x, 06x) and for a Bangkok landline written
 * with its area code; nine for the older provincial landlines still on file.
 * Leading zero required, which is what separates a phone number from the nine
 * digits of a national ID someone pasted into the wrong box.
 */
export const isCallablePhone = (raw: unknown): boolean => /^0\d{8,9}$/.test(digitsOnly(raw));

/** 081-234-5678, for reading — never for storing. */
export const formatPhone = (raw: unknown): string => {
  const d = digitsOnly(raw);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
};
