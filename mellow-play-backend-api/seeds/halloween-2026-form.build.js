// Builds the Halloween registration form as SQL. Written from Node rather
// than typed into a shell: the content is Thai text and JSON, and a shell
// mangles both.
const fs = require('fs');

const SLUG = 'halloween-2026';
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const ACTIVITY_DETAIL = [
  "🎃 HALLOWEEN PARTY FOR KIDS 👻",
  "",
  "📍 สถานที่: Burasiri Watcharapol (บ้านเลขที่ 55/55)",
  "👗 Dress Code: Halloween Theme",
  "📅 วันที่ / เวลา: (รอยืนยัน — แก้ได้ในหน้าจัดการแบบสอบถาม)",
  "",
  "🎮 GAME ZONE",
  "🚪 Mystery Mansion — ไขปริศนา ห้องแห่งความลับ",
  "🦇 Bat Hunt — บุกถ้ำค้างคาว ตามล่าลูกโป่งสีตามภารกิจ",
  "⚡ Bat Catch — ประลองความไว ใครมือไวที่สุดมาลองกัน",
  "🧪 Monster Swamp — ตะลุยบึงปีศาจ ตักลูกตาและสิ่งประหลาดสะสมคะแนน",
  "👁️ Eyeball Drop — ปล่อยลูกตากลิ้งลุ้นโชค ลงช่องไหนได้คะแนนเท่าไหร่",
  "🎃 Pumpkin Toss — ท้าความแม่น โยนลูกบอลลงไหฟักทอง ลุ้นรับรางวัล",
  "👾 Mini Monster Challenge — บังคับมอนสเตอร์ตัวจิ๋ว ชนถังให้ล้ม",
  "",
  "🎤 RELAX ZONE",
  "🎶 Monster Karaoke — เวทีปล่อยพลังเสียงของเหล่ามอนสเตอร์ตัวน้อย ร้อง เต้น สนุกไปด้วยกัน",
  "",
  "🎨 WORKSHOP ZONE",
  "👾 Monster Lab Challenge — สร้างมอนสเตอร์จากกระดาษลัง แล้วมาประลองพลังเป่า แข่งกันว่าใครไปได้ไกลที่สุด",
  "🖌️ Halloween Art — ระบายสีแคนวาส สร้างผลงานฮัลโลวีนในสไตล์ตัวเอง",
  "📿 Monster Beads Workshop — ออกแบบพวงกุญแจบีดสุดหลอน ชิ้นเดียวในโลก",
  "",
  "📸 PHOTO ZONE",
  "🏚️ Haunted Mansion Photo Studio — เช็กอินบ้านผีสิง ถ่ายภาพเก็บความทรงจำสุดหลอน",
  "👻 Ghost Tattoo — เติมความหลอนด้วยแทตทูฮัลโลวีนลายน่ารัก ๆ",
  "",
  "🍭 MINI KIDS MARKET",
  "🍧 Bingsu Station — บิงซูเย็นฉ่ำ เติมความสดชื่น (บ้าน 55/54)",
  "🍳 Egg Roll — ไข่ม้วนร้อน ๆ อร่อยเต็มคำ (บ้าน 55/55)",
  "🍹 Drinks & Ice Pops — เครื่องดื่มและไอติมหลอดคลายร้อน (บ้าน 55/62)",
  "",
  "✨ SECRET ACTIVITIES — กิจกรรมพิเศษ รวมตัวกันเล่นเป็นรอบ ๆ",
  "🍬 Trick or Treat — กิจกรรมแลกขนม (แต่ละบ้านนำขนมมาแจกให้เด็ก ๆ ได้)",
  "",
  "🧡 ฮัลโลวีนปีนี้เป็นวันที่เด็ก ๆ จะได้เล่น ทดลอง สร้างสรรค์ และสนุกไปกับเพื่อน ๆ ในหมู่บ้าน",
  "เพราะความทรงจำดี ๆ ของวัยเด็ก เริ่มต้นได้จากใกล้บ้านเรานี่เอง",
  "",
  "#HalloweenParty2026 #BurasiriWatcharapol",
].join('\n');

const KIDS_CONFIG = {
  itemLabel: 'เด็ก',
  addLabel: 'เพิ่มเด็กที่จะเข้าร่วม',
  namePlaceholder: 'ชื่อ-นามสกุลเด็ก',
  choiceLabel: 'เลือกรูปแบบการเข้าร่วม',
  min: 1,
  max: 8,
  firstMustChooseNote: 'เด็กคนแรกของแต่ละครอบครัวต้องมีบัตรรวมกิจกรรม',
  options: [
    {
      key: 'pass',
      label: 'เข้าร่วมฟรี + บัตรรวมกิจกรรม',
      price: 500,
      priceFrom2: 350,
      detail: [
        { label: 'ซุ้มแกะฟักทอง', price: 200 },
        { label: 'เดินขอขนม Trick or Treat', price: 150 },
        { label: 'ถ่ายรูปกับฉากผี + ของที่ระลึก', price: 150 },
      ],
    },
    {
      key: 'free',
      label: 'เข้าร่วมฟรี (ไม่รับบัตรรวมกิจกรรม)',
      price: 0,
      disabledOnFirst: true,
      disabledOnFirstNote: 'เด็กคนแรกของแต่ละครอบครัวต้องมีบัตรรวมกิจกรรม เลือกตัวเลือกนี้ได้ตั้งแต่คนที่ 2',
    },
  ],
};

// Deliberately a placeholder. Inventing an account number would put a wrong
// one in front of people paying real money.
const ACCOUNT = {
  bankName: '(ใส่ชื่อธนาคาร)',
  accountName: '(ใส่ชื่อบัญชี)',
  accountNo: '(ใส่เลขบัญชี)',
  promptPay: '(ใส่พร้อมเพย์)',
  note: 'โอนแล้วแนบสลิปได้ที่หน้านี้เลย ระบบจะส่งอีเมลยืนยันให้อัตโนมัติ',
};

const FIELDS = [
  ['act_head', 0, 0, 'heading', 'รายละเอียดกิจกรรม', 0, null, null],
  ['act_detail', 0, 1, 'paragraph', ACTIVITY_DETAIL, 0, null, null],

  ['who_head', 0, 2, 'heading', 'ข้อมูลผู้ปกครอง', 0, null, null],
  ['parent_name', 0, 3, 'text', 'ชื่อ-นามสกุลผู้ปกครอง', 1, null, null],
  ['house_no', 0, 4, 'text', 'บ้านเลขที่ / ที่อยู่', 1, null, null],
  ['phone', 0, 5, 'text', 'เบอร์โทรศัพท์', 1, null, null],
  // The receipt is sent to whatever address the answers contain, so this one
  // is required or nobody gets a confirmation.
  ['email', 0, 6, 'text', 'อีเมล (สำหรับรับอีเมลยืนยัน)', 1, null, null],

  ['kids_head', 0, 7, 'heading', 'เด็กที่จะเข้าร่วม', 0, null, null],
  ['kids', 0, 8, 'participant_list', 'เพิ่มเด็กที่จะเข้าร่วม', 1, null, JSON.stringify(KIDS_CONFIG)],

  ['notes', 0, 9, 'textarea', 'สิ่งที่อยากให้ทีมงานทราบ (เช่น อาหารที่แพ้)', 0, null, null],
];

const sql = [
  `DELETE FROM Survey_Form_Fields WHERE form_id IN (SELECT id FROM Survey_Forms WHERE slug = ${q(SLUG)});`,
  `DELETE FROM Survey_Forms WHERE slug = ${q(SLUG)};`,
  `INSERT INTO Survey_Forms (name, description, form_kind, has_answer_key, is_active, slug, collects_payment, base_price, payment_account_json)`,
  `VALUES (${q("ลงทะเบียนร่วมงาน Halloween Party for Kids")}, ${q("Burasiri Watcharapol · Dress Code: Halloween Theme")}, 'survey', 0, 1, ${q(SLUG)}, 1, 0, ${q(JSON.stringify(ACCOUNT))});`,
  ...FIELDS.map(([key, page, idx, type, label, required, options, config]) =>
    `INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json) ` +
    `SELECT id, ${q(key)}, ${page}, ${idx}, ${q(type)}, ${q(label)}, ${required}, ${q(options)}, ${q(config)} FROM Survey_Forms WHERE slug = ${q(SLUG)};`),
].join('\n');

const out = process.argv[2];
fs.writeFileSync(out, sql, 'utf8');
console.log(`wrote ${FIELDS.length} fields + the form to ${out}`);
