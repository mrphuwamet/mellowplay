/**
 * What to call a course, given what it actually is.
 *
 * The three kinds share one component and one booking flow, so the copy
 * defaulted to "คลาส" everywhere — and a parent registering for a filming day
 * was told about a class they were not attending, and a haircut booking asked
 * them to confirm their "คลาส". Small, and the kind of small that makes a page
 * read as though it was written for something else.
 *
 * Kept as one function rather than a ternary at each call site so the three
 * words cannot drift apart screen by screen, which is how it started.
 */

export interface CourseKindSource {
  is_event?: number | boolean | null;
  is_service?: number | boolean | null;
}

export type CourseKind = 'event' | 'service' | 'class';

export const courseKind = (course?: CourseKindSource | null): CourseKind =>
  course?.is_event ? 'event' : course?.is_service ? 'service' : 'class';

/** "กิจกรรม" / "บริการ" / "คลาส" — the noun on its own. */
export const courseKindWord = (course: CourseKindSource | null | undefined, lang: string): string => {
  const kind = courseKind(course);
  if (lang === 'en') return kind === 'event' ? 'activity' : kind === 'service' ? 'service' : 'class';
  return kind === 'event' ? 'กิจกรรม' : kind === 'service' ? 'บริการ' : 'คลาส';
};

/** "กิจกรรมนี้" / "this activity" — the noun pointing at the one in hand. */
export const thisCourseWord = (course: CourseKindSource | null | undefined, lang: string): string =>
  lang === 'en' ? `this ${courseKindWord(course, lang)}` : `${courseKindWord(course, lang)}นี้`;

/**
 * The verb. An event is registered for; a class or a service is booked.
 *
 * Thai says ลงทะเบียน for an event and จอง for the other two, which is the
 * split the course cards already used before this file existed.
 */
export const courseActionWord = (course: CourseKindSource | null | undefined, lang: string): string =>
  courseKind(course) === 'event'
    ? (lang === 'en' ? 'register for' : 'ลงทะเบียน')
    : (lang === 'en' ? 'book' : 'จอง');

/** "เด็กผู้เข้าคลาส" / "เด็กผู้ร่วมกิจกรรม" — who the booking is for. */
export const attendeeWord = (course: CourseKindSource | null | undefined, lang: string): string => {
  const kind = courseKind(course);
  if (lang === 'en') return kind === 'event' ? 'Attendees' : kind === 'service' ? 'Who it is for' : 'Class Attendees';
  return kind === 'event' ? 'เด็กผู้ร่วมกิจกรรม' : kind === 'service' ? 'เด็กผู้รับบริการ' : 'เด็กผู้เข้าคลาส';
};
