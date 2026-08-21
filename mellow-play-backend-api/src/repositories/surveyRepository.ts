export interface SurveyFieldInput {
  fieldKey: string; pageIndex: number; fieldIndex: number; type: string;
  label: string; required?: boolean; optionsJson?: string; configJson?: string;
}

// Whether a select/radio/checkbox field carries real scoring — an explicit
// per-field toggle in config_json (`{ scored: true }`), not inferred from
// whether any option happens to have a non-zero point value, since a form
// builder can legitimately leave every option at 0 while scoring is still
// "on" for that question.
const isFieldScored = (configJson: string | null | undefined): boolean => {
  try { return !!(configJson && JSON.parse(configJson).scored); } catch { return false; }
};

const isChoiceLike = (type: string): boolean =>
  type === 'select' || type === 'radio' || type === 'checkbox';

// A rating scale's options are a ladder, not a set of alternatives: shuffling
// "5,4,3,2,1" into "3,1,5,2,4" does not randomise the question, it destroys it.
const isScaleDisplay = (configJson: string | null | undefined): boolean => {
  try { return !!configJson && JSON.parse(configJson).display === 'scale'; } catch { return false; }
};

// Fields that anchor the ones around them: a heading introduces the questions
// below it, a reading passage is what the questions after it are ABOUT, an
// image is the thing a question refers to, and the "who's answering" block
// belongs where the form author put it. Shuffling moves questions around
// these, never the anchors themselves.
const ANCHOR_TYPES = new Set(['heading', 'paragraph', 'image', 'identity']);

const shuffleSlice = <T>(arr: T[], from: number, to: number): void => {
  for (let i = to - 1; i > from; i--) {
    const j = from + Math.floor(Math.random() * (i - from + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

export class SurveyRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // Every mode except 'pages' shuffles WITHIN a page and never across one:
  // pages are a deliberate pacing decision by whoever built the form, unlike
  // the order of questions on one screen.
  //
  // 'pages' is the exception, and exists for the one-question-per-page layout
  // an exam usually wants: there, every other mode is a no-op — a page holding
  // a single question has nothing to permute — so the whole form came out in
  // the same order for everyone. It moves each page as an intact block, taking
  // its heading, its reading passage and its image along with the question
  // they belong to.
  private shuffleQuestions(fields: any[], mode: string, pinnedPages: boolean[] = []): any[] {
    if (mode === 'pages') return this.shufflePages(fields, pinnedPages);
    if (mode !== 'within_section' && mode !== 'sections' && mode !== 'all') return fields;
    const out: any[] = [];
    let i = 0;
    while (i < fields.length) {
      const page = fields[i].page_index;
      let j = i;
      while (j < fields.length && fields[j].page_index === page) j++;
      out.push(...this.shufflePage(fields.slice(i, j), mode));
      i = j;
    }
    return out;
  }

  /**
   * Reorder whole pages, each keeping its own contents in the author's order.
   *
   * page_index is rewritten to the new position rather than carried along: the
   * app groups fields into an array BY page_index, so pages come out in
   * numeric order no matter what order the rows arrive in. Shuffling the rows
   * without renumbering would have been silently undone.
   */
  private shufflePages(fields: any[], pinnedPages: boolean[] = []): any[] {
    const byPage = new Map<number, any[]>();
    for (const f of fields) {
      const page = f.page_index ?? 0;
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page)!.push(f);
    }
    const blocks = Array.from(byPage.values());
    if (blocks.length < 2) return fields;

    // A pinned page keeps its exact position; the rest are permuted among the
    // positions that are left. A test still has pages that are not questions —
    // "who is answering" at the front, comments at the back — and dealing
    // those into the middle makes the paper nonsense.
    const looseSlots: number[] = [];
    blocks.forEach((_, i) => { if (!pinnedPages[i]) looseSlots.push(i); });
    if (looseSlots.length > 1) {
      const loose = looseSlots.map(i => blocks[i]);
      shuffleSlice(loose, 0, loose.length);
      looseSlots.forEach((slot, n) => { blocks[slot] = loose[n]; });
    }

    return blocks.flatMap((block, newIndex) => block.map(f => ({ ...f, page_index: newIndex })));
  }

  private shufflePage(page: any[], mode: string): any[] {
    // 'sections' moves whole heading blocks and leaves each block's insides
    // alone. Anything before the first heading is the form's preamble, not a
    // section, so it stays at the top.
    if (mode === 'sections') {
      const firstHeading = page.findIndex(f => f.type === 'heading');
      if (firstHeading < 0) return page;
      const blocks: any[][] = [];
      for (let k = firstHeading; k < page.length; k++) {
        if (page[k].type === 'heading') blocks.push([page[k]]);
        else blocks[blocks.length - 1].push(page[k]);
      }
      shuffleSlice(blocks, 0, blocks.length);
      return [...page.slice(0, firstHeading), ...blocks.flat()];
    }

    // 'within_section' and 'all' both keep anchors in their exact slots and
    // permute questions between the slots that are left. They differ only in
    // how far a question may travel: 'within_section' treats every anchor as a
    // wall, 'all' treats none of them as one.
    const out = [...page];
    const runs: number[][] = [];
    let run: number[] = [];
    out.forEach((f, k) => {
      const isAnchor = ANCHOR_TYPES.has(f.type);
      if (isAnchor && mode === 'within_section') {
        if (run.length) runs.push(run);
        run = [];
      }
      if (!isAnchor) run.push(k);
    });
    if (run.length) runs.push(run);

    for (const positions of runs) {
      if (positions.length < 2) continue;
      const picked = positions.map(k => out[k]);
      shuffleSlice(picked, 0, picked.length);
      positions.forEach((slot, n) => { out[slot] = picked[n]; });
    }
    return out;
  }

  private shuffleOptions(fields: any[]): any[] {
    return fields.map(f => {
      if (!isChoiceLike(f.type) || !f.options_json || isScaleDisplay(f.config_json)) return f;
      try {
        const options = JSON.parse(f.options_json);
        if (!Array.isArray(options) || options.length < 2) return f;
        shuffleSlice(options, 0, options.length);
        return { ...f, options_json: JSON.stringify(options) };
      } catch {
        return f; // malformed options render as-is rather than break the form
      }
    });
  }

  // field_index is what the consumer app groups a page by, so a shuffled array
  // whose indices still say the original order would be silently re-sorted
  // back. Renumber per page, matching how the CRM writes them on save.
  private renumberFieldIndex(fields: any[]): any[] {
    const nextIndex = new Map<number, number>();
    return fields.map(f => {
      const page = f.page_index ?? 0;
      const i = nextIndex.get(page) ?? 0;
      nextIndex.set(page, i + 1);
      return { ...f, field_index: i };
    });
  }

  async listForms(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT f.id, f.name, f.description, f.form_kind, f.has_answer_key, f.is_active, f.slug, f.created_at,
        (SELECT COUNT(*) FROM Survey_Submissions s WHERE s.form_id = f.id) AS response_count
      FROM Survey_Forms f
      ORDER BY f.created_at DESC
    `).all();
    return results;
  }

  async getFormWithFields(id: number): Promise<any | null> {
    const form = await this.db.prepare('SELECT * FROM Survey_Forms WHERE id = ?').bind(id).first();
    if (!form) return null;
    const { results: fields } = await this.db.prepare(
      'SELECT * FROM Survey_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC'
    ).bind(id).all();
    return { ...form, fields };
  }

  // Public read: accepts either a numeric id or a slug, since the shareable
  // consumer-app link can use whichever the form was given. Inactive forms
  // are "not found" to a respondent, same as a deleted one.
  async getPublicForm(idOrSlug: string): Promise<any | null> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const form = isNumeric
      ? await this.db.prepare('SELECT * FROM Survey_Forms WHERE id = ?').bind(parseInt(idOrSlug)).first() as any
      : await this.db.prepare('SELECT * FROM Survey_Forms WHERE slug = ?').bind(idOrSlug).first() as any;
    if (!form || !form.is_active) return null;
    const { results: fields } = await this.db.prepare(
      'SELECT * FROM Survey_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC'
    ).bind(form.id).all();

    // Shuffled fresh on every fetch, so the two rounds of a before/after test
    // are never the same paper twice — and so is a reload, which is fine:
    // answers key off field_key, not position.
    let presented = fields as any[];
    if (form.shuffle_options) presented = this.shuffleOptions(presented);
    if (form.shuffle_mode && form.shuffle_mode !== 'none') {
      let pinnedPages: boolean[] = [];
      try {
        const parsed = JSON.parse(form.shuffle_pinned_pages || '[]');
        if (Array.isArray(parsed)) pinnedPages = parsed.map(Boolean);
      } catch { /* a malformed pin list just means nothing is pinned */ }
      presented = this.renumberFieldIndex(this.shuffleQuestions(presented, form.shuffle_mode, pinnedPages));
    }

    return { ...form, fields: presented };
  }

  async createForm(data: {
    name: string; description?: string; formKind: string;
    isActive?: boolean; slug?: string | null; scoreRangesJson?: string | null;
    shuffleMode?: string; shuffleOptions?: boolean; shufflePinnedPages?: boolean[];
    fields: SurveyFieldInput[];
  }): Promise<number> {
    // has_answer_key is derived, not a separate manual toggle — a form is
    // "graded" as soon as any one of its questions has scoring turned on,
    // regardless of whether the others do.
    const hasAnswerKey = data.fields.some(f => isFieldScored(f.configJson));
    const result = await this.db.prepare(`
      INSERT INTO Survey_Forms (name, description, form_kind, has_answer_key, is_active, slug, score_ranges_json, shuffle_mode, shuffle_options, shuffle_pinned_pages)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.name, data.description ?? null, data.formKind,
      hasAnswerKey ? 1 : 0, data.isActive === false ? 0 : 1, data.slug ?? null,
      hasAnswerKey ? (data.scoreRangesJson ?? null) : null,
      data.shuffleMode ?? 'none', data.shuffleOptions ? 1 : 0,
      data.shufflePinnedPages?.some(Boolean) ? JSON.stringify(data.shufflePinnedPages) : null,
    ).run();
    const formId = result.meta.last_row_id;

    if (data.fields.length > 0) {
      await this.db.batch(data.fields.map(f =>
        this.db.prepare(`
          INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(formId, f.fieldKey, f.pageIndex, f.fieldIndex, f.type, f.label, f.required ? 1 : 0, f.optionsJson ?? null, f.configJson ?? null)
      ));
    }
    return formId;
  }

  // Fields are always replaced wholesale on save (delete-all-reinsert), same
  // approach as Registration_Form_Fields — field_key (client-generated, not
  // the DB id) is what survives across saves for anything referencing it.
  async updateForm(id: number, data: {
    name: string; description?: string; formKind: string;
    isActive?: boolean; slug?: string | null; scoreRangesJson?: string | null;
    shuffleMode?: string; shuffleOptions?: boolean; shufflePinnedPages?: boolean[];
    fields: SurveyFieldInput[];
  }): Promise<void> {
    const hasAnswerKey = data.fields.some(f => isFieldScored(f.configJson));
    const statements = [
      this.db.prepare(`
        UPDATE Survey_Forms SET name = ?, description = ?, form_kind = ?, has_answer_key = ?, is_active = ?, slug = ?, score_ranges_json = ?, shuffle_mode = ?, shuffle_options = ?, shuffle_pinned_pages = ?
        WHERE id = ?
      `).bind(
        data.name, data.description ?? null, data.formKind,
        hasAnswerKey ? 1 : 0, data.isActive === false ? 0 : 1, data.slug ?? null,
        hasAnswerKey ? (data.scoreRangesJson ?? null) : null,
        data.shuffleMode ?? 'none', data.shuffleOptions ? 1 : 0,
        data.shufflePinnedPages?.some(Boolean) ? JSON.stringify(data.shufflePinnedPages) : null, id,
      ),
      this.db.prepare('DELETE FROM Survey_Form_Fields WHERE form_id = ?').bind(id),
      ...data.fields.map(f =>
        this.db.prepare(`
          INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, f.fieldKey, f.pageIndex, f.fieldIndex, f.type, f.label, f.required ? 1 : 0, f.optionsJson ?? null, f.configJson ?? null)
      ),
    ];
    await this.db.batch(statements);
  }

  async deleteForm(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM Survey_Submissions WHERE form_id = ?').bind(id),
      this.db.prepare('DELETE FROM Survey_Forms WHERE id = ?').bind(id),
    ]);
  }

  async isSlugTaken(slug: string, excludeFormId?: number): Promise<boolean> {
    const row = excludeFormId
      ? await this.db.prepare('SELECT id FROM Survey_Forms WHERE slug = ? AND id != ?').bind(slug, excludeFormId).first()
      : await this.db.prepare('SELECT id FROM Survey_Forms WHERE slug = ?').bind(slug).first();
    return !!row;
  }

  // Scoring is computed here, server-side, from the form's OWN stored
  // options_json points — never trusted from the submitted answers payload.
  // radio/select: the point value of whichever single option was picked.
  // checkbox: sum of point values of every option selected. Per-field max
  // mirrors the same shape (highest single option for radio/select, sum of
  // every positive-point option for checkbox) so a non-graded form (or a
  // field with no points set) naturally contributes 0/0.
  private computeScore(fields: any[], answers: Record<string, any>): { totalScore: number; maxScore: number } {
    let totalScore = 0;
    let maxScore = 0;
    for (const f of fields) {
      if (f.type !== 'select' && f.type !== 'radio' && f.type !== 'checkbox') continue;
      if (!isFieldScored(f.config_json)) continue;
      let options: { label: string; points?: number }[] = [];
      try { options = f.options_json ? JSON.parse(f.options_json) : []; } catch { /* malformed options shouldn't block scoring other fields */ }
      if (options.length === 0) continue;

      if (f.type === 'checkbox') {
        const picked: string[] = Array.isArray(answers[f.field_key]) ? answers[f.field_key] : [];
        for (const opt of options) {
          const points = opt.points ?? 0;
          if (points > 0) maxScore += points;
          if (picked.includes(opt.label)) totalScore += points;
        }
      } else {
        const picked = answers[f.field_key];
        const bestPoints = Math.max(0, ...options.map(o => o.points ?? 0));
        maxScore += bestPoints;
        const match = options.find(o => o.label === picked);
        if (match) totalScore += match.points ?? 0;
      }
    }
    return { totalScore, maxScore };
  }

  // Finds whichever configured band the final score falls into (inclusive
  // min/max) — the first match wins, so an admin who accidentally overlaps
  // two ranges gets deterministic (if not necessarily "correct") behavior
  // rather than a runtime error.
  // resultTextHtml is the formatted copy of resultText, sent alongside it
  // rather than instead of it: the plain text is what an SMS, an export or any
  // future plain-text reader needs, and only the result screen renders markup.
  private matchScoreRange(scoreRangesJson: string | null | undefined, totalScore: number): { resultText: string; resultTextHtml?: string; imageUrl?: string } | null {
    if (!scoreRangesJson) return null;
    try {
      const ranges: { min: number; max: number; resultText: string; resultTextHtml?: string; imageUrl?: string }[] = JSON.parse(scoreRangesJson);
      const match = ranges.find(r => totalScore >= r.min && totalScore <= r.max);
      return match ? { resultText: match.resultText, resultTextHtml: match.resultTextHtml, imageUrl: match.imageUrl } : null;
    } catch { return null; }
  }

  // Which round this is for this respondent on this form. Derived here, never
  // taken from the client — a "2nd attempt" a respondent can assert is a
  // respondent who can fake their own improvement.
  //
  // Members are keyed by user_id; guests fall back to the phone they typed.
  // Someone who answers anonymously with no phone at all is unpairable, so
  // every such submission is round 1.
  private async nextAttemptNo(formId: number, userId?: number | null, respondentPhone?: string | null): Promise<number> {
    let prior: { n: number } | null = null;
    if (userId != null) {
      prior = await this.db.prepare(
        'SELECT COUNT(*) AS n FROM Survey_Submissions WHERE form_id = ? AND user_id = ? AND is_test = 0'
      ).bind(formId, userId).first<{ n: number }>();
    } else if (respondentPhone) {
      prior = await this.db.prepare(
        'SELECT COUNT(*) AS n FROM Survey_Submissions WHERE form_id = ? AND user_id IS NULL AND respondent_phone = ? AND is_test = 0'
      ).bind(formId, respondentPhone).first<{ n: number }>();
    }
    return (prior?.n ?? 0) + 1;
  }

  async createSubmission(data: {
    formId: number; userId?: number | null; respondentName?: string | null;
    respondentPhone?: string | null; answers: Record<string, any>; attemptLabel?: string | null;
    sessionId?: number | null; sessionRunId?: string | null; isTest?: boolean;
  }): Promise<{ id: number; totalScore: number | null; maxScore: number | null; attemptNo: number; result: { resultText: string; imageUrl?: string } | null }> {
    const form = await this.db.prepare('SELECT has_answer_key, score_ranges_json FROM Survey_Forms WHERE id = ?').bind(data.formId).first() as any;
    let totalScore: number | null = null;
    let maxScore: number | null = null;
    let result: { resultText: string; imageUrl?: string } | null = null;
    if (form?.has_answer_key) {
      const { results: fields } = await this.db.prepare(
        'SELECT field_key, type, options_json, config_json FROM Survey_Form_Fields WHERE form_id = ?'
      ).bind(data.formId).all();
      const scored = this.computeScore(fields as any[], data.answers);
      totalScore = scored.totalScore;
      maxScore = scored.maxScore;
      result = this.matchScoreRange(form.score_ranges_json, totalScore);
    }

    const attemptNo = await this.nextAttemptNo(data.formId, data.userId, data.respondentPhone);

    const inserted = await this.db.prepare(`
      INSERT INTO Survey_Submissions (form_id, user_id, respondent_name, respondent_phone, answers_json, total_score, max_score, attempt_no, attempt_label, session_id, session_run_id, is_test)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.formId, data.userId ?? null, data.respondentName ?? null, data.respondentPhone ?? null,
      JSON.stringify(data.answers), totalScore, maxScore, attemptNo, data.attemptLabel ?? null,
      data.sessionId ?? null, data.sessionRunId ?? null, data.isTest ? 1 : 0,
    ).run();

    return { id: inserted.meta.last_row_id, totalScore, maxScore, attemptNo, result };
  }

  /**
    * Real answers by default. Trial runs (is_test = 1) are a separate world:
    * they exist so staff can walk the form themselves, and counting them would
    * quietly move every average and response count the CRM shows.
    *
    * 'test' returns only the trial runs, for the "ดูผลทดลอง" view; 'all' is
    * offered for completeness but is never the default anywhere.
    */
  async listSubmissions(formId: number, scope: 'real' | 'test' | 'all' = 'real'): Promise<any[]> {
    const filter = scope === 'all' ? '' : scope === 'test' ? 'AND s.is_test = 1' : 'AND s.is_test = 0';
    const { results } = await this.db.prepare(`
      SELECT s.*, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM Survey_Submissions s
      LEFT JOIN Users u ON u.id = s.user_id
      WHERE s.form_id = ? ${filter}
      ORDER BY s.created_at DESC
    `).bind(formId).all();
    return results;
  }

  // Both numbers in one round trip so the CRM can show "ผลจริง 12 · ทดลอง 3"
  // without asking twice for the same table.
  async countSubmissions(formId: number): Promise<{ real: number; test: number }> {
    const row = await this.db.prepare(`
      SELECT
        SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) AS real_count,
        SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) AS test_count
      FROM Survey_Submissions WHERE form_id = ?
    `).bind(formId).first<{ real_count: number | null; test_count: number | null }>();
    return { real: row?.real_count ?? 0, test: row?.test_count ?? 0 };
  }

  async deleteTestSubmissions(formId: number): Promise<number> {
    const res = await this.db.prepare('DELETE FROM Survey_Submissions WHERE form_id = ? AND is_test = 1').bind(formId).run();
    return res.meta.changes ?? 0;
  }
}
