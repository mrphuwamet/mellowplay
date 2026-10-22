import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { quoteSurvey } from '../services/surveyPricing';
import { sendSurveyReceipt, receiptRecipient } from '../services/surveyReceiptService';
import { AuthService } from '../services/authService';
import { UserRepository } from '../repositories/userRepository';
import { SurveyRepository } from '../repositories/surveyRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { findRoundLink, bookingForRound } from '../services/roundLinkService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

// 'pretest'/'posttest' were folded into one 'test' kind (migration 0076) —
// before/after is two rounds of ONE form, not two forms. Old values are still
// accepted from any client that hasn't caught up and mapped forward, so a save
// from a stale tab can't reintroduce a retired kind.
const FORM_KINDS = ['survey', 'test'];
const LEGACY_FORM_KINDS: Record<string, string> = { pretest: 'test', posttest: 'test' };

// Question shuffling used to be a boolean; it is now a mode (migration 0077).
// A client that still sends the boolean gets the behaviour that flag used to
// mean, rather than silently losing its setting.
const SHUFFLE_MODES = ['none', 'within_section', 'sections', 'all', 'pages'];

const normalizeShuffleMode = (raw: unknown, legacyFlag?: unknown): string => {
  if (typeof raw === 'string' && SHUFFLE_MODES.includes(raw)) return raw;
  return legacyFlag ? 'within_section' : 'none';
};

const normalizeFormKind = (raw: unknown): string => {
  const kind = typeof raw === 'string' ? raw : '';
  const mapped = LEGACY_FORM_KINDS[kind] ?? kind;
  return FORM_KINDS.includes(mapped) ? mapped : 'survey';
};

/** The transfer details as configured, or nothing if they are unreadable. */
function safeJson(value: string | null | undefined): any {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export class SurveyController {
  private repo(c: C) { return new SurveyRepository(new ConfigService(c.env).db); }

  // Same optional-auth pattern as contactController — a survey link must be
  // answerable by a guest with no token at all, so a missing/invalid token
  // resolves to undefined rather than throwing a 401.
  private async getOptionalUserId(c: C, config: ConfigService): Promise<number | undefined> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return undefined;
    const payload = await AuthService.verifyToken(token, config.jwtSecret);
    return payload?.userId ?? undefined;
  }

  private normalizeFields(fields: any[]): any[] {
    return (fields || []).map((f: any, i: number) => ({
      fieldKey: f.fieldKey || crypto.randomUUID(),
      pageIndex: f.pageIndex ?? 0,
      fieldIndex: f.fieldIndex ?? i,
      type: f.type,
      label: f.label,
      required: !!f.required,
      optionsJson: f.optionsJson ?? (f.options ? JSON.stringify(f.options) : undefined),
      configJson: f.configJson ?? (f.config ? JSON.stringify(f.config) : undefined),
    }));
  }

  // ── CRM ──────────────────────────────────────────────────────────────────

  async listForms(c: C) {
    try {
      return c.json({ success: true, forms: await this.repo(c).listForms() });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getForm(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const form = await this.repo(c).getFormWithFields(id);
      if (!form) return c.json({ success: false, message: 'Form not found' }, 404);
      return c.json({ success: true, form });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createForm(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'name is required' }, 400);
      const repo = this.repo(c);
      const slug = body.slug?.trim() || null;
      if (slug && await repo.isSlugTaken(slug)) {
        return c.json({ success: false, message: 'ลิงก์นี้ถูกใช้แล้ว กรุณาตั้งชื่อลิงก์อื่น' }, 400);
      }
      const id = await repo.createForm({
        name: body.name,
        description: body.description,
        formKind: normalizeFormKind(body.formKind),
        isActive: body.isActive,
        slug,
        scoreRangesJson: body.scoreRanges ? JSON.stringify(body.scoreRanges) : undefined,
        shuffleMode: normalizeShuffleMode(body.shuffleMode, body.shuffleQuestions),
        shuffleOptions: !!body.shuffleOptions,
        // Only meaningful for the 'pages' mode; stored either way so toggling
        // the mode off and back on does not lose which pages were pinned.
        shufflePinnedPages: Array.isArray(body.shufflePinnedPages) ? body.shufflePinnedPages.map(Boolean) : undefined,
        fields: this.normalizeFields(body.fields),
      });
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateForm(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'name is required' }, 400);
      const repo = this.repo(c);
      const slug = body.slug?.trim() || null;
      if (slug && await repo.isSlugTaken(slug, id)) {
        return c.json({ success: false, message: 'ลิงก์นี้ถูกใช้แล้ว กรุณาตั้งชื่อลิงก์อื่น' }, 400);
      }
      await repo.updateForm(id, {
        name: body.name,
        description: body.description,
        formKind: normalizeFormKind(body.formKind),
        isActive: body.isActive,
        slug,
        scoreRangesJson: body.scoreRanges ? JSON.stringify(body.scoreRanges) : undefined,
        shuffleMode: normalizeShuffleMode(body.shuffleMode, body.shuffleQuestions),
        shuffleOptions: !!body.shuffleOptions,
        // Only meaningful for the 'pages' mode; stored either way so toggling
        // the mode off and back on does not lose which pages were pinned.
        shufflePinnedPages: Array.isArray(body.shufflePinnedPages) ? body.shufflePinnedPages.map(Boolean) : undefined,
        fields: this.normalizeFields(body.fields),
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteForm(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      await this.repo(c).deleteForm(id);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ?scope=real (default) | test | all — see SurveyRepository.listSubmissions
  // for why trial runs are never mixed into the real numbers by default.
  async listSubmissions(c: C) {
    try {
      const formId = parseInt(c.req.param('id'));
      const raw = c.req.query('scope');
      const scope = raw === 'test' || raw === 'all' ? raw : 'real';
      const submissions = await this.repo(c).listSubmissions(formId, scope);
      const counts = await this.repo(c).countSubmissions(formId);
      return c.json({ success: true, submissions, counts });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async clearTestSubmissions(c: C) {
    try {
      const formId = parseInt(c.req.param('id'));
      const deleted = await this.repo(c).deleteTestSubmissions(formId);
      return c.json({ success: true, deleted });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Public (Consumer App — member or guest) ─────────────────────────────

  // Never send answer-key point values to whoever is about to answer the
  // form — strip them regardless of has_answer_key, so a form edited into
  // "graded" later can't have leaked its old points through a cached
  // response either.
  async getPublicForm(c: C) {
    try {
      const idOrSlug = c.req.param('idOrSlug');
      const form = await this.repo(c).getPublicForm(idOrSlug);
      if (!form) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);
      const sanitizedFields = (form.fields || []).map((f: any) => {
        if (f.type !== 'select' && f.type !== 'radio' && f.type !== 'checkbox') return f;
        let options: { label: string; color?: string; allowText?: boolean }[] = [];
        // label, colour and allowText only: all three are how the option is
        // meant to look and behave, while points are the answer key and must
        // not travel with a blank form. Anything else the CRM ever adds stays
        // behind by default.
        try {
          options = (JSON.parse(f.options_json || '[]')).map((o: any) => ({
            label: o.label,
            ...(o.color ? { color: o.color } : {}),
            ...(o.allowText ? { allowText: true } : {}),
          }));
        } catch { /* malformed options render as empty rather than block the form */ }
        return { ...f, options_json: JSON.stringify(options) };
      });
      // score_ranges_json is the "answer key" for the result screen — a
      // respondent gets it back from submit() only after answering, never
      // upfront alongside the blank form.
      const { score_ranges_json, ...formWithoutScoreRanges } = form;
      return c.json({ success: true, form: { ...formWithoutScoreRanges, fields: sanitizedFields } });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * What these answers would cost, before anybody commits to them.
   *
   * Public, like the form itself: the person filling it in has no account.
   * It reads nothing back about other people and writes nothing, so the only
   * thing it exposes is the form's own price list, which the form shows
   * anyway.
   */
  async quote(c: C) {
    try {
      const config = new ConfigService(c.env);
      const form = await this.repo(c).getPublicForm(c.req.param('idOrSlug'));
      if (!form) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);

      const body = await c.req.json().catch(() => ({}));
      const quote = await quoteSurvey(config.db, {
        formId: form.id,
        answers: body.answers ?? null,
        participants: Number(body.participants) || 1,
      });
      return c.json({ success: true, quote });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Attaching the transfer slip to a submission that owes money.
   *
   * Public, because the person who filled the form has no account — but held
   * to the token handed back at submit, so a slip can only be attached to the
   * submission it belongs to. A bare id would let anyone paste a picture onto
   * a stranger's registration, which is not a thing a counter should have to
   * untangle on the morning of an event.
   *
   * Nothing is marked paid here. A slip is a claim, not a confirmation: this
   * moves the submission into the queue a human (or, later, a verification
   * API) looks at.
   */
  async uploadSlip(c: C) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, message: 'ไม่พบรายการนี้' }, 404);

      const body = await c.req.formData();
      const token = String(body.get('token') ?? '');
      const file = body.get('slip') as unknown as File | null;
      if (!file) return c.json({ success: false, message: 'กรุณาแนบสลิป' }, 400);

      const submission = await config.db.prepare(
        'SELECT id, form_id, amount, answers_json, payment_status, payment_token FROM Survey_Submissions WHERE id = ?'
      ).bind(id).first() as any;
      if (!submission) return c.json({ success: false, message: 'ไม่พบรายการนี้' }, 404);

      // Compared in full and only against this row's own token. There is no
      // other way in: not the submission id, not the respondent's name.
      if (!submission.payment_token || token !== submission.payment_token) {
        return c.json({ success: false, message: 'ลิงก์แนบสลิปไม่ถูกต้องหรือหมดอายุ' }, 403);
      }
      if (submission.payment_status === 'verified') {
        return c.json({ success: false, message: 'รายการนี้ยืนยันการชำระเงินแล้ว' }, 409);
      }

      // Images only, and small enough that a phone photo is fine while a
      // video or a PDF scan of something else is not.
      const type = String(file.type || '');
      if (!type.startsWith('image/')) {
        return c.json({ success: false, message: 'กรุณาแนบเป็นรูปภาพ (JPG หรือ PNG)' }, 400);
      }
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength > 8 * 1024 * 1024) {
        return c.json({ success: false, message: 'ไฟล์ใหญ่เกินไป กรุณาแนบรูปที่เล็กกว่า 8MB' }, 400);
      }

      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const key = `slips/survey-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await c.env.BUCKET.put(key, buffer, { httpMetadata: { contentType: type } });
      const slipUrl = `/api/v1/files/${key}`;

      // Re-uploading replaces the picture and puts the row back in the queue,
      // which is what someone does after being told their first slip was
      // unreadable. The note from that rejection is cleared with it.
      await config.db.prepare(`
        UPDATE Survey_Submissions
        SET slip_url = ?, slip_uploaded_at = datetime('now'), payment_status = 'submitted',
            payment_method = 'transfer', payment_note = NULL
        WHERE id = ?
      `).bind(slipUrl, id).run();

      // Sent now rather than after a review, because there may not be a
      // review: this form is meant to run without anyone standing behind it.
      // The wording says the slip was received, not that the payment is
      // confirmed — nobody has looked yet, and telling someone their money is
      // settled when it is not is the sentence they would quote back later.
      //
      // Handed to waitUntil rather than awaited. The slip is already in R2
      // and the row is already updated, so the person has nothing left to
      // wait for; making them watch a spinner while an email is handed off
      // was slow enough to be visible.
      const quote = await quoteSurvey(config.db, {
        formId: submission.form_id,
        answers: safeJson(submission.answers_json) ?? null,
      });
      const willEmail = !!(await receiptRecipient(config, id));
      const send = sendSurveyReceipt(config, id, 'received', quote.lines);
      if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(send);
      else await send;

      return c.json({ success: true, slipUrl, amount: submission.amount, emailed: willEmail });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async submit(c: C) {
    try {
      const config = new ConfigService(c.env);
      const idOrSlug = c.req.param('idOrSlug');
      const form = await this.repo(c).getPublicForm(idOrSlug);
      if (!form) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);

      const { answers, respondentName, respondentPhone, attemptLabel, sessionId, sessionRunId, isTest, roundToken, participants } = await c.req.json();
      if (!answers || typeof answers !== 'object') return c.json({ success: false, message: 'answers is required' }, 400);

      const userId = await this.getOptionalUserId(c, config);
      let resolvedName = respondentName?.trim() || undefined;
      let resolvedPhone = respondentPhone?.trim() || undefined;
      if (userId) {
        const user = await new UserRepository(config.db).findById(userId);
        if (user) {
          resolvedName = resolvedName || user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || undefined;
          resolvedPhone = resolvedPhone || user.phone || undefined;
        }
      }

      // The session's "one answer per person" rule is enforced here too, not
      // only by the pre-flight check the app runs before starting: the app's
      // check is a courtesy to the respondent, this is the actual rule. Scoped
      // to other runs so a run submitting its 2nd and 3rd form isn't blocked
      // by its own first one.
      const parsedSessionId = Number.isInteger(sessionId) ? sessionId : parseInt(sessionId);
      const inSession = Number.isInteger(parsedSessionId) && parsedSessionId > 0;
      if (inSession && resolvedName) {
        const sessions = new SessionRepository(config.db);
        const session = await sessions.getPublicSession(String(parsedSessionId));
        if (session?.require_unique_name && await sessions.isNameTaken(parsedSessionId, resolvedName, sessionRunId)) {
          return c.json({ success: false, message: 'ชื่อนี้ทำแบบฟอร์มชุดนี้ไปแล้ว' }, 409);
        }
      }

      // Where this was answered, taken from the link rather than from the
      // respondent: a date typed into the address bar could file an answer
      // against a round nobody attended.
      const link = typeof roundToken === 'string' && roundToken
        ? await findRoundLink(config.db, roundToken)
        : null;
      const bookingId = link && userId ? await bookingForRound(config.db, link, userId) : null;

      // Recomputed here from the answers being filed, never taken from the
      // request. A total that arrives from a browser is a total somebody can
      // edit, and this one decides what is owed.
      const quote = await quoteSurvey(config.db, {
        formId: form.id,
        answers,
        participants: Number(participants) || 1,
      });
      // A trial run never owes. Staff walking their own paid form with
      // "ทดลองทำ" would otherwise file a real payment request and sit in the
      // review queue alongside people who actually registered. The quote
      // endpoint still shows them the price, which is what they came to check.
      const owesMoney = quote.collectsPayment && quote.total > 0 && isTest !== true;
      // Handed back to this respondent so they, and only they, can attach a
      // slip to this submission afterwards.
      const paymentToken = owesMoney ? crypto.randomUUID() : null;

      const result = await this.repo(c).createSubmission({
        formId: form.id,
        amount: owesMoney ? quote.total : null,
        paymentStatus: owesMoney ? 'awaiting_payment' : null,
        paymentToken,
        userId,
        courseId: link?.course_id ?? null,
        slotDate: link?.slot_date ?? null,
        slotStartTime: link?.slot_start_time ?? null,
        bookingId,
        respondentName: resolvedName,
        respondentPhone: resolvedPhone,
        answers,
        sessionId: inSession ? parsedSessionId : null,
        sessionRunId: inSession && typeof sessionRunId === 'string' ? sessionRunId.slice(0, 64) : null,
        // Cosmetic round name off the link's ?attempt= — capped so a crafted
        // link can't stuff arbitrary text into the CRM's tables.
        attemptLabel: typeof attemptLabel === 'string' ? attemptLabel.trim().slice(0, 40) || null : null,
        // A trial run started from the CRM's "ทดลองทำ" link. Self-declared, and
        // that is fine: the only thing it can do is keep an answer OUT of the
        // real results, so the worst a crafted request achieves is discarding
        // its own submission.
        isTest: isTest === true,
      });

      return c.json({
        success: true,
        submissionId: result.id,
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        attemptNo: result.attemptNo,
        result: result.result,
        // Everything the next screen needs to ask for the transfer. Absent
        // entirely on a form that does not charge, so an ordinary survey's
        // reply is exactly the shape it has always been.
        ...(owesMoney ? {
          payment: {
            amount: quote.total,
            lines: quote.lines,
            token: paymentToken,
            account: safeJson(form.payment_account_json),
          },
        } : {}),
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}
