const DAYS_OF_WEEK = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const formatCalendarSummary = (summaryJson?: string): string => {
  if (!summaryJson) return 'เช็ครอบกิจกรรม';
  try {
    const rules = JSON.parse(summaryJson);
    if (!Array.isArray(rules) || rules.length === 0) return 'รอประกาศวัน';
    
    const specificDates = new Set<string>();
    const regularDays = new Set<number>();
    
    rules.forEach((r: any) => {
      if (r.day_of_week === null || r.day_of_week === 'null') {
        if (r.specific_date) specificDates.add(r.specific_date);
      } else {
        regularDays.add(parseInt(r.day_of_week));
      }
    });

    if (regularDays.size > 0) {
      const days = Array.from(regularDays).sort((a, b) => a - b);
      if (days.length === 7) return 'เปิดสอนทุกวัน';
      return 'ทุกวัน ' + days.map(d => DAYS_OF_WEEK[d]).join(', ');
    }

    if (specificDates.size > 0) {
      const dates = Array.from(specificDates).sort();
      if (dates.length === 1) {
        const d = new Date(dates[0]);
        return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
      } else if (dates.length <= 3) {
        return dates.map(ds => {
          const d = new Date(ds);
          return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
        }).join(', ');
      } else {
        const first = new Date(dates[0]);
        const last = new Date(dates[dates.length - 1]);
        return `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} - ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]} ${last.getFullYear() + 543}`;
      }
    }

    return 'เช็ครอบกิจกรรม';
  } catch (e) {
    return 'เช็ครอบกิจกรรม';
  }
};
