import { CONSUMER_APP_URL } from '../config';

// Mirrors the consumer app's own getCourseDetailPath (src/utils/courseLinks.ts
// there) — kept in sync manually since the two apps don't share a package.
export const getCourseDetailPath = (course: { id: number; is_event?: number | boolean; is_service?: number | boolean }): string => {
  if (course.is_event) return `/activities/${course.id}`;
  if (course.is_service) return `/services/${course.id}`;
  return `/class/${course.id}`;
};

export const getCourseDetailUrl = (course: { id: number; is_event?: number | boolean; is_service?: number | boolean }): string =>
  `${CONSUMER_APP_URL}${getCourseDetailPath(course)}`;
