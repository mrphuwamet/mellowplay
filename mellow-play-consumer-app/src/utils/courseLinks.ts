// Consumer-facing detail path for a course — reflects what it actually is
// (event/service/class) rather than always saying "/class/", since that read
// wrong for events shared externally. All three paths render the same
// CourseDetail component (it fetches by :id and reads is_event/is_service
// itself), so this is purely a URL-naming concern, not a routing split —
// old "/class/:id" links already shared stay valid.

// Which segment addresses a course in a URL.
//
// public_code where there is one: a readable slug plus ten characters no one
// walks through. The row id is a counter, and for the private classes added in
// migration 0117 that is fatal — /class/12 announces that 11 and 13 exist. Only
// the code opens a private class; a listed one still answers to its id, so
// every link shared before codes existed keeps working.
const courseSegment = (course: { id: number; public_code?: string | null }): string =>
  course.public_code || String(course.id);

export const getCourseDetailPath = (course: { id: number; public_code?: string | null; is_event?: number | boolean; is_service?: number | boolean }): string => {
  const segment = courseSegment(course);
  if (course.is_event) return `/activities/${segment}`;
  if (course.is_service) return `/services/${segment}`;
  return `/class/${segment}`;
};
