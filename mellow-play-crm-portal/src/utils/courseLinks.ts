import { CONSUMER_APP_URL } from '../config';

// Mirrors the consumer app's own getCourseDetailPath (src/utils/courseLinks.ts
// there) — kept in sync manually since the two apps don't share a package.

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

export const getCourseDetailUrl = (course: { id: number; public_code?: string | null; is_event?: number | boolean; is_service?: number | boolean }): string =>
  `${CONSUMER_APP_URL}${getCourseDetailPath(course)}`;
