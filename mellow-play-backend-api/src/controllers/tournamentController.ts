import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import {
  TournamentRepository, buildEntryOptions, bookingIdsForEntry, EntryType,
} from '../repositories/tournamentRepository';
import { awardBadge } from '../services/stampService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * What a round is called. Named by how many heats are left rather than by its
 * number, because "รอบรองชนะเลิศ" means two heats to go, whichever round of the
 * competition that happens to be.
 */
function stageLabel(stageIndex: number, heatCount: number, totalStages: number): string {
  if (heatCount === 1) return 'รอบชิงชนะเลิศ';
  if (heatCount === 2) return 'รอบรองชนะเลิศ';
  if (heatCount === 4 && stageIndex > 0) return 'รอบก่อนรองชนะเลิศ';
  if (stageIndex === 0) return totalStages > 1 ? 'รอบคัดเลือก' : 'รอบแข่ง';
  return `รอบที่ ${stageIndex + 1}`;
}

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
      const tournaments = await repo.listByCourse(courseId);
      // Which bracket is being looked at. Defaults to the first so a link with
      // no id still opens something.
      const requestedId = parseInt(c.req.query('tournamentId') || '');
      const tournament = tournaments.find(t => t.id === requestedId) || tournaments[0] || null;
      const teamFieldKey = tournament?.team_field_key || teamFields[0]?.field_key || null;

      const registrants = await repo.getRegistrants(courseId, teamFieldKey);
      const options = buildEntryOptions(registrants);
      // Every round the course has, not only the ones that happen to have a
      // registrant in the current grouping — a heat is often created first.
      const rounds = await repo.getRounds(courseId);
      // What the bracket should be built for. Falls back to the booking count
      // for a round with no rule behind it (a one-off typed straight onto a
      // booking), so a course with no calendar still gets a usable number.
      const capacityCount = rounds.reduce(
        (n, r) => n + (r.capacity != null ? Number(r.capacity) : Number(r.booking_count || 0)), 0);

      if (!tournament) {
        return c.json({
          success: true, tournament: null, tournaments, brackets: [], heats: [], entries: [], links: [],
          options, teamFields, rounds, registrantCount: registrants.length, capacityCount,
        });
      }

      // Every bracket, not only the selected one: winners of separate brackets
      // meet each other, and that is impossible to plan while looking at one at
      // a time. Each is small — a handful of heats — so this is one round trip
      // rather than one per bracket.
      const brackets = [];
      for (const t of tournaments) {
        const [heats, entries] = await Promise.all([repo.getHeats(t.id), repo.getEntries(t.id)]);
        brackets.push({
          tournament: t,
          heats,
          // An entry knows the bookings behind it now, not the ones behind it
          // when it was drawn — see bookingIdsForEntry.
          entries: entries.map(e => ({ ...e, booking_ids: bookingIdsForEntry(e, registrants) })),
        });
      }
      const selected = brackets.find(b => b.tournament.id === tournament.id)!;

      return c.json({
        success: true,
        tournament, tournaments, brackets,
        heats: selected.heats, entries: selected.entries, links: await repo.getLinks(tournament.id),
        options, teamFields, rounds, registrantCount: registrants.length, capacityCount,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Creates a bracket, or edits the one named by id.
   *
   * A course can hold several — an id in the body means "edit that one", no id
   * means "add another". Without the id this used to silently rename whichever
   * bracket happened to be first, which is how a second one becomes impossible.
   */
  async createOrUpdate(c: C) {
    try {
      const courseId = parseInt(c.req.param('courseId'));
      const { id, name, description, team_field_key } = await c.req.json();
      const repo = this.repo(c);

      if (id) {
        await repo.update(Number(id), { name, description, teamFieldKey: team_field_key ?? null });
        return c.json({ success: true, id: Number(id) });
      }
      const newId = await repo.create(courseId, name?.trim() || 'สายการแข่งขัน', team_field_key ?? null);
      return c.json({ success: true, id: newId });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async remove(c: C) {
    try {
      await this.repo(c).deactivate(parseInt(c.req.param('tournamentId')));
      return c.json({ success: true });
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
        advanceCount: body.advance_count ?? null,
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

  /**
   * Lays out the whole bracket from two numbers: how many go in a heat, and
   * how many of them go through.
   *
   * Each round is derived from the one before — heats × advance = the next
   * round's entrants — until one heat is left, which is the final. Generating
   * it beats asking someone to type "รอบรองชนะเลิศ, 2 heats, 2 ผ่าน" four times
   * and get one of them wrong.
   */
  async generate(c: C) {
    try {
      const tournamentId = parseInt(c.req.param('tournamentId'));
      const { entrant_count, per_heat, advance_per_heat, slot_date, slot_start_time, replace } = await c.req.json() as {
        entrant_count: number; per_heat: number; advance_per_heat: number;
        slot_date?: string | null; slot_start_time?: string | null; replace?: boolean;
      };

      const perHeat = Math.max(2, Number(per_heat) || 4);
      const advance = Math.min(Math.max(1, Number(advance_per_heat) || 2), perHeat - 1);
      const entrants = Math.max(2, Number(entrant_count) || 0);

      const repo = this.repo(c);
      if (replace) await repo.deleteAllHeats(tournamentId);

      const stages: number[] = [];
      let remaining = entrants;
      // Guard on stage count as well as size: a bad advance/perHeat pair could
      // otherwise describe a bracket that never narrows.
      while (stages.length < 8) {
        const heatCount = Math.max(1, Math.ceil(remaining / perHeat));
        stages.push(heatCount);
        if (heatCount === 1) break;
        const next = heatCount * advance;
        if (next >= remaining) break; // not narrowing — stop rather than loop
        remaining = next;
      }

      // Ids per stage, so the lines can be drawn once every heat exists.
      const createdIds: number[][] = [];
      let created = 0;
      for (const [stageIndex, heatCount] of stages.entries()) {
        const label = stageLabel(stageIndex, heatCount, stages.length);
        createdIds[stageIndex] = [];
        for (let i = 0; i < heatCount; i++) {
          createdIds[stageIndex].push(await repo.createHeat(tournamentId, {
            name: heatCount === 1 ? label : `${label} · ${i + 1}`,
            stageIndex,
            stageLabel: label,
            advanceCount: heatCount === 1 ? null : advance,
            capacity: perHeat,
            sortOrder: i,
            slotDate: stageIndex === 0 ? (slot_date ?? null) : null,
            slotStartTime: stageIndex === 0 ? (slot_start_time ?? null) : null,
          }));
          created++;
        }
      }

      // The lines, drawn to match the layout just built. Advancement reads
      // these and nothing else, so a generated bracket without them would be a
      // set of heats that never feed each other.
      //
      // One line per advancing place: a heat sending two through gets two
      // lines, to consecutive heats of the next stage, which is the rule the
      // old stage arithmetic implemented and the only reading of the picture.
      for (let stageIndex = 0; stageIndex + 1 < createdIds.length; stageIndex++) {
        const from = createdIds[stageIndex];
        const to = createdIds[stageIndex + 1];
        if (!from?.length || !to?.length) continue;
        for (const [pos, fromId] of from.entries()) {
          const lines = Math.min(advance, to.length);
          for (let i = 0; i < lines; i++) {
            await repo.addLink(tournamentId, fromId, to[(pos + i) % to.length]);
          }
        }
      }

      await this.repo(c).update(tournamentId, { advancePerHeat: advance, format: 'bracket' });
      return c.json({ success: true, stages, created });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Sends a heat's top finishers into the next round.
   *
   * Winners from one heat are spread across the next round's heats rather than
   * poured into the first one — the point of seeding is that the two fastest
   * entrants do not meet again in the round straight after.
   */
  /** Draw a line between two heats. */
  async addLink(c: C) {
    try {
      const tournamentId = parseInt(c.req.param('tournamentId'));
      const { from_heat_id, to_heat_id } = await c.req.json();
      const drawn = await this.repo(c).addLink(tournamentId, Number(from_heat_id), Number(to_heat_id));
      if (!drawn) return c.json({ success: false, message: 'เชื่อมแบบนี้ไม่ได้ — จะทำให้สายวนกลับมาที่เดิม' }, 400);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteLink(c: C) {
    try {
      const tournamentId = parseInt(c.req.param('tournamentId'));
      const { from_heat_id, to_heat_id } = await c.req.json();
      await this.repo(c).deleteLink(tournamentId, Number(from_heat_id), Number(to_heat_id));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Save dragged positions, in one batch at the end of a drag. */
  async saveLayout(c: C) {
    try {
      const tournamentId = parseInt(c.req.param('tournamentId'));
      const { positions } = await c.req.json() as { positions: { id: number; x: number; y: number }[] };
      if (!Array.isArray(positions)) return c.json({ success: false, message: 'positions is required' }, 400);
      // Capped so one bad payload cannot become an unbounded batch.
      await this.repo(c).setHeatPositions(tournamentId, positions.slice(0, 200).map(p => ({
        id: Number(p.id), x: Number(p.x) || 0, y: Number(p.y) || 0,
      })));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async advance(c: C) {
    try {
      const heatId = parseInt(c.req.param('heatId'));
      const repo = this.repo(c);
      const heat = await repo.getHeat(heatId);
      if (!heat) return c.json({ success: false, message: 'ไม่พบ Heat' }, 404);

      // Where this heat's qualifiers go is now whatever lines were drawn out
      // of it, not arithmetic on stage numbers. That is what lets the picture
      // be rearranged without changing who plays whom — and what makes a heat
      // with no outgoing line simply a final.
      const links = await repo.getOutgoingLinks(heatId);
      if (links.length === 0) {
        return c.json({ success: false, message: 'ไม่มีรอบถัดไป — Heat นี้ยังไม่ได้ลากเส้นไปที่ไหน' }, 400);
      }

      const take = heat.advance_count ?? 1;
      const entries = await repo.getHeatEntries(heatId);
      const qualified = entries.filter(e => e.result_rank != null).slice(0, take);
      if (qualified.length === 0) {
        return c.json({ success: false, message: 'ยังไม่ได้บันทึกผลของ Heat นี้' }, 400);
      }

      let moved = 0;
      for (const [i, entry] of qualified.entries()) {
        // One qualifier per line, in the order the lines were drawn: a heat
        // sending two through with two lines out sends one along each, which
        // is the old behaviour and also the only reading of the picture.
        const target = links[i % links.length];
        if (await repo.addAdvancedEntry(heat.tournament_id, target.to_heat_id, entry)) moved++;
      }
      await repo.updateHeat(heatId, { status: 'done' });
      return c.json({ success: true, moved });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Marks one entry as through, and puts it in the next round.
   *
   * The two-step version — record a result, then advance the heat — is right
   * when a whole heat finishes at once. Calling a single winner as it happens
   * is what actually occurs at the side of a track, so it is one action: the
   * next free placing is assigned and the entry moves.
   */
  async advanceEntry(c: C) {
    try {
      const entryId = parseInt(c.req.param('entryId'));
      const repo = this.repo(c);
      const entry = await repo.getEntry(entryId);
      if (!entry) return c.json({ success: false, message: 'ไม่พบรายการ' }, 404);

      const heat = await repo.getHeat(entry.heat_id);
      const nextStage = await repo.getStageHeats(heat.tournament_id, heat.stage_index + 1);
      if (nextStage.length === 0) {
        return c.json({ success: false, message: 'รอบนี้คือรอบสุดท้ายแล้ว' }, 400);
      }

      let rank = entry.result_rank;
      if (!rank) {
        const siblings = await repo.getHeatEntries(entry.heat_id);
        const taken = new Set(siblings.map((e: any) => e.result_rank).filter(Boolean));
        rank = 1;
        while (taken.has(rank)) rank++;
        await repo.setEntryResult(entryId, rank, entry.result_note ?? null);
      }

      const heatsInStage = await repo.getStageHeats(heat.tournament_id, heat.stage_index);
      const heatPos = Math.max(0, heatsInStage.findIndex(h => h.id === heat.id));
      const target = nextStage[(heatPos + (rank - 1)) % nextStage.length];
      const moved = await repo.addAdvancedEntry(heat.tournament_id, target.id, { ...entry, result_rank: rank });

      return c.json({ success: true, moved, rank, heatName: target.name });
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
