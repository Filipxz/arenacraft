#!/usr/bin/env bun
/**
 * gen_armory_data - regenerate the static client data the website armory needs
 * (`apps/site/packages/backend/src/features/armory/generated/armoryData.ts`).
 *
 * The site only reads the characters database, which stores talents as spell
 * ids, gems as enchantment ids and glyphs as GlyphProperties ids. Turning those
 * into talent trees, gem items and glyph spells needs client data, so it is
 * baked into a committed table:
 *
 * - talent trees per class (Talent.dbc + TalentTab.dbc), in the client's tab
 *   and tier/column order (the same order Wowhead's talent calculator encodes)
 * - socket enchantment id -> gem item (GemProperties.dbc + item_template)
 * - GlyphProperties id -> glyph spell and major/minor (GlyphProperties.dbc)
 * - the name and icon of every talent and glyph spell (Spell.dbc + SpellIcon.dbc)
 *
 * The DBC tables are read from `data/dbc` (`scripts/extract_assets`). Without
 * extracted assets, `--wago <build>` reads the same tables from wago.tools
 * instead (Wrath Classic builds share the 3.3.5 ids) and spell names and icons
 * from Wowhead's tooltip API (~1k requests); prefer the DBCs when you have them. Gem items always come from `data/sql/base/db_world/item_template.sql`.
 *
 * Usage: bun scripts/gen_armory_data [--wago 3.4.3.54261]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readDbc } from "./lib/dbc.ts";
import { repoRoot } from "./lib/repo.ts";

const OUTPUT = join(
  repoRoot,
  "apps",
  "site",
  "packages",
  "backend",
  "src",
  "features",
  "armory",
  "generated",
  "armoryData.ts",
);

interface TalentRow
{
  tab: number;
  tier: number;
  column: number;
  ranks: number[];
}

interface TabRow
{
  id: number;
  name: string;
  classMask: number;
  order: number;
}

interface GemPropertyRow
{
  id: number;
  enchant: number;
}

interface GlyphRow
{
  id: number;
  spell: number;
  flags: number;
}

interface SpellInfo
{
  name: string;
  /** Lower-case icon name, as Wowhead's icon CDN serves it. */
  icon: string;
}

interface Tables
{
  talents: TalentRow[];
  tabs: TabRow[];
  gemProperties: GemPropertyRow[];
  glyphs: GlyphRow[];
  spellInfo(spellIds: number[]): Promise<Map<number, SpellInfo>>;
}

/** `Interface\\Icons\\Ability_Rogue_Ambush` -> `ability_rogue_ambush`. */
const iconName = (texture: string) => (texture.split(/[\\/]/).pop() ?? "").toLowerCase();

// Field indices of the 3.3.5 WDBC files (TrinityCore/AzerothCore DBCfmt.h).
function tablesFromDbc(): Tables
{
  const dbc = (name: string) => readDbc(join(repoRoot, "data", "dbc", `${name}.dbc`));

  const talent = dbc("Talent");
  const tab = dbc("TalentTab");
  const gem = dbc("GemProperties");
  const glyph = dbc("GlyphProperties");

  return {
    // Spell.dbc: SpellIconID (133), SpellName[0] (136); SpellIcon.dbc: ID, TextureFilename.
    async spellInfo(spellIds)
    {
      const wanted = new Set(spellIds);
      const spell = dbc("Spell");
      const icon = dbc("SpellIcon");
      const textures = new Map(icon.records.map((r) => [r[0]!, icon.string(r[1]!)]));
      const out = new Map<number, SpellInfo>();
      for (const r of spell.records)
      {
        if (!wanted.has(r[0]!)) continue;
        out.set(r[0]!, { name: spell.string(r[136]!), icon: iconName(textures.get(r[133]!) ?? "") });
      }
      return out;
    },
    // ID, TabID, TierID, ColumnIndex, SpellRank[9] (4..12)
    talents: talent.records.map((r) => ({
      tab: r[1]!,
      tier: r[2]!,
      column: r[3]!,
      ranks: Array.from(r.subarray(4, 13)),
    })),
    // ID, Name_lang[16] + flags (1..17), SpellIconID, RaceMask, ClassMask (20), PetTalentMask, OrderIndex (22)
    tabs: tab.records.map((r) => ({ id: r[0]!, name: tab.string(r[1]!), classMask: r[20]!, order: r[22]! })),
    // ID, Enchant_ID
    gemProperties: gem.records.map((r) => ({ id: r[0]!, enchant: r[1]! })),
    // ID, SpellID, GlyphSlotFlags
    glyphs: glyph.records.map((r) => ({ id: r[0]!, spell: r[1]!, flags: r[2]! })),
  };
}

async function tablesFromWago(build: string): Promise<Tables>
{
  const table = async (name: string) =>
  {
    const url = `https://wago.tools/db2/${name}/csv?build=${encodeURIComponent(build)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return parseCsv(await response.text());
  };

  const [talent, tab, gem, glyph] = await Promise.all([
    table("Talent"),
    table("TalentTab"),
    table("GemProperties"),
    table("GlyphProperties"),
  ]);
  const int = (row: Record<string, string>, key: string) =>
  {
    const value = row[key];
    if (value === undefined) throw new Error(`wago table is missing column ${key}`);
    return Number(value);
  };

  return {
    spellInfo: wowheadSpellInfo,
    talents: talent.map((r) => ({
      tab: int(r, "TabID"),
      tier: int(r, "TierID"),
      column: int(r, "ColumnIndex"),
      ranks: Array.from({ length: 9 }, (_, i) => int(r, `SpellRank_${i}`)),
    })),
    tabs: tab.map((r) => ({
      id: int(r, "ID"),
      name: r.Name_lang ?? "",
      classMask: int(r, "ClassMask"),
      order: int(r, "OrderIndex"),
    })),
    gemProperties: gem.map((r) => ({ id: int(r, "ID"), enchant: int(r, "Enchant_ID") })),
    glyphs: glyph.map((r) => ({ id: int(r, "ID"), spell: int(r, "SpellID"), flags: int(r, "GlyphSlotFlags") })),
  };
}

/** Spell names and icons from Wowhead's WotLK tooltip API, for the wago.tools source. */
async function wowheadSpellInfo(spellIds: number[]): Promise<Map<number, SpellInfo>>
{
  const out = new Map<number, SpellInfo>();
  const ids = [...new Set(spellIds)];
  for (let i = 0; i < ids.length; i += 8)
  {
    await Promise.all(
      ids.slice(i, i + 8).map(async (id) =>
      {
        for (let attempt = 0; attempt < 3; attempt++)
        {
          const response = await fetch(`https://nether.wowhead.com/wotlk/tooltip/spell/${id}`);
          if (!response.ok) continue;
          const data = (await response.json()) as { name?: string; icon?: string };
          out.set(id, { name: data.name ?? "", icon: (data.icon ?? "").toLowerCase() });
          return;
        }
        console.warn(`wowhead: no data for spell ${id}`);
      }),
    );
  }
  return out;
}

function parseCsv(text: string): Array<Record<string, string>>
{
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++)
  {
    const c = text[i]!;
    if (quoted)
    {
      if (c === '"' && text[i + 1] === '"')
      {
        field += '"';
        i++;
      }
      else if (c === '"')
        quoted = false;
      else
        field += c;
    }
    else if (c === '"')
      quoted = true;
    else if (c === ",")
    {
      row.push(field);
      field = "";
    }
    else if (c === "\n")
    {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    }
    else
      field += c;
  }
  if (field !== "" || row.length > 0)
  {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows;
  if (header === undefined) return [];
  return data.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}

/** Gem items (`GemProperties != 0`) from the world database dump the server ships with. */
function gemItems(): Array<{ entry: number; gemProperties: number; quality: number; itemLevel: number }>
{
  const sql = readFileSync(join(repoRoot, "data", "sql", "base", "db_world", "item_template.sql"), "utf8");

  const create = /CREATE TABLE[^(]*\(([\s\S]*?)\n\)/.exec(sql);
  if (!create) throw new Error("item_template.sql: no CREATE TABLE");
  const columns = [...create[1]!.matchAll(/^\s*`(\w+)`/gm)].map((m) => m[1]!);
  const col = (name: string) =>
  {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`item_template.sql: no column ${name}`);
    return index;
  };
  const ENTRY = col("entry");
  const QUALITY = col("Quality");
  const ITEM_LEVEL = col("ItemLevel");
  const GEM_PROPERTIES = col("GemProperties");

  const out: Array<{ entry: number; gemProperties: number; quality: number; itemLevel: number }> = [];
  for (const tuple of sqlTuples(sql))
  {
    const gemProperties = Number(tuple[GEM_PROPERTIES]);
    if (!gemProperties) continue;
    out.push({
      entry: Number(tuple[ENTRY]),
      gemProperties,
      quality: Number(tuple[QUALITY]),
      itemLevel: Number(tuple[ITEM_LEVEL]),
    });
  }
  return out;
}

/** Value tuples of every `INSERT ... VALUES (...), (...);` statement, as raw field strings. */
function* sqlTuples(sql: string): Generator<string[]>
{
  let at = 0;
  for (;;)
  {
    const insert = sql.indexOf("INSERT INTO", at);
    if (insert < 0) return;
    let i = sql.indexOf("VALUES", insert) + "VALUES".length;

    for (;;)
    {
      while (i < sql.length && sql[i] !== "(" && sql[i] !== ";") i++;
      if (i >= sql.length || sql[i] === ";") break;
      i++; // (

      const fields: string[] = [];
      let field = "";
      let quoted = false;
      for (; i < sql.length; i++)
      {
        const c = sql[i]!;
        if (quoted)
        {
          if (c === "\\")
          {
            field += sql[++i];
            continue;
          }
          if (c === "'")
          {
            if (sql[i + 1] === "'")
            {
              field += "'";
              i++;
              continue;
            }
            quoted = false;
            continue;
          }
          field += c;
        }
        else if (c === "'")
          quoted = true;
        else if (c === ",")
        {
          fields.push(field.trim());
          field = "";
        }
        else if (c === ")")
        {
          fields.push(field.trim());
          i++;
          break;
        }
        else
          field += c;
      }
      yield fields;
    }
    at = i;
  }
}

const CLASS_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11];

const wagoIndex = process.argv.indexOf("--wago");
const wagoBuild = wagoIndex >= 0 ? process.argv[wagoIndex + 1] : undefined;
if (wagoIndex >= 0 && !wagoBuild) throw new Error("--wago needs a build, e.g. --wago 3.4.3.54261");
if (wagoBuild === undefined && !existsSync(join(repoRoot, "data", "dbc", "Talent.dbc")))
  throw new Error("data/dbc/Talent.dbc not found: run scripts/extract_assets, or pass --wago <build>");

const tables = wagoBuild === undefined ? tablesFromDbc() : await tablesFromWago(wagoBuild);
const source = wagoBuild === undefined ? "data/dbc" : `wago.tools build ${wagoBuild}`;

const classTabs = (classId: number) =>
  tables.tabs.filter((tab) => tab.classMask & (1 << (classId - 1))).sort((a, b) => a.order - b.order);
const classTabIds = new Set(CLASS_IDS.flatMap((classId) => classTabs(classId).map((tab) => tab.id)));
const glyphRows = tables.glyphs.filter((g) => g.spell !== 0).sort((a, b) => a.id - b.id);
const spells = await tables.spellInfo([
  ...tables.talents.filter((t) => classTabIds.has(t.tab) && t.ranks[0]).map((t) => t.ranks[0]!),
  ...glyphRows.map((g) => g.spell),
]);
const spellName = (id: number) => (spells.get(id)?.name ?? "").replace(/\s+/g, " ").trim();
const spellIcon = (id: number) => spells.get(id)?.icon || "inv_misc_questionmark";

// Talent trees: three tabs per class, ordered like the client (OrderIndex), talents by tier then column.
const trees: string[] = [];
for (const classId of CLASS_IDS)
{
  const tabs = classTabs(classId);
  if (tabs.length !== 3) throw new Error(`class ${classId}: expected 3 talent tabs, got ${tabs.length}`);

  const rendered = tabs.map((tab) =>
  {
    const talents = tables.talents
      .filter((t) => t.tab === tab.id)
      .sort((a, b) => a.tier - b.tier || a.column - b.column)
      .map((t) =>
      {
        let ranks = t.ranks;
        while (ranks.length > 0 && ranks[ranks.length - 1] === 0) ranks = ranks.slice(0, -1);
        const first = ranks[0] ?? 0;
        return (
          `      { tier: ${t.tier}, column: ${t.column}, name: ${JSON.stringify(spellName(first))}, ` +
          `icon: ${JSON.stringify(spellIcon(first))}, ranks: [${ranks.join(", ")}] },`
        );
      });
    return `    {\n      id: ${tab.id}, name: ${JSON.stringify(tab.name)}, talents: [\n${talents.join("\n")}\n    ] },`;
  });
  trees.push(`  ${classId}: [\n${rendered.join("\n")}\n  ],`);
}

// Socket enchantment -> gem item. Several items can share one enchantment (e.g. a BoP jewelcrafter
// variant); keep the best quality, then the highest item level, then the lowest entry.
const enchantByProperty = new Map(tables.gemProperties.map((g) => [g.id, g.enchant]));
const bestGem = new Map<number, { entry: number; quality: number; itemLevel: number }>();
for (const item of gemItems())
{
  const enchant = enchantByProperty.get(item.gemProperties);
  if (!enchant) continue;
  const current = bestGem.get(enchant);
  const better =
    current === undefined ||
    item.quality > current.quality ||
    (item.quality === current.quality &&
      (item.itemLevel > current.itemLevel || (item.itemLevel === current.itemLevel && item.entry < current.entry)));
  if (better) bestGem.set(enchant, item);
}
const gems = [...bestGem.entries()].sort((a, b) => a[0] - b[0]).map(([enchant, item]) => `${enchant}: ${item.entry}`);

// GlyphSlotFlags bit 0 marks a minor glyph.
const glyphs = glyphRows.map(
  (g) =>
    `  ${g.id}: { spellId: ${g.spell}, minor: ${(g.flags & 1) === 1}, name: ${JSON.stringify(spellName(g.spell))}, ` +
    `icon: ${JSON.stringify(spellIcon(g.spell))} },`,
);

const wrap = (items: string[]) =>
{
  const lines: string[] = [];
  let line = "";
  for (const item of items)
  {
    if (line.length + item.length + 2 > 98)
    {
      lines.push(line.trimEnd());
      line = "";
    }
    line += `${item}, `;
  }
  if (line) lines.push(line.trimEnd());
  return lines.map((l) => `  ${l}`).join("\n");
};

const output = `// Generated by scripts/src/gen_armory_data.ts from ${source} - do not edit by hand.
// Regenerate with: bun scripts/gen_armory_data

export interface GeneratedTalent {
  readonly tier: number;
  readonly column: number;
  readonly name: string;
  /** Wowhead icon name of the first rank. */
  readonly icon: string;
  /** Spell id of every rank. */
  readonly ranks: readonly number[];
}

export interface GeneratedGlyph {
  readonly spellId: number;
  readonly minor: boolean;
  readonly name: string;
  readonly icon: string;
}

export interface GeneratedTalentTree {
  readonly id: number;
  readonly name: string;
  /** Ordered by tier, then column: the order Wowhead's talent calculator encodes. */
  readonly talents: readonly GeneratedTalent[];
}

/** Talent trees per class id, in the client's tab order. */
export const TALENT_TREES: Readonly<Record<number, readonly GeneratedTalentTree[]>> = {
${trees.join("\n")}
};

/** Socket enchantment id (item_instance.enchantments) -> gem item entry. */
export const GEM_ITEM_BY_ENCHANT: Readonly<Record<number, number>> = {
${wrap(gems)}
};

/** GlyphProperties id (character_glyphs) -> glyph spell. */
export const GLYPHS: Readonly<Record<number, GeneratedGlyph>> = {
${glyphs.join("\n")}
};
`;

writeFileSync(OUTPUT, output);
console.log(
  `wrote ${CLASS_IDS.length} classes, ${gems.length} gems and ${glyphs.length} glyphs from ${source} to ${OUTPUT}`,
);
