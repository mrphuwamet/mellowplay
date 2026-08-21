const fs = require('fs');

const SLUG = 'family-relationship';
const q = (s) => "'" + String(s).split("'").join("''") + "'";

// ── the 5-rung ladder ส่วนที่ 2 is scored on ────────────────────────────────
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

// points 0 throughout: these are choices, not marks. The form is not graded.
const plain = (labels) => labels.map(label => ({ label, points: 0 }));

const S2 = [
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
  'คำชี้แจง: แบบสอบถามนี้จัดทำขึ้นเพื่อสำรวจความคิดเห็นของผู้เข้าร่วมกิจกรรมเกี่ยวกับความสัมพันธ์ในครอบครัว '
  + 'ข้อมูลจะนำไปใช้เพื่อการประเมินและพัฒนาโครงการเท่านั้น โดยเก็บรักษาเป็นความลับและนำเสนอในภาพรวม\n\n'
  + 'ไม่มีคำตอบที่ถูกหรือผิด กรุณาเลือกช่องที่ตรงกับความคิดเห็นของท่านมากที่สุด', 0);
add(0, 's1_head', 'heading', 'ส่วนที่ 1 ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม', 0);
add(0, 's1_status', 'radio', 'สถานะของผู้ตอบแบบสอบถาม', 1,
  plain(['ผู้ปกครอง (พ่อ/แม่)', 'ผู้ปกครองอื่น ๆ (ปู่ ย่า ตา ยาย ฯลฯ)', 'เด็กผู้เข้าร่วมกิจกรรม']));
add(0, 's1_gender', 'radio', 'เพศ', 1, plain(['ชาย', 'หญิง', 'ไม่ระบุ']));
add(0, 's1_age', 'radio', 'อายุ', 1,
  plain(['7–9 ปี', '10–15 ปี', '16–25 ปี', '26–35 ปี', '36–45 ปี', '46 ปีขึ้นไป']));
add(0, 's1_members', 'number', 'จำนวนสมาชิกครอบครัวที่มาร่วมกิจกรรมครั้งนี้ รวมตัวท่านเอง (คน)', 1);
add(0, 's1_with', 'checkbox', 'ท่านเข้าร่วมกิจกรรมกับใคร (ตอบได้มากกว่า 1 ข้อ)', 1,
  [...plain(['พ่อ/แม่', 'ลูก', 'ปู่ ย่า ตา ยาย', 'พี่/น้อง']), { label: 'อื่น ๆ', points: 0, allowText: true }]);

// ── หน้า 2 — ส่วนที่ 2, the scored block ───────────────────────────────────
add(1, 's2_head', 'heading', 'ส่วนที่ 2 ความคิดเห็นเกี่ยวกับครอบครัวหลังเข้าร่วมกิจกรรม', 0);
add(1, 's2_note', 'paragraph',
  'หลังเข้าร่วมกิจกรรม ท่านเห็นด้วยกับข้อความต่อไปนี้มากน้อยเพียงใด\n'
  + '5 = มากที่สุด · 4 = มาก · 3 = ปานกลาง · 2 = น้อย · 1 = น้อยที่สุด', 0);
S2.forEach((label, i) => add(1, `s2_q${i + 1}`, 'radio', label, 1, LIKERT, LIKERT_CONFIG));

// ── หน้า 3 — ส่วนที่ 3 ─────────────────────────────────────────────────────
// Left as stacked lists, not scale rows: "แนะนำอย่างยิ่ง" is too long for a
// cell, so one of the two would fall back anyway and the pair would look
// mismatched. Four options stacked is short enough as it is.
add(2, 's3_head', 'heading', 'ส่วนที่ 3 ความคิดเห็นภาพรวม', 0);
add(2, 's3_effect', 'radio', 'ท่านคิดว่าการเข้าร่วมโครงการนี้ส่งผลต่อความสัมพันธ์ในครอบครัวของท่านอย่างไร', 1,
  plain(['ดีขึ้นมาก', 'ดีขึ้น', 'เหมือนเดิม', 'แย่ลง']));
add(2, 's3_recommend', 'radio', 'ท่านจะแนะนำให้ครอบครัวอื่นมาเข้าร่วมกิจกรรมลักษณะนี้หรือไม่', 1,
  plain(['แนะนำอย่างยิ่ง', 'แนะนำ', 'ไม่แน่ใจ', 'ไม่แนะนำ']));

// ── หน้า 4 — ส่วนที่ 4 ─────────────────────────────────────────────────────
add(3, 's4_head', 'heading', 'ส่วนที่ 4 ข้อเสนอแนะเพิ่มเติม', 0);
add(3, 's4_impress', 'textarea', 'สิ่งที่ท่านประทับใจมากที่สุดจากกิจกรรมครั้งนี้', 0);
add(3, 's4_suggest', 'textarea', 'ข้อเสนอแนะเพื่อการพัฒนากิจกรรมในครั้งต่อไป', 0);
add(3, 's4_thanks', 'paragraph', 'ขอขอบพระคุณที่สละเวลาตอบแบบสอบถาม', 0);

// ── SQL ────────────────────────────────────────────────────────────────────
const lines = [];
lines.push('-- Seed: แบบสอบถามความสัมพันธ์ในครอบครัว (Family Fact or Fake)');
lines.push('-- Guarded by the slug so re-running cannot create a second copy.');
lines.push('');
lines.push(`INSERT INTO Survey_Forms (name, description, form_kind, has_answer_key, is_active, slug, shuffle_questions, shuffle_options, shuffle_mode)`);
lines.push(`SELECT ${q('แบบสอบถามความสัมพันธ์ในครอบครัว')},`);
lines.push(`       ${q('หลังเข้าร่วมกิจกรรม Active Learning โครงการ "ครอบครัวทันโลก Family Fact or Fake"')},`);
lines.push(`       'survey', 0, 1, ${q(SLUG)}, 0, 0, 'none'`);
lines.push(`WHERE NOT EXISTS (SELECT 1 FROM Survey_Forms WHERE slug = ${q(SLUG)});`);
lines.push('');

// field_index restarts per page, which is how the builder numbers them.
const perPage = {};
for (const f of fields) {
  perPage[f.page] = (perPage[f.page] ?? -1) + 1;
  const opts = f.options ? q(JSON.stringify(f.options)) : 'NULL';
  const cfg = f.config ? q(JSON.stringify(f.config)) : 'NULL';
  lines.push(
    `INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json) ` +
    `SELECT id, ${q(f.key)}, ${f.page}, ${perPage[f.page]}, ${q(f.type)}, ${q(f.label)}, ${f.required}, ${opts}, ${cfg} ` +
    `FROM Survey_Forms WHERE slug = ${q(SLUG)};`
  );
}

const out = process.argv[2];
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${fields.length} fields across ${Object.keys(perPage).length} pages -> ${out}`);
console.log('per page:', JSON.stringify(perPage));
