import type { ArmoryCharacter } from "@arenacraft/common";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { MatchHistory } from "@/components/armory/MatchHistory";
import { Paperdoll } from "@/components/armory/Paperdoll";
import { TalentTrees } from "@/components/armory/TalentTrees";
import { ClassIcon } from "@/components/ClassIcon";
import { PageHero } from "@/components/PageHero";
import { useArmoryCharacter } from "@/hooks/useArmory";
import { useWowheadTooltips } from "@/hooks/useWowheadTooltips";
import { pointSplit, specName, winRateOf } from "@/lib/armory";
import { CLASS_COLORS } from "@/lib/ladder";

export function ArmoryCharacterPage() {
  const { name = "" } = useParams();
  const state = useArmoryCharacter(name);
  useWowheadTooltips();

  if (state.status !== "ready") {
    return (
      <>
        <PageHero eyebrow="Armory" title={name} />
        <section className="grid gap-3 border-b-2 border-divider px-4 py-8">
          <p className="text-[15px] leading-[1.55] text-ink/70">
            {state.status === "loading"
              ? "Loading character…"
              : state.status === "notFound"
                ? "There is no character with this name on the realm."
                : `The armory is unavailable right now: ${state.message}`}
          </p>
          <Link to="/armory" className="text-sm font-bold text-label hover:underline">
            ← All characters
          </Link>
        </section>
      </>
    );
  }

  return <CharacterView key={state.character.name} character={state.character} />;
}

function CharacterView({ character }: { character: ArmoryCharacter }) {
  const color = CLASS_COLORS[character.class];
  const active = character.talentGroups.find((group) => group.active) ?? character.talentGroups[0];
  const spec = active === undefined ? null : specName(active);

  return (
    <>
      <PageHero eyebrow="Armory" title={character.name} titleStyle={{ color }}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold">
          <ClassIcon wowClass={character.class} className="size-7" />
          <span>
            Level {character.level} {character.race}
          </span>
          <span style={{ color }}>
            {spec === null ? "" : `${spec} `}
            {character.class}
          </span>
          {character.guild !== null && <span className="text-label">&lt;{character.guild}&gt;</span>}
        </p>
      </PageHero>

      <section className="grid grid-cols-2 gap-px border-b-2 border-divider bg-divider sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="SoloQ rating" value={character.soloq?.rating ?? "—"} accent />
        <Stat
          label="Ladder rank"
          value={
            character.soloq?.rank == null ? (
              "—"
            ) : (
              <Link to="/ladder" className="hover:underline">
                #{character.soloq.rank}
              </Link>
            )
          }
        />
        <Stat
          label="Season record"
          value={character.soloq === null ? "—" : `${character.soloq.wins}–${character.soloq.losses}`}
        />
        <Stat
          label="Win rate"
          value={character.soloq === null ? "—" : winRateOf(character.soloq.wins, character.soloq.losses)}
        />
        <Stat label="Item level" value={character.averageItemLevel?.toFixed(1) ?? "—"} />
        <Stat label="Talents" value={active === undefined ? "—" : pointSplit(active)} />
      </section>

      <Section title="Equipment" note="Hover an item for its tooltip with enchants and gems.">
        {character.equipment.length === 0 ? (
          <p className="px-4 py-8 text-[15px] text-ink/70">Nothing equipped.</p>
        ) : (
          <Paperdoll equipment={character.equipment} />
        )}
      </Section>

      <Section title="Talents">
        <TalentTrees groups={character.talentGroups} wowClass={character.class} />
      </Section>

      <Section title="Recent SoloQ matches" note="Watch any match in game with its .replay command.">
        <MatchHistory matches={character.matches} />
      </Section>
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="grid gap-0.5 bg-surface px-4 py-3">
      <span className="text-[11px] font-bold tracking-[0.08em] text-ink/60 uppercase">{label}</span>
      <span className={accent ? "text-2xl font-extrabold text-accent" : "text-2xl font-extrabold"}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="border-b-2 border-divider">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-divider px-4 py-3">
        <h2 className="text-[28px] leading-[1.55] font-extrabold">{title}</h2>
        {note !== undefined && <span className="ml-auto text-[13px] text-ink/60">{note}</span>}
      </div>
      {children}
    </section>
  );
}
