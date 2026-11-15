import type { ArmoryMatch, ArmoryMatchPlayer } from "@arenacraft/common";
import { CharacterLink } from "@/components/armory/CharacterLink";
import { cn } from "@/lib/cn";
import { formatDuration, timeAgo } from "@/lib/armory";

export function MatchHistory({ matches }: { matches: readonly ArmoryMatch[] }) {
  if (matches.length === 0) {
    return <p className="px-4 py-8 text-[15px] text-ink/70">No recorded SoloQ matches yet.</p>;
  }

  const now = Date.now();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm leading-[1.55]">
        <thead>
          <tr>
            {["Result", "Arena", "Team", "Opponents", "Length", "Played", "Replay"].map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b-2 border-divider p-2 text-[11px] font-bold tracking-[0.08em] text-ink/60 uppercase first:pl-4 last:pr-4"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.id}>
              <td className="border-b border-divider p-2 pl-4">
                <span
                  className={cn(
                    "inline-block w-12 py-0.5 text-center text-xs font-extrabold",
                    match.won ? "bg-[#1f5f2a] text-[#9dff9d]" : "bg-accent-deep text-label",
                  )}
                >
                  {match.won ? "Win" : "Loss"}
                </span>
              </td>
              <td className="border-b border-divider p-2">{match.map}</td>
              <td className="border-b border-divider p-2">
                <Players players={match.team} />
              </td>
              <td className="border-b border-divider p-2">
                <Players players={match.enemies} />
              </td>
              <td className="border-b border-divider p-2 tabular-nums">
                {formatDuration(match.durationSeconds)}
              </td>
              <td
                className="border-b border-divider p-2 whitespace-nowrap"
                title={new Date(match.playedAt).toLocaleString()}
              >
                {timeAgo(match.playedAt, now)}
              </td>
              <td className="border-b border-divider p-2 pr-4">
                <code
                  className="text-xs text-ink/60"
                  title="Type this in game to watch the replay"
                >
                  .replay {match.id}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Players({ players }: { players: readonly ArmoryMatchPlayer[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {players.map((player) => (
        <CharacterLink key={player.name} name={player.name} wowClass={player.class} withIcon />
      ))}
    </span>
  );
}
