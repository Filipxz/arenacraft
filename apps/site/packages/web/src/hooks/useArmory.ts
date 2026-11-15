import {
  isArmoryCharacterName,
  type ArmoryCharacter,
  type ArmoryCharacterSummary,
} from "@arenacraft/common";
import { useEffect, useState } from "react";
import { armoryApi } from "@/lib/apis";
import { isNotFoundError } from "@/lib/playerOverlay";

export type ArmoryListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; characters: ArmoryCharacterSummary[] };

export type ArmoryCharacterState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; character: ArmoryCharacter };

export function useArmoryCharacters(): ArmoryListState {
  const [state, setState] = useState<ArmoryListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    armoryApi.list().then(
      (characters) => {
        if (!cancelled) setState({ status: "ready", characters });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", message: messageOf(error, "the armory") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function useArmoryCharacter(name: string): ArmoryCharacterState {
  const [state, setState] = useState<ArmoryCharacterState>({ status: "loading" });

  useEffect(() => {
    // A name that cannot exist needs no request.
    if (!isArmoryCharacterName(name)) {
      setState({ status: "notFound" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    armoryApi.character({ params: { name } }).then(
      (character) => {
        if (!cancelled) setState({ status: "ready", character });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (isNotFoundError(error)) setState({ status: "notFound" });
        else setState({ status: "error", message: messageOf(error, "this character") });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [name]);

  return state;
}

function messageOf(error: unknown, what: string): string {
  return error instanceof Error ? error.message : `Failed to load ${what}`;
}
