/**
 * Copy text, and say whether it worked.
 *
 * Every copy button in the CRM called `navigator.clipboard.writeText` without
 * awaiting it and then announced success. That call returns a promise which
 * rejects on a permissions refusal, in an iframe without clipboard-write, and
 * on any non-HTTPS origin — where `navigator.clipboard` is not even defined.
 * Nothing caught it, so "คัดลอกลิงก์แล้ว" appeared over an empty clipboard.
 *
 * There is a fallback for those cases: a hidden textarea and the old
 * execCommand, which is deprecated but still the only thing that works without
 * the async API. It has to be in the document and selected to copy, hence the
 * appended element rather than an off-screen constant.
 *
 * Never rejects. A caller gets true or false and must tell the truth with it —
 * the whole point is that a failed copy stops looking like a successful one.
 */
export const copyText = async (text: string): Promise<boolean> => {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — a rejection here is exactly the case the fallback is for.
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but still rendered: display:none or visibility:hidden makes
    // the selection empty and the copy silently no-op.
    area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
    area.setAttribute('readonly', '');
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length); // iOS ignores select() on its own
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};
