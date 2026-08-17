import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import {
  TournamentRepository, buildEntryOptions, bookingIdsForEntry, EntryType,
} from '../repositories/tournamentRepository';
import { awardBadge } from '../services/stampService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class TournamentController {
  private repo(c: C) { return new TournamentRepository(new ConfigService(c.env).db); }

  /**
   * Everything one screen needs: the tournament, its heats and entries, the
   * registrants in all three groupings, and which of them are still unplaced.
   * One request because these are useless apart — a start list is the diff
   * between "who registered" and "who is already in a heat".
   */
  async getForCourse(c: C) {
    try {
      const courseId = parseInt(c.req.param('courseId'));
      const repo = this.repo(c);

      const teamFields = await repo.getTeamFields(courseId);
      const tournament = await repo.getByCourse(courseId);
      const teamFieldKey = tournament?.team_field_key || teamFields[0]?.field_key || null;

      const registrants = await repo.getRegistrants(courseId, teamFieldKey);
      const options = buildEntryOptions(registrants);

      if (!tournament) {
        return c.json({
          success: true, tournament: null, heats: [], entries: [],
          options, teamFields, registrantCount: registrants.length,
        });
      }

      const [heats, entries] = await Promise.all([
        repo.getHeats(tournament.id),
        repo.getEntries(tournament.id),
      ]);

      // An entry knows the bookings behind it now, not the ones behind it when
      // it was drawn — see bookingIdsForEntry.
      const entriesWithBookings = entries.map(e => ({
        ...e,
        booking_ids: bookingIdsForEntry(e, registrants),
      }));

      return c.json({
        success: true,
        tournament, heats, entries: entriesWithBookings,
        options, teamFields, registrantCount: registrants.length,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createOrUpdate(c: C) {
    try {
      const courseId = parseInt(c.req.param('courseId'));
      const { name, description, team_field_key } = await c.req.json();
      const repo = this.repo(c);
      const existing = await repo.getByCourse(courseId);

      if (existing) {
        await repo.update(existing.id, { name, description, teamFieldKey: team_field_key ?? null });
        return c.json({ success: true, id: existing.id });
      }
      const id = await repo.create(courseId, name?.trim() || 'การแข่งขัน', team_field_key ?? null);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createHeat(c: C) {
    try {
      const tournamentId = parseInt(c.req.param('tournamentId'));
      const body = await c.req.json();
      const id = await this.repo(c).createHeat(tournamentId, {
        name: body.name?.trim() || 'Heat',
        slotDate: body.slot_date ?? null,
        slotStartTime: body.slot_start_time ?? null,
        capacity: body.capacity ?? null,
        sortOrder: body.sort_order ?? 0,
        note: body.note ?? null,
      });
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateHeat(c: C) {
    try {
      const body = await c.req.json();
      await this.repo(c).updateHeat(parseInt(c.req.param('heatId')), {
        name: body.name,
        slotDate: body.slot_date ?? null,
        slotStartTime: body.slot_start_time ?? null,
        capacity: body.capacity ?? null,
        status: body.status,
        note: body.note ?? null,
        sortOrder: body.sort_order,
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteHeat(c: C) {
    try {
      await this.repo(c).deleteHeat(parseInt(c.req.param('heatId')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async addEntries(c: C) {
    try {
      const heatId = parseInt(c.req.param('heatId'));
      const { tournament_id, entries } = await c.req.json() as {
        tournament_id: number;
        entries: { entry_type: EntryType; ref_key: string; label: string; sub_label?: string }[];
      };
      const repo = this.repo(c);

      let added = 0;
      const skipped: string[] = [];
      for (const [i, e] of (entries || []).entries()) {
        try {
          await repo.addEntry(tournament_id, heatId, {
            entryType: e.entry_type, refKey: String(e.ref_key),
            label: e.label, subLabel: e.sub_label ?? null, sortOrder: i,
          });
          added++;
        } catch {
          // The unique index caught it: this registrant is already in a heat of
          // this tournament. Skipping is the right answer — the alternative is
          // silently moving them out of the heat someone else just built.
          skipped.push(e.label);
        }
      }
      return c.json({ success: true, added, skipped });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async moveEntry(c: C) {
    try {
      const { heat_id } = await c.req.json();
      await this.repo(c).moveEntry(parseInt(c.req.param('entryId')), heat_id);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteEntry(c: C) {
    try {
      await this.repo(c).deleteEntry(parseInt(c.req.param('entryId')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Records where an entry placed, and — for the top three — hands the medal to
   * everyone that entry covers.
   *
   * This is the whole point of recording heats in the system rather than on
   * paper: the result of the race is the thing that puts a badge in a child's
   * collection, and typing it twice is how the two stop matching.
   */
  async setResult(c: C) {
    try {
      const config = new ConfigService(c.env);
      const repo = this.repo(c);
      const entryId = parseInt(c.req.param('entryId'));
      const { rank, note, award } = await c.req.json() as { rank: number | null; note?: string; award?: boolean };

      const entry = await repo.getEntry(entryId);
      if (!entry) return c.json({ success: false, message: 'ไม่พบรายการ' }, 404);

      await repo.setEntryResult(entryId, rank ?? null, note ?? null);

      let awarded = 0;
      if (award && rank && [1, 2, 3].includes(rank)) {
        const heat = await config.db.prepare('SELECT tournament_id FROM Tournament_Heats WHERE id = ?')
          .bind(entry.heat_id).first<any>();
        const tournament = await config.db.prepare('SELECT course_id, team_field_key FROM Tournaments WHERE id = ?')
          .bind(heat?.tournament_id).first<any>();
        if (tournament) {
          const registrants = await repo.getRegistrants(tournament.course_id, tournament.team_field_key);
          const bookingIds = bookingIdsForEntry(entry, registrants);
          for (const bookingId of bookingIds) {
            const booking = await config.db.prepare('SELECT child_id, course_id FROM Bookings WHERE id = ?')
              .bind(bookingId).first<any>();
            if (!booking) continue;
            const ok = await awardBadge(config.db, {
              childId: booking.child_id, tier: rank, courseId: booking.course_id,
              bookingId, source: 'manual', note: `${entry.label} · อันดับ ${rank}`,
              actorId: c.get('crmUser')?.userId ?? null,
            });
            if (ok) awarded++;
          }
        }
      }
      return c.json({ success: true, awarded });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}
