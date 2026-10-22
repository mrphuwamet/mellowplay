/**
 * What the answers to a form add up to.
 *
 * Deliberately knows nothing about classes, bookings, seats or surveys: it
 * takes the fields and the answers and returns the charges they produce. Both
 * form systems in this codebase store their fields with the same columns
 * (field_key, type, options_json, config_json), so one implementation serves
 * a class registration and a standalone survey alike. Two implementations is
 * how a screen and a checkout end up disagreeing about what something costs,
 * which is the bug this whole area was built to stop.
 *
 * The rules are DATA, not formulas. A price lives on an option or on a field's
 * config, and this function knows a small closed set of shapes. Adding a way
 * to charge means adding a shape here, never evaluating something an admin
 * typed — a formula box would be unverifiable, impossible to configure safely,
 * and would put arbitrary expressions on the path that sets a real amount.
 */

export interface PriceableField {
  field_key: string;
  label: string;
  type: string;
  options_json?: string | null;
  config_json?: string | null;
}

export interface AnswerCharge {
  fieldKey: string;
  label: string;
  /** Always positive: these are things bought, never discounts. */
  amount: number;
  /** How many of it. 1 unless a quantity field said otherwise. */
  quantity: number;
  /** True when the charge was multiplied by the number of participants. */
  perPerson: boolean;
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
    // A field whose options cannot be read charges nothing, rather than
    // guessing a number onto somebody's bill.
    return [];
  }
}

function configOf(configJson: string | null | undefined): Record<string, any> {
  if (!configJson) return {};
  try {
    const parsed = JSON.parse(configJson);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Which option labels an answer selected — a checkbox gives several. */
function selectedLabels(answer: any): string[] {
  if (Array.isArray(answer)) return answer.map(String);
  if (answer === null || answer === undefined || answer === '') return [];
  return [String(answer)];
}

/**
 * A quantity typed into a number field. Anything that is not a whole number
 * above zero buys nothing — a blank box, a word, a negative, a decimal number
 * of t-shirts. Capped so a typo of 99999999 cannot produce a bill nobody
 * meant; the cap is a guard, not a business rule, and a real order that large
 * belongs in a conversation rather than a form.
 */
function quantityOf(answer: any, max = 99): number {
  const n = Number(answer);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 0;
  return Math.min(n, max);
}

export interface PriceAnswersOptions {
  /**
   * How many people this submission is for. A field marked
   * `charge_per: "person"` is multiplied by it — one shirt each. Defaults to
   * 1, which is also what a form with no notion of participants wants.
   */
  participants?: number;
}

export interface ParticipantOption {
  key: string;
  label: string;
  /** What the first participant pays for it. */
  price?: number;
  /** What everyone after the first pays, when it differs. */
  priceFrom2?: number;
  /** Cannot be chosen by the first participant — see validateAnswers. */
  disabledOnFirst?: boolean;
  /**
   * What the option is made of, shown so a price has a visible origin.
   * Never added up: these are a description of the one price above them, and
   * summing them would charge twice for the same thing.
   */
  detail?: { label: string; price?: number }[];
}

/** One row of a participant_list answer: who, and what they chose. */
export interface ParticipantAnswer {
  name?: string;
  choice?: string;
}

export function participantOptionsOf(configJson: string | null | undefined): ParticipantOption[] {
  const config = configOf(configJson);
  return Array.isArray(config.options)
    ? config.options.filter((o: any) => o && o.key && o.label)
    : [];
}

export function participantsOf(answer: any): ParticipantAnswer[] {
  if (!Array.isArray(answer)) return [];
  return answer
    .filter((p: any) => p && typeof p === 'object')
    .map((p: any) => ({ name: typeof p.name === 'string' ? p.name : '', choice: typeof p.choice === 'string' ? p.choice : '' }));
}

/**
 * What a participant in a given position pays for an option.
 *
 * Position matters because a family rate is a property of the booking, not of
 * the person: the first child's pass costs what it costs, and the second
 * child's costs less for being second.
 */
export function participantPrice(option: ParticipantOption, index: number): number {
  const first = Number(option.price) || 0;
  if (index === 0) return first;
  const later = option.priceFrom2;
  return later === undefined || later === null ? first : Number(later) || 0;
}

export function priceAnswers(
  fields: PriceableField[],
  answers: Record<string, any> | null | undefined,
  options: PriceAnswersOptions = {},
): AnswerCharge[] {
  if (!answers) return [];
  const participants = Math.max(1, Math.floor(options.participants ?? 1));
  const charges: AnswerCharge[] = [];

  for (const field of fields) {
    const config = configOf(field.config_json);
    const perPerson = config.charge_per === 'person';
    const multiplier = perPerson ? participants : 1;

    // ── a list of people, each choosing, priced by their position ──
    if (field.type === 'participant_list') {
      const opts = participantOptionsOf(field.config_json);
      participantsOf(answers[field.field_key]).forEach((person, index) => {
        const option = opts.find((o) => o.key === person.choice);
        if (!option) return;
        const amount = participantPrice(option, index);
        if (amount <= 0) return;   // attending without buying anything
        const who = (person.name || '').trim() || `คนที่ ${index + 1}`;
        charges.push({
          fieldKey: field.field_key,
          // Named per person so the bill can be checked line by line, which
          // is the whole reason a family rate needs showing rather than
          // summing.
          label: `${who} · ${option.label}`,
          amount,
          quantity: 1,
          perPerson: true,
        });
      });
      continue;
    }

    // ── a number field that sells something: quantity x unit price ──
    const unitPrice = Number(config.unit_price);
    if (field.type === 'number' && Number.isFinite(unitPrice) && unitPrice > 0) {
      const qty = quantityOf(answers[field.field_key], Number(config.max_quantity) || 99);
      if (qty > 0) {
        charges.push({
          fieldKey: field.field_key,
          label: field.label,
          amount: unitPrice * qty * multiplier,
          quantity: qty * multiplier,
          perPerson,
        });
      }
      continue;
    }

    // ── an option that carries its own price ──
    const priced = pricedOptionsOf(field.options_json);
    if (priced.length === 0) continue;
    for (const label of selectedLabels(answers[field.field_key])) {
      const match = priced.find((o) => o.label === label);
      if (!match) continue;
      charges.push({
        fieldKey: field.field_key,
        label: `${field.label}: ${match.label}`,
        amount: match.price * multiplier,
        quantity: multiplier,
        perPerson,
      });
    }
  }

  return charges;
}

/** The SELECT both form systems use — their field tables share these columns. */
export const PRICEABLE_FIELD_COLUMNS = 'field_key, label, type, options_json, config_json';

/**
 * Rules a priced answer has to obey, checked on the server.
 *
 * The form disables what cannot be chosen, but a disabled control is a
 * courtesy to the person filling it in, not a rule. The rule is here, where
 * the amount owed is decided.
 *
 * Returns the problems in words the respondent can act on, or an empty array.
 */
export function validateAnswers(
  fields: PriceableField[],
  answers: Record<string, any> | null | undefined,
): string[] {
  if (!answers) return [];
  const problems: string[] = [];

  for (const field of fields) {
    if (field.type !== 'participant_list') continue;
    const config = configOf(field.config_json);
    const opts = participantOptionsOf(field.config_json);
    const people = participantsOf(answers[field.field_key]);

    const min = Number(config.min) || 0;
    if (min > 0 && people.length < min) {
      problems.push(`กรุณาเพิ่ม${config.itemLabel || 'ผู้เข้าร่วม'}อย่างน้อย ${min} คน`);
      continue;
    }
    const max = Number(config.max) || 0;
    if (max > 0 && people.length > max) {
      problems.push(`${config.itemLabel || 'ผู้เข้าร่วม'}ได้สูงสุด ${max} คน`);
      continue;
    }

    people.forEach((person, index) => {
      const who = (person.name || '').trim();
      if (!who) problems.push(`กรุณากรอกชื่อ${config.itemLabel || 'ผู้เข้าร่วม'}คนที่ ${index + 1}`);
      const option = opts.find((o) => o.key === person.choice);
      if (!option) {
        problems.push(`กรุณาเลือกรูปแบบการเข้าร่วมของ${who ? ` ${who}` : `คนที่ ${index + 1}`}`);
        return;
      }
      if (index === 0 && option.disabledOnFirst) {
        problems.push(
          config.firstMustChooseNote
          || `${who || 'คนแรก'} เป็นคนแรกของครอบครัว จึงเลือก "${option.label}" ไม่ได้`,
        );
      }
    });
  }

  return problems;
}
