import { InjectionToken } from "@needle-di/core";
import type {
  ArmoryListRow,
  ArmoryProfileRow,
  EquipmentRow,
  GlyphRow,
  MatchPlayerRow,
  MatchRow,
  TalentRow,
} from "./armory";

export interface ArmoryRepository {
  /** Every live (not deleted) character, best SoloQ rating first, then by name. */
  characters(limit: number): Promise<ArmoryListRow[]>;

  /** One character by its exact (normalized) name; null when there is none. */
  profile(name: string): Promise<ArmoryProfileRow | null>;

  /** Equipped items (bag 0, slots 0-18). */
  equipment(guid: number): Promise<EquipmentRow[]>;

  talents(guid: number): Promise<TalentRow[]>;

  glyphs(guid: number): Promise<GlyphRow[]>;

  /** Most recent decided SoloQ matches of the character, newest first. */
  recentMatches(guid: number, limit: number): Promise<MatchRow[]>;

  /** Every participant of the given replays. */
  matchPlayers(replayIds: readonly number[]): Promise<MatchPlayerRow[]>;
}

export const ARMORY_REPOSITORY = new InjectionToken<ArmoryRepository>("ArmoryRepository");
