import { ArmoryCharacterParams, armoryContract, HttpStatusCodes } from "@arenacraft/common";
import { inject, injectable } from "@needle-di/core";
import { Hono } from "hono";
import * as v from "valibot";
import { CONFIG, type Config } from "@/shared/Config";
import { ArmoryService } from "./ArmoryService";
import { ArmoryCharacterNotFoundError } from "./error/armoryErrors";

@injectable()
export class ArmoryApi {
  constructor(
    private readonly service: ArmoryService = inject(ArmoryService),
    private readonly config: Config = inject(CONFIG),
  ) {}

  build() {
    const router = new Hono();

    router.on(["GET", "HEAD"], armoryContract.list.path, async (c) => {
      const characters = await this.service.list();
      c.header("Cache-Control", `private, max-age=${this.config.cacheTtlSeconds}`);
      return c.json(characters, HttpStatusCodes.OK);
    });

    router.on(["GET", "HEAD"], armoryContract.character.path, async (c) => {
      // A name that cannot exist is the same answer as a name that does not.
      const params = v.safeParse(ArmoryCharacterParams, { name: c.req.param("name") });
      if (!params.success) throw new ArmoryCharacterNotFoundError();

      const character = await this.service.character(params.output.name);
      c.header("Cache-Control", `private, max-age=${this.config.cacheTtlSeconds}`);
      return c.json(character, HttpStatusCodes.OK);
    });

    return router;
  }
}
