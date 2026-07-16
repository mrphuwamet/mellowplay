// A 4xx from our own API has a specific, actionable message (wrong OTP,
// rate limited, phone already used, etc.) — trust it as-is. A 5xx, or no
// response at all (network/timeout), isn't something the user can fix by
// just retrying with different input, so point them at support instead of
// leaving them stuck on a generic/raw error with no way forward.
export const getOtpErrorMessage = (err: any, lang: 'th' | 'en', fallbackMessage: string): string => {
  const status = err?.response?.status;
  const backendMessage = err?.response?.data?.message;
  const baseMessage = backendMessage || fallbackMessage;
  const isServerOrNetworkError = !status || status >= 500;
  if (!isServerOrNetworkError) return baseMessage;

  const contactHint = lang === 'en'
    ? 'Please contact admin via LINE: @mellowplay'
    : 'โปรดติดต่อแอดมิน LINE: @mellowplay';
  return `${baseMessage} (${contactHint})`;
};
