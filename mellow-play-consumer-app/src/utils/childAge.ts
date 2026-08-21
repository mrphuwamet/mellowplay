// One age rule, shared by everything that compares a person to a course's
// age range. It used to live only inside Booking.tsx, where it powered the
// "this class is for ages X–Y" warning; the roadmap's suggestions need the
// same comparison, and two copies of an age calculation drift.

export interface AgeRange {
  age_min?: number | null;
  age_max?: number | null;
}

/**
 * Plain numeric age in whole years. Distinct from the "X ขวบ Y เดือน" display
 * string elsewhere, which is not something a min/max range can be compared
 * against.
 */
export const getAgeYears = (birthDateString?: string | null): number | null => {
  if (!birthDateString) return null;
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  const months = today.getMonth() - birthDate.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) years--;
  return years;
};

/** Age including the part-year, needed by the ranges measured in months. */
const getAgeYearsFractional = (birthDateString?: string | null): number | null => {
  const years = getAgeYears(birthDateString);
  if (years == null) return null;
  const birthDate = new Date(birthDateString as string);
  const today = new Date();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) months += 12;
  return years + months / 12;
};

/**
 * Whether one person's age falls inside a course's range.
 *
 * The two bounds are read differently because the catalogue uses the range
 * field for two different things. "Baby Quest 6-12 เดือน" is stored as 0.5–1,
 * so the lower bound has to see the part-year or a nine-month-old (0 whole
 * years) is judged too young for a course aimed squarely at them. "Baby Build
 * 3-4 ปี" means through the whole of age four the way ages are quoted in Thai,
 * so a whole-number upper bound admits the entire year — a child of 4y6m is
 * "4 ขวบ" and belongs there.
 *
 * The cost of that reading is that a whole-number upper bound is generous with
 * a range that actually meant months: an 18-month-old is not excluded from
 * 0.5–1. Erring toward showing a course is the same direction chosen for a
 * person with no birthday on file, and the booking screen still warns.
 */
const ageFitsRange = (dob: string | null | undefined, course: AgeRange): boolean => {
  const exact = getAgeYearsFractional(dob);
  if (exact == null) return true;
  const { age_min, age_max } = course;
  if (age_min != null && exact < age_min) return false;
  if (age_max != null) {
    const ceiling = Number.isInteger(age_max) ? age_max + 1 : age_max;
    if (Number.isInteger(age_max) ? exact >= ceiling : exact > ceiling) return false;
  }
  return true;
};

/** True when this person's age falls outside the course's stated range. */
export const isChildAgeMismatch = (dob: string, course: AgeRange | null): boolean => {
  if (!course) return false;
  if (getAgeYears(dob) == null) return false;
  return !ageFitsRange(dob, course);
};

/**
 * Whether a course is worth showing to a set of people — true if it suits at
 * least one of them.
 *
 * Both unknowns resolve toward showing the course, on purpose. A course that
 * states no age range suits everyone, and a person whose birthday we do not
 * have cannot be ruled out: silently hiding activities because a profile is
 * incomplete is worse than suggesting one that turns out not to fit.
 */
export const courseFitsAnyAge = (course: AgeRange, dobs: (string | null | undefined)[]): boolean => {
  if (course.age_min == null && course.age_max == null) return true;
  const known = dobs.filter(d => getAgeYears(d) != null);
  if (known.length === 0) return true;
  return known.some(dob => ageFitsRange(dob, course));
};
