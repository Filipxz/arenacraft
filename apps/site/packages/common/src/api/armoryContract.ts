import { array, InferOutput, is, maxLength, minLength, object, pipe, regex, string } from "valibot";
import { ArmoryCharacter, ArmoryCharacterSummary } from "../domain/armory";

// Character names are 2-12 letters (the core's ObjectMgr::CheckPlayerName); any case, the server
// normalizes it.
export const ArmoryCharacterName = pipe(
  string(),
  minLength(2),
  maxLength(12),
  regex(/^\p{L}+$/u),
);

/** True when `name` could be a character name; anything else cannot have an armory page. */
export function isArmoryCharacterName(name: string): boolean {
  return is(ArmoryCharacterName, name);
}

export const ArmoryCharacterParams = object({ name: ArmoryCharacterName });
export type ArmoryCharacterParams = InferOutput<typeof ArmoryCharacterParams>;

// Best SoloQ rating first, then characters without SoloQ games by name.
export const ArmoryCharactersResponse = array(ArmoryCharacterSummary);
export type ArmoryCharactersResponse = InferOutput<typeof ArmoryCharactersResponse>;

export const armoryContract = {
  list: {
    method: "GET",
    path: "/armory/characters",
    response: ArmoryCharactersResponse,
  },
  character: {
    method: "GET",
    path: "/armory/characters/:name",
    params: ArmoryCharacterParams,
    response: ArmoryCharacter,
  },
} as const;
