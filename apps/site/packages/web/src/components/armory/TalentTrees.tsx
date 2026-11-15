import type { ArmoryGlyph, ArmoryTalent, ArmoryTalentGroup, ArmoryTalentTree } from "@arenacraft/common";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { iconUrl, pointSplit, specName, spellUrl, talentCalculatorUrl } from "@/lib/armory";

const TALENT_COLUMNS = 4;

/** Both specs of a character (dual spec), with the active one shown first. */
export function TalentTrees({
  groups,
  wowClass,
}: {
  groups: readonly ArmoryTalentGroup[];
  wowClass: string;
}) {
  const activeIndex = Math.max(
    0,
    groups.findIndex((group) => group.active),
  );
  const [selected, setSelected] = useState(activeIndex);
  const group = groups[selected] ?? groups[0];

  if (group === undefined) {
    return <p className="px-4 py-8 text-[15px] text-ink/70">No talent data for this character.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-divider px-4 py-3">
        {groups.length > 1 &&
          groups.map((option, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={selected === index}
              className={cn(
                "px-3.5 py-2 text-sm font-extrabold transition-colors",
                selected === index
                  ? "bg-accent text-surface"
                  : "border border-divider text-ink hover:bg-surface-raised",
              )}
            >
              {specName(option) ?? "Unspent"} ({pointSplit(option)})
              {option.active && <span className="ml-1.5 font-semibold opacity-75">· active</span>}
            </button>
          ))}
        {groups.length === 1 && (
          <span className="text-sm font-extrabold">
            {specName(group) ?? "Unspent"} ({pointSplit(group)})
          </span>
        )}
        <a
          href={talentCalculatorUrl(wowClass, group)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[13px] text-label hover:underline"
        >
          Open in Wowhead talent calculator ↗
        </a>
      </div>

      <div className="grid gap-px bg-divider lg:grid-cols-3">
        {group.trees.map((tree) => (
          <Tree key={tree.name} tree={tree} />
        ))}
      </div>

      {group.glyphs.length > 0 && <Glyphs glyphs={group.glyphs} />}
    </div>
  );
}

function Tree({ tree }: { tree: ArmoryTalentTree }) {
  const tiers = Math.max(0, ...tree.talents.map((talent) => talent.tier)) + 1;
  const cells = new Map(tree.talents.map((talent) => [`${talent.tier}:${talent.column}`, talent]));

  return (
    <div className="bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-extrabold">{tree.name}</h3>
        <span className={cn("text-sm font-extrabold", tree.points > 0 ? "text-accent" : "text-ink/40")}>
          {tree.points}
        </span>
      </div>
      <div
        className="mx-auto grid w-fit gap-2"
        style={{ gridTemplateColumns: `repeat(${TALENT_COLUMNS}, 2.5rem)` }}
      >
        {Array.from({ length: tiers * TALENT_COLUMNS }, (_, index) => {
          const talent = cells.get(`${Math.floor(index / TALENT_COLUMNS)}:${index % TALENT_COLUMNS}`);
          return talent === undefined ? (
            <span key={index} className="size-10" aria-hidden="true" />
          ) : (
            <TalentIcon key={index} talent={talent} />
          );
        })}
      </div>
    </div>
  );
}

function TalentIcon({ talent }: { talent: ArmoryTalent }) {
  const learned = talent.rank > 0;
  const maxed = talent.rank === talent.maxRank;

  return (
    <a
      href={spellUrl(talent.spellId)}
      target="_blank"
      rel="noreferrer"
      aria-label={`${talent.name} ${talent.rank}/${talent.maxRank}`}
      className="relative block size-10"
    >
      <img
        src={iconUrl(talent.icon, "medium")}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        className={cn(
          "size-10 border-2",
          learned ? (maxed ? "border-[#ffd100]" : "border-[#1eff00]") : "border-divider opacity-35 grayscale",
        )}
      />
      {learned && (
        <span
          className={cn(
            "absolute -right-1.5 -bottom-1.5 bg-surface px-1 text-[10px] leading-4 font-extrabold",
            maxed ? "text-[#ffd100]" : "text-[#1eff00]",
          )}
        >
          {talent.rank}/{talent.maxRank}
        </span>
      )}
    </a>
  );
}

function Glyphs({ glyphs }: { glyphs: readonly ArmoryGlyph[] }) {
  return (
    <div className="grid gap-px border-t-2 border-divider bg-divider sm:grid-cols-2">
      {(["major", "minor"] as const).map((kind) => (
        <div key={kind} className="bg-surface p-4">
          <h3 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-ink/60 uppercase">
            {kind} glyphs
          </h3>
          <ul className="grid gap-1.5">
            {glyphs
              .filter((glyph) => glyph.kind === kind)
              .map((glyph, index) => (
                <li key={`${glyph.spellId}-${index}`}>
                  <a
                    href={spellUrl(glyph.spellId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-bold hover:underline"
                  >
                    <img
                      src={iconUrl(glyph.icon, "small")}
                      alt=""
                      width={18}
                      height={18}
                      loading="lazy"
                      className="size-[18px]"
                    />
                    {glyph.name}
                  </a>
                </li>
              ))}
            {!glyphs.some((glyph) => glyph.kind === kind) && (
              <li className="text-sm text-ink/40">None</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
