import {
  datetime,
  int,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  tinyint,
  varchar,
} from "drizzle-orm/mysql-core";

// Only the columns the armory reads. The rest of each table lives in the core schema
// (data/sql/base/db_characters). `arena_team*` and the replay tables are shared with the ladder
// and the player overlay (`features/ladder/model`, `features/playerOverlay/model`).

export const armoryCharacters = mysqlTable("characters", {
  guid: int("guid", { unsigned: true }).primaryKey(),
  name: varchar("name", { length: 12 }).notNull(),
  race: tinyint("race", { unsigned: true }).notNull(),
  class: tinyint("class", { unsigned: true }).notNull(),
  gender: tinyint("gender", { unsigned: true }).notNull(),
  level: tinyint("level", { unsigned: true }).notNull(),
  talentGroupsCount: tinyint("talentGroupsCount", { unsigned: true }).notNull(),
  activeTalentGroup: tinyint("activeTalentGroup", { unsigned: true }).notNull(),
  // Set when the character is deleted; such rows are kept for restoration and never listed.
  deleteDate: int("deleteDate", { unsigned: true }),
});

export const characterInventory = mysqlTable("character_inventory", {
  guid: int("guid", { unsigned: true }).notNull(),
  bag: int("bag", { unsigned: true }).notNull(),
  slot: tinyint("slot", { unsigned: true }).notNull(),
  item: int("item", { unsigned: true }).primaryKey(),
});

export const itemInstance = mysqlTable("item_instance", {
  guid: int("guid", { unsigned: true }).primaryKey(),
  itemEntry: int("itemEntry", { unsigned: true }),
  enchantments: text("enchantments").notNull(),
  randomPropertyId: smallint("randomPropertyId").notNull(),
});

export const characterTalent = mysqlTable(
  "character_talent",
  {
    guid: int("guid", { unsigned: true }).notNull(),
    spell: int("spell", { unsigned: true }).notNull(),
    specMask: tinyint("specMask", { unsigned: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guid, table.spell] })],
);

export const characterGlyphs = mysqlTable(
  "character_glyphs",
  {
    guid: int("guid", { unsigned: true }).notNull(),
    talentGroup: tinyint("talentGroup", { unsigned: true }).notNull(),
    glyph1: smallint("glyph1", { unsigned: true }),
    glyph2: smallint("glyph2", { unsigned: true }),
    glyph3: smallint("glyph3", { unsigned: true }),
    glyph4: smallint("glyph4", { unsigned: true }),
    glyph5: smallint("glyph5", { unsigned: true }),
    glyph6: smallint("glyph6", { unsigned: true }),
  },
  (table) => [primaryKey({ columns: [table.guid, table.talentGroup] })],
);

export const guild = mysqlTable("guild", {
  guildId: int("guildid", { unsigned: true }).primaryKey(),
  name: varchar("name", { length: 24 }).notNull(),
});

export const guildMember = mysqlTable("guild_member", {
  guildId: int("guildid", { unsigned: true }).notNull(),
  guid: int("guid", { unsigned: true }).notNull(),
});

// `arena_replay` columns the overlay does not need; the overlay's mapping stays minimal.
export const armoryArenaReplay = mysqlTable("arena_replay", {
  id: int("id", { unsigned: true }).primaryKey(),
  bracket: tinyint("bracket", { unsigned: true }).notNull(),
  mapId: int("map_id", { unsigned: true }).notNull(),
  winner: tinyint("winner", { unsigned: true }).notNull(),
  durationMs: int("duration_ms", { unsigned: true }).notNull(),
  createdAt: datetime("created_at").notNull(),
});

export const armoryArenaReplayPlayer = mysqlTable(
  "arena_replay_player",
  {
    replayId: int("replay_id", { unsigned: true }).notNull(),
    guid: int("guid", { unsigned: true }).notNull(),
    name: varchar("name", { length: 12 }).notNull(),
    team: tinyint("team", { unsigned: true }).notNull(),
    class: tinyint("class", { unsigned: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.replayId, table.guid] })],
);
