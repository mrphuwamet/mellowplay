import { priceAnswers, validateAnswers, PRICEABLE_FIELD_COLUMNS, AnswerCharge } from './answerPricing';

/**
 * What a survey submission costs.
 *
 * The standalone counterpart to quoteBooking. It shares the one implementation
 * of "what do these answers add up to" and adds only what is different here:
 * a flat fee for the form itself, and no notion of seats, children or classes.
 *
 * As with the booking quote, the screen that shows this and the code that
 * records the amount owed call the same function. A total arriving from a
 * browser is never trusted — it is recomputed here before it is written down.
 */

export interface SurveyChargeLine {
  label: string;
  amount: number;
  /** Present on lines that came from an answer rather than from the fee. */
  fieldKey?: string;
}

export interface SurveyQuote {
  form: { id: number; name: string };
  collectsPayment: boolean;
  lines: SurveyChargeLine[];
  total: number;
  currency: 'THB';
  /**
   * What is wrong with the answers as they stand, in words the respondent
   * can act on. Empty when there is nothing to fix. The quote still prices
   * what it can, so somebody halfway through a form still sees a running
   * total rather than an error where the number should be.
   */
  problems: string[];
}

export interface SurveyQuoteInput {
  formId: number;
  answers?: Record<string, any> | null;
  /**
   * How many people the submission covers, for fields priced per person. A
   * form that does not ask leaves this at 1.
   */
  participants?: number;
}

export async function quoteSurvey(db: any, input: SurveyQuoteInput): Promise<SurveyQuote> {
  const formId = Number(input.formId);
  const form = await db.prepare(
    'SELECT id, name, collects_payment, base_price FROM Survey_Forms WHERE id = ?'
  ).bind(formId).first() as any;

  const collectsPayment = !!form?.collects_payment;
  if (!collectsPayment) {
    // A form that does not charge still answers, with nothing owed — so the
    // caller has one shape to handle rather than two.
    return {
      form: { id: formId, name: String(form?.name ?? '') },
      collectsPayment: false,
      lines: [],
      total: 0,
      currency: 'THB',
      problems: [],
    };
  }

  const lines: SurveyChargeLine[] = [];
  const basePrice = Number(form?.base_price ?? 0);
  if (basePrice > 0) lines.push({ label: 'ค่าสมัคร', amount: basePrice });

  const { results: fields } = await db.prepare(
    `SELECT ${PRICEABLE_FIELD_COLUMNS} FROM Survey_Form_Fields WHERE form_id = ?`
  ).bind(formId).all();

  const charges: AnswerCharge[] = priceAnswers(fields as any[], input.answers, {
    participants: input.participants,
  });
  for (const charge of charges) {
    lines.push({
      fieldKey: charge.fieldKey,
      label: charge.quantity > 1 ? `${charge.label} x${charge.quantity}` : charge.label,
      amount: charge.amount,
    });
  }

  return {
    form: { id: formId, name: String(form?.name ?? '') },
    collectsPayment: true,
    lines,
    total: Math.max(0, lines.reduce((sum, l) => sum + l.amount, 0)),
    currency: 'THB',
    problems: validateAnswers(fields as any[], input.answers),
  };
}
