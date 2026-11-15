import { DUMMY_LADDER_ROWS } from "@/features/ladder/DummyLadderRepository";
import type { LadderRow } from "@/features/ladder/ladder";
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
import { TALENT_TREES } from "./generated/armoryData";

// Local development data. No database is required with DATA_SOURCE=dummy (the default). The
// ladder fixtures double as the armory's SoloQ players, so every ladder name opens a profile; a few
// characters without SoloQ games are added for the index.

const RACE_BY_CLASS: Record<number, number> = { 1: 2, 2: 10, 3: 8, 4: 7, 5: 1, 6: 5, 7: 11, 8: 10, 9: 5, 11: 6 };

const EXTRA_CHARACTERS: ArmoryListRow[] = [
  { charName: "Bankalt", classId: 4, raceId: 1, level: 80, rating: null, seasonWins: 0, seasonGames: 0 },
  { charName: "Lowbie", classId: 1, raceId: 3, level: 80, rating: null, seasonWins: 0, seasonGames: 0 },
];

// Gem enchantments (GemProperties): Bold/Runed/Delicate Cardinal Ruby, Relentless Earthsiege and
// Ember Skyflare meta, Nightmare Tear.
const BOLD = 3518;
const RUNED = 3520;
const DELICATE = 3519;
const RELENTLESS = 3628;
const EMBER = 3623;
const NIGHTMARE = 3879;

type Gear = Array<[slot: number, itemId: number, enchant?: number, gems?: number[]]>;

// Wrathful Gladiator's sets per armor type, with a plausible enchant and gem on each piece.
const PLATE: Gear = [
  [0, 51543, 3817, [RELENTLESS, BOLD]], [1, 51355, 0, [BOLD]], [2, 51545, 3793, [BOLD]],
  [4, 51541, 3832, [BOLD, BOLD]], [5, 51362, 0, [BOLD, NIGHTMARE]], [6, 51544, 3823, [BOLD]],
  [7, 51363, 3232, [BOLD]], [8, 51364, 3845, [BOLD]], [9, 51542, 1603, [BOLD]],
  [10, 51358], [11, 50402], [12, 51378], [13, 50363], [14, 51354, 3831], [15, 51392, 3789, [BOLD]],
];
const MAIL: Gear = [
  [0, 51499, 3817, [RELENTLESS, DELICATE]], [1, 51357], [2, 51502, 3793, [DELICATE]],
  [4, 51497, 3832, [DELICATE, DELICATE]], [5, 51350, 0, [DELICATE, NIGHTMARE]], [6, 51500, 3823],
  [7, 51351, 3232], [8, 51352, 3845], [9, 51498, 3604], [10, 51358], [11, 50604], [12, 51378],
  [13, 50363], [14, 51356, 3831], [15, 51515, 3789], [17, 51394],
];
const LEATHER: Gear = [
  [0, 51494, 3817, [RELENTLESS, DELICATE]], [1, 51355], [2, 51496, 3793, [DELICATE]],
  [4, 51492, 3832, [DELICATE, DELICATE]], [5, 51368, 0, [DELICATE, NIGHTMARE]], [6, 51495, 3823],
  [7, 51369, 3232], [8, 51370, 3845], [9, 51493, 3604], [10, 51358], [11, 50402], [12, 51377],
  [13, 50363], [14, 51354, 3831], [15, 51517, 3789], [16, 51441, 3789],
];
const CLOTH: Gear = [
  [0, 51465, 3820, [EMBER, RUNED]], [1, 51331], [2, 51467, 3794, [RUNED]],
  [4, 51463, 3832, [RUNED, RUNED]], [5, 51327, 0, [RUNED, NIGHTMARE]], [6, 51466, 3719],
  [7, 51328, 3232], [8, 51329, 2332], [9, 51464, 3604], [10, 51336], [11, 50398], [12, 51377],
  [13, 50365], [14, 51330, 3831], [15, 51404, 3834], [17, 51451],
];

const GEAR_BY_CLASS: Record<number, Gear> = {
  1: PLATE, 2: PLATE, 6: PLATE, 3: MAIL, 7: MAIL, 4: LEATHER, 11: LEATHER, 5: CLOTH, 8: CLOTH, 9: CLOTH,
};

// Major glyphs (GlyphProperties ids) for the classes that have some in the fixture set.
const GLYPHS_BY_CLASS: Record<number, number[]> = {
  2: [196, 195, 199],
  3: [351, 353, 357],
  5: [263, 255, 252],
  7: [214, 226, 221],
  8: [329, 319, 322],
  9: [291, 277, 274],
  11: [178, 175, 177],
};

// Main tree per class for the fixture builds (index into the class's trees).
const MAIN_TREE: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 0, 6: 1, 7: 0, 8: 2, 9: 0, 11: 0 };

const ARENA_MAPS = [559, 562, 572, 617, 618];

export class DummyArmoryRepository implements ArmoryRepository {
  private readonly rows: ArmoryProfileRow[];

  constructor(ladderRows: LadderRow[] = DUMMY_LADDER_ROWS) {
    const soloq: ArmoryListRow[] = ladderRows.map((row) => ({
      charName: row.charName,
      classId: row.classId,
      raceId: RACE_BY_CLASS[row.classId] ?? 1,
      level: 80,
      rating: row.rating,
      seasonWins: row.seasonWins,
      seasonGames: row.seasonGames,
    }));

    this.rows = [...soloq, ...EXTRA_CHARACTERS].map((row, index) => ({
      ...row,
      guid: index + 1,
      gender: index % 2,
      talentGroupsCount: index % 3 === 0 ? 2 : 1,
      activeTalentGroup: 0,
      guild: index % 4 === 3 ? null : index % 2 === 0 ? "Gladiators" : "Rank One",
    }));
  }

  async characters(limit: number): Promise<ArmoryListRow[]> {
    return this.rows.slice(0, Math.max(0, Math.floor(limit)));
  }

  async profile(name: string): Promise<ArmoryProfileRow | null> {
    return this.rows.find((row) => row.charName === name) ?? null;
  }

  async equipment(guid: number): Promise<EquipmentRow[]> {
    const row = this.byGuid(guid);
    if (row === undefined) return [];
    return (GEAR_BY_CLASS[row.classId] ?? []).map(([slot, itemId, enchant = 0, gems = []]) => ({
      slot,
      itemId,
      enchantments: enchantmentsString(enchant, gems),
      randomPropertyId: 0,
    }));
  }

  async talents(guid: number): Promise<TalentRow[]> {
    const row = this.byGuid(guid);
    if (row === undefined) return [];
    const main = MAIN_TREE[row.classId] ?? 0;
    const primary = fixtureBuild(row.classId, main, (main + 1) % 3);
    const secondary = row.talentGroupsCount > 1 ? fixtureBuild(row.classId, (main + 2) % 3, main) : [];

    const masks = new Map<number, number>();
    for (const spell of primary) masks.set(spell, (masks.get(spell) ?? 0) | 1);
    for (const spell of secondary) masks.set(spell, (masks.get(spell) ?? 0) | 2);
    return [...masks].map(([spellId, specMask]) => ({ spellId, specMask }));
  }

  async glyphs(guid: number): Promise<GlyphRow[]> {
    const row = this.byGuid(guid);
    const glyphs = row === undefined ? undefined : GLYPHS_BY_CLASS[row.classId];
    if (glyphs === undefined) return [];
    return [{ talentGroup: 0, glyphs: [glyphs[0]!, 0, 0, glyphs[1]!, 0, glyphs[2]!] }];
  }

  async recentMatches(guid: number, limit: number): Promise<MatchRow[]> {
    if (this.byGuid(guid) === undefined) return [];
    const now = Date.now();
    return Array.from({ length: Math.min(8, Math.max(0, Math.floor(limit))) }, (_, i) => ({
      id: guid * 100 + 8 - i,
      mapId: ARENA_MAPS[(guid + i) % ARENA_MAPS.length]!,
      durationMs: (95 + ((guid * 37 + i * 53) % 360)) * 1000,
      playedAt: now - (i * 23 + 4) * 60 * 1000,
      won: (guid + i) % 3 !== 0,
      team: i % 2,
    }));
  }

  async matchPlayers(replayIds: readonly number[]): Promise<MatchPlayerRow[]> {
    const players = this.rows.filter((row) => row.rating !== null);
    const out: MatchPlayerRow[] = [];
    for (const replayId of replayIds) {
      const guid = Math.floor(replayId / 100);
      const self = this.byGuid(guid);
      if (self === undefined) continue;
      const myTeam = (8 - (replayId % 100)) % 2;
      const others = players.filter((row) => row.guid !== guid);
      const pick = (offset: number) => others[(replayId + offset * 3) % others.length]!;
      const lineup = [self, pick(1), pick(2), pick(3), pick(4), pick(5)];
      lineup.forEach((row, index) => {
        out.push({
          replayId,
          name: row.charName,
          team: index < 3 ? myTeam : 1 - myTeam,
          classId: row.classId,
        });
      });
    }
    return out;
  }

  private byGuid(guid: number): ArmoryProfileRow | undefined {
    return this.rows.find((row) => row.guid === guid);
  }
}

/** `item_instance.enchantments`: 12 slots of `id duration charges`, sockets in slots 2-4. */
function enchantmentsString(enchant: number, gems: number[]): string {
  const slots = Array.from({ length: 12 }, () => [0, 0, 0]);
  slots[0]![0] = enchant;
  gems.slice(0, 3).forEach((gem, index) => (slots[2 + index]![0] = gem));
  return `${slots.flat().join(" ")} `;
}

/** A 51/20 style build: max ranks tier by tier, 51 points in `main`, the rest in `side`. */
function fixtureBuild(classId: number, main: number, side: number): number[] {
  const trees = TALENT_TREES[classId];
  if (trees === undefined) return [];
  const spells: number[] = [];
  const fill = (treeIndex: number, budget: number) => {
    for (const { ranks } of trees[treeIndex]?.talents ?? []) {
      if (budget <= 0) break;
      const rank = Math.min(ranks.length, budget);
      spells.push(ranks[rank - 1]!);
      budget -= rank;
    }
  };
  fill(main, 51);
  fill(side, 20);
  return spells;
}
