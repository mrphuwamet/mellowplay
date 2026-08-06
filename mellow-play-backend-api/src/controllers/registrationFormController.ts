import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { RegistrationFormRepository } from '../repositories/registrationFormRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class RegistrationFormController {
  private repo(c: C) { return new RegistrationFormRepository(new ConfigService(c.env).db); }

  // Fields arrive from the CRM builder with a client-generated fieldKey —
  // this fallback only covers a caller that omits one (e.g. a direct API
  // test), so answers_json always has a stable key to write against.
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
      duplicateCheckScope: f.duplicateCheckScope,
    }));
  }

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

  // Public: the consumer app calls this to render whatever form (if any)
  // is assigned to the course it's booking. `form: null` is a normal
  // response, not an error — most courses have no form assigned.
  async getFormForCourse(c: C) {
    try {
      const courseId = parseInt(c.req.param('id'));
      const form = await this.repo(c).getFormForCourse(courseId);
      return c.json({ success: true, form });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Public: how many spots are left per team on a team_select field, for
  // this specific course+round — read by the consumer booking wizard to
  // disable full teams before submit (also re-checked server-side at
  // createBooking). scheduledAt is required since capacity resets per round.
  async getTeamAvailability(c: C) {
    try {
      const formId = parseInt(c.req.param('id'));
      const courseId = parseInt(c.req.query('courseId') || '');
      const scheduledAt = c.req.query('scheduledAt') || '';
      if (!courseId) return c.json({ success: false, message: 'courseId is required' }, 400);
      if (!scheduledAt) return c.json({ success: false, message: 'scheduledAt is required' }, 400);
      const counts = await this.repo(c).getTeamAvailability(formId, courseId, scheduledAt);
      return c.json({ success: true, counts });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createForm(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'name is required' }, 400);
      const id = await this.repo(c).createForm({
        name: body.name,
        description: body.description,
        isActive: body.isActive,
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
      await this.repo(c).updateForm(id, {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
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
}
