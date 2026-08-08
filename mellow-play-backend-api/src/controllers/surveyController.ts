import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';
import { UserRepository } from '../repositories/userRepository';
import { SurveyRepository } from '../repositories/surveyRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const FORM_KINDS = ['survey', 'pretest', 'posttest'];

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
        formKind: FORM_KINDS.includes(body.formKind) ? body.formKind : 'survey',
        hasAnswerKey: !!body.hasAnswerKey,
        isActive: body.isActive,
        slug,
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
        formKind: FORM_KINDS.includes(body.formKind) ? body.formKind : 'survey',
        hasAnswerKey: !!body.hasAnswerKey,
        isActive: body.isActive,
        slug,
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

  async listSubmissions(c: C) {
    try {
      const formId = parseInt(c.req.param('id'));
      const submissions = await this.repo(c).listSubmissions(formId);
      return c.json({ success: true, submissions });
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
        let options: { label: string }[] = [];
        try { options = (JSON.parse(f.options_json || '[]')).map((o: any) => ({ label: o.label })); } catch { /* malformed options render as empty rather than block the form */ }
        return { ...f, options_json: JSON.stringify(options) };
      });
      return c.json({ success: true, form: { ...form, fields: sanitizedFields } });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async submit(c: C) {
    try {
      const config = new ConfigService(c.env);
      const idOrSlug = c.req.param('idOrSlug');
      const form = await this.repo(c).getPublicForm(idOrSlug);
      if (!form) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);

      const { answers, respondentName, respondentPhone } = await c.req.json();
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

      const result = await this.repo(c).createSubmission({
        formId: form.id,
        userId,
        respondentName: resolvedName,
        respondentPhone: resolvedPhone,
        answers,
      });

      return c.json({ success: true, totalScore: result.totalScore, maxScore: result.maxScore });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}
