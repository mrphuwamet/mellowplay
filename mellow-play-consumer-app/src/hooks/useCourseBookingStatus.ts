import { useEffect, useState } from 'react';
import apiClient from '../utils/apiClient';

export type CourseBookingStatus = 'upcoming' | 'completed';
export type CourseBookingStatusMap = Record<number, CourseBookingStatus>;

// Per-course booking status (for the current child) so course cards can flag
// "already registered" / "already taken" — mainly to stop duplicate
// registration on one-time-only Extra Classes. 'upcoming' takes priority
// over 'completed' when a course has both.
export function useCourseBookingStatus(userId: number | undefined, childId: number | string | undefined) {
  const [statusMap, setStatusMap] = useState<CourseBookingStatusMap>({});
  // Starts true whenever there's a real child to check, so callers can hold
  // off rendering "already registered" badges until the fetch actually
  // resolves — otherwise cards briefly render as unregistered first.
  const [isLoading, setIsLoading] = useState(!!userId && !!childId && childId !== 'guest');

  useEffect(() => {
    if (!userId || !childId || childId === 'guest') {
      setStatusMap({});
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    const fetchStatus = async () => {
      try {
        const [historyRes, upcomingRes] = await Promise.all([
          apiClient.get(`/profiles/bookings/history?userId=${userId}`),
          apiClient.get(`/profiles/bookings/upcoming?userId=${userId}`),
        ]);
        if (cancelled) return;

        const map: CourseBookingStatusMap = {};
        if (historyRes.data.success) {
          for (const b of historyRes.data.bookings as any[]) {
            if (b.child_id === childId) map[b.course_id] = 'completed';
          }
        }
        if (upcomingRes.data.success) {
          for (const b of upcomingRes.data.bookings as any[]) {
            if (b.child_id === childId) map[b.course_id] = 'upcoming';
          }
        }
        setStatusMap(map);
      } catch (err) {
        console.error('Failed to load course booking status:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchStatus();
    return () => { cancelled = true; };
  }, [userId, childId]);

  return { statusMap, isLoading };
}
