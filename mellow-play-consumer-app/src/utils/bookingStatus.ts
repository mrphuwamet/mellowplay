export interface BookingStatusMeta {
  th: string;
  en: string;
  bg: string;
  fg: string;
}

export const BOOKING_STATUS_META: Record<string, BookingStatusMeta> = {
  pending:         { th: 'รอชำระเงิน',  en: 'Awaiting Payment', bg: 'bg-amber-100',   fg: 'text-amber-700' },
  confirmed:       { th: 'กำลังจะถึง',   en: 'Upcoming',         bg: 'bg-sky-100',     fg: 'text-sky-700' },
  confirmed_paid:  { th: 'กำลังจะถึง',   en: 'Upcoming',         bg: 'bg-sky-100',     fg: 'text-sky-700' },
  awaiting_report: { th: 'คลาสจบแล้ว',  en: 'Class Finished',  bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  completed:       { th: 'คลาสจบแล้ว',  en: 'Class Finished',  bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  cancelled:       { th: 'ยกเลิกแล้ว',  en: 'Cancelled',        bg: 'bg-red-100',     fg: 'text-red-700' },
};
