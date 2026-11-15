import {
  ARMORY_SLOTS,
  type ArmoryCharacterSummary,
  type ArmoryGlyph,
  type ArmoryItem,
  type ArmoryItemInfo,
  type ArmoryMatch,
  type ArmoryMatchPlayer,
  type ArmoryTalent,
  type ArmoryTalentGroup,
  type ArmoryTalentTree,
} from "@arenacraft/common";
import { classNameOf } from "@/features/ladder/ladder";
import { GEM_ITEM_BY_ENCHANT, GLYPHS, TALENT_TREES } from "./generated/armoryData";

/** Profiles change on logout or after a match; half a minute keeps a refresh storm off the DB. */
export const ARMORY_CACHE_TTL_MS = 30_000;

/** Upper bound on per-character profile caches kept in memory. */
export const ARMORY_MAX_CACHED_CHARACTERS = 1_000;

/** Upper bound on the armory index; the server is invite-only, so this is never reached in practice. */
export const ARMORY_LIST_LIMIT = 5_000;

// SharedDefines.h Races enum.
const RACE_NAMES: Record<number, string> = {
  1: "Human",
  2: "Orc",
  3: "Dwarf",
  4: "Night Elf",
  5: "Undead",
  6: "Tauren",
  7: "Gnome",
  8: "Troll",
  10: "Blood Elf",
  11: "Draenei",
};

// Arena maps (Map.dbc).
const ARENA_MAP_NAMES: Record<number, string> = {
  559: "Nagrand Arena",
  562: "Blade's Edge Arena",
  572: "Ruins of Lordaeron",
  617: "Dalaran Sewers",
  618: "The Ring of Valor",
};

// The core's EnchantmentSlot (ItemDefines.h): every slot is saved as `id duration charges`.
const PERM_ENCHANTMENT_SLOT = 0;
const SOCKET_ENCHANTMENT_SLOTS = [2, 3, 4];
const PRISMATIC_ENCHANTMENT_SLOT = 6;

const SHIRT_SLOT = 3;
const TABARD_SLOT = 18;
const MAIN_HAND_SLOT = 15;
const OFF_HAND_SLOT = 16;

/** Slots the in-game average item level counts: all but shirt and tabard. */
const ITEM_LEVEL_SLOT_COUNT = ARMORY_SLOTS.length - 2;

export interface ArmoryListRow {
  charName: string;
  classId: number;
  raceId: number;
  level: number;
  /** Null when the character has no SoloQ team. */
  rating: number | null;
  seasonWins: number;
  seasonGames: number;
}

export interface ArmoryProfileRow extends ArmoryListRow {
  guid: number;
  gender: number;
  talentGroupsCount: number;
  activeTalentGroup: number;
  guild: string | null;
}

export interface EquipmentRow {
  slot: number;
  itemId: number;
  /** `item_instance.enchantments`, space separated. */
  enchantments: string;
  randomPropertyId: number;
}

export interface TalentRow {
  spellId: number;
  specMask: number;
}

export interface GlyphRow {
  talentGroup: number;
  /** GlyphProperties ids of the six glyph slots, 0 when empty. */
  glyphs: number[];
}

export interface MatchRow {
  id: number;
  mapId: number;
  durationMs: number;
  /** Unix milliseconds. */
  playedAt: number;
  won: boolean;
  team: number;
}

export interface MatchPlayerRow {
  replayId: number;
  name: string;
  team: number;
  classId: number;
}

/** Item data plus what the average item level needs. */
export interface ItemInfo extends ArmoryItemInfo {
  twoHanded: boolean;
}

export function raceNameOf(raceId: number): string {
  return RACE_NAMES[raceId] ?? "Unknown";
}

export function arenaMapNameOf(mapId: number): string {
  return ARENA_MAP_NAMES[mapId] ?? "Arena";
}

export function toCharacterSummary(row: ArmoryListRow): ArmoryCharacterSummary {
  return {
    name: row.charName,
    class: classNameOf(row.classId),
    race: raceNameOf(row.raceId),
    level: row.level,
    rating: row.rating,
    wins: row.seasonWins,
    losses: Math.max(0, row.seasonGames - row.seasonWins),
  };
}

export interface ParsedEnchantments {
  enchantId: number | null;
  /** Socket enchantments in socket order, trailing empty sockets dropped. */
  socketEnchants: number[];
  prismaticEnchant: number | null;
}

export function parseEnchantments(raw: string): ParsedEnchantments {
  const values = raw.trim().split(/\s+/).map(Number);
  const idAt = (slot: number) => {
    const id = values[slot * 3];
    return id !== undefined && Number.isInteger(id) && id > 0 ? id : null;
  };

  const sockets = SOCKET_ENCHANTMENT_SLOTS.map((slot) => idAt(slot) ?? 0);
  while (sockets.length > 0 && sockets[sockets.length - 1] === 0) sockets.pop();

  return {
    enchantId: idAt(PERM_ENCHANTMENT_SLOT),
    socketEnchants: sockets,
    prismaticEnchant: idAt(PRISMATIC_ENCHANTMENT_SLOT),
  };
}

/** Gem item behind a socket enchantment; 0 (empty socket) and unknown enchantments map to null. */
export function gemItemOf(enchantId: number): number | null {
  return GEM_ITEM_BY_ENCHANT[enchantId] ?? null;
}

/** Every item id an equipment listing needs data for: the items and their gems. */
export function itemIdsOf(rows: readonly EquipmentRow[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    ids.add(row.itemId);
    const { socketEnchants, prismaticEnchant } = parseEnchantments(row.enchantments);
    for (const enchant of [...socketEnchants, prismaticEnchant ?? 0]) {
      const gem = gemItemOf(enchant);
      if (gem !== null) ids.add(gem);
    }
  }
  return [...ids];
}

/** Placeholder for an item the data source does not know. */
export function unknownItem(itemId: number): ItemInfo {
  return {
    itemId,
    name: `Item #${itemId}`,
    quality: 1,
    itemLevel: null,
    icon: null,
    twoHanded: false,
  };
}

function publicInfo({ twoHanded: _, ...info }: ItemInfo): ArmoryItemInfo {
  return info;
}

export function toEquipment(
  rows: readonly EquipmentRow[],
  items: ReadonlyMap<number, ItemInfo>,
): ArmoryItem[] {
  const info = (itemId: number) => items.get(itemId) ?? unknownItem(itemId);

  return rows
    .filter((row) => row.slot >= 0 && row.slot < ARMORY_SLOTS.length)
    .sort((a, b) => a.slot - b.slot)
    .map((row) => {
      const { enchantId, socketEnchants, prismaticEnchant } = parseEnchantments(row.enchantments);
      const gemEnchants = [...socketEnchants, ...(prismaticEnchant === null ? [] : [prismaticEnchant])];
      const gems = gemEnchants
        .map(gemItemOf)
        .filter((gem): gem is number => gem !== null)
        .map((gem) => publicInfo(info(gem)));

      return {
        slot: ARMORY_SLOTS[row.slot]!,
        ...publicInfo(info(row.itemId)),
        enchantId,
        gems,
        extraSocket: prismaticEnchant !== null,
        randomPropertyId: row.randomPropertyId,
      };
    });
}

/**
 * The in-game average: item levels of the 17 non-cosmetic slots over 17, empty slots counting 0.
 * A two-handed weapon with an empty off hand counts twice, as in the client.
 */
export function averageItemLevel(
  rows: readonly EquipmentRow[],
  items: ReadonlyMap<number, ItemInfo>,
): number | null {
  let total = 0;
  let known = 0;
  let offHandEmpty = true;
  let twoHandedLevel = 0;

  for (const row of rows) {
    if (row.slot === SHIRT_SLOT || row.slot === TABARD_SLOT || row.slot >= ARMORY_SLOTS.length) {
      continue;
    }
    const item = items.get(row.itemId);
    if (row.slot === OFF_HAND_SLOT) offHandEmpty = false;
    if (item?.itemLevel == null) continue;
    total += item.itemLevel;
    known++;
    if (row.slot === MAIN_HAND_SLOT && item.twoHanded) twoHandedLevel = item.itemLevel;
  }

  if (known === 0) return null;
  if (offHandEmpty) total += twoHandedLevel;
  return Math.round((total / ITEM_LEVEL_SLOT_COUNT) * 10) / 10;
}

export function toTalentGroups(
  classId: number,
  talents: readonly TalentRow[],
  glyphs: readonly GlyphRow[],
  talentGroupsCount: number,
  activeTalentGroup: number,
): ArmoryTalentGroup[] {
  const trees = TALENT_TREES[classId];
  if (trees === undefined) return [];

  const groupCount = Math.max(1, Math.min(2, talentGroupsCount));
  const groups: ArmoryTalentGroup[] = [];

  for (let group = 0; group < groupCount; group++) {
    const learned = new Set(
      talents.filter((t) => (t.specMask & (1 << group)) !== 0).map((t) => t.spellId),
    );

    const encoded: string[] = [];
    const treesOut: ArmoryTalentTree[] = trees.map((tree) => {
      let points = 0;
      let digits = "";
      const talentsOut = tree.talents.map((talent): ArmoryTalent => {
        // The highest rank whose spell is learned. Lower ranks may or may not be kept as well.
        let rank = 0;
        talent.ranks.forEach((spell, index) => {
          if (learned.has(spell)) rank = Math.max(rank, index + 1);
        });
        digits += String(rank);
        points += rank;
        return {
          tier: talent.tier,
          column: talent.column,
          name: talent.name,
          icon: talent.icon,
          spellId: talent.ranks[Math.max(0, rank - 1)] ?? 0,
          rank,
          maxRank: talent.ranks.length,
        };
      });
      encoded.push(digits.replace(/0+$/, ""));
      return { name: tree.name, points, talents: talentsOut };
    });

    while (encoded.length > 0 && encoded[encoded.length - 1] === "") encoded.pop();

    const glyphRow = glyphs.find((g) => g.talentGroup === group);
    groups.push({
      active: group === activeTalentGroup,
      trees: treesOut,
      build: encoded.join("-"),
      glyphs: toGlyphs(glyphRow?.glyphs ?? []),
    });
  }

  return groups;
}

function toGlyphs(ids: readonly number[]): ArmoryGlyph[] {
  const out: ArmoryGlyph[] = [];
  for (const id of ids) {
    const glyph = GLYPHS[id];
    if (glyph === undefined) continue;
    out.push({
      spellId: glyph.spellId,
      name: glyph.name,
      icon: glyph.icon,
      kind: glyph.minor ? "minor" : "major",
    });
  }
  // Majors first, like the glyph pane.
  return out.sort((a, b) => Number(a.kind === "minor") - Number(b.kind === "minor"));
}

export function toMatches(
  matches: readonly MatchRow[],
  players: readonly MatchPlayerRow[],
): ArmoryMatch[] {
  const byReplay = new Map<number, MatchPlayerRow[]>();
  for (const player of players) {
    const list = byReplay.get(player.replayId) ?? [];
    list.push(player);
    byReplay.set(player.replayId, list);
  }

  const toPlayer = (row: MatchPlayerRow): ArmoryMatchPlayer => ({
    name: row.name,
    class: classNameOf(row.classId),
  });
  const byName = (a: ArmoryMatchPlayer, b: ArmoryMatchPlayer) => a.name.localeCompare(b.name);

  return matches.map((match) => {
    const participants = byReplay.get(match.id) ?? [];
    return {
      id: match.id,
      playedAt: match.playedAt,
      map: arenaMapNameOf(match.mapId),
      durationSeconds: Math.round(match.durationMs / 1000),
      won: match.won,
      team: participants.filter((p) => p.team === match.team).map(toPlayer).sort(byName),
      enemies: participants.filter((p) => p.team !== match.team).map(toPlayer).sort(byName),
    };
  });
}
