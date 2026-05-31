import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { HDService } from '../services/hdService';
import { ConfigService } from '../services/configService';
import { HDProfileRepository } from '../repositories/hdProfileRepository';

export class ProfileController {
  async calculate(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const { userId, name, relation, birthInfo } = await c.req.json();
    const hdService = new HDService(config.hdApiKey, config.hdGeocodeKey);
    const hdProfileRepository = new HDProfileRepository(config.db);

    try {
      const apiResponse = await hdService.calculateChart({
        birthdate: birthInfo.date,
        birthtime: birthInfo.time,
        lat: birthInfo.lat,
        lng: birthInfo.lng
      });

      const profileData = hdService.mapResponseToProfile(
        userId, name, relation, birthInfo, apiResponse
      );

      const profileId = await hdProfileRepository.create(profileData);

      return c.json({ success: true, profileId });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async listProfiles(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = c.req.query('userId');
      if (!userId) return c.json({ success: false, message: 'User ID required' }, 400);

      const hdProfileRepository = new HDProfileRepository(config.db);
      const profiles = await hdProfileRepository.findByUserId(parseInt(userId));
      
      return c.json({ success: true, profiles });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}
