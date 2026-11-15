import { describe, expect, test } from "bun:test";
import { normalizeCharacterName } from "@arenacraft/common";
import { LadderService } from "@/features/ladder/LadderService";
import type { Config } from "@/shared/Config";
import {
  averageItemLevel,
  parseEnchantments,
  toEquipment,
  toMatches,
  toTalentGroups,
  unknownItem,
  type EquipmentRow,
  type ItemInfo,
} from "./armory";
import { ArmoryService } from "./ArmoryService";
import { DummyArmoryRepository } from "./DummyArmoryRepository";
import { DummyItemInfoSource } from "./DummyItemInfoSource";
import { ArmoryCharacterNotFoundError } from "./error/armoryErrors";
import { TALENT_TREES } from "./generated/armoryData";
import { WowheadItemInfoSource } from "./WowheadItemInfoSource";

/** 12 enchantment slots of `id duration charges`, as the core saves them. */
function enchantments(bySlot: Record<number, number>): string {
  return Array.from({ length: 12 }, (_, slot) => `${bySlot[slot] ?? 0} 0 0`).join(" ") + " ";
}

function item(itemId: number, itemLevel: number | null, twoHanded = false): ItemInfo {
  return { itemId, name: `I${itemId}`, quality: 4, itemLevel, icon: "inv_x", twoHanded };
}

describe("parseEnchantments", () => {
  test("reads the permanent enchant, sockets and the prismatic socket", () => {
    expect(parseEnchantments(enchantments({ 0: 3817, 2: 3628, 3: 3518, 6: 3879 }))).toEqual({
      enchantId: 3817,
      socketEnchants: [3628, 3518],
      prismaticEnchant: 3879,
    });
  });

  test("keeps an empty socket before a filled one and tolerates junk", () => {
    expect(parseEnchantments(enchantments({ 3: 3518 })).socketEnchants).toEqual([0, 3518]);
    expect(parseEnchantments("")).toEqual({ enchantId: null, socketEnchants: [], prismaticEnchant: null });
  });
});

describe("toEquipment", () => {
  test("maps slots, gems in socket order and the extra socket", () => {
    const rows: EquipmentRow[] = [
      { slot: 5, itemId: 51362, enchantments: enchantments({ 2: 3518, 6: 3879 }), randomPropertyId: 0 },
      { slot: 0, itemId: 51543, enchantments: enchantments({ 0: 3817, 2: 3628 }), randomPropertyId: 0 },
    ];
    const items = new Map([
      [51543, item(51543, 270)],
      [41398, item(41398, 80)],
    ]);

    const equipment = toEquipment(rows, items);
    expect(equipment.map((e) => e.slot)).toEqual(["Head", "Waist"]);
    expect(equipment[0]).toMatchObject({ itemId: 51543, enchantId: 3817, extraSocket: false });
    expect(equipment[0]!.gems.map((g) => g.itemId)).toEqual([41398]);
    // Unknown items (and gems) still render, as placeholders.
    expect(equipment[1]!.name).toBe(unknownItem(51362).name);
    expect(equipment[1]!.gems.map((g) => g.itemId)).toEqual([40111, 49110]);
    expect(equipment[1]!.extraSocket).toBe(true);
    expect("twoHanded" in equipment[0]!).toBe(false);
  });
});

describe("averageItemLevel", () => {
  const row = (slot: number, itemId: number): EquipmentRow => ({
    slot,
    itemId,
    enchantments: "",
    randomPropertyId: 0,
  });

  test("divides by the 17 non-cosmetic slots and ignores shirt and tabard", () => {
    const items = new Map([
      [1, item(1, 170)],
      [2, item(2, 999)],
    ]);
    expect(averageItemLevel([row(0, 1), row(3, 2), row(18, 2)], items)).toBe(10);
  });

  test("a two-hander with an empty off hand counts twice", () => {
    const items = new Map([
      [1, item(1, 170, true)],
      [2, item(2, 170)],
    ]);
    expect(averageItemLevel([row(15, 1)], items)).toBe(20);
    expect(averageItemLevel([row(15, 1), row(16, 2)], items)).toBe(20);
  });

  test("is null without any known item level", () => {
    expect(averageItemLevel([row(0, 1)], new Map())).toBeNull();
  });
});

describe("toTalentGroups", () => {
  const warrior = TALENT_TREES[1]!;
  const [arms, fury] = warrior;

  test("counts points per tree and encodes the Wowhead build", () => {
    const deflection = arms!.talents[1]!; // tier 0, column 1, five ranks
    const fury1 = fury!.talents[0]!;
    const groups = toTalentGroups(
      1,
      [
        { spellId: deflection.ranks[4]!, specMask: 1 },
        { spellId: deflection.ranks[2]!, specMask: 1 }, // a lower rank kept as well
        { spellId: fury1.ranks[0]!, specMask: 3 },
      ],
      [{ talentGroup: 0, glyphs: [489, 0, 0, 0, 0, 0] }],
      2,
      1,
    );

    expect(groups).toHaveLength(2);
    const [primary, secondary] = groups;
    expect(primary!.active).toBe(false);
    expect(secondary!.active).toBe(true);
    expect(primary!.trees.map((t) => [t.name, t.points])).toEqual([
      ["Arms", 5],
      ["Fury", 1],
      ["Protection", 0],
    ]);
    expect(primary!.build).toBe("05-1");
    expect(secondary!.build).toBe("-1");
    expect(primary!.trees[0]!.talents[1]).toMatchObject({
      name: "Deflection",
      rank: 5,
      maxRank: 5,
      spellId: deflection.ranks[4],
    });
    // Every talent is listed, learned or not, with its first rank for the tooltip.
    expect(primary!.trees[0]!.talents).toHaveLength(arms!.talents.length);
    expect(primary!.trees[0]!.talents[0]).toMatchObject({ rank: 0, spellId: arms!.talents[0]!.ranks[0] });
  });

  test("maps glyph ids and puts majors first", () => {
    const [group] = toTalentGroups(
      8,
      [],
      [{ talentGroup: 0, glyphs: [81, 0, 0, 329, 0, 999_999] }],
      1,
      0,
    );
    expect(group!.glyphs.map((g) => [g.name, g.kind])).toEqual([
      ["Glyph of Polymorph", "major"],
      ["Glyph of Natural Force", "minor"],
    ]);
  });

  test("an unknown class has no talents", () => {
    expect(toTalentGroups(42, [], [], 1, 0)).toEqual([]);
  });
});

describe("toMatches", () => {
  test("splits participants into the character's team and the enemies", () => {
    const [match] = toMatches(
      [{ id: 7, mapId: 572, durationMs: 125_400, playedAt: 1_000, won: true, team: 1 }],
      [
        { replayId: 7, name: "Zed", team: 1, classId: 4 },
        { replayId: 7, name: "Amy", team: 1, classId: 5 },
        { replayId: 7, name: "Bob", team: 0, classId: 1 },
        { replayId: 8, name: "Other", team: 0, classId: 1 },
      ],
    );
    expect(match).toEqual({
      id: 7,
      playedAt: 1_000,
      map: "Ruins of Lordaeron",
      durationSeconds: 125,
      won: true,
      team: [
        { name: "Amy", class: "Priest" },
        { name: "Zed", class: "Rogue" },
      ],
      enemies: [{ name: "Bob", class: "Warrior" }],
    });
  });
});

describe("normalizeCharacterName", () => {
  test("matches the core's name normalization", () => {
    expect(normalizeCharacterName("kALVAX")).toBe("Kalvax");
    expect(normalizeCharacterName("łucznik")).toBe("Łucznik");
  });
});

describe("WowheadItemInfoSource", () => {
  const tooltip = {
    name: "Wrathful Gladiator's Greatsword",
    quality: 4,
    icon: "INV_Sword_157",
    tooltip: "<!--ilvl-->264<table><tr><td>Two-Hand</td></tr></table>",
  };

  test("parses the tooltip and caches hits for good", async () => {
    let calls = 0;
    const source = new WowheadItemInfoSource(Date.now, async () => {
      calls++;
      return Response.json(tooltip);
    });

    const first = await source.lookup([51392, 51392]);
    await source.lookup([51392]);

    expect(first.get(51392)).toEqual({
      itemId: 51392,
      name: "Wrathful Gladiator's Greatsword",
      quality: 4,
      itemLevel: 264,
      icon: "inv_sword_157",
      twoHanded: true,
    });
    expect(calls).toBe(1);
  });

  test("leaves failed items out and retries them only after a while", async () => {
    let now = 0;
    let calls = 0;
    const source = new WowheadItemInfoSource(
      () => now,
      async () => {
        calls++;
        return new Response("nope", { status: 503 });
      },
    );

    expect((await source.lookup([1])).size).toBe(0);
    await source.lookup([1]);
    expect(calls).toBe(1);

    now += 11 * 60 * 1000;
    await source.lookup([1]);
    expect(calls).toBe(2);
  });

  test("rejects icon names that are not plain identifiers", async () => {
    const source = new WowheadItemInfoSource(Date.now, async () =>
      Response.json({ ...tooltip, icon: "../evil" }),
    );
    expect((await source.lookup([1])).get(1)?.icon).toBeNull();
  });
});

describe("ArmoryService", () => {
  const config = { cacheTtlSeconds: 30, ladderSize: 200 } as Config;

  class CountingRepository extends DummyArmoryRepository {
    profiles = 0;
    override async profile(name: string) {
      this.profiles++;
      return super.profile(name);
    }
  }

  const service = (repository = new CountingRepository()) => {
    const ladder = new LadderService(
      { topSoloq: async () => [{ charName: "Kalvax", classId: 4, storedRole: null, rating: 2412, seasonWins: 1, seasonGames: 1 }] },
      config,
    );
    return { repository, service: new ArmoryService(repository, new DummyItemInfoSource(), ladder, () => 0) };
  };

  test("builds a profile with gear, talents, ladder rank and matches", async () => {
    const { service: armory } = service();
    const character = await armory.character("kalvax");

    expect(character.name).toBe("Kalvax");
    expect(character.soloq).toEqual({ rating: 2412, wins: 184, losses: 61, rank: 1 });
    expect(character.equipment.length).toBeGreaterThan(10);
    expect(character.equipment.every((e) => e.icon !== null)).toBe(true);
    expect(character.talentGroups[0]!.trees.reduce((sum, t) => sum + t.points, 0)).toBe(71);
    expect(character.matches[0]!.team.some((p) => p.name === "Kalvax")).toBe(true);
  });

  test("serves repeated requests from the snapshot cache, whatever the name's case", async () => {
    const { repository, service: armory } = service();
    await armory.character("Kalvax");
    await armory.character("KALVAX");
    expect(repository.profiles).toBe(1);
  });

  test("rejects unknown names", async () => {
    const { service: armory } = service();
    await expect(armory.character("Nobody")).rejects.toBeInstanceOf(ArmoryCharacterNotFoundError);
  });

  test("lists SoloQ players by rating, then everyone else by name", async () => {
    const { service: armory } = service();
    const list = await armory.list();
    const ratings = list.map((c) => c.rating);
    expect(ratings[0]).toBe(2412);
    expect(list.slice(-2).map((c) => [c.name, c.rating])).toEqual([
      ["Bankalt", null],
      ["Lowbie", null],
    ]);
  });
});
