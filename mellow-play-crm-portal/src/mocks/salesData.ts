export interface SalesTransaction {
  id: string;
  date: string; // ISO YYYY-MM-DD
  time: string; // HH:mm
  customerName: string;
  branch: string;
  productName: string;
  category: 'คอร์สเรียน' | 'แพ็คเกจ' | 'สินค้า' | 'บริการเสริม';
  quantity: number;
  amount: number; // THB
  paymentMethod: 'เงินสด' | 'โอนเงิน' | 'พร้อมเพย์' | 'บัตรเครดิต' | 'Beam';
  status: 'สำเร็จ' | 'คืนเงิน' | 'รอดำเนินการ';
}

export const MOCK_BRANCHES = ['สาขาสุขุมวิท', 'สาขาราชพฤกษ์', 'สาขาเชียงใหม่'];

const isoDaysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};

const PRODUCTS: { name: string; category: SalesTransaction['category']; price: number }[] = [
  { name: 'คอร์สปั้นดินน้ำมัน', category: 'คอร์สเรียน', price: 890 },
  { name: 'คอร์สศิลปะเด็กเล็ก', category: 'คอร์สเรียน', price: 1200 },
  { name: 'คอร์สดนตรีสำหรับเด็ก', category: 'คอร์สเรียน', price: 990 },
  { name: 'แพ็คเกจ 10 ครั้ง', category: 'แพ็คเกจ', price: 8500 },
  { name: 'แพ็คเกจรายเดือน Unlimited', category: 'แพ็คเกจ', price: 4900 },
  { name: 'ชุดคิทศิลปะ DIY', category: 'สินค้า', price: 350 },
  { name: 'เสื้อยืด Mellow Play', category: 'สินค้า', price: 290 },
  { name: 'บริการจัดปาร์ตี้วันเกิด', category: 'บริการเสริม', price: 6500 },
];

const CUSTOMERS = [
  'คุณสมชาย ใจดี', 'คุณวรรณา สุขสันต์', 'คุณปิยะ รักเรียน', 'คุณนภา แสงทอง',
  'คุณธนกร ศรีสุข', 'คุณอรทัย บุญมาก', 'คุณกิตติ วงศ์ไพศาล', 'คุณสุดา เจริญพร',
  'คุณวิชัย มั่นคง', 'คุณพรทิพย์ อารีย์', 'คุณเอกชัย ยิ้มแย้ม', 'คุณมาลี ทองอินทร์',
];

const PAYMENTS: SalesTransaction['paymentMethod'][] = ['เงินสด', 'โอนเงิน', 'พร้อมเพย์', 'บัตรเครดิต', 'Beam'];

// 45 hand-varied rows spanning the last 30 days across all 3 branches —
// intentionally the single source of truth for this dashboard: KPIs, the
// revenue trend, revenue-by-category, and the Top Products table are all
// derived (aggregated) from this list rather than hardcoded separately, so
// every section on the page stays numerically consistent with the others.
export const SALES_TRANSACTIONS: SalesTransaction[] = Array.from({ length: 45 }).map((_, i) => {
  const product = PRODUCTS[i % PRODUCTS.length];
  const branch = MOCK_BRANCHES[i % MOCK_BRANCHES.length];
  const customer = CUSTOMERS[i % CUSTOMERS.length];
  const payment = PAYMENTS[i % PAYMENTS.length];
  const daysBack = Math.floor((i * 29) / 45);
  const quantity = 1 + (i % 3);
  const status: SalesTransaction['status'] = i % 17 === 0 ? 'คืนเงิน' : i % 11 === 0 ? 'รอดำเนินการ' : 'สำเร็จ';
  return {
    id: `TXN-${10230 + i}`,
    date: isoDaysAgo(daysBack),
    time: `${String(9 + (i % 9)).padStart(2, '0')}:${i % 2 === 0 ? '15' : '45'}`,
    customerName: customer,
    branch,
    productName: product.name,
    category: product.category,
    quantity,
    amount: product.price * quantity,
    paymentMethod: payment,
    status,
  };
});
