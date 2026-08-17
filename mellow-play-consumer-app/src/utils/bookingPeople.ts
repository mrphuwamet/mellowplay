// Who a booking is actually for, as shown to the family.
//
// A form-based registration (events with a registration form) names its real
// participants in the form's family_member_picker answers — the backend's
// booking lists surface those as `form_people`. The account child the seat
// is technically booked under still drives QR/reports, but presenting them
// as "the participant" read wrong whenever the form named someone else, so
// every display leads with the form's people and only falls back to the
// system child for ordinary, form-less class bookings.
export interface BookingPersonAnswer { label: string; value: string }

interface BookingLike {
  form_people?: BookingPersonAnswer[] | null;
  child_id?: number;
  child_nickname?: string | null;
  child_name?: string | null;
}

export const getBookingPeopleLabel = (booking: BookingLike): string =>
  booking.form_people && booking.form_people.length > 0
    ? booking.form_people.map(p => p.value).join(' · ')
    : (booking.child_nickname || booking.child_name || '');

// Whether this booking involves a given person — either as the seat-holder
// child (by id) or named in the form's participant answers (by any of the
// display names that person goes by). Form answers store the picker's
// display text (nickname-preferred), so matching is by name, not id.
export const bookingMatchesPerson = (
  booking: BookingLike,
  person: { childId?: number; names: (string | null | undefined)[] },
): boolean => {
  if (person.childId != null && booking.child_id === person.childId) return true;
  const names = new Set(person.names.map(n => (n || '').trim()).filter(Boolean));
  if (names.size === 0) return false;
  return (booking.form_people || []).some(p => names.has((p.value || '').trim()));
};
