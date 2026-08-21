// Builds the SQL for "แบบสอบถามความคิดเห็นต่อกิจกรรมและความสัมพันธ์ในครอบครัว".
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
const NAME = 'แบบสอบถามความคิดเห็นต่อกิจกรรมและความสัมพันธ์ในครอบครัว';
const DESCRIPTION = 'หลังเข้าร่วมกิจกรรม Active Learning โครงการ "ครอบครัวทันโลก Family Fact or Fake"';

const q = (s) => "'" + String(s).split("'").join("''") + "'";

// ── the 1–5 ladder ส่วนที่ 2 and 3 are scored on ───────────────────────────
// Numeric captions, matching the paper's own "5 4 3 2 1" columns and its
// legend. The end captions carry the words instead, so each row explains
// itself on a phone where the legend has already scrolled away.
const LIKERT = [5, 4, 3, 2, 1].map(n => ({ label: String(n), points: n }));
const LIKERT_CONFIG = {
  display: 'scale',
  scored: true,
  scaleLowLabel: '5 = มากที่สุด',
  scaleHighLabel: '1 = น้อยที่สุด',
};
const LEGEND = '5 = มากที่สุด · 4 = มาก · 3 = ปานกลาง · 2 = น้อย · 1 = น้อยที่สุด';

// points 0: a choice, not a mark. Anything with no points stays out of the
// ค่าเฉลี่ยรายข้อ table, which is how ส่วนที่ 1 and ส่วนที่ 4 are kept from
// diluting an average that is meant to cover ข้อ 1–15 and nothing else.
const plain = (labels) => labels.map(label => ({ label, points: 0 }));

// ข้อ 1–7 — the activity itself
const S2 = [
  'รูปแบบเกมและกิจกรรมมีความน่าสนใจ',
  'เนื้อหาเรื่องการรู้เท่าทันสื่อเข้าใจง่ายและนำไปใช้ได้จริง',
  'ระดับความยากง่ายของเกมเหมาะสมกับผู้เข้าร่วม',
  'ระยะเวลาในการทำกิจกรรมมีความเหมาะสม',
  'เจ้าหน้าที่/พิธีกรอธิบายกติกาชัดเจนและดูแลทั่วถึง',
  'สถานที่ อุปกรณ์ และความปลอดภัยมีความเหมาะสม',
  'ท่านได้รับความรู้เรื่องการใช้สื่ออย่างรู้เท่าทันจากกิจกรรมนี้',
];

// ข้อ 8–15 — the family
const S3 = [
  'ครอบครัวของท่านได้ร่วมกันคิดและตัดสินใจระหว่างทำกิจกรรม',
  'ท่านได้เห็นมุมมองหรือความสามารถของสมาชิกในครอบครัวเพิ่มขึ้น',
  'ท่านได้พูดคุยและรับฟังสมาชิกในครอบครัวระหว่างกิจกรรม',
  'ครอบครัวของท่านมีช่วงเวลาที่มีความสุขร่วมกันในกิจกรรมนี้',
  'กิจกรรมนี้ทำให้ครอบครัวมีหัวข้อใหม่ไว้พูดคุยกันต่อ',
  'ท่านสนใจจะทำกิจกรรมร่วมกับครอบครัวลักษณะนี้อีก',
  'รูปแบบการเล่นเป็นทีมเปิดโอกาสให้สมาชิกครอบครัวทำงานร่วมกัน',
  'โดยรวม กิจกรรมนี้ส่งผลต่อความสัมพันธ์ในครอบครัวของท่าน',
];

const fields = [];
const add = (page, key, type, label, required, options, config) =>
  fields.push({ page, key, type, label, required, options, config });

// ── หน้า 1 — คำชี้แจง + ส่วนที่ 1 ──────────────────────────────────────────
add(0, 'intro', 'paragraph',
  'คำชี้แจง: แบบสอบถามนี้จัดทำขึ้นเพื่อสำรวจความคิดเห็นของผู้เข้าร่วมกิจกรรมเกี่ยวกับการจัดกิจกรรม'
  + 'และความสัมพันธ์ในครอบครัว ข้อมูลจะนำไปใช้เพื่อการประเมินและพัฒนาโครงการเท่านั้น '
  + 'โดยเก็บรักษาเป็นความลับและนำเสนอในภาพรวม\n\n'
  + 'ไม่มีคำตอบที่ถูกหรือผิด กรุณาเลือกช่องที่ตรงกับความคิดเห็นของท่านมากที่สุด', 0);
add(0, 's1_head', 'heading', 'ส่วนที่ 1 ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม', 0);
add(0, 's1_status', 'radio', 'สถานะของผู้ตอบแบบสอบถาม', 1,
  plain(['ผู้ปกครอง (พ่อ/แม่)', 'ผู้ปกครองอื่น ๆ (ปู่ ย่า ตา ยาย ฯลฯ)', 'เด็กผู้เข้าร่วมกิจกรรม']));
add(0, 's1_gender', 'radio', 'เพศ', 1, plain(['ชาย', 'หญิง', 'ไม่ระบุ']));
add(0, 's1_age', 'radio', 'อายุ', 1,
  plain(['7–9 ปี', '10–15 ปี', '16–25 ปี', '26–35 ปี', '36–45 ปี', '46 ปีขึ้นไป']));
add(0, 's1_members', 'number', 'จำนวนสมาชิกครอบครัวที่มาร่วมกิจกรรมครั้งนี้ รวมตัวท่านเอง (คน)', 1);
// The paper's "อื่น ๆ ระบุ ......" is the option's own box, not a field of its
// own — picking it opens a text box inside it.
add(0, 's1_with', 'checkbox', 'ท่านเข้าร่วมกิจกรรมกับใคร (ตอบได้มากกว่า 1 ข้อ)', 1,
  [...plain(['พ่อ/แม่', 'ลูก', 'ปู่ ย่า ตา ยาย', 'พี่/น้อง']),
   { label: 'อื่น ๆ', points: 0, allowText: true }]);

// ── หน้า 2 — ส่วนที่ 2, ข้อ 1–7 ────────────────────────────────────────────
add(1, 's2_head', 'heading', 'ส่วนที่ 2 ความคิดเห็นต่อการจัดกิจกรรม', 0);
add(1, 's2_note', 'paragraph', `ท่านเห็นด้วยกับข้อความต่อไปนี้มากน้อยเพียงใด\n${LEGEND}`, 0);
S2.forEach((label, i) => add(1, `s2_q${i + 1}`, 'radio', label, 1, LIKERT, LIKERT_CONFIG));

// ── หน้า 3 — ส่วนที่ 3, ข้อ 8–15 ───────────────────────────────────────────
add(2, 's3_head', 'heading', 'ส่วนที่ 3 ความคิดเห็นเกี่ยวกับครอบครัวหลังเข้าร่วมกิจกรรม', 0);
add(2, 's3_note', 'paragraph', `หลังเข้าร่วมกิจกรรม ท่านเห็นด้วยกับข้อความต่อไปนี้มากน้อยเพียงใด\n${LEGEND}`, 0);
S3.forEach((label, i) => add(2, `s3_q${i + 8}`, 'radio', label, 1, LIKERT, LIKERT_CONFIG));

// ── หน้า 4 — ส่วนที่ 4 ─────────────────────────────────────────────────────
// Stacked lists, not scale rows, even where the labels would fit. In this form
// a scale row means one thing — the 1–5 agreement ladder of ข้อ 1–15 — and
// borrowing that shape for a four-way choice would blur the signal. Four or
// five short options in a column is nothing to scroll past anyway.
add(3, 's4_head', 'heading', 'ส่วนที่ 4 ความคิดเห็นภาพรวม', 0);
add(3, 's4_effect', 'radio', 'ท่านคิดว่าการเข้าร่วมโครงการนี้ส่งผลต่อความสัมพันธ์ในครอบครัวของท่านอย่างไร', 1,
  plain(['ดีขึ้นมาก', 'ดีขึ้น', 'เหมือนเดิม', 'แย่ลง']));
add(3, 's4_satisfaction', 'radio', 'โดยภาพรวม ท่านมีความพึงพอใจต่อการจัดกิจกรรมครั้งนี้ในระดับใด', 1,
  plain(['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด']));
add(3, 's4_recommend', 'radio', 'ท่านจะแนะนำให้ครอบครัวอื่นมาเข้าร่วมกิจกรรมลักษณะนี้หรือไม่', 1,
  plain(['แนะนำอย่างยิ่ง', 'แนะนำ', 'ไม่แน่ใจ', 'ไม่แนะนำ']));

// ── หน้า 5 — ส่วนที่ 5 ─────────────────────────────────────────────────────
add(4, 's5_head', 'heading', 'ส่วนที่ 5 ข้อเสนอแนะเพิ่มเติม', 0);
add(4, 's5_impress', 'textarea', 'สิ่งที่ท่านประทับใจมากที่สุดจากกิจกรรมครั้งนี้', 0);
add(4, 's5_suggest', 'textarea', 'ข้อเสนอแนะเพื่อการพัฒนากิจกรรมในครั้งต่อไป', 0);
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
console.log('scored items:', fields.filter(f => f.config).length, '(expect 15 — ข้อ 1–15)');
