/**
 * Heats, and who is in them.
 *
 * The interesting part is the registrant list: the same set of bookings has to
 * be offered three ways — as teams, as families, or as individual people —
 * because that is how staff actually think about a start list. One query reads
 * the bookings and their form answers; the three groupings are then folded out
 * of that in memory rather than as three round trips.
 */

export type EntryType = 'team' | 'family' | 'person';

/**
 * One person named on a registration, and the field they were named in.
 *
 * The field's own label is the role: a form asks for "ผู้ปกครองที่มาร่วม" and
 * "เด็กที่เข้าแข่งขัน", so printing the label beside the name says who is who
 * without the system having to guess from the name itself.
 */
export interface RegistrantMember {
  fieldKey: string;
  fieldLabel: string;
  /** 'adult' | 'child' when the form's picker declares one — otherwise null. */
  role: string | null;
  name: string;
}

export interface Registrant {
  bookingId: number;
  submissionId: number | null;
  childName: string;
  parentName: string;
  team: string | null;
  members: RegistrantMember[];
  slotDate: string | null;
  slotStartTime: string | null;
  scheduledAt: string;
  status: string;
}

export interface EntryOption {
  entryType: EntryType;
  refKey: string;
  label: string;
  subLabel: string;
  /** Who is on this entry, and under which question of the form. */
  members: RegistrantMember[];
  bookingIds: number[];
  slotDate: string | null;
  slotStartTime: string | null;
}

export class TournamentRepository {
  constructor(private db: D1Database) {}

  async getByCourse(courseId: number): Promise<any | null> {
    return await this.db.prepare(
      'SELECT * FROM Tournaments WHERE course_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1'
    ).bind(courseId).first<any>();
  }

  async create(courseId: number, name: string, teamFieldKey: string | null): Promise<number> {
    const res = await this.db.prepare(
      'INSERT INTO Tournaments (course_id, name, team_field_key) VALUES (?, ?, ?)'
    ).bind(courseId, name, teamFieldKey).run();
    return Number(res.meta.last_row_id);
  }

  async update(id: number, patch: {
    name?: string; description?: string | null; teamFieldKey?: string | null;
    format?: string; advancePerHeat?: number;
  }): Promise<void> {
    // COALESCE on everything the caller may not be sending: the bracket
    // generator only knows about format/advance, and must not wipe the name.
    await this.db.prepare(`
      UPDATE Tournaments SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        team_field_key = COALESCE(?, team_field_key),
        format = COALESCE(?, format),
        advance_per_heat = COALESCE(?, advance_per_heat),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      patch.name ?? null, patch.description ?? null, patch.teamFieldKey ?? null,
      patch.format ?? null, patch.advancePerHeat ?? null, id,
    ).run();
  }

  async getHeats(tournamentId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Tournament_Heats WHERE tournament_id = ? ORDER BY slot_date, slot_start_time, sort_order, id'
    ).bind(tournamentId).all<any>();
    return results;
  }

  async getEntries(tournamentId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Tournament_Entries WHERE tournament_id = ? ORDER BY heat_id, sort_order, id'
    ).bind(tournamentId).all<any>();
    return results;
  }

  async createHeat(tournamentId: number, heat: {
    name: string; slotDate?: string | null; slotStartTime?: string | null;
    capacity?: number | null; sortOrder?: number; note?: string | null;
    stageIndex?: number; stageLabel?: string | null; advanceCount?: number | null;
  }): Promise<number> {
    const res = await this.db.prepare(`
      INSERT INTO Tournament_Heats
        (tournament_id, name, slot_date, slot_start_time, capacity, sort_order, note, stage_index, stage_label, advance_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tournamentId, heat.name, heat.slotDate ?? null, heat.slotStartTime ?? null,
      heat.capacity ?? null, heat.sortOrder ?? 0, heat.note ?? null,
      heat.stageIndex ?? 0, heat.stageLabel ?? null, heat.advanceCount ?? null,
    ).run();
    return Number(res.meta.last_row_id);
  }

  async deleteAllHeats(tournamentId: number): Promise<void> {
    await this.db.prepare('DELETE FROM Tournament_Entries WHERE tournament_id = ?').bind(tournamentId).run();
    await this.db.prepare('DELETE FROM Tournament_Heats WHERE tournament_id = ?').bind(tournamentId).run();
  }

  /** Entries of one heat, best result first, with unplaced ones last. */
  async getHeatEntries(heatId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM Tournament_Entries WHERE heat_id = ?
      ORDER BY CASE WHEN result_rank IS NULL THEN 9999 ELSE result_rank END, sort_order, id
    `).bind(heatId).all<any>();
    return results;
  }

  async getHeat(heatId: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Tournament_Heats WHERE id = ?').bind(heatId).first<any>();
  }

  async getStageHeats(tournamentId: number, stageIndex: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Tournament_Heats WHERE tournament_id = ? AND stage_index = ? ORDER BY sort_order, id'
    ).bind(tournamentId, stageIndex).all<any>();
    return results;
  }

  async addAdvancedEntry(tournamentId: number, heatId: number, from: any): Promise<boolean> {
    try {
      await this.db.prepare(`
        INSERT INTO Tournament_Entries
          (heat_id, tournament_id, entry_type, ref_key, label, sub_label, sort_order, source_entry_id, stage_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT stage_index FROM Tournament_Heats WHERE id = ?), 0))
      `).bind(
        heatId, tournamentId, from.entry_type, from.ref_key, from.label,
        from.sub_label ?? null, from.sort_order ?? 0, from.id, heatId,
      ).run();
      return true;
    } catch {
      // Already through — the unique index per tournament means advancing twice
      // is a no-op rather than a duplicate on the start list.
      return false;
    }
  }

  async updateHeat(id: number, patch: {
    name?: string; slotDate?: string | null; slotStartTime?: string | null;
    capacity?: number | null; status?: string; note?: string | null; sortOrder?: number;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE Tournament_Heats SET
        name = COALESCE(?, name),
        slot_date = ?, slot_start_time = ?, capacity = ?,
        status = COALESCE(?, status), note = ?,
        sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).bind(
      patch.name ?? null, patch.slotDate ?? null, patch.slotStartTime ?? null,
      patch.capacity ?? null, patch.status ?? null, patch.note ?? null,
      patch.sortOrder ?? null, id,
    ).run();
  }

  async deleteHeat(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Tournament_Entries WHERE heat_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Tournament_Heats WHERE id = ?').bind(id).run();
  }

  async addEntry(tournamentId: number, heatId: number, entry: {
    entryType: EntryType; refKey: string; label: string; subLabel?: string | null;
    lane?: number | null; sortOrder?: number;
  }): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Tournament_Entries
        (heat_id, tournament_id, entry_type, ref_key, label, sub_label, lane, sort_order, stage_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT stage_index FROM Tournament_Heats WHERE id = ?), 0))
    `).bind(
      heatId, tournamentId, entry.entryType, entry.refKey, entry.label,
      entry.subLabel ?? null, entry.lane ?? null, entry.sortOrder ?? 0, heatId,
    ).run();
  }

  // Moving between stages has to carry the stage with it, or the "no racing
  // twice in one round" index would be checking the wrong round.
  async moveEntry(entryId: number, heatId: number): Promise<void> {
    await this.db.prepare(`
      UPDATE Tournament_Entries
      SET heat_id = ?, stage_index = COALESCE((SELECT stage_index FROM Tournament_Heats WHERE id = ?), stage_index)
      WHERE id = ?
    `).bind(heatId, heatId, entryId).run();
  }

  async setEntryResult(entryId: number, rank: number | null, note: string | null): Promise<void> {
    await this.db.prepare(
      'UPDATE Tournament_Entries SET result_rank = ?, result_note = ? WHERE id = ?'
    ).bind(rank, note, entryId).run();
  }

  async deleteEntry(entryId: number): Promise<void> {
    await this.db.prepare('DELETE FROM Tournament_Entries WHERE id = ?').bind(entryId).run();
  }

  async getEntry(entryId: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Tournament_Entries WHERE id = ?').bind(entryId).first<any>();
  }

  /**
   * Everyone booked onto this course, with the answers a start list needs.
   *
   * Cancelled bookings are left out — they are not racing — but every other
   * status is kept, because a heat is built before the money is always settled.
   */
  async getRegistrants(courseId: number, teamFieldKey: string | null): Promise<Registrant[]> {
    // The form's person-naming fields, fetched once. Their labels are what
    // tells a start list which name is the parent and which is the child.
    const { results: personFields } = await this.db.prepare(`
      SELECT f.field_key, f.label, f.config_json
      FROM Courses c
      JOIN Registration_Form_Fields f ON f.form_id = c.registration_form_id
      WHERE c.id = ? AND f.type = 'family_member_picker'
      ORDER BY f.page_index, f.field_index
    `).bind(courseId).all<any>();

    const fieldRoles = personFields.map((f: any) => {
      let role: string | null = null;
      try { role = JSON.parse(f.config_json || '{}')?.role ?? null; } catch { /* no role declared */ }
      return { fieldKey: f.field_key, fieldLabel: f.label, role };
    });

    const { results } = await this.db.prepare(`
      SELECT b.id AS booking_id, b.form_submission_id, b.scheduled_at, b.slot_date, b.slot_start_time, b.status,
             COALESCE(hp.nickname, hp.name) AS child_name,
             (u.first_name || ' ' || u.last_name) AS parent_name,
             fs.answers_json
      FROM Bookings b
      JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      JOIN Users u ON ch.parent_id = u.id
      LEFT JOIN Form_Submissions fs ON b.form_submission_id = fs.id
      WHERE b.course_id = ? AND b.status != 'cancelled'
      ORDER BY b.slot_date, b.slot_start_time, b.id
    `).bind(courseId).all<any>();

    return results.map((r: any) => {
      let team: string | null = null;
      const members: RegistrantMember[] = [];
      if (r.answers_json) {
        try {
          const answers = JSON.parse(r.answers_json);
          if (teamFieldKey) {
            const raw = answers[teamFieldKey];
            team = raw == null || raw === '' ? null : String(raw);
          }
          for (const f of fieldRoles) {
            // __realname is the fuller of the two the app records; the plain
            // answer is nickname-preferred and is what staff read out loud.
            const name = answers[f.fieldKey] || answers[`${f.fieldKey}__realname`];
            if (name) members.push({ ...f, name: String(name) });
          }
        } catch { /* a malformed submission just has no team or members */ }
      }
      return {
        bookingId: r.booking_id,
        submissionId: r.form_submission_id ?? null,
        childName: r.child_name || '',
        parentName: r.parent_name || '',
        team,
        members,
        slotDate: r.slot_date ?? null,
        slotStartTime: r.slot_start_time ?? null,
        scheduledAt: r.scheduled_at,
        status: r.status,
      };
    });
  }

  /**
   * Every round this course actually has bookings for.
   *
   * Taken from the bookings rather than from the calendar rules: a rule is a
   * repeating pattern ("every Saturday 10:00"), and what a heat needs is the
   * concrete dates people are booked onto. Rounds with nobody in them are
   * still listed, because a heat can be created before its entrants are drawn.
   */
  async getRounds(courseId: number): Promise<{ slot_date: string | null; slot_start_time: string | null; booking_count: number }[]> {
    const { results } = await this.db.prepare(`
      SELECT slot_date, slot_start_time, COUNT(*) AS booking_count
      FROM Bookings
      WHERE course_id = ? AND status != 'cancelled'
      GROUP BY slot_date, slot_start_time
      ORDER BY slot_date, slot_start_time
    `).bind(courseId).all<any>();
    return results;
  }

  /** The team_select fields this course's registration form offers. */
  async getTeamFields(courseId: number): Promise<{ field_key: string; label: string }[]> {
    const { results } = await this.db.prepare(`
      SELECT DISTINCT f.field_key, f.label
      FROM Courses c
      JOIN Registration_Form_Fields f ON f.form_id = c.registration_form_id
      WHERE c.id = ? AND f.type = 'team_select'
      ORDER BY f.page_index, f.field_index
    `).bind(courseId).all<any>();
    return results;
  }
}

/**
 * The same registrants, offered as the three things a heat can hold.
 *
 * A team gathers everyone who picked it; a family gathers one submission's
 * bookings; a person is one booking. Each option carries the booking ids behind
 * it so awarding a medal to an entry reaches everyone it covers.
 */
export function buildEntryOptions(registrants: Registrant[]): Record<EntryType, EntryOption[]> {
  const teams = new Map<string, Registrant[]>();
  const families = new Map<string, Registrant[]>();

  for (const r of registrants) {
    if (r.team) {
      if (!teams.has(r.team)) teams.set(r.team, []);
      teams.get(r.team)!.push(r);
    }
    // A booking with no submission is its own family of one — grouping those
    // together under "no submission" would put strangers in one entry.
    const familyKey = r.submissionId ? `sub:${r.submissionId}` : `booking:${r.bookingId}`;
    if (!families.has(familyKey)) families.set(familyKey, []);
    families.get(familyKey)!.push(r);
  }

  const slotOf = (rs: Registrant[]) => ({
    slotDate: rs[0]?.slotDate ?? null,
    slotStartTime: rs[0]?.slotStartTime ?? null,
  });

  // Everyone named across a group's registrations, without repeating a person
  // who appears on two of them.
  const membersOf = (rs: Registrant[]): RegistrantMember[] => {
    const seen = new Set<string>();
    const out: RegistrantMember[] = [];
    for (const r of rs) {
      for (const m of r.members) {
        const key = `${m.fieldKey}|${m.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
    }
    return out;
  };

  // "ผู้ปกครอง: สมชาย · เด็ก: น้องเอ๋" — the form's own question is the role, so
  // a start list says who is who without the system guessing from the name.
  const describe = (members: RegistrantMember[], fallback: string) =>
    (members.length > 0 ? members.map(m => `${m.fieldLabel}: ${m.name}`).join(' · ') : fallback);

  return {
    team: Array.from(teams.entries()).map(([name, rs]) => ({
      entryType: 'team' as const,
      refKey: name,
      label: name,
      subLabel: `${rs.length} คน`,
      members: membersOf(rs),
      bookingIds: rs.map(r => r.bookingId),
      ...slotOf(rs),
    })).sort((a, b) => a.label.localeCompare(b.label, 'th')),

    family: Array.from(families.entries()).map(([key, rs]) => {
      const members = membersOf(rs);
      return {
        entryType: 'family' as const,
        refKey: key,
        // The account holder names the family; the members say who actually
        // turned up and in what capacity.
        label: rs[0].parentName || rs[0].childName,
        subLabel: describe(members, rs.map(r => r.childName).filter(Boolean).join(', ')),
        members,
        bookingIds: rs.map(r => r.bookingId),
        ...slotOf(rs),
      };
    }).sort((a, b) => a.label.localeCompare(b.label, 'th')),

    person: registrants.map(r => ({
      entryType: 'person' as const,
      refKey: String(r.bookingId),
      label: r.childName || r.parentName,
      subLabel: describe(r.members, r.team || r.parentName),
      members: r.members,
      bookingIds: [r.bookingId],
      slotDate: r.slotDate,
      slotStartTime: r.slotStartTime,
    })),
  };
}

/**
 * The bookings an entry covers, recomputed from the current registrant list
 * rather than stored — a family that adds a child after the draw should have
 * that child in the heat, and a stored id list would quietly not.
 */
export function bookingIdsForEntry(
  entry: { entry_type: string; ref_key: string },
  registrants: Registrant[],
): number[] {
  if (entry.entry_type === 'team') {
    return registrants.filter(r => r.team === entry.ref_key).map(r => r.bookingId);
  }
  if (entry.entry_type === 'family') {
    if (entry.ref_key.startsWith('sub:')) {
      const id = Number(entry.ref_key.slice(4));
      return registrants.filter(r => r.submissionId === id).map(r => r.bookingId);
    }
    const id = Number(entry.ref_key.replace('booking:', ''));
    return registrants.filter(r => r.bookingId === id).map(r => r.bookingId);
  }
  const id = Number(entry.ref_key);
  return registrants.filter(r => r.bookingId === id).map(r => r.bookingId);
}
