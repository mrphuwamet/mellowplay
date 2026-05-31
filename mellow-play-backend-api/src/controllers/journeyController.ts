import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { RoadmapRepository } from '../repositories/roadmapRepository';
import { JourneyRepository } from '../repositories/journeyRepository';
import { ConfigService } from '../services/configService';

export class JourneyController {
  async listNodes(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const roadmapRepo = new RoadmapRepository(config.db);
    const nodes = await roadmapRepo.getAllNodes();
    return c.json({ success: true, nodes });
  }

  async getChildProgress(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const childId = parseInt(c.req.param('childId'));
    const journeyRepo = new JourneyRepository(config.db);
    const progress = await journeyRepo.getChildProgress(childId);
    return c.json({ success: true, progress });
  }

  async getAlbum(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const childId = parseInt(c.req.param('childId'));
    const journeyRepo = new JourneyRepository(config.db);
    const album = await journeyRepo.getAlbum(childId);
    return c.json({ success: true, album });
  }

  async recordMilestone(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const data = await c.req.json();
    const journeyRepo = new JourneyRepository(config.db);
    
    const journeyId = await journeyRepo.recordProgress({
      child_id: data.childId,
      node_id: data.nodeId,
      booking_id: data.bookingId,
      skills_learned: data.skillsLearned,
      teacher_comment: data.teacherComment
    });

    if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
      for (const url of data.mediaUrls) {
        await journeyRepo.addMedia(journeyId, url);
      }
    }

    return c.json({ success: true, journeyId });
  }
}
