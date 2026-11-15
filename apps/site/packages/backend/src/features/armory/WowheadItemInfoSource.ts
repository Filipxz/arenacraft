import * as v from "valibot";
import { Logger } from "@/lib/Logger";
import type { ItemInfo } from "./armory";
import type { ItemInfoSource } from "./ItemInfoSource";

const WOWHEAD_TOOLTIP_URL = "https://nether.wowhead.com/wotlk/tooltip/item";

const REQUEST_TIMEOUT_MS = 3_000;

/** Parallel requests per lookup; a full paperdoll with gems is ~40 items on a cold cache. */
const MAX_CONCURRENT_REQUESTS = 8;

/** Item data is static: a hit is kept for the life of the process. Misses are retried later. */
const MISS_RETRY_MS = 10 * 60 * 1000;

/** Bound on cached items. The game has ~40k items; only equipped ones are ever looked up. */
const MAX_CACHED_ITEMS = 20_000;

const ICON_PATTERN = /^[a-z0-9_-]{1,100}$/i;

const WowheadItemTooltip = v.object({
  name: v.string(),
  quality: v.number(),
  icon: v.string(),
  tooltip: v.string(),
});

/** Narrow fetch signature, so tests can inject a plain function. */
export type WowheadFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Production source: Wowhead's tooltip API for the WotLK item database, the same data the
 * browser-side tooltips show. One request per item, ever: item data does not change, so a hit is
 * cached until restart. Failures are logged once per item and the item renders as unknown.
 */
export class WowheadItemInfoSource implements ItemInfoSource {
  private readonly hits = new Map<number, ItemInfo>();
  private readonly misses = new Map<number, number>();
  private readonly pending = new Map<number, Promise<ItemInfo | null>>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly fetchFn: WowheadFetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async lookup(itemIds: readonly number[]): Promise<Map<number, ItemInfo>> {
    const result = new Map<number, ItemInfo>();
    const toFetch: number[] = [];

    for (const id of new Set(itemIds)) {
      const hit = this.hits.get(id);
      if (hit !== undefined) {
        result.set(id, hit);
        continue;
      }
      const missedAt = this.misses.get(id);
      if (missedAt !== undefined && this.now() - missedAt < MISS_RETRY_MS) continue;
      toFetch.push(id);
    }

    for (let i = 0; i < toFetch.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = toFetch.slice(i, i + MAX_CONCURRENT_REQUESTS);
      const infos = await Promise.all(batch.map((id) => this.fetchShared(id)));
      infos.forEach((info, index) => {
        if (info !== null) result.set(batch[index]!, info);
      });
    }

    return result;
  }

  /** Concurrent lookups of one item share a single request. */
  private fetchShared(id: number): Promise<ItemInfo | null> {
    let request = this.pending.get(id);
    if (request === undefined) {
      request = this.fetchItem(id).finally(() => this.pending.delete(id));
      this.pending.set(id, request);
    }
    return request;
  }

  private async fetchItem(id: number): Promise<ItemInfo | null> {
    try {
      const response = await this.fetchFn(`${WOWHEAD_TOOLTIP_URL}/${id}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const info = toItemInfo(id, v.parse(WowheadItemTooltip, await response.json()));
      if (this.hits.size >= MAX_CACHED_ITEMS) this.hits.clear();
      this.hits.set(id, info);
      this.misses.delete(id);
      return info;
    } catch (error) {
      if (!this.misses.has(id)) {
        logger.warn("Wowhead item lookup failed; the item renders as unknown", {
          itemId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.misses.set(id, this.now());
      return null;
    }
  }
}

export function toItemInfo(itemId: number, tooltip: v.InferOutput<typeof WowheadItemTooltip>): ItemInfo {
  const itemLevel = /<!--ilvl-->(\d+)/.exec(tooltip.tooltip)?.[1];
  return {
    itemId,
    name: tooltip.name,
    quality: Math.max(0, Math.min(7, Math.floor(tooltip.quality))),
    itemLevel: itemLevel === undefined ? null : Number(itemLevel),
    // The icon ends up in an image URL on the website; only accept plain icon names.
    icon: ICON_PATTERN.test(tooltip.icon) ? tooltip.icon.toLowerCase() : null,
    twoHanded: tooltip.tooltip.includes("<td>Two-Hand</td>"),
  };
}

const logger = Logger.for(WowheadItemInfoSource);
