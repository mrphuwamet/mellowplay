// Sample data for template previews.
//
// Previously the preview always showed the same three placeholders
// ('น้องเอ๋', 'สมชาย ตัวอย่าง', ...) and rendered every registration-form field as
// the literal string "(ตัวอย่าง) <label>". That is enough to prove a variable
// resolves, but not enough to judge the message: real names have different
// lengths, and a template that looks fine with one short nickname can wrap badly
// or overrun an SMS segment with a longer one.
//
// The values come from a seeded generator rather than Math.random on each render.
// With Math.random every keystroke in the editor would reshuffle the names
// underneath the preview; a seed held in state means the sample only changes when
// the user asks for a new one.

const CHILD_NICKNAMES = ['น้องเอ๋', 'น้องปลื้ม', 'น้องข้าวปุ้น', 'น้องมิว', 'น้องภูมิ', 'น้องเบล', 'น้องอิ่มบุญ', 'น้องซัน'];
const CHILD_NAMES = ['ธนกร ศรีสุข', 'ปัณณธร วงศ์ทอง', 'กฤตานน แสงเพ็ชร', 'ชัญญานุช ใจดี', 'ภูมิพัฒน์ รักไทย', 'พิชญาภา อารีย์'];
const PARENT_NAMES = ['สมชาย ศรีสุข', 'วราภรณ์ วงศ์ทอง', 'ณัฐพงษ์ แสงเพ็ชร', 'กมลชนก ใจดี', 'ธีรเดช รักไทย', 'อรพรรณ อารีย์'];
const PARENT_NICKNAMES = ['พี่หนึ่ง', 'คุณแม่เมย์', 'คุณพ่อโอ๊ต', 'พี่นก', 'คุณแม่ปุ้ย', 'คุณพ่อเบิร์ด'];
const BRANCHES = ['Central Chidlom', 'CentralWorld', 'Central ลาดพร้าว', 'Mega Bangna'];
const LOCATIONS = [
  'ชั้น 5 โซน Kids Zone ตรงข้ามร้านหนังสือ',
  'ห้อง Studio B ชั้น 3 อาคารจอดรถฝั่งเหนือ',
  'ลานกิจกรรมหน้าโถงกลาง ชั้น G',
];
const TIMES = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30'];

const THAI_MONTHS_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Same output shape as the backend's formatThaiDateTime.
function formatThaiDateTime(y: number, m: number, d: number, time: string): string {
  return `วันที่ ${d} ${THAI_MONTHS_ABBR[m - 1]} ${y + 543} เวลา ${time}น.`;
}

// mulberry32 — small, fast, and stable across reloads for a given seed, which is
// what makes a preview reproducible while the dialog is open.
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Guesses a plausible value from the field's own label, so a preview of a
// template using {{phone}} shows a phone number instead of the words
// "(ตัวอย่าง) เบอร์โทร". Falls back to the label when nothing matches, which is
// still better than nothing for a free-text question.
function sampleForField(label: string, rand: () => number): string {
  const l = label.toLowerCase();
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  if (/เบอร์|โทร|phone|mobile|tel/.test(l)) return `08${Math.floor(rand() * 9) + 1}-${String(Math.floor(rand() * 9000000) + 1000000).slice(0, 3)}-${String(Math.floor(rand() * 9000) + 1000)}`;
  if (/อีเมล|email|e-mail/.test(l)) return pick(['somchai.s@example.com', 'waraporn.w@example.com', 'parent.demo@example.com']);
  if (/อายุ|age/.test(l)) return String(Math.floor(rand() * 7) + 3);
  if (/น้ำหนัก|weight/.test(l)) return `${Math.floor(rand() * 15) + 12} กก.`;
  if (/ส่วนสูง|height/.test(l)) return `${Math.floor(rand() * 30) + 95} ซม.`;
  if (/วันเกิด|เกิด|birth|dob/.test(l)) return `${Math.floor(rand() * 28) + 1} ${pick(THAI_MONTHS_ABBR)} ${2560 + Math.floor(rand() * 8)}`;
  if (/ชื่อเล่น|nickname/.test(l)) return pick(CHILD_NICKNAMES);
  if (/ชื่อ|name/.test(l)) return pick(CHILD_NAMES);
  if (/แพ้|allergy|โรค|medical/.test(l)) return pick(['ไม่มี', 'แพ้นมวัว', 'แพ้อาหารทะเล', 'ไม่มีข้อจำกัด']);
  if (/ที่อยู่|address/.test(l)) return '123/45 ถนนพระราม 4 แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110';
  if (/หมายเหตุ|note|เพิ่มเติม|comment/.test(l)) return pick(['ไม่มี', 'มาถึงก่อนเวลา 10 นาที', 'ผู้ปกครองรออยู่หน้าห้อง']);
  if (/จำนวน|number|qty/.test(l)) return String(Math.floor(rand() * 3) + 1);
  return `ตัวอย่าง${label}`;
}

export interface SampleVariableField {
  field_key: string;
  label: string;
}

export function buildSampleVariables(
  courseName: string,
  formFields: SampleVariableField[],
  seed = 1,
): Record<string, string> {
  const rand = makeRandom(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const childNickname = pick(CHILD_NICKNAMES);
  const childReal = pick(CHILD_NAMES);
  const parentReal = pick(PARENT_NAMES);
  const parentNickname = pick(PARENT_NICKNAMES);

  const vars: Record<string, string> = {
    // child_name / parent_name are the nickname-preferred defaults, matching
    // buildNameVariables on the backend.
    child_name: childNickname,
    child_real_name: childReal,
    child_nickname: childNickname,
    parent_name: parentReal,
    parent_real_name: parentReal,
    parent_nickname: parentNickname,
    course_name: courseName || 'คอร์สตัวอย่าง',
    branch_name: pick(BRANCHES),
    location: pick(LOCATIONS),
    location_link: 'https://maps.google.com/?q=13.7466,100.5347',
    scheduled_at: formatThaiDateTime(2026, Math.floor(rand() * 12) + 1, Math.floor(rand() * 28) + 1, pick(TIMES)),
  };

  for (const f of formFields) vars[f.field_key] = sampleForField(f.label, rand);
  return vars;
}
