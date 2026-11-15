import type { ArmoryItem, ArmorySlot, ArmoryTalentGroup } from "@arenacraft/common";

// Item, talent and glyph tooltips come from Wowhead's WotLK database (see useWowheadTooltips).
const WOWHEAD_URL = "https://www.wowhead.com/wotlk";
const ICON_CDN_URL = "https://wow.zamimg.com/images/wow/icons";
const UNKNOWN_ICON = "inv_misc_questionmark";

export type IconSize = "small" | "medium" | "large";

export function iconUrl(icon: string | null, size: IconSize = "large"): string {
  return `${ICON_CDN_URL}/${size}/${icon ?? UNKNOWN_ICON}.jpg`;
}

// In-game item quality colors (ItemQualities, 0 poor ... 7 heirloom).
export const QUALITY_COLORS: readonly string[] = [
  "#9d9d9d",
  "#ffffff",
  "#1eff00",
  "#0070dd",
  "#a335ee",
  "#ff8000",
  "#e6cc80",
  "#00ccff",
];

export function qualityColor(quality: number): string {
  return QUALITY_COLORS[quality] ?? QUALITY_COLORS[1]!;
}

export const SLOT_LABELS: Record<ArmorySlot, string> = {
  Head: "Head",
  Neck: "Neck",
  Shoulder: "Shoulder",
  Shirt: "Shirt",
  Chest: "Chest",
  Waist: "Waist",
  Legs: "Legs",
  Feet: "Feet",
  Wrist: "Wrist",
  Hands: "Hands",
  Finger1: "Finger",
  Finger2: "Finger",
  Trinket1: "Trinket",
  Trinket2: "Trinket",
  Back: "Back",
  MainHand: "Main hand",
  OffHand: "Off hand",
  Ranged: "Ranged",
  Tabard: "Tabard",
};

// The in-game character pane: left column, right column, weapons underneath.
export const PAPERDOLL_LEFT: readonly ArmorySlot[] = [
  "Head",
  "Neck",
  "Shoulder",
  "Back",
  "Chest",
  "Shirt",
  "Tabard",
  "Wrist",
];
export const PAPERDOLL_RIGHT: readonly ArmorySlot[] = [
  "Hands",
  "Waist",
  "Legs",
  "Feet",
  "Finger1",
  "Finger2",
  "Trinket1",
  "Trinket2",
];
export const PAPERDOLL_WEAPONS: readonly ArmorySlot[] = ["MainHand", "OffHand", "Ranged"];

export function itemUrl(itemId: number): string {
  return `${WOWHEAD_URL}/item=${itemId}`;
}

export function spellUrl(spellId: number): string {
  return `${WOWHEAD_URL}/spell=${spellId}`;
}

/**
 * Wowhead tooltip parameters for an equipped item: enchant, gems, random suffix and the other
 * equipped pieces, so set bonuses show as active.
 */
export function itemTooltipParams(item: ArmoryItem, equippedIds: readonly number[]): string {
  const params = new URLSearchParams();
  params.set("item", String(item.itemId));
  if (item.enchantId !== null) params.set("ench", String(item.enchantId));
  if (item.gems.length > 0) params.set("gems", item.gems.map((gem) => gem.itemId).join(":"));
  if (item.extraSocket) params.set("sock", "");
  if (item.randomPropertyId !== 0) params.set("rand", String(item.randomPropertyId));
  if (equippedIds.length > 0) params.set("pcs", equippedIds.join(":"));
  // Wowhead reads `&`-separated pairs; it does not expect `:` to be percent-encoded.
  return decodeURIComponent(params.toString());
}

export function talentCalculatorUrl(wowClass: string, group: ArmoryTalentGroup): string {
  const slug = wowClass.toLowerCase().replace(/\s+/g, "-");
  return `${WOWHEAD_URL}/talent-calc/${slug}/${group.build}`;
}

/** The tree with the most points names the spec; ties go to the earlier tree. */
export function specName(group: ArmoryTalentGroup): string | null {
  let best: { name: string; points: number } | null = null;
  for (const tree of group.trees) {
    if (tree.points > (best?.points ?? 0)) best = tree;
  }
  return best?.name ?? null;
}

export function pointSplit(group: ArmoryTalentGroup): string {
  return group.trees.map((tree) => tree.points).join("/");
}

export function armoryPath(name: string): string {
  return `/armory/${encodeURIComponent(name)}`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function winRateOf(wins: number, losses: number): string {
  const games = wins + losses;
  return games === 0 ? "—" : `${Math.round((wins / games) * 100)}%`;
}
