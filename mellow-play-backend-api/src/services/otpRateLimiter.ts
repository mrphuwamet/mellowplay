// Cheap KV-backed guards so a bored user (or an attacker) can't rack up SMS
// charges by mashing "resend OTP", or brute-force a 6-digit code before it
// expires. Shared by every OTP-issuing flow (registration, forgot-password,
// phone change).
// Cloudflare KV rejects any expirationTtl below 60 seconds.
const COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

export async function enforceOtpRequestLimit(
  kv: KVNamespace,
  identifier: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cooldownKey = `otp_cooldown:${identifier}`;
  if (await kv.get(cooldownKey)) {
    return {
      ok: false,
      message: `กรุณารอ ${COOLDOWN_SECONDS} วินาทีก่อนขอรหัส OTP ใหม่อีกครั้ง (Please wait before requesting another OTP)`,
    };
  }

  const countKey = `otp_hourly_count:${identifier}`;
  const count = parseInt((await kv.get(countKey)) || '0', 10);
  if (count >= MAX_REQUESTS_PER_HOUR) {
    return {
      ok: false,
      message: 'คุณขอรหัส OTP บ่อยเกินไป กรุณาลองใหม่ภายใน 1 ชั่วโมง (Too many OTP requests, please try again later)',
    };
  }

  await kv.put(cooldownKey, '1', { expirationTtl: COOLDOWN_SECONDS });
  await kv.put(countKey, String(count + 1), { expirationTtl: 3600 });
  return { ok: true };
}

// Call before comparing a submitted OTP against the stored one. Returns
// ok:false once too many wrong guesses have been made against this
// specific OTP session, forcing the user to request a fresh code instead
// of letting them keep guessing against the same one.
export async function enforceOtpVerifyLimit(
  kv: KVNamespace,
  otpKey: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const attemptsKey = `${otpKey}:attempts`;
  const attempts = parseInt((await kv.get(attemptsKey)) || '0', 10);
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await kv.delete(otpKey);
    await kv.delete(attemptsKey);
    return {
      ok: false,
      message: 'กรอกรหัส OTP ผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่ (Too many incorrect attempts — please request a new OTP)',
    };
  }
  await kv.put(attemptsKey, String(attempts + 1), { expirationTtl: 300 });
  return { ok: true };
}

export async function clearOtpVerifyAttempts(kv: KVNamespace, otpKey: string): Promise<void> {
  await kv.delete(`${otpKey}:attempts`);
}
