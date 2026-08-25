import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { SessionRepository } from '../repositories/sessionRepository';
import { SurveyRepository } from '../repositories/surveyRepository';
import { findRoundLink, generateRoundToken } from '../services/roundLinkService';

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
  /**
   * What the QR at the door leads to: the round, and the forms to fill in.
   *
   * Public, because it is printed on a sheet of paper anyone at the venue can
   * point a camera at. It gives up the activity's name, date and place —
   * things already written on the poster beside it — and nothing about who is
   * booked on it.
   */
  async getRoundLink(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const link: any = await findRoundLink(config.db, c.req.param('token'));
      if (!link) return c.json({ success: false, message: 'ลิงก์นี้ใช้ไม่ได้แล้ว' }, 404);
      if (!link.session_active) return c.json({ success: false, message: 'ชุดแบบฟอร์มนี้ปิดอยู่' }, 404);

      return c.json({
        success: true,
        round: {
          course_name: link.course_name,
          course_location: link.course_location,
          slot_date: link.slot_date,
          slot_start_time: link.slot_start_time,
          label: link.label,
        },
        session: { slug: link.session_slug || String(link.session_id), name: link.session_name },
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── CRM: the codes themselves ──────────────────────────────────────────
  async listRoundLinks(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const db = new ConfigService(c.env).db;
      const courseId = parseInt(c.req.query('course_id') || '') || null;
      const { results } = await db.prepare(`
        SELECT l.*, s.name AS session_name, co.name AS course_name
          FROM Round_Survey_Links l
          JOIN Survey_Sessions s ON s.id = l.session_id
          JOIN Courses co ON co.id = l.course_id
         WHERE l.revoked_at IS NULL AND (? IS NULL OR l.course_id = ?)
         ORDER BY l.slot_date DESC, l.slot_start_time
      `).bind(courseId, courseId).all();
      return c.json({ success: true, links: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createRoundLink(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const db = new ConfigService(c.env).db;
      const { session_id, course_id, slot_date, slot_start_time, label } = await c.req.json();
      if (!session_id || !course_id || !slot_date) {
        return c.json({ success: false, message: 'ต้องระบุชุดแบบฟอร์มและรอบ' }, 400);
      }

      // One live code per (session, round). Printing a second sheet for a round
      // that already has one would split its answers across two codes for no
      // reason, and staff would have no way to tell which sheet is current.
      const existing: any = await db.prepare(`
        SELECT token FROM Round_Survey_Links
         WHERE session_id = ? AND course_id = ? AND slot_date = ?
           AND COALESCE(slot_start_time, '') = COALESCE(?, '') AND revoked_at IS NULL
      `).bind(session_id, course_id, slot_date, slot_start_time || null).first();
      if (existing) return c.json({ success: true, token: existing.token, reused: true });

      const token = generateRoundToken();
      await db.prepare(`
        INSERT INTO Round_Survey_Links (token, session_id, course_id, slot_date, slot_start_time, label, created_by_crm_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        token, Number(session_id), Number(course_id), slot_date,
        slot_start_time || null, label || null, c.get('crmUser')?.userId ?? null,
      ).run();
      return c.json({ success: true, token, reused: false });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async revokeRoundLink(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const db = new ConfigService(c.env).db;
      await db.prepare("UPDATE Round_Survey_Links SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")
        .bind(parseInt(c.req.param('id'))).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

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
          // Named, so the round page can list what is being asked before
          // anyone starts — a chain of three unnamed forms is a chain of
          // unknown length.
          title: form.title || form.name || null,
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
