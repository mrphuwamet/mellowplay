const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "dd mmm yyyy" (style='short') or "dd mmmm yyyy" (style='full'), consistent
// across the app regardless of browser/locale — Thai years are Buddhist era.
export const formatCustomDate = (
  dateInput: string | Date | null | undefined,
  lang: 'th' | 'en' = 'th',
  style: 'short' | 'full' = 'short'
): string => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const months = lang === 'th'
    ? (style === 'full' ? TH_MONTHS_FULL : TH_MONTHS_SHORT)
    : (style === 'full' ? EN_MONTHS_FULL : EN_MONTHS_SHORT);
  const year = lang === 'th' ? d.getFullYear() + 543 : d.getFullYear();
  return `${day} ${months[d.getMonth()]} ${year}`;
};

/**
 * Time of day, always 24-hour.
 *
 * The places this replaces called toLocaleTimeString([]) — an empty locale
 * list means "use whatever the browser is set to", so the same booking read
 * "14:30" on a Thai browser and "02:30 PM" on an English one. Times here are
 * always shown alongside Thai wording, and staff and parents compare them
 * against a schedule written in 24-hour, so the format cannot depend on a
 * setting nobody knows they have.
 *
 * en-GB rather than th-TH for English: both are 24-hour, but th-TH would drag
 * Thai digits/wording into an otherwise English screen.
 */
export const formatTime24 = (value: string | number | Date, lang: 'th' | 'en' = 'th'): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};
