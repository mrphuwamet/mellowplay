export interface JourneyProgress {
  id: number;
  child_id: number;
  node_id: number | null;
  booking_id?: number;
  skills_learned: string;
  teacher_comment: string;
  completed_at: string;
  media?: { url: string; type: string }[];
}

export class JourneyRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getChildProgress(childId: number): Promise<JourneyProgress[]> {
    // node_title falls back to the attended course's name — RecordMilestone
    // (CRM) records reports per-course, not against Roadmap_Nodes, so node_id
    // is normally null.
    const { results } = await this.db.prepare(`
      SELECT j.*, m.media_url, m.media_type, COALESCE(n.title, c.name) as node_title, n.description as node_desc
      FROM Child_Journey j
      LEFT JOIN Journey_Media m ON j.id = m.journey_id
      LEFT JOIN Roadmap_Nodes n ON j.node_id = n.id
      LEFT JOIN Bookings b ON j.booking_id = b.id
      LEFT JOIN Courses c ON b.course_id = c.id
      WHERE j.child_id = ?
      ORDER BY j.completed_at DESC
    `).bind(childId).all<any>();

    // Basic grouping of media into array
    const journeyMap = new Map<number, JourneyProgress>();
    results.forEach(row => {
      if (!journeyMap.has(row.id)) {
        journeyMap.set(row.id, {
          ...row,
          media: []
        });
      }
      if (row.media_url) {
        journeyMap.get(row.id)!.media?.push({ url: row.media_url, type: row.media_type });
      }
    });

    return Array.from(journeyMap.values());
  }

  async getProgressByBooking(bookingId: number): Promise<JourneyProgress | null> {
    const { results } = await this.db.prepare(`
      SELECT j.*, m.media_url, m.media_type, COALESCE(n.title, c.name) as node_title, n.description as node_desc
      FROM Child_Journey j
      LEFT JOIN Journey_Media m ON j.id = m.journey_id
      LEFT JOIN Roadmap_Nodes n ON j.node_id = n.id
      LEFT JOIN Bookings b ON j.booking_id = b.id
      LEFT JOIN Courses c ON b.course_id = c.id
      WHERE j.booking_id = ?
    `).bind(bookingId).all<any>();

    if (results.length === 0) return null;

    const media = results.filter(r => r.media_url).map(r => ({ url: r.media_url, type: r.media_type }));
    return { ...results[0], media };
  }

  async getAlbum(childId: number): Promise<any[]> {
    // Prefer the actual course the child attended (via the booking tied to
    // this journey record) over the generic roadmap node title, so the
    // album groups by "ชื่อคลาสเข้าร่วม" (the class actually attended).
    // LEFT JOIN Roadmap_Nodes — node_id is normally null (see Child_Journey
    // schema note), so an inner join here would silently drop every photo.
    const { results } = await this.db.prepare(`
      SELECT m.*, j.completed_at, j.booking_id, COALESCE(n.title, c.name) as activity_title, c.name as course_name,
        COALESCE(b.scheduled_at, j.completed_at) as class_date
      FROM Journey_Media m
      JOIN Child_Journey j ON m.journey_id = j.id
      LEFT JOIN Roadmap_Nodes n ON j.node_id = n.id
      LEFT JOIN Bookings b ON j.booking_id = b.id
      LEFT JOIN Courses c ON b.course_id = c.id
      WHERE j.child_id = ?
      ORDER BY class_date DESC
    `).bind(childId).all();
    return results;
  }

  async recordProgress(data: {
    child_id: number;
    node_id?: number | null;
    booking_id?: number;
    skills_learned: string;
    teacher_comment: string;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Child_Journey (child_id, node_id, booking_id, skills_learned, teacher_comment)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.child_id, data.node_id ?? null, data.booking_id, data.skills_learned, data.teacher_comment).run();
    return result.meta.last_row_id;
  }

  // Editing an existing report should update it in place, not insert a
  // second Child_Journey row for the same booking.
  async findJourneyIdByBooking(bookingId: number): Promise<number | null> {
    const row = await this.db.prepare(
      `SELECT id FROM Child_Journey WHERE booking_id = ? LIMIT 1`
    ).bind(bookingId).first<{ id: number }>();
    return row?.id ?? null;
  }

  async updateProgress(journeyId: number, data: { skills_learned: string; teacher_comment: string }): Promise<void> {
    await this.db.prepare(
      `UPDATE Child_Journey SET skills_learned = ?, teacher_comment = ? WHERE id = ?`
    ).bind(data.skills_learned, data.teacher_comment, journeyId).run();
  }

  async deleteMediaByJourney(journeyId: number): Promise<void> {
    await this.db.prepare(`DELETE FROM Journey_Media WHERE journey_id = ?`).bind(journeyId).run();
  }

  async addMedia(journeyId: number, url: string, type: string = 'image'): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Journey_Media (journey_id, media_url, media_type)
      VALUES (?, ?, ?)
    `).bind(journeyId, url, type).run();
    return result.meta.last_row_id;
  }
}
