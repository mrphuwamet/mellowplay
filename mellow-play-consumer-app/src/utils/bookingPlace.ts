/**
 * Where a booking actually takes place.
 *
 * The booking lists used to show only the branch, so an event held somewhere
 * else — a mall hall, a partner venue — told a parent to go to the branch
 * instead. The activity's own location wins whenever it is set; the branch is
 * the fallback for ordinary classes, which are held at a branch and normally
 * leave the location field empty.
 */
export interface BookingPlaceSource {
  course_location?: string | null;
  course_location_link?: string | null;
  branch_name?: string | null;
}

export const getBookingPlace = (booking: BookingPlaceSource): { name: string; link: string | null } | null => {
  const courseLocation = (booking.course_location || '').trim();
  if (courseLocation) {
    const link = (booking.course_location_link || '').trim();
    return { name: courseLocation, link: link || null };
  }
  const branch = (booking.branch_name || '').trim();
  return branch ? { name: branch, link: null } : null;
};
