import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';
import { UserRepository } from '../repositories/userRepository';
import { SurveyRepository } from '../repositories/surveyRepository';
import { SessionRepository } from '../repositories/sessionRepository';

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

  async submit(c: C) {
    try {
      const config = new ConfigService(c.env);
      const idOrSlug = c.req.param('idOrSlug');
      const form = await this.repo(c).getPublicForm(idOrSlug);
      if (!form) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);

      const { answers, respondentName, respondentPhone, attemptLabel, sessionId, sessionRunId, isTest } = await c.req.json();
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

      const result = await this.repo(c).createSubmission({
        formId: form.id,
        userId,
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
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        attemptNo: result.attemptNo,
        result: result.result,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}
