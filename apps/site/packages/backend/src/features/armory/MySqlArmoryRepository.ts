import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { arenaTeam, arenaTeamMember } from "@/features/ladder/model/ladderTables";
import type { DrizzleDb } from "@/shared/Db";
import type {
  ArmoryListRow,
  ArmoryProfileRow,
  EquipmentRow,
  GlyphRow,
  MatchPlayerRow,
  MatchRow,
  TalentRow,
} from "./armory";
import type { ArmoryRepository } from "./ArmoryRepository";
import {
  armoryArenaReplay,
  armoryArenaReplayPlayer,
  armoryCharacters,
  characterGlyphs,
  characterInventory,
  characterTalent,
  guild,
  guildMember,
  itemInstance,
} from "./model/armoryTables";

// The soloq team of every character is a 5v5 arena team it captains
// (src/game/Arenacraft/soloq/SoloqTeam.cpp).
const ARENA_TYPE_5V5 = 5;

// arenacraft::replay::Bracket::Soloq (src/game/Arenacraft/replay/ReplayConfig.hpp).
const REPLAY_BRACKET_SOLOQ = 4;

// `arena_replay.winner` is a TeamId; 2 (TEAM_NEUTRAL) is a draw or a cancelled start.
const DECIDED_WINNERS = [0, 1];

// Equipped items live in the backpack container (bag 0) at EQUIPMENT_SLOT_START..END (0-18).
const EQUIPMENT_SLOT_END = 19;

type Query = { toSQL(): { sql: string; params: unknown[] } };

export class MySqlArmoryRepository implements ArmoryRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly timeoutMs: number,
  ) {}

  async characters(limit: number): Promise<ArmoryListRow[]> {
    const c = armoryCharacters;
    const query = this.db
      .select({
        name: c.name,
        classId: c.class,
        raceId: c.race,
        level: c.level,
        rating: arenaTeamMember.personalRating,
        seasonWins: arenaTeamMember.seasonWins,
        seasonGames: arenaTeamMember.seasonGames,
      })
      .from(c)
      .leftJoin(arenaTeam, and(eq(arenaTeam.captainGuid, c.guid), eq(arenaTeam.type, ARENA_TYPE_5V5)))
      .leftJoin(
        arenaTeamMember,
        and(eq(arenaTeamMember.arenaTeamId, arenaTeam.arenaTeamId), eq(arenaTeamMember.guid, c.guid)),
      )
      .where(isNull(c.deleteDate))
      .orderBy(desc(arenaTeamMember.personalRating), asc(c.name))
      .limit(Math.max(0, Math.floor(limit)));

    return (await this.rows(query)).map(
      ([name, classId, raceId, level, rating, seasonWins, seasonGames]) =>
        withSoloq(
          {
            charName: String(name),
            classId: Number(classId),
            raceId: Number(raceId),
            level: Number(level),
          },
          rating,
          seasonWins,
          seasonGames,
        ),
    );
  }

  async profile(name: string): Promise<ArmoryProfileRow | null> {
    const c = armoryCharacters;
    const query = this.db
      .select({
        guid: c.guid,
        name: c.name,
        classId: c.class,
        raceId: c.race,
        gender: c.gender,
        level: c.level,
        talentGroupsCount: c.talentGroupsCount,
        activeTalentGroup: c.activeTalentGroup,
        guild: guild.name,
        rating: arenaTeamMember.personalRating,
        seasonWins: arenaTeamMember.seasonWins,
        seasonGames: arenaTeamMember.seasonGames,
      })
      .from(c)
      .leftJoin(guildMember, eq(guildMember.guid, c.guid))
      .leftJoin(guild, eq(guild.guildId, guildMember.guildId))
      .leftJoin(arenaTeam, and(eq(arenaTeam.captainGuid, c.guid), eq(arenaTeam.type, ARENA_TYPE_5V5)))
      .leftJoin(
        arenaTeamMember,
        and(eq(arenaTeamMember.arenaTeamId, arenaTeam.arenaTeamId), eq(arenaTeamMember.guid, c.guid)),
      )
      .where(and(eq(c.name, name), isNull(c.deleteDate)))
      .limit(1);

    const [row] = await this.rows(query);
    if (row === undefined) return null;

    const [
      guid,
      charName,
      classId,
      raceId,
      gender,
      level,
      talentGroupsCount,
      activeTalentGroup,
      guildName,
      rating,
      seasonWins,
      seasonGames,
    ] = row;
    return {
      ...withSoloq(
        {
          charName: String(charName),
          classId: Number(classId),
          raceId: Number(raceId),
          level: Number(level),
        },
        rating,
        seasonWins,
        seasonGames,
      ),
      guid: Number(guid),
      gender: Number(gender),
      talentGroupsCount: Number(talentGroupsCount),
      activeTalentGroup: Number(activeTalentGroup),
      guild: guildName === null || guildName === undefined || guildName === "" ? null : String(guildName),
    };
  }

  async equipment(guid: number): Promise<EquipmentRow[]> {
    const query = this.db
      .select({
        slot: characterInventory.slot,
        itemId: itemInstance.itemEntry,
        enchantments: itemInstance.enchantments,
        randomPropertyId: itemInstance.randomPropertyId,
      })
      .from(characterInventory)
      .innerJoin(itemInstance, eq(itemInstance.guid, characterInventory.item))
      .where(
        and(
          eq(characterInventory.guid, guid),
          eq(characterInventory.bag, 0),
          sql`${characterInventory.slot} < ${EQUIPMENT_SLOT_END}`,
        ),
      );

    return (await this.rows(query))
      .map(([slot, itemId, enchantments, randomPropertyId]) => ({
        slot: Number(slot),
        itemId: Number(itemId ?? 0),
        enchantments: String(enchantments ?? ""),
        randomPropertyId: Number(randomPropertyId ?? 0),
      }))
      .filter((row) => row.itemId > 0);
  }

  async talents(guid: number): Promise<TalentRow[]> {
    const query = this.db
      .select({ spellId: characterTalent.spell, specMask: characterTalent.specMask })
      .from(characterTalent)
      .where(eq(characterTalent.guid, guid));

    return (await this.rows(query)).map(([spellId, specMask]) => ({
      spellId: Number(spellId),
      specMask: Number(specMask),
    }));
  }

  async glyphs(guid: number): Promise<GlyphRow[]> {
    const g = characterGlyphs;
    const query = this.db
      .select({
        talentGroup: g.talentGroup,
        glyph1: g.glyph1,
        glyph2: g.glyph2,
        glyph3: g.glyph3,
        glyph4: g.glyph4,
        glyph5: g.glyph5,
        glyph6: g.glyph6,
      })
      .from(g)
      .where(eq(g.guid, guid));

    return (await this.rows(query)).map(([talentGroup, ...glyphs]) => ({
      talentGroup: Number(talentGroup),
      glyphs: glyphs.map((id) => Number(id ?? 0)),
    }));
  }

  async recentMatches(guid: number, limit: number): Promise<MatchRow[]> {
    const r = armoryArenaReplay;
    const p = armoryArenaReplayPlayer;
    const query = this.db
      .select({
        id: r.id,
        mapId: r.mapId,
        durationMs: r.durationMs,
        // `created_at` is written with NOW() by the core; UNIX_TIMESTAMP reads it in the same
        // server time zone.
        playedAt: sql<number>`UNIX_TIMESTAMP(${r.createdAt})`,
        won: sql<number>`${r.winner} = ${p.team}`,
        team: p.team,
      })
      .from(p)
      .innerJoin(r, eq(r.id, p.replayId))
      .where(
        and(eq(p.guid, guid), eq(r.bracket, REPLAY_BRACKET_SOLOQ), inArray(r.winner, DECIDED_WINNERS)),
      )
      .orderBy(desc(r.id))
      .limit(Math.max(0, Math.floor(limit)));

    return (await this.rows(query)).map(([id, mapId, durationMs, playedAt, won, team]) => ({
      id: Number(id),
      mapId: Number(mapId),
      durationMs: Number(durationMs),
      playedAt: Number(playedAt) * 1000,
      won: Number(won) === 1,
      team: Number(team),
    }));
  }

  async matchPlayers(replayIds: readonly number[]): Promise<MatchPlayerRow[]> {
    if (replayIds.length === 0) return [];
    const p = armoryArenaReplayPlayer;
    const query = this.db
      .select({ replayId: p.replayId, name: p.name, team: p.team, classId: p.class })
      .from(p)
      .where(inArray(p.replayId, [...replayIds]));

    return (await this.rows(query)).map(([replayId, name, team, classId]) => ({
      replayId: Number(replayId),
      name: String(name),
      team: Number(team),
      classId: Number(classId),
    }));
  }

  // Executed through the pool rather than Drizzle's prepared query so the per-query timeout
  // (DB_TIMEOUT_MS) is enforced by mysql2; rows come back as arrays in select order (see
  // MySqlLadderRepository).
  private async rows(query: Query): Promise<unknown[][]> {
    const { sql: text, params } = query.toSQL();
    const [rows] = await this.db.$client.query<RowDataPacket[]>({
      sql: text,
      values: params,
      timeout: this.timeoutMs,
      rowsAsArray: true,
    });
    return rows as unknown as unknown[][];
  }
}

/** A SoloQ team without a played game this season has no meaningful rating yet. */
function withSoloq(
  base: Omit<ArmoryListRow, "rating" | "seasonWins" | "seasonGames">,
  rating: unknown,
  seasonWins: unknown,
  seasonGames: unknown,
): ArmoryListRow {
  const games = Number(seasonGames ?? 0);
  return {
    ...base,
    rating: rating === null || rating === undefined || games === 0 ? null : Number(rating),
    seasonWins: Number(seasonWins ?? 0),
    seasonGames: games,
  };
}
