// Builds the SQL for "แบบสอบถามความพึงพอใจและความสัมพันธ์ในครอบครัว".
//
//   node seeds/family_relationship_survey.build.js seeds/family_relationship_survey.sql
//
// The output is a REBUILD, not an append: it creates the form if the slug is
// missing, then replaces every field with what is described here. That keeps
// the shared link stable across revisions of the paper form — but it also means
// running it against a form that already has submissions would orphan their
// answers. Check first:
//
//   SELECT COUNT(*) FROM Survey_Submissions
//    WHERE form_id = (SELECT id FROM Survey_Forms WHERE slug = 'family-relationship');
const fs = require('fs');

const SLUG = 'family-relationship';
const NAME = 'แบบสอบถามความพึงพอใจและความสัมพันธ์ในครอบครัว';
const DESCRIPTION = 'กิจกรรม Active Learning โครงการ "ครอบครัวทันโลก Family Fact or Fake"';

const q = (s) => "'" + String(s).split("'").join("''") + "'";

// ── the 1–5 ladder ข้อ 1–18 are scored on ──────────────────────────────────
// Numeric captions, matching the paper's own "5 4 3 2 1" columns. The end
// captions carry the words, so each row explains itself on a phone where the
// legend is a page behind.
const LIKERT = [5, 4, 3, 2, 1].map(n => ({ label: String(n), points: n }));
const LIKERT_CONFIG = {
  display: 'scale',
  scored: true,
  scaleLowLabel: '5 = มากที่สุด',
  scaleHighLabel: '1 = น้อยที่สุด',
};

// The paper prints its scale key once, at the top. Pages 2 and 3 are separate
// screens from that key, so a short reminder repeats there — the full wording
// stays on page 1 where the paper puts it.
const LEGEND_FULL = [
  'ระดับความคิดเห็น',
  '5 = มากที่สุดหรือดีที่สุด',
  '4 = มากหรือดี',
  '3 = ปานกลางหรือพอใช้',
  '2 = น้อยหรือต่ำกว่ามาตรฐาน',
  '1 = น้อยที่สุดหรือควรปรับปรุง',
].join('\n');
const LEGEND_SHORT = '5 = มากที่สุด/ดีที่สุด · 4 = มาก/ดี · 3 = ปานกลาง/พอใช้ · 2 = น้อย/ต่ำกว่ามาตรฐาน · 1 = น้อยที่สุด/ควรปรับปรุง';

// points 0: a choice, not a mark. Anything with no points stays out of the
// ค่าเฉลี่ยรายข้อ table, which is how ส่วนที่ 1 and ส่วนที่ 4 are kept from
// diluting an average meant to cover ข้อ 1–18 and nothing else.
const plain = (labels) => labels.map(label => ({ label, points: 0 }));
// The paper's "อื่น ๆ ระบุ ......" — the option carries its own text box rather
// than being followed by a separate field.
const other = (label = 'อื่น ๆ') => ({ label, points: 0, allowText: true });

// ส่วนที่ 2, in the paper's three sub-groups
const S2_GROUPS = [
  ['ด้านการประชาสัมพันธ์และการรับสมัคร', [
    'ข้อมูลประชาสัมพันธ์กิจกรรมมีความชัดเจน ครบถ้วน (วัน เวลา สถานที่ วิธีสมัคร)',
    'ขั้นตอนการสมัคร/ลงทะเบียนเข้าร่วมกิจกรรมมีความสะดวก ไม่ยุ่งยาก',
    'การลงทะเบียนหน้างานและการเข้ารอบกิจกรรมมีความรวดเร็ว',
  ]],
  ['ด้านเนื้อหาและรูปแบบกิจกรรม', [
    'รูปแบบเกมและกิจกรรมมีความน่าสนใจ',
    'เนื้อหาเรื่องการรู้เท่าทันสื่อเข้าใจง่ายและนำไปใช้ได้จริง',
    'กิจกรรมมีความเหมาะสมกับวัยของบุตรหลาน',
    'บุตรหลานของท่านได้เรียนรู้เรื่องการใช้สื่ออย่างรู้เท่าทันจากกิจกรรมนี้',
  ]],
  ['ด้านการดำเนินงานและสถานที่', [
    'เจ้าหน้าที่/พิธีกรให้ข้อมูลชัดเจนและดูแลทั่วถึง',
    'ระยะเวลาในการทำกิจกรรมมีความเหมาะสม',
    'สถานที่ อุปกรณ์ และความปลอดภัยมีความเหมาะสม',
  ]],
];

// ส่วนที่ 3 — ข้อ 11–18
const S3 = [
  'ท่านและบุตรหลานได้ร่วมกันคิดและตัดสินใจระหว่างทำกิจกรรม',
  'ท่านได้เห็นมุมมองหรือความสามารถของบุตรหลานเพิ่มขึ้น',
  'ท่านสังเกตว่าบุตรหลานกล้าพูด กล้าแสดงออกกับท่านมากขึ้นระหว่างกิจกรรม',
  'ครอบครัวของท่านมีช่วงเวลาที่มีความสุขร่วมกันในกิจกรรมนี้',
  'กิจกรรมนี้ทำให้ครอบครัวมีหัวข้อใหม่ไว้พูดคุยกันต่อ',
  'ท่านสนใจจะทำกิจกรรมร่วมกับบุตรหลานลักษณะนี้อีก',
  'รูปแบบการเล่นเป็นทีมเปิดโอกาสให้ท่านและบุตรหลานทำงานร่วมกัน',
  'โดยรวม กิจกรรมนี้ส่งผลต่อความสัมพันธ์ในครอบครัวของท่าน',
];

const fields = [];
const add = (page, key, type, label, required, options, config) =>
  fields.push({ page, key, type, label, required, options, config });

// ── หน้า 1 — หัวแบบฟอร์ม, คำชี้แจง, ส่วนที่ 1 ─────────────────────────────
// วันที่ / รอบที่ / สถานที่ are the paper's header blanks. Left optional: the
// submission is already timestamped, and a respondent at the venue often does
// not know which "รอบที่" they are counted as. They are here so a shared
// tablet at the desk can record them.
add(0, 'meta_head', 'heading', 'ข้อมูลกิจกรรม', 0);
add(0, 'meta_date', 'date', 'วันที่จัดกิจกรรม', 0);
add(0, 'meta_round', 'text', 'รอบที่', 0);
add(0, 'meta_place', 'text', 'สถานที่', 0);
add(0, 'intro', 'paragraph',
  'คำชี้แจง: แบบสอบถามนี้จัดทำขึ้นเพื่อสำรวจความคิดเห็นของผู้เข้าร่วมกิจกรรมเกี่ยวกับการจัดกิจกรรม'
  + 'และความสัมพันธ์ในครอบครัว ข้อมูลจะนำไปใช้เพื่อการประเมินและพัฒนาโครงการเท่านั้น '
  + 'ไม่มีคำตอบที่ถูกหรือผิด', 0);
add(0, 'legend', 'paragraph', LEGEND_FULL, 0);

add(0, 's1_head', 'heading', 'ส่วนที่ 1 ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม', 0);
add(0, 's1_role', 'radio', 'ผู้กรอกแบบฟอร์ม', 1,
  [...plain(['คุณแม่', 'คุณพ่อ', 'ผู้ปกครองอื่น ๆ (ปู่ ย่า ตา ยาย ฯลฯ)', 'เด็กผู้เข้าร่วมกิจกรรม']), other()]);
add(0, 's1_age', 'radio', 'อายุ', 1,
  plain(['7–9 ปี', '10–15 ปี', '16–25 ปี', '26–35 ปี', '36–45 ปี', '46 ปีขึ้นไป']));
add(0, 's1_members', 'number', 'จำนวนสมาชิกครอบครัวที่มาร่วมกิจกรรมครั้งนี้ รวมตัวท่านเอง (คน)', 1);
add(0, 's1_with', 'checkbox', 'ท่านเข้าร่วมกิจกรรมกับใคร (ตอบได้มากกว่า 1 ข้อ)', 1,
  [...plain(['พ่อ/แม่', 'ลูก', 'ปู่ ย่า ตา ยาย', 'พี่/น้อง']), other()]);
add(0, 's1_source', 'checkbox', 'ท่านทราบข้อมูลกิจกรรมนี้จากแหล่งใด (ตอบได้มากกว่า 1 ข้อ)', 1,
  [...plain([
    'Facebook',
    'Instagram / TikTok',
    'เว็บไซต์หรือช่องทางออนไลน์ของผู้จัดงาน',
    'LINE / กลุ่มผู้ปกครอง',
    'โรงเรียนของบุตรหลาน',
    'เพื่อนหรือคนรู้จักแนะนำ',
    'ป้ายประชาสัมพันธ์ / มาพบหน้างาน',
  ]), other()]);

// ── หน้า 2 — ส่วนที่ 2, ข้อ 1–10 in three sub-groups ──────────────────────
add(1, 's2_head', 'heading', 'ส่วนที่ 2 ความคิดเห็นต่อการจัดกิจกรรม', 0);
add(1, 's2_note', 'paragraph', LEGEND_SHORT, 0);
let n = 0;
S2_GROUPS.forEach(([groupName, items], gi) => {
  add(1, `s2_g${gi + 1}_head`, 'heading', groupName, 0);
  items.forEach(label => { n += 1; add(1, `s2_q${n}`, 'radio', label, 1, LIKERT, LIKERT_CONFIG); });
});

// ── หน้า 3 — ส่วนที่ 3, ข้อ 11–18 ──────────────────────────────────────────
add(2, 's3_head', 'heading', 'ส่วนที่ 3 ด้านความสัมพันธ์ในครอบครัว', 0);
add(2, 's3_note', 'paragraph', `หลังเข้าร่วมกิจกรรม ท่านเห็นด้วยกับข้อความต่อไปนี้มากน้อยเพียงใด\n${LEGEND_SHORT}`, 0);
S3.forEach((label, i) => add(2, `s3_q${i + 11}`, 'radio', label, 1, LIKERT, LIKERT_CONFIG));

// ── หน้า 4 — ส่วนที่ 4 ─────────────────────────────────────────────────────
// Stacked lists, not scale rows, even where the labels would fit. In this form
// a scale row means one thing — the 1–5 ladder of ข้อ 1–18 — and borrowing that
// shape for a four-way choice would blur the signal.
add(3, 's4_head', 'heading', 'ส่วนที่ 4 ความคิดเห็นภาพรวม', 0);
add(3, 's4_effect', 'radio', 'ท่านคิดว่าการเข้าร่วมโครงการนี้ส่งผลต่อความสัมพันธ์ในครอบครัวของท่านอย่างไร', 1,
  plain(['ดีขึ้นมาก', 'ดีขึ้น', 'เหมือนเดิม', 'แย่ลง']));
add(3, 's4_satisfaction', 'radio', 'โดยภาพรวม ท่านมีความพึงพอใจต่อการจัดกิจกรรมครั้งนี้ในระดับใด', 1,
  plain(['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด']));
add(3, 's4_recommend', 'radio', 'ท่านจะแนะนำให้ครอบครัวอื่นมาเข้าร่วมกิจกรรมลักษณะนี้หรือไม่', 1,
  plain(['แนะนำอย่างยิ่ง', 'แนะนำ', 'ไม่แน่ใจ', 'ไม่แนะนำ']));

// ── หน้า 5 — ส่วนที่ 5 ─────────────────────────────────────────────────────
add(4, 's5_head', 'heading', 'ส่วนที่ 5 ข้อเสนอแนะเพิ่มเติม', 0);
add(4, 's5_impress', 'textarea', 'สิ่งที่ท่านประทับใจมากที่สุดจากกิจกรรมครั้งนี้ (ระบุหรือไม่ก็ได้)', 0);
add(4, 's5_suggest', 'textarea', 'ข้อเสนอแนะเพื่อการพัฒนากิจกรรมในครั้งต่อไป (ระบุหรือไม่ก็ได้)', 0);
add(4, 's5_thanks', 'paragraph', 'ขอขอบพระคุณที่สละเวลาตอบแบบสอบถาม', 0);

// ── SQL ────────────────────────────────────────────────────────────────────
const FORM = `(SELECT id FROM Survey_Forms WHERE slug = ${q(SLUG)})`;
const lines = [];
lines.push(`-- ${NAME}`);
lines.push('-- Generated by family_relationship_survey.build.js — edit the builder, not this.');
lines.push('-- Rebuilds the form in place: safe to re-run, but it replaces every field, so');
lines.push('-- only run it while the form has no submissions.');
lines.push('');
lines.push('INSERT INTO Survey_Forms (name, description, form_kind, has_answer_key, is_active, slug, shuffle_questions, shuffle_options, shuffle_mode)');
lines.push(`SELECT ${q(NAME)}, ${q(DESCRIPTION)}, 'survey', 0, 1, ${q(SLUG)}, 0, 0, 'none'`);
lines.push(`WHERE NOT EXISTS (SELECT 1 FROM Survey_Forms WHERE slug = ${q(SLUG)});`);
lines.push('');
lines.push(`UPDATE Survey_Forms SET name = ${q(NAME)}, description = ${q(DESCRIPTION)}, is_active = 1 WHERE slug = ${q(SLUG)};`);
lines.push('');
lines.push(`DELETE FROM Survey_Form_Fields WHERE form_id = ${FORM};`);
lines.push('');

// field_index restarts per page, which is how the builder numbers them.
const perPage = {};
for (const f of fields) {
  perPage[f.page] = (perPage[f.page] ?? -1) + 1;
  const opts = f.options ? q(JSON.stringify(f.options)) : 'NULL';
  const cfg = f.config ? q(JSON.stringify(f.config)) : 'NULL';
  lines.push(
    'INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json) ' +
    `SELECT id, ${q(f.key)}, ${f.page}, ${perPage[f.page]}, ${q(f.type)}, ${q(f.label)}, ${f.required}, ${opts}, ${cfg} ` +
    `FROM Survey_Forms WHERE slug = ${q(SLUG)};`
  );
}

const out = process.argv[2];
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${fields.length} fields across ${Object.keys(perPage).length} pages -> ${out}`);
console.log('fields per page:', JSON.stringify(perPage));
console.log('scored items:', fields.filter(f => f.config).length, '(expect 18 — ข้อ 1–18)');
console.log('options with their own text box:',
  fields.filter(f => (f.options || []).some(o => o.allowText)).map(f => f.key).join(', '));
