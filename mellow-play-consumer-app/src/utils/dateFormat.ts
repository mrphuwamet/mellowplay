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
