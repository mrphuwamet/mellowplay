// Redacts known-sensitive JSON keys before a request/response body is
// written to Api_Call_Logs. This is a best-effort masking layer for
// debugging logs, not a security boundary on its own — don't rely on it as
// the only thing standing between a secret and a log row.
//
// "Contains" matching is deliberately restricted to longer, unambiguous
// substrings (password, token, secret, ...) — a naive substring check
// against something short like "pin" would also mask unrelated keys that
// merely contain those letters (e.g. "opinion", "shipping"), so "pin" gets
// its own narrower exact/suffix check instead.
const SENSITIVE_CONTAINS = [
  'password', 'passwd', 'token', 'secret', 'otp', 'cvv',
  'cardnumber', 'card_number', 'apikey', 'api_key', 'authorization', 'jwt',
];

const MAX_LOGGED_BODY_LENGTH = 5000;
const MASK = '***MASKED***';

function isSensitiveKey(rawKey: string): boolean {
  const key = rawKey.toLowerCase();
  if (key === 'pin' || key === 'pincode' || key.endsWith('_pin') || key.endsWith('pincode')) return true;
  return SENSITIVE_CONTAINS.some(s => key.includes(s));
}

function maskValue(value: any): any {
  if (Array.isArray(value)) return value.map(maskValue);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? MASK : maskValue(v);
    }
    return out;
  }
  return value;
}

function truncate(str: string): string {
  return str.length > MAX_LOGGED_BODY_LENGTH ? `${str.slice(0, MAX_LOGGED_BODY_LENGTH)}...(truncated)` : str;
}

// Returns null for an empty/whitespace-only body (nothing worth logging).
export function maskAndStringifyBody(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return truncate(JSON.stringify(maskValue(parsed)));
  } catch {
    // Not JSON — mask nothing structural (nowhere to look for sensitive
    // keys), just truncate so an oversized non-JSON body can't bloat the row.
    return truncate(raw);
  }
}
