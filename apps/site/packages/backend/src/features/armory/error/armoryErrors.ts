import { HttpStatusCodes } from "@arenacraft/common";
import { HttpError } from "@/lib/HttpErrorMetadata";

@HttpError({ status: HttpStatusCodes.NOT_FOUND })
export class ArmoryCharacterNotFoundError extends Error {
  constructor() {
    super("No character with this name.");
  }
}
