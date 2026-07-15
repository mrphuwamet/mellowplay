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

  async getProgressByBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const bookingId = parseInt(c.req.param('bookingId'));
    const journeyRepo = new JourneyRepository(config.db);
    const progress = await journeyRepo.getProgressByBooking(bookingId);
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

    const skillsLearned = Array.isArray(data.skillsLearned) ? JSON.stringify(data.skillsLearned) : data.skillsLearned;

    // Editing an already-filed report (RecordMilestone reopened from CRM)
    // updates the existing Child_Journey row instead of inserting a second
    // one for the same booking.
    const existingJourneyId = data.bookingId ? await journeyRepo.findJourneyIdByBooking(data.bookingId) : null;

    let journeyId: number;
    if (existingJourneyId) {
      journeyId = existingJourneyId;
      await journeyRepo.updateProgress(journeyId, { skills_learned: skillsLearned, teacher_comment: data.teacherComment });
      await journeyRepo.deleteMediaByJourney(journeyId);
    } else {
      journeyId = await journeyRepo.recordProgress({
        child_id: data.childId,
        node_id: data.nodeId ?? null,
        booking_id: data.bookingId,
        skills_learned: skillsLearned,
        teacher_comment: data.teacherComment
      });
    }

    // RecordMilestone.tsx (CRM) sends `media: [{url, type}]`; also accept the
    // older `mediaUrls: string[]` shape for backward compatibility.
    if (Array.isArray(data.media)) {
      for (const item of data.media) {
        if (item?.url) await journeyRepo.addMedia(journeyId, item.url, item.type || 'image');
      }
    } else if (Array.isArray(data.mediaUrls)) {
      for (const url of data.mediaUrls) {
        await journeyRepo.addMedia(journeyId, url);
      }
    }

    return c.json({ success: true, journeyId });
  }
}
