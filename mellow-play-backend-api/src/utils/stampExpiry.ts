// Stamps never expire on their naive (earn_date + N months) anniversary —
// expiry is always rounded UP to the nearest half-year boundary (Jun 30 or
// Dec 31) of that naive date's own year, so customers only ever see stamps
// expire mid-year or year-end.
export function computeStampExpiry(earnedAt: Date, expiryMonths: number): Date {
  const naive = new Date(earnedAt.getTime());
  naive.setMonth(naive.getMonth() + expiryMonths);

  const year = naive.getFullYear();
  const juneEnd = new Date(year, 5, 30, 23, 59, 59);
  const decEnd = new Date(year, 11, 31, 23, 59, 59);

  return naive <= juneEnd ? juneEnd : decEnd;
}
