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

export interface Registrant {
  bookingId: number;
  submissionId: number | null;
  childName: string;
  parentName: string;
  team: string | null;
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

  async update(id: number, patch: { name?: string; description?: string | null; teamFieldKey?: string | null }): Promise<void> {
    await this.db.prepare(`
      UPDATE Tournaments SET
        name = COALESCE(?, name),
        description = ?,
        team_field_key = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(patch.name ?? null, patch.description ?? null, patch.teamFieldKey ?? null, id).run();
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
  }): Promise<number> {
    const res = await this.db.prepare(`
      INSERT INTO Tournament_Heats (tournament_id, name, slot_date, slot_start_time, capacity, sort_order, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tournamentId, heat.name, heat.slotDate ?? null, heat.slotStartTime ?? null,
      heat.capacity ?? null, heat.sortOrder ?? 0, heat.note ?? null,
    ).run();
    return Number(res.meta.last_row_id);
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
      INSERT INTO Tournament_Entries (heat_id, tournament_id, entry_type, ref_key, label, sub_label, lane, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      heatId, tournamentId, entry.entryType, entry.refKey, entry.label,
      entry.subLabel ?? null, entry.lane ?? null, entry.sortOrder ?? 0,
    ).run();
  }

  async moveEntry(entryId: number, heatId: number): Promise<void> {
    await this.db.prepare('UPDATE Tournament_Entries SET heat_id = ? WHERE id = ?').bind(heatId, entryId).run();
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
      if (teamFieldKey && r.answers_json) {
        try {
          const answers = JSON.parse(r.answers_json);
          const raw = answers[teamFieldKey];
          team = raw == null || raw === '' ? null : String(raw);
        } catch { /* a malformed submission just has no team */ }
      }
      return {
        bookingId: r.booking_id,
        submissionId: r.form_submission_id ?? null,
        childName: r.child_name || '',
        parentName: r.parent_name || '',
        team,
        slotDate: r.slot_date ?? null,
        slotStartTime: r.slot_start_time ?? null,
        scheduledAt: r.scheduled_at,
        status: r.status,
      };
    });
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

  return {
    team: Array.from(teams.entries()).map(([name, rs]) => ({
      entryType: 'team' as const,
      refKey: name,
      label: name,
      subLabel: `${rs.length} คน`,
      bookingIds: rs.map(r => r.bookingId),
      ...slotOf(rs),
    })).sort((a, b) => a.label.localeCompare(b.label, 'th')),

    family: Array.from(families.entries()).map(([key, rs]) => ({
      entryType: 'family' as const,
      refKey: key,
      // The parent names the family; the children are what distinguishes one
      // booking of theirs from another.
      label: rs[0].parentName || rs[0].childName,
      subLabel: rs.map(r => r.childName).filter(Boolean).join(', '),
      bookingIds: rs.map(r => r.bookingId),
      ...slotOf(rs),
    })).sort((a, b) => a.label.localeCompare(b.label, 'th')),

    person: registrants.map(r => ({
      entryType: 'person' as const,
      refKey: String(r.bookingId),
      label: r.childName || r.parentName,
      subLabel: r.team || r.parentName,
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
