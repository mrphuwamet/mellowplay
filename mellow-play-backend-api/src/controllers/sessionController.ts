import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { SessionRepository } from '../repositories/sessionRepository';
import { SurveyRepository } from '../repositories/surveyRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Sessions — several forms presented behind one link as a single
 * questionnaire.
 *
 * The respondent-facing endpoints deliberately never say which form a question
 * came from: the whole point is that the seam is invisible, so the public
 * payload is one flat ordered list of steps.
 */
export class SessionController {
  private sessions(c: C) { return new SessionRepository(new ConfigService(c.env).db); }
  private surveys(c: C) { return new SurveyRepository(new ConfigService(c.env).db); }

  private normalizeForms(forms: any): { formId: number; orderIndex: number }[] {
    if (!Array.isArray(forms)) return [];
    return forms
      .map((f: any, i: number) => ({
        formId: parseInt(typeof f === 'object' ? f.formId ?? f.form_id : f),
        orderIndex: typeof f === 'object' && f.orderIndex != null ? f.orderIndex : i,
      }))
      .filter(f => Number.isInteger(f.formId));
  }

  // ── CRM ──────────────────────────────────────────────────────────────────

  async list(c: C) {
    try {
      return c.json({ success: true, sessions: await this.sessions(c).list() });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async get(c: C) {
    try {
      const session = await this.sessions(c).getWithForms(parseInt(c.req.param('id')));
      if (!session) return c.json({ success: false, message: 'Session not found' }, 404);
      return c.json({ success: true, session });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async create(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'name is required' }, 400);
      const repo = this.sessions(c);
      const slug = body.slug?.trim() || null;
      if (slug && await repo.isSlugTaken(slug)) {
        return c.json({ success: false, message: 'ลิงก์นี้ถูกใช้แล้ว กรุณาตั้งชื่อลิงก์อื่น' }, 400);
      }
      const id = await repo.create({
        name: body.name,
        description: body.description,
        slug,
        isActive: body.isActive,
        requireUniqueName: body.requireUniqueName,
        forms: this.normalizeForms(body.forms),
      });
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async update(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'name is required' }, 400);
      const repo = this.sessions(c);
      const slug = body.slug?.trim() || null;
      if (slug && await repo.isSlugTaken(slug, id)) {
        return c.json({ success: false, message: 'ลิงก์นี้ถูกใช้แล้ว กรุณาตั้งชื่อลิงก์อื่น' }, 400);
      }
      await repo.update(id, {
        name: body.name,
        description: body.description,
        slug,
        isActive: body.isActive,
        requireUniqueName: body.requireUniqueName,
        forms: this.normalizeForms(body.forms),
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async remove(c: C) {
    try {
      const deleted = await this.sessions(c).remove(parseInt(c.req.param('id')));
      if (!deleted) {
        return c.json({
          success: false,
          message: 'ชุดนี้มีคำตอบเก็บไว้แล้ว ลบไม่ได้ — ถ้าไม่ต้องการให้ใช้งานต่อ ให้ปิดใช้งานแทน',
        }, 409);
      }
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async listSubmissions(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const session = await this.sessions(c).getWithForms(id);
      if (!session) return c.json({ success: false, message: 'Session not found' }, 404);
      const submissions = await this.sessions(c).listSubmissions(id);
      return c.json({ success: true, session, submissions });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Public (Consumer App) ────────────────────────────────────────────────

  /**
   * The whole chain in one response: every form's fields, already shuffled and
   * already stripped of its answer key, flattened into `steps` in running
   * order. One request means the respondent never waits between forms, which
   * is what sells the illusion of a single questionnaire.
   */
  async getPublic(c: C) {
    try {
      const session = await this.sessions(c).getPublicSession(c.req.param('idOrSlug'));
      if (!session) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);

      const surveys = this.surveys(c);
      const steps = [];
      for (const formId of session.formIds) {
        const form = await surveys.getPublicForm(String(formId));
        if (!form) continue; // a form deactivated mid-session just drops out
        steps.push({
          formId: form.id,
          hasAnswerKey: !!form.has_answer_key,
          fields: SessionController.stripAnswerKey(form.fields),
        });
      }
      if (steps.length === 0) return c.json({ success: false, message: 'ยังไม่มีแบบฟอร์มในชุดนี้' }, 404);

      return c.json({
        success: true,
        session: {
          id: session.id,
          name: session.name,
          description: session.description,
          requireUniqueName: !!session.require_unique_name,
          steps,
        },
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Same rule as SurveyController.getPublicForm: point values never travel to
  // whoever is about to answer, regardless of the form's own settings.
  private static stripAnswerKey(fields: any[]): any[] {
    return (fields || []).map((f: any) => {
      if (f.type !== 'select' && f.type !== 'radio' && f.type !== 'checkbox') return f;
      let options: { label: string }[] = [];
      try { options = (JSON.parse(f.options_json || '[]')).map((o: any) => ({ label: o.label })); } catch { /* malformed options render as empty */ }
      return { ...f, options_json: JSON.stringify(options) };
    });
  }

  /**
   * Pre-flight for the "one answer per person" rule.
   *
   * Called before the respondent starts rather than at submit time, because
   * finding out your name is taken after answering three forms is the worst
   * possible moment to be told.
   */
  async checkName(c: C) {
    try {
      const session = await this.sessions(c).getPublicSession(c.req.param('idOrSlug'));
      if (!session) return c.json({ success: false, message: 'ไม่พบแบบฟอร์มนี้' }, 404);
      if (!session.require_unique_name) return c.json({ success: true, available: true });

      const { name, runId } = await c.req.json();
      if (!name || !String(name).trim()) {
        return c.json({ success: false, message: 'กรุณากรอกชื่อ' }, 400);
      }
      const taken = await this.sessions(c).isNameTaken(session.id, String(name), runId);
      return c.json({
        success: true,
        available: !taken,
        message: taken ? 'ชื่อนี้ทำแบบฟอร์มชุดนี้ไปแล้ว กรุณาตรวจสอบอีกครั้ง' : undefined,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}
