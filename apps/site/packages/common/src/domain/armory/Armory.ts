import {
  array,
  boolean,
  InferOutput,
  minLength,
  nullable,
  number,
  object,
  picklist,
  pipe,
  string,
} from "valibot";

// Equipment slots as the core numbers them (EquipmentSlots, Player.h). Shirt and tabard are
// cosmetic and left out of the average item level.
export const ARMORY_SLOTS = [
  "Head",
  "Neck",
  "Shoulder",
  "Shirt",
  "Chest",
  "Waist",
  "Legs",
  "Feet",
  "Wrist",
  "Hands",
  "Finger1",
  "Finger2",
  "Trinket1",
  "Trinket2",
  "Back",
  "MainHand",
  "OffHand",
  "Ranged",
  "Tabard",
] as const;

export const ArmorySlot = picklist(ARMORY_SLOTS);
export type ArmorySlot = InferOutput<typeof ArmorySlot>;

/** SoloQ season standing; null on a character that never played SoloQ. */
export const ArmorySoloq = object({
  rating: number(),
  wins: number(),
  losses: number(),
  /** 1-based position on the website ladder, null when outside it. */
  rank: nullable(number()),
});
export type ArmorySoloq = InferOutput<typeof ArmorySoloq>;

/** One row of the armory index (`/armory`). */
export const ArmoryCharacterSummary = object({
  name: pipe(string(), minLength(1)),
  class: string(),
  race: string(),
  level: number(),
  /** SoloQ personal rating; null when the character never played SoloQ. */
  rating: nullable(number()),
  wins: number(),
  losses: number(),
});
export type ArmoryCharacterSummary = InferOutput<typeof ArmoryCharacterSummary>;

/** Static item data (name, icon, ...) resolved from the item id. */
export const ArmoryItemInfo = object({
  itemId: number(),
  name: string(),
  /** ItemQualities: 0 poor ... 4 epic, 5 legendary, 6 artifact, 7 heirloom. */
  quality: number(),
  /** Null when the item data source does not know the item. */
  itemLevel: nullable(number()),
  /** Wowhead icon name (`inv_helmet_153`), null when unknown. */
  icon: nullable(string()),
});
export type ArmoryItemInfo = InferOutput<typeof ArmoryItemInfo>;

export const ArmoryItem = object({
  slot: ArmorySlot,
  ...ArmoryItemInfo.entries,
  /** Permanent enchantment (SpellItemEnchantment id), null when unenchanted. */
  enchantId: nullable(number()),
  /** Socketed gems in socket order, the prismatic (extra) socket last. */
  gems: array(ArmoryItemInfo),
  /** True when the extra socket (belt buckle, blacksmith socket) holds a gem. */
  extraSocket: boolean(),
  randomPropertyId: number(),
});
export type ArmoryItem = InferOutput<typeof ArmoryItem>;

export const ArmoryTalent = object({
  /** Row in the tree, 0 at the top. */
  tier: number(),
  /** Column, 0-3. */
  column: number(),
  name: string(),
  /** Wowhead icon name. */
  icon: string(),
  /** Spell of the learned rank, or of the first rank when the talent has no points. */
  spellId: number(),
  rank: number(),
  maxRank: number(),
});
export type ArmoryTalent = InferOutput<typeof ArmoryTalent>;

export const ArmoryTalentTree = object({
  name: string(),
  points: number(),
  /** Every talent of the tree, learned or not, by tier then column. */
  talents: array(ArmoryTalent),
});
export type ArmoryTalentTree = InferOutput<typeof ArmoryTalentTree>;

export const ArmoryGlyph = object({
  spellId: number(),
  name: string(),
  icon: string(),
  kind: picklist(["major", "minor"]),
});
export type ArmoryGlyph = InferOutput<typeof ArmoryGlyph>;

/** One talent specialization (dual spec has two). */
export const ArmoryTalentGroup = object({
  active: boolean(),
  /** The class's three trees in client order. */
  trees: array(ArmoryTalentTree),
  /** Build string for Wowhead's WotLK talent calculator (`/wotlk/talent-calc/<class>/<build>`). */
  build: string(),
  glyphs: array(ArmoryGlyph),
});
export type ArmoryTalentGroup = InferOutput<typeof ArmoryTalentGroup>;

export const ArmoryMatchPlayer = object({
  name: string(),
  class: string(),
});
export type ArmoryMatchPlayer = InferOutput<typeof ArmoryMatchPlayer>;

/** A recorded SoloQ match (arena replay). */
export const ArmoryMatch = object({
  /** Replay id: `.replay <id>` watches it in game. */
  id: number(),
  playedAt: number(),
  map: string(),
  durationSeconds: number(),
  won: boolean(),
  /** The character's team, the character itself included. */
  team: array(ArmoryMatchPlayer),
  enemies: array(ArmoryMatchPlayer),
});
export type ArmoryMatch = InferOutput<typeof ArmoryMatch>;

/** One character's armory page (`/armory/:name`). */
export const ArmoryCharacter = object({
  name: pipe(string(), minLength(1)),
  class: string(),
  race: string(),
  gender: picklist(["male", "female"]),
  level: number(),
  guild: nullable(string()),
  soloq: nullable(ArmorySoloq),
  /** Equipped items in slot order; empty slots are absent. */
  equipment: array(ArmoryItem),
  /** Average item level over the non-cosmetic slots, null without data. */
  averageItemLevel: nullable(number()),
  talentGroups: array(ArmoryTalentGroup),
  /** Most recent SoloQ matches, newest first. */
  matches: array(ArmoryMatch),
});
export type ArmoryCharacter = InferOutput<typeof ArmoryCharacter>;

export const ARMORY_RECENT_MATCHES = 20;

/** The core's character name rule (`normalizePlayerName`): first letter upper case, rest lower. */
export function normalizeCharacterName(name: string): string {
  const [first = "", ...rest] = Array.from(name.trim());
  return first.toLocaleUpperCase() + rest.join("").toLocaleLowerCase();
}
