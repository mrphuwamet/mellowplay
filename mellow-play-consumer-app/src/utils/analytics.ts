import apiClient from './apiClient';

// Fire-and-forget view tracking for the CRM dashboard funnel (เข้าชม → จอง →
// เรียนจบ → คะแนน). Call this anywhere a user shows real interest in a course
// — not just on CourseDetail's mount — so cards that jump straight to
// /booking (skipping the detail page) still register as a view.
export function trackCourseView(courseId: number | string, childId?: number) {
  apiClient.post(`/courses/${courseId}/view`, { childId: typeof childId === 'number' ? childId : undefined }).catch(() => {});
}
