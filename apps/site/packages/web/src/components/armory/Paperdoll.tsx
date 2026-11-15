import type { ArmoryItem, ArmorySlot } from "@arenacraft/common";
import { cn } from "@/lib/cn";
import {
  iconUrl,
  itemTooltipParams,
  itemUrl,
  PAPERDOLL_LEFT,
  PAPERDOLL_RIGHT,
  PAPERDOLL_WEAPONS,
  qualityColor,
  SLOT_LABELS,
} from "@/lib/armory";

/** The equipment pane: slots laid out like the in-game character window. */
export function Paperdoll({ equipment }: { equipment: readonly ArmoryItem[] }) {
  const bySlot = new Map(equipment.map((item) => [item.slot, item]));
  const equippedIds = equipment.map((item) => item.itemId);

  const column = (slots: readonly ArmorySlot[], mirrored: boolean) =>
    slots.map((slot) => (
      <ItemSlot
        key={slot}
        slot={slot}
        item={bySlot.get(slot)}
        equippedIds={equippedIds}
        mirrored={mirrored}
      />
    ));

  return (
    <div className="grid gap-px bg-divider">
      <div className="grid gap-px md:grid-cols-2">
        <div className="grid gap-px">{column(PAPERDOLL_LEFT, false)}</div>
        <div className="grid gap-px">{column(PAPERDOLL_RIGHT, true)}</div>
      </div>
      <div className="grid gap-px md:grid-cols-3">{column(PAPERDOLL_WEAPONS, false)}</div>
    </div>
  );
}

function ItemSlot({
  slot,
  item,
  equippedIds,
  mirrored,
}: {
  slot: ArmorySlot;
  item: ArmoryItem | undefined;
  equippedIds: readonly number[];
  mirrored: boolean;
}) {
  if (item === undefined) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 bg-surface p-2.5",
          mirrored && "md:flex-row-reverse md:text-right",
        )}
      >
        <span className="size-11 shrink-0 border border-divider bg-surface-raised" aria-hidden="true" />
        <span className="text-sm text-ink/40">{SLOT_LABELS[slot]} · empty</span>
      </div>
    );
  }

  const color = qualityColor(item.quality);

  return (
    <a
      href={itemUrl(item.itemId)}
      data-wowhead={itemTooltipParams(item, equippedIds)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group flex min-w-0 items-center gap-3 bg-surface p-2.5 transition-colors hover:bg-surface-raised",
        mirrored && "md:flex-row-reverse md:text-right",
      )}
    >
      <img
        src={iconUrl(item.icon)}
        alt=""
        width={44}
        height={44}
        loading="lazy"
        className="size-11 shrink-0 border-2"
        style={{ borderColor: color }}
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-bold group-hover:underline" style={{ color }}>
          {item.name}
        </span>
        <span
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/60",
            mirrored && "md:flex-row-reverse",
          )}
        >
          <span>{SLOT_LABELS[slot]}</span>
          {item.itemLevel !== null && <span className="text-ink/80">ilvl {item.itemLevel}</span>}
          {item.enchantId !== null && <span className="text-[#1eff00]/80">Enchanted</span>}
          {item.gems.length > 0 && (
            <span className="flex gap-0.5">
              {item.gems.map((gem, index) => (
                <img
                  key={`${gem.itemId}-${index}`}
                  src={iconUrl(gem.icon, "small")}
                  alt={gem.name}
                  title={gem.name}
                  width={16}
                  height={16}
                  loading="lazy"
                  className="size-4 border"
                  style={{ borderColor: qualityColor(gem.quality) }}
                />
              ))}
            </span>
          )}
        </span>
      </span>
    </a>
  );
}
