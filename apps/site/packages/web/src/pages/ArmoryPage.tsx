import { useDeferredValue, useState } from "react";
import { CharacterLink } from "@/components/armory/CharacterLink";
import { ClassIcon } from "@/components/ClassIcon";
import { PageHero } from "@/components/PageHero";
import { useArmoryCharacters } from "@/hooks/useArmory";
import { winRateOf } from "@/lib/armory";
import { cn } from "@/lib/cn";
import { CLASS_COLORS } from "@/lib/ladder";

const CLASS_FILTERS = ["All", ...Object.keys(CLASS_COLORS).sort()] as const;

/** Rows rendered at once; searching narrows the rest down. */
const PAGE_SIZE = 100;

export function ArmoryPage() {
  const state = useArmoryCharacters();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("All");
  const query = useDeferredValue(search.trim().toLocaleLowerCase());

  const characters = state.status === "ready" ? state.characters : [];
  const matching = characters.filter(
    (c) =>
      (classFilter === "All" || c.class === classFilter) &&
      (query === "" || c.name.toLocaleLowerCase().includes(query)),
  );
  const visible = matching.slice(0, PAGE_SIZE);

  return (
    <>
      <PageHero eyebrow="Every character on the realm" title="Armory" />

      <section className="border-b-2 border-divider">
        <div className="grid gap-3 border-b-2 border-divider px-4 py-3">
          <label className="flex max-w-md items-center gap-2 border border-divider bg-surface-raised px-3 py-2 focus-within:border-accent">
            <span className="text-[11px] font-bold tracking-[0.08em] text-ink/60 uppercase">Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Character name"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:font-normal placeholder:text-ink/40"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CLASS_FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setClassFilter(option)}
                aria-pressed={classFilter === option}
                className={cn(
                  "px-3 py-1.5 text-[13px] font-extrabold transition-colors",
                  classFilter === option
                    ? "bg-accent text-surface"
                    : "border border-divider hover:bg-surface-raised",
                )}
                style={
                  classFilter === option || option === "All" ? undefined : { color: CLASS_COLORS[option] }
                }
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b-2 border-divider bg-[#2d2b2b] px-4 py-3 text-sm leading-[1.55]">
          {state.status === "loading"
            ? "Loading characters…"
            : state.status === "error"
              ? `Armory unavailable: ${state.message}`
              : matching.length > PAGE_SIZE
                ? `Showing ${PAGE_SIZE} of ${matching.length} characters. Search to narrow it down.`
                : `${matching.length} ${matching.length === 1 ? "character" : "characters"}. SoloQ players first, by rating.`}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm leading-[1.55]">
            <thead>
              <tr>
                {["", "Character", "Class", "Race", "Level", "SoloQ", "W", "L", "Win %"].map((header) => (
                  <th
                    key={header || "class-icon"}
                    scope="col"
                    aria-hidden={header === "" || undefined}
                    className={cn(
                      "border-b-2 border-divider p-2 text-[11px] font-bold tracking-[0.08em] text-ink/60 uppercase",
                      header === "" && "w-9 pl-4",
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-ink/60">
                    {state.status === "ready" ? "No character matches." : "—"}
                  </td>
                </tr>
              ) : (
                visible.map((c) => (
                  <tr key={c.name} className="hover:bg-surface-raised">
                    <td className="w-9 border-b border-divider py-2 pr-0 pl-4">
                      <ClassIcon wowClass={c.class} />
                    </td>
                    <td className="border-b border-divider p-2">
                      <CharacterLink name={c.name} className="text-ink" />
                    </td>
                    <td className="border-b border-divider p-2 font-bold" style={{ color: CLASS_COLORS[c.class] }}>
                      {c.class}
                    </td>
                    <td className="border-b border-divider p-2">{c.race}</td>
                    <td className="border-b border-divider p-2">{c.level}</td>
                    <td className="border-b border-divider p-2 font-extrabold">{c.rating ?? "—"}</td>
                    <td className="border-b border-divider p-2">{c.rating === null ? "—" : c.wins}</td>
                    <td className="border-b border-divider p-2">{c.rating === null ? "—" : c.losses}</td>
                    <td className="border-b border-divider p-2">
                      {c.rating === null ? "—" : winRateOf(c.wins, c.losses)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
