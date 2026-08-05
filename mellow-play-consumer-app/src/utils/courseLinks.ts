// Consumer-facing detail path for a course — reflects what it actually is
// (event/service/class) rather than always saying "/class/", since that read
// wrong for events shared externally. All three paths render the same
// CourseDetail component (it fetches by :id and reads is_event/is_service
// itself), so this is purely a URL-naming concern, not a routing split —
// old "/class/:id" links already shared stay valid.
export const getCourseDetailPath = (course: { id: number; is_event?: number | boolean; is_service?: number | boolean }): string => {
  if (course.is_event) return `/activities/${course.id}`;
  if (course.is_service) return `/services/${course.id}`;
  return `/class/${course.id}`;
};
