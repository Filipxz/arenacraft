import {
  ARMORY_RECENT_MATCHES,
  normalizeCharacterName,
  type ArmoryCharacter,
  type ArmoryCharacterSummary,
  type ArmorySoloq,
} from "@arenacraft/common";
import { inject, injectable } from "@needle-di/core";
import { LadderService } from "@/features/ladder/LadderService";
import { Logger } from "@/lib/Logger";
import { SnapshotCache } from "@/shared/SnapshotCache";
import {
  ARMORY_CACHE_TTL_MS,
  ARMORY_LIST_LIMIT,
  ARMORY_MAX_CACHED_CHARACTERS,
  averageItemLevel,
  itemIdsOf,
  raceNameOf,
  toCharacterSummary,
  toEquipment,
  toMatches,
  toTalentGroups,
  type ArmoryProfileRow,
} from "./armory";
import { ARMORY_REPOSITORY, type ArmoryRepository } from "./ArmoryRepository";
import { ArmoryCharacterNotFoundError } from "./error/armoryErrors";
import { ITEM_INFO_SOURCE, type ItemInfoSource } from "./ItemInfoSource";
import { classNameOf } from "@/features/ladder/ladder";

@injectable()
export class ArmoryService {
  private readonly listCache: SnapshotCache<ArmoryCharacterSummary[]>;
  // One snapshot per character name; insertion order doubles as a cheap LRU for the size cap.
  private readonly characterCaches = new Map<string, SnapshotCache<ArmoryCharacter>>();

  constructor(
    private readonly repository: ArmoryRepository = inject(ARMORY_REPOSITORY),
    private readonly items: ItemInfoSource = inject(ITEM_INFO_SOURCE),
    private readonly ladder: LadderService = inject(LadderService),
    private readonly now: () => number = Date.now,
  ) {
    this.listCache = new SnapshotCache(ARMORY_CACHE_TTL_MS, () => this.loadList(), this.now);
  }

  list(): Promise<ArmoryCharacterSummary[]> {
    return this.listCache.get();
  }

  character(name: string): Promise<ArmoryCharacter> {
    const key = normalizeCharacterName(name);

    let cache = this.characterCaches.get(key);
    if (cache === undefined) {
      cache = new SnapshotCache(ARMORY_CACHE_TTL_MS, () => this.loadCharacter(key), this.now);
      if (this.characterCaches.size >= ARMORY_MAX_CACHED_CHARACTERS) {
        const oldest = this.characterCaches.keys().next().value;
        if (oldest !== undefined) this.characterCaches.delete(oldest);
      }
    } else {
      this.characterCaches.delete(key);
    }
    this.characterCaches.set(key, cache);

    return cache.get().catch((error: unknown) => {
      // Do not keep a cache slot for a name that does not resolve.
      if (error instanceof ArmoryCharacterNotFoundError) this.characterCaches.delete(key);
      throw error;
    });
  }

  private async loadList(): Promise<ArmoryCharacterSummary[]> {
    const rows = await this.repository.characters(ARMORY_LIST_LIMIT);
    return rows
      .map(toCharacterSummary)
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
  }

  private async loadCharacter(name: string): Promise<ArmoryCharacter> {
    const profile = await this.repository.profile(name);
    if (profile === null) throw new ArmoryCharacterNotFoundError();

    const [equipment, talents, glyphs, matches, rank] = await Promise.all([
      this.repository.equipment(profile.guid),
      this.repository.talents(profile.guid),
      this.repository.glyphs(profile.guid),
      this.repository.recentMatches(profile.guid, ARMORY_RECENT_MATCHES),
      this.ladderRank(profile.charName),
    ]);
    const [players, items] = await Promise.all([
      this.repository.matchPlayers(matches.map((match) => match.id)),
      this.items.lookup(itemIdsOf(equipment)),
    ]);

    return {
      name: profile.charName,
      class: classNameOf(profile.classId),
      race: raceNameOf(profile.raceId),
      gender: profile.gender === 1 ? "female" : "male",
      level: profile.level,
      guild: profile.guild,
      soloq: soloqOf(profile, rank),
      equipment: toEquipment(equipment, items),
      averageItemLevel: averageItemLevel(equipment, items),
      talentGroups: toTalentGroups(
        profile.classId,
        talents,
        glyphs,
        profile.talentGroupsCount,
        profile.activeTalentGroup,
      ),
      matches: toMatches(matches, players),
    };
  }

  /** Position on the website ladder; a ladder outage only hides the rank. */
  private async ladderRank(name: string): Promise<number | null> {
    try {
      const index = (await this.ladder.getSoloq()).findIndex((entry) => entry.name === name);
      return index < 0 ? null : index + 1;
    } catch (error) {
      logger.warn("Ladder unavailable for the armory rank", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

function soloqOf(profile: ArmoryProfileRow, rank: number | null): ArmorySoloq | null {
  if (profile.rating === null) return null;
  return {
    rating: profile.rating,
    wins: profile.seasonWins,
    losses: Math.max(0, profile.seasonGames - profile.seasonWins),
    rank,
  };
}

const logger = Logger.for(ArmoryService);
