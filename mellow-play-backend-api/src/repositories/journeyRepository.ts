export interface JourneyProgress {
  id: number;
  child_id: number;
  node_id: number;
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
    const { results } = await this.db.prepare(`
      SELECT j.*, m.media_url, m.media_type
      FROM Child_Journey j
      LEFT JOIN Journey_Media m ON j.id = m.journey_id
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

  async getAlbum(childId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT m.*, j.completed_at, n.title as activity_title
      FROM Journey_Media m
      JOIN Child_Journey j ON m.journey_id = j.id
      JOIN Roadmap_Nodes n ON j.node_id = n.id
      WHERE j.child_id = ?
      ORDER BY j.completed_at DESC
    `).bind(childId).all();
    return results;
  }

  async recordProgress(data: {
    child_id: number;
    node_id: number;
    booking_id?: number;
    skills_learned: string;
    teacher_comment: string;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Child_Journey (child_id, node_id, booking_id, skills_learned, teacher_comment)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.child_id, data.node_id, data.booking_id, data.skills_learned, data.teacher_comment).run();
    return result.meta.last_row_id;
  }

  async addMedia(journeyId: number, url: string, type: string = 'image'): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Journey_Media (journey_id, media_url, media_type)
      VALUES (?, ?, ?)
    `).bind(journeyId, url, type).run();
    return result.meta.last_row_id;
  }
}
