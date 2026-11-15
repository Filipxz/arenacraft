import { InjectionToken } from "@needle-di/core";
import type { ItemInfo } from "./armory";

/**
 * Static item data (name, quality, icon, item level). The site has no world database, so it comes
 * from a source outside the characters database. Items the source does not know are absent from
 * the result; callers render a placeholder.
 */
export interface ItemInfoSource {
  lookup(itemIds: readonly number[]): Promise<Map<number, ItemInfo>>;
}

export const ITEM_INFO_SOURCE = new InjectionToken<ItemInfoSource>("ItemInfoSource");
