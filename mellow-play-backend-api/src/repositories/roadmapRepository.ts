export interface RoadmapNode {
  id: number;
  node_order: number;
  title: string;
  description: string;
  required_level: number;
}

export class RoadmapRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getAllNodes(): Promise<RoadmapNode[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Roadmap_Nodes ORDER BY node_order ASC'
    ).all<RoadmapNode>();
    return results;
  }

  async findById(id: number): Promise<RoadmapNode | null> {
    return await this.db.prepare('SELECT * FROM Roadmap_Nodes WHERE id = ?')
      .bind(id)
      .first<RoadmapNode>();
  }
}
