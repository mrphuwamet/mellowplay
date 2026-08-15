const DAYS_OF_WEEK = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
// Full month names, for the 'ช่วงเดือน…' summary — an abbreviation reads
// oddly in a sentence.
const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// A course with no calendar bound at all, or whose only slots were specific
// one-off dates that have all already passed, has nothing left to book —
// shown as "จบแล้ว" (ended) rather than "รอประกาศวัน" (pending schedule),
// which read as "check back later" for something that structurally never
// will get a new date. Recurring weekly slots (regularDays) are ongoing by
// definition and never count as ended.
export const isCourseEnded = (course: { calendar_id?: number | null; calendar_summary_json?: string | null }): boolean => {
  if (!course.calendar_id) return true;
  if (!course.calendar_summary_json) return false; // calendar exists, summary just hasn't loaded/been set yet
  try {
    const rules = JSON.parse(course.calendar_summary_json);
    if (!Array.isArray(rules) || rules.length === 0) return true;

    const specificDates: string[] = [];
    let hasRegularDay = false;
    rules.forEach((r: any) => {
      if (r.day_of_week === null || r.day_of_week === 'null') {
        if (r.specific_date) specificDates.push(r.specific_date);
      } else {
        hasRegularDay = true;
      }
    });

    if (hasRegularDay) return false;
    if (specificDates.length === 0) return true;

    const todayStr = new Date().toISOString().split('T')[0];
    return specificDates.every(d => d < todayStr);
  } catch {
    return false;
  }
};

// Independent of isCourseEnded above — a course can still have future
// calendar slots but registration cut off earlier (e.g. prep time needed),
// or vice versa. Both just result in the booking button being hidden.
export const isRegistrationClosed = (course: { registration_close_at?: string | null }): boolean =>
  !!course.registration_close_at && new Date(course.registration_close_at) < new Date();

/**
 * A course's schedule in one line, as a person would say it.
 *
 * Three shapes, because the underlying rules come in three shapes:
 *   - weekly rules      -> "ทุกวัน" / "ทุกเสาร์–อาทิตย์" / "ทุกจันทร์, พุธ, ศุกร์"
 *   - a few dates       -> "3–6, 11–13 ก.ย."   (runs of consecutive days collapse)
 *   - dates all over one month -> "ช่วงเดือนกันยายน"
 *
 * Consecutive days are collapsed because "3, 4, 5, 6 ก.ย." is the same fact
 * written four times, and a card has one line to say it in.
 */
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
      if (days.length === 7) return 'ทุกวัน จันทร์ - อาทิตย์';
      // Runs of consecutive weekdays read as a span. Sunday is 0 in JS but
      // last in a Thai week, so the list is walked in week order first.
      const weekOrder = [1, 2, 3, 4, 5, 6, 0];
      const ordered = weekOrder.filter(d => days.includes(d));
      const runs: number[][] = [];
      for (const d of ordered) {
        const last = runs[runs.length - 1];
        if (last && weekOrder.indexOf(d) === weekOrder.indexOf(last[last.length - 1]) + 1) last.push(d);
        else runs.push([d]);
      }
      return 'ทุก' + runs
        .map(run => run.length >= 2
          ? `${DAYS_OF_WEEK[run[0]]} - ${DAYS_OF_WEEK[run[run.length - 1]]}`
          : run.map(d => DAYS_OF_WEEK[d]).join(', '))
        .join(', ');
    }

    if (specificDates.size > 0) {
      const dates = Array.from(specificDates).sort().map(ds => new Date(`${ds}T00:00:00`));
      const sameMonth = dates.every(d => d.getMonth() === dates[0].getMonth() && d.getFullYear() === dates[0].getFullYear());

      // Collapse consecutive days into ranges: [3,4,5,6,11,12,13] -> "3-6, 11-13".
      const groups: Date[][] = [];
      for (const d of dates) {
        const last = groups[groups.length - 1];
        const prev = last?.[last.length - 1];
        const isNextDay = prev && (d.getTime() - prev.getTime()) === 86400000;
        if (isNextDay) last.push(d);
        else groups.push([d]);
      }

      if (sameMonth) {
        const month = SHORT_MONTHS[dates[0].getMonth()];
        // Too many separate runs to list — the month is the honest summary.
        if (groups.length > 3) return `ช่วงเดือน${MONTHS[dates[0].getMonth()]}`;
        const parts = groups.map(g => g.length === 1
          ? `${g[0].getDate()}`
          : `${g[0].getDate()}-${g[g.length - 1].getDate()}`);
        return `${parts.join(', ')} ${month}`;
      }

      const first = dates[0];
      const last = dates[dates.length - 1];
      return `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} - ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]}`;
    }

    return 'เช็ครอบกิจกรรม';
  } catch (e) {
    return 'เช็ครอบกิจกรรม';
  }
};
