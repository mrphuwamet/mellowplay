export interface Deliverable {
  id: string;
  label: string;
  done: boolean;
}

export interface TimelineEntry {
  date: string; // ISO
  note: string;
}

export type SponsorCategory = 'การศึกษา' | 'อาหารและเครื่องดื่ม' | 'ค้าปลีก' | 'เทคโนโลยี' | 'สุขภาพ' | 'อื่นๆ';
export type SponsorContractStatus = 'signed' | 'pending';

export interface Sponsor {
  id: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  category: SponsorCategory;
  value: number; // THB
  startDate: string; // ISO
  endDate: string; // ISO
  contractStatus: SponsorContractStatus;
  deliverables: Deliverable[];
  timeline: TimelineEntry[];
  notes: string;
}

const isoDaysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let nextId = 1;
const sponsor = (partial: Omit<Sponsor, 'id'>): Sponsor => ({ id: `SPN-${1000 + nextId++}`, ...partial });

export const MOCK_SPONSORS: Sponsor[] = [
  sponsor({
    companyName: 'บริษัท นมสดใจดี จำกัด',
    contactName: 'คุณศิริพร แจ่มใส',
    contactPhone: '081-234-5671',
    contactEmail: 'siriporn@happymilk.co.th',
    category: 'อาหารและเครื่องดื่ม',
    value: 250000,
    startDate: isoDaysFromNow(-120),
    endDate: isoDaysFromNow(15),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'โลโก้บนป้ายกิจกรรม', done: true },
      { id: 'd2', label: 'แจกตัวอย่างสินค้าในงานกิจกรรม', done: true },
      { id: 'd3', label: 'โพสต์ขอบคุณใน Social Media', done: false },
      { id: 'd4', label: 'รายงานสรุปผลหลังจบแคมเปญ', done: false },
    ],
    timeline: [
      { date: isoDaysFromNow(-120), note: 'เซ็นสัญญาเรียบร้อย' },
      { date: isoDaysFromNow(-90), note: 'ส่งโลโก้และสื่อประชาสัมพันธ์ให้ทีมออกแบบ' },
      { date: isoDaysFromNow(-40), note: 'ติดตั้งป้ายโลโก้ที่สาขาสุขุมวิท' },
    ],
    notes: 'ใกล้ครบสัญญา ต้องติดต่อเจรจาต่ออายุภายในสิ้นเดือน',
  }),
  sponsor({
    companyName: 'ธนาคาร กรุงศรีมั่งมี',
    contactName: 'คุณอนุชา ทองคำ',
    contactPhone: '089-876-5432',
    contactEmail: 'anucha@krungsrimoney.co.th',
    category: 'เทคโนโลยี',
    value: 500000,
    startDate: isoDaysFromNow(-60),
    endDate: isoDaysFromNow(305),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'บูธประชาสัมพันธ์ในงานเปิดเทอม', done: true },
      { id: 'd2', label: 'ป้ายโลโก้หน้าสาขา', done: true },
      { id: 'd3', label: 'ข่าวประชาสัมพันธ์ร่วม (Press Release)', done: true },
      { id: 'd4', label: 'กิจกรรม CSR ร่วมกับผู้ปกครอง', done: false },
      { id: 'd5', label: 'รายงานผลลัพธ์รายไตรมาส', done: false },
    ],
    timeline: [
      { date: isoDaysFromNow(-60), note: 'เซ็นสัญญาสปอนเซอร์หลักประจำปี' },
      { date: isoDaysFromNow(-45), note: 'จัดบูธในงานเปิดเทอม' },
      { date: isoDaysFromNow(-10), note: 'เผยแพร่ข่าวประชาสัมพันธ์ร่วม' },
    ],
    notes: 'สปอนเซอร์รายใหญ่ที่สุดของปีนี้',
  }),
  sponsor({
    companyName: 'ร้านหนังสือ ปัญญาดี',
    contactName: 'คุณรัตนา ปัญญาชาญ',
    contactPhone: '062-345-6789',
    contactEmail: 'rattana@panyadee-books.co.th',
    category: 'ค้าปลีก',
    value: 80000,
    startDate: isoDaysFromNow(-200),
    endDate: isoDaysFromNow(-10),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'ส่วนลดหนังสือให้สมาชิก', done: true },
      { id: 'd2', label: 'โลโก้บนใบปลิว', done: true },
    ],
    timeline: [
      { date: isoDaysFromNow(-200), note: 'เซ็นสัญญาระยะสั้น' },
      { date: isoDaysFromNow(-15), note: 'สิ้นสุดแคมเปญส่วนลดหนังสือ' },
    ],
    notes: 'สัญญาหมดอายุแล้ว รอพิจารณาต่อสัญญาปีหน้า',
  }),
  sponsor({
    companyName: 'คลินิกเด็กสุขภาพดี',
    contactName: 'นพ. ธีระ แข็งแรง',
    contactPhone: '090-111-2233',
    contactEmail: 'teera@healthykids-clinic.co.th',
    category: 'สุขภาพ',
    value: 150000,
    startDate: isoDaysFromNow(-30),
    endDate: isoDaysFromNow(335),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'ตรวจสุขภาพเด็กฟรีประจำปี', done: false },
      { id: 'd2', label: 'บูธให้คำปรึกษาด้านสุขภาพ', done: true },
      { id: 'd3', label: 'โลโก้บน Newsletter', done: false },
    ],
    timeline: [
      { date: isoDaysFromNow(-30), note: 'เซ็นสัญญาเรียบร้อย' },
      { date: isoDaysFromNow(-20), note: 'จัดบูธให้คำปรึกษาครั้งแรก' },
    ],
    notes: '',
  }),
  sponsor({
    companyName: 'บริษัท ของเล่นสร้างสรรค์ จำกัด',
    contactName: 'คุณนันทวัน สร้างสรรค์',
    contactPhone: '083-999-8877',
    contactEmail: 'nantawan@creativetoys.co.th',
    category: 'ค้าปลีก',
    value: 120000,
    startDate: isoDaysFromNow(-5),
    endDate: isoDaysFromNow(360),
    contractStatus: 'pending',
    deliverables: [
      { id: 'd1', label: 'ส่งของเล่นตัวอย่างให้ทดลอง', done: false },
      { id: 'd2', label: 'โลโก้บนกล่องกิจกรรม', done: false },
    ],
    timeline: [
      { date: isoDaysFromNow(-5), note: 'อยู่ระหว่างเจรจาเงื่อนไขสัญญา' },
    ],
    notes: 'รอเซ็นสัญญาอย่างเป็นทางการ คาดว่าจะเซ็นภายในสัปดาห์หน้า',
  }),
  sponsor({
    companyName: 'ร้านเบเกอรี่ หวานเล็ก',
    contactName: 'คุณสายฝน หอมหวาน',
    contactPhone: '065-222-3344',
    contactEmail: 'saifon@littlesweet-bakery.co.th',
    category: 'อาหารและเครื่องดื่ม',
    value: 45000,
    startDate: isoDaysFromNow(-15),
    endDate: isoDaysFromNow(20),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'ขนมว่างในงานกิจกรรมผู้ปกครอง', done: true },
      { id: 'd2', label: 'โพสต์ขอบคุณใน Facebook Page', done: false },
    ],
    timeline: [
      { date: isoDaysFromNow(-15), note: 'เซ็นสัญญาสนับสนุนงานกิจกรรมเดือนนี้' },
    ],
    notes: 'ใกล้หมดสัญญา ควรติดตามผลก่อนต่ออายุ',
  }),
  sponsor({
    companyName: 'บริษัท แอพเรียนสนุก จำกัด',
    contactName: 'คุณภาคภูมิ ดิจิทัล',
    contactPhone: '086-555-1122',
    contactEmail: 'pakpoom@funlearnapp.co.th',
    category: 'เทคโนโลยี',
    value: 300000,
    startDate: isoDaysFromNow(-90),
    endDate: isoDaysFromNow(275),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'สิทธิ์ใช้แอปฟรีสำหรับสมาชิก', done: true },
      { id: 'd2', label: 'Workshop สาธิตแอปให้ผู้ปกครอง', done: true },
      { id: 'd3', label: 'โลโก้บนเว็บไซต์', done: true },
      { id: 'd4', label: 'รายงานการใช้งานรายเดือน', done: true },
    ],
    timeline: [
      { date: isoDaysFromNow(-90), note: 'เซ็นสัญญาความร่วมมือด้านเทคโนโลยี' },
      { date: isoDaysFromNow(-70), note: 'เปิดสิทธิ์ใช้งานแอปให้สมาชิกทุกสาขา' },
      { date: isoDaysFromNow(-30), note: 'จัด Workshop สาธิตแอปที่สาขาราชพฤกษ์' },
    ],
    notes: 'ผลตอบรับดีมาก พิจารณาขยายสัญญาเพิ่มปีถัดไป',
  }),
  sponsor({
    companyName: 'สวนน้ำแฮปปี้แลนด์',
    contactName: 'คุณดวงใจ สุขสำราญ',
    contactPhone: '087-444-5566',
    contactEmail: 'duangjai@happyland-water.co.th',
    category: 'อื่นๆ',
    value: 60000,
    startDate: isoDaysFromNow(-400),
    endDate: isoDaysFromNow(-35),
    contractStatus: 'signed',
    deliverables: [
      { id: 'd1', label: 'บัตรส่วนลดสวนน้ำให้สมาชิก', done: true },
      { id: 'd2', label: 'โลโก้บนใบปลิวกิจกรรมปิดเทอม', done: true },
    ],
    timeline: [
      { date: isoDaysFromNow(-400), note: 'เซ็นสัญญาแคมเปญปิดเทอม' },
      { date: isoDaysFromNow(-40), note: 'สิ้นสุดแคมเปญ' },
    ],
    notes: 'หมดอายุแล้ว ผลตอบรับดี น่าพิจารณาต่อสัญญาปิดเทอมหน้า',
  }),
];

// Monthly sponsorship revenue for the trailing 8 months, used by the
// revenue line chart on the Sponsorship dashboard.
const monthLabel = (monthsAgo: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
};

export const SPONSORSHIP_REVENUE_TREND = [720000, 680000, 850000, 910000, 780000, 1020000, 960000, 1150000]
  .map((revenue, i, arr) => ({ label: monthLabel(arr.length - 1 - i), revenue }));
