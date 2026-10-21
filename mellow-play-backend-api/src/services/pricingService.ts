/**
 * What a booking costs, worked out in one place.
 *
 * Before this, the amount was computed inline in createBooking and the
 * consumer app worked out its own preview separately — one price times the
 * headcount, with no idea Premium members exist. The two agreed only because
 * nothing had ever made them differ. A per-seat ladder makes them differ on
 * the very first booking: the button says 1,000 and Beam charges 850.
 *
 * So there is exactly one implementation, and both the checkout and the
 * screen that previews it call it. The screen never computes a total, and a
 * total arriving from a browser is never trusted — the amount handed to Beam
 * is always produced here, server-side, from the course and the answers.
 */

export type PriceAdjustmentKind = 'seat-tier' | 'membership' | 'campaign' | 'promo';

export interface PriceAdjustment {
  kind: PriceAdjustmentKind;
  label: string;
  /** Negative lowers the price. Shown as its own line so a bill can be read. */
  amount: number;
}

export interface ParticipantLine {
  childId: number;
  /** 1-based position in this booking — what the seat ladder is read against. */
  seat: number;
  /** Before any adjustment: the ladder's price for this seat, or the course price. */
  base: number;
  adjustments: PriceAdjustment[];
  subtotal: number;
}

export interface ExtraLine {
  /** The form field that produced this charge. */
  fieldKey: string;
  label: string;
  amount: number;
  /** The participant it belongs to, once answers are asked per person. */
  childId: number | null;
}

export interface Quote {
  /** Named here so a caller showing the bill does not re-query the course. */
  course: { id: number; name: string };
  participants: ParticipantLine[];
  extras: ExtraLine[];
  total: number;
  currency: 'THB';
}

export interface QuoteInput {
  courseId: number;
  /** One entry per participant. Values <= 0 are guests with no roster row. */
  childIds: number[];
  ageGroup?: string | null;
  /** The registration form's answers, for options that carry a price. */
  formAnswers?: Record<string, any> | null;
  formId?: number | null;
  promoCode?: string | null;
}

interface PricedOption {
  label: string;
  price: number;
}

/** An option is priced when it is an object carrying a positive `price`. */
function pricedOptionsOf(optionsJson: string | null | undefined): PricedOption[] {
  if (!optionsJson) return [];
  try {
    const parsed = JSON.parse(optionsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o: any) => o && typeof o === 'object' && Number(o.price) > 0 && o.label)
      .map((o: any) => ({ label: String(o.label), price: Number(o.price) }));
  } catch {
    // A field whose options are unreadable charges nothing rather than
    // guessing a number onto somebody's bill.
    return [];
  }
}

/** Which option labels an answer selected — a checkbox gives several. */
function selectedLabels(answer: any): string[] {
  if (Array.isArray(answer)) return answer.map(String);
  if (answer === null || answer === undefined || answer === '') return [];
  return [String(answer)];
}

/**
 * The ladder for this course, read as "from this seat onwards, this price".
 * Returns an empty array when the course has no ladder, which is every course
 * that existed before this feature — they keep pricing every seat the same.
 */
async function loadSeatLadder(db: any, courseId: number, ageGroup?: string | null) {
  const { results } = await db.prepare(
    `SELECT from_seat, price, age_group FROM Course_Price_Tiers
     WHERE course_id = ? AND (age_group IS NULL OR age_group = ?)
     ORDER BY from_seat ASC`
  ).bind(courseId, ageGroup ?? '').all();

  // A tier naming this age bracket beats the catch-all for the same seat,
  // mirroring how Courses holds a bracket-specific price beside a general one.
  const bySeat = new Map<number, { price: number; specific: boolean }>();
  for (const row of (results as any[])) {
    const seat = Number(row.from_seat);
    const specific = row.age_group !== null && row.age_group !== undefined;
    const existing = bySeat.get(seat);
    if (!existing || (specific && !existing.specific)) {
      bySeat.set(seat, { price: Number(row.price), specific });
    }
  }
  return [...bySeat.entries()]
    .map(([from_seat, v]) => ({ from_seat, price: v.price }))
    .sort((a, b) => a.from_seat - b.from_seat);
}

/** The ladder price covering a given seat: the last step at or below it. */
function ladderPriceFor(ladder: { from_seat: number; price: number }[], seat: number): number | null {
  let price: number | null = null;
  for (const step of ladder) {
    if (step.from_seat <= seat) price = step.price;
    else break;
  }
  return price;
}

export async function quoteBooking(db: any, input: QuoteInput): Promise<Quote> {
  const courseId = Number(input.courseId);
  const childIds = (input.childIds || []).map((id) => Number(id) || 0);

  const course = await db.prepare(
    'SELECT id, name, original_price, premium_price FROM Courses WHERE id = ?'
  ).bind(courseId).first() as any;

  const originalPrice = Number(course?.original_price ?? 0);
  // premium_price defaults to 0 in the schema rather than NULL, so "set" has
  // to mean positive — otherwise every course that never configured one would
  // price its Premium members at nothing.
  const premiumPrice = Number(course?.premium_price ?? 0);
  const hasPremiumPrice = premiumPrice > 0;

  // ── who is Premium, in one query ──
  const realChildIds = childIds.filter((id) => id > 0);
  const premiumIds = new Set<number>();
  if (realChildIds.length > 0) {
    const { results } = await db.prepare(
      `SELECT id, membership_type, membership_expires_at FROM Children
       WHERE id IN (${realChildIds.map(() => '?').join(',')})`
    ).bind(...realChildIds).all();
    const now = Date.now();
    for (const row of (results as any[])) {
      const live = !row.membership_expires_at || new Date(row.membership_expires_at).getTime() > now;
      if (row.membership_type === 'premium' && live) premiumIds.add(Number(row.id));
    }
  }

  const ladder = await loadSeatLadder(db, courseId, input.ageGroup);

  // ── seat order ──
  // The ladder descends, and a Premium member's price is capped. Giving the
  // capped participants the earliest (dearest) seats is what makes the total
  // as low as it can legitimately be — and, more importantly, makes it the
  // same total no matter which order the boxes were ticked in. A price that
  // moves because of tick order is a price nobody can check.
  //
  // Seats are assigned on a sorted copy, but the lines come back in the order
  // they were asked for. Two guests in one booking share childId 0, so a
  // caller matching lines to children by id would collapse them onto one seat
  // and charge the cheaper of the two twice.
  const capOf = (childId: number) => (childId > 0 && premiumIds.has(childId) && hasPremiumPrice)
    ? premiumPrice
    : Number.POSITIVE_INFINITY;
  const seatOrder = childIds
    .map((childId, requestIndex) => ({ childId, requestIndex }))
    .sort((a, b) => capOf(a.childId) - capOf(b.childId) || a.requestIndex - b.requestIndex);

  // ── campaign: pick one, the same way createBooking always has ──
  const { results: campaigns } = await db.prepare(
    'SELECT * FROM Sale_Campaigns WHERE is_active = 1'
  ).all();

  const now = new Date();
  let campaignPct = 0;
  let campaignAmt = 0;
  let campaignLabel = '';
  let bestForOriginal = 0;

  for (const camp of (campaigns as any[])) {
    if (camp.valid_from && new Date(camp.valid_from) > now) continue;
    if (camp.valid_until && new Date(camp.valid_until) < now) continue;

    let amt = camp.discount_amount || 0;
    let pct = camp.discount_percent || 0;
    try {
      const applicable = JSON.parse(camp.applicable_course_ids || '[]');
      const specific = applicable.find((i: any) => i.id === courseId);
      if (specific) {
        amt = specific.discount_amount ?? amt;
        pct = specific.discount_percent ?? pct;
      }
    } catch { /* an unreadable scope list simply does not narrow the campaign */ }

    // Compared against original_price so the winner does not change with the
    // group's makeup; the winning rule is then applied to each seat's own base.
    const forOriginal = pct > 0 ? (originalPrice * pct) / 100 : amt;
    if (forOriginal > bestForOriginal) {
      bestForOriginal = forOriginal;
      campaignPct = pct > 0 ? pct : 0;
      campaignAmt = pct > 0 ? 0 : amt;
      campaignLabel = camp.consumer_label || camp.name || 'ส่วนลดแคมเปญ';
    }
  }

  // ── promo code ──
  let promoPct = 0;
  let promoAmt = 0;
  if (input.promoCode) {
    const promo = await db.prepare(`
      SELECT discount_amount, discount_percent FROM Promotions
      WHERE code = ? AND is_active = 1
        AND (valid_until IS NULL OR valid_until > datetime('now'))
        AND (max_uses = 0 OR current_uses < max_uses)
    `).bind(input.promoCode).first() as any;
    if (promo) {
      if (promo.discount_percent > 0) promoPct = promo.discount_percent;
      else promoAmt = promo.discount_amount;
    }
  }

  // ── one line per participant ──
  const seated = seatOrder.map(({ childId, requestIndex }, index) => {
    const seat = index + 1;
    const fromLadder = ladderPriceFor(ladder, seat);
    const base = fromLadder ?? originalPrice;

    const adjustments: PriceAdjustment[] = [];
    let running = base;

    if (fromLadder !== null && seat > 1 && fromLadder !== originalPrice) {
      adjustments.push({ kind: 'seat-tier', label: `ราคาคนที่ ${seat}`, amount: 0 });
    }

    // Membership caps rather than stacks: a Premium member pays their own
    // price when it is the better of the two, never both benefits at once.
    if (childId > 0 && premiumIds.has(childId) && hasPremiumPrice && premiumPrice < running) {
      adjustments.push({ kind: 'membership', label: 'ราคาสมาชิก Premium', amount: premiumPrice - running });
      running = premiumPrice;
    }

    if (campaignPct > 0 || campaignAmt > 0) {
      const off = campaignPct > 0 ? (running * campaignPct) / 100 : campaignAmt;
      const applied = Math.min(off, running);
      if (applied > 0) {
        adjustments.push({ kind: 'campaign', label: campaignLabel, amount: -applied });
        running -= applied;
      }
    }

    if (promoPct > 0 || promoAmt > 0) {
      const off = promoPct > 0 ? Math.floor((running * promoPct) / 100) : promoAmt;
      const applied = Math.min(off, running);
      if (applied > 0) {
        adjustments.push({ kind: 'promo', label: `โค้ด ${input.promoCode}`, amount: -applied });
        running -= applied;
      }
    }

    return { requestIndex, line: { childId, seat, base, adjustments, subtotal: Math.max(0, running) } };
  });

  // Back into the order the caller asked in, so a line can be matched to a
  // participant by position rather than by an id two guests may share.
  const participants: ParticipantLine[] = seated
    .sort((a, b) => a.requestIndex - b.requestIndex)
    .map((entry) => entry.line);

  // ── extras the answers asked for ──
  // A priced option is an ordinary option that carries a price, so selling a
  // shirt alongside the activity is a normal radio field, not a new concept.
  // Discounts deliberately do not reach here: a class promo should not take
  // 20% off a shirt.
  const extras: ExtraLine[] = [];
  if (input.formId && input.formAnswers) {
    const { results: fields } = await db.prepare(
      `SELECT field_key, label, type, options_json FROM Registration_Form_Fields WHERE form_id = ?`
    ).bind(Number(input.formId)).all();

    for (const field of (fields as any[])) {
      const priced = pricedOptionsOf(field.options_json);
      if (priced.length === 0) continue;
      for (const label of selectedLabels(input.formAnswers[field.field_key])) {
        const match = priced.find((o) => o.label === label);
        if (match) {
          extras.push({
            fieldKey: field.field_key,
            label: `${field.label}: ${match.label}`,
            amount: match.price,
            // Answers are shared across the booking today. When they become
            // per participant this carries the owner instead of null, and
            // nothing else here has to change.
            childId: null,
          });
        }
      }
    }
  }

  const total =
    participants.reduce((sum, p) => sum + p.subtotal, 0) +
    extras.reduce((sum, e) => sum + e.amount, 0);

  return {
    course: { id: courseId, name: String(course?.name ?? '') },
    participants,
    extras,
    total: Math.max(0, total),
    currency: 'THB',
  };
}
