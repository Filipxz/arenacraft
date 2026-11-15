# scripts

Development and operations helpers. Run them directly with Bun; each runnable name is a
symlink into `src/` and resolves its dependencies from `scripts/node_modules`.

```bash
cd scripts && bun install
```

## emit_fake_event

Publishes fake SoloQ events to Redis/Valkey so any listener (the Discord bot, custom tooling,
...) can be exercised without running the WoW core. It is standalone and does not import from
`apps/ac-bot`.

```bash
# full cycle (publish matchup, wait, publish ended)
bun run scripts/emit_fake_event --channel both --instance 42 \
  --team-a ALICE,BOB,CAROL --team-b DAVE,ERIN,FRANK

# move real Discord users into the rooms (IDs from Discord, no DB lookup)
bun run scripts/emit_fake_event --channel both --instance 42 \
  --team-a ALICE,BOB,CAROL --team-b DAVE,ERIN,FRANK \
  --team-a-ids 111111111111111111,222222222222222222,333333333333333333 \
  --team-b-ids 444444444444444444,555555555555555555,666666666666666666

# just a matchup
bun run scripts/emit_fake_event --channel matchup --instance 42

# just an end (test crash recovery / unknown instance)
bun run scripts/emit_fake_event --channel ended --instance 42
```

Options:

- `--channel matchup|ended|both` (default `both`)
- `--instance <id>` (default `9000`)
- `--delay <ms>` between the matchup and ended events (default `5000`)
- `--finished true|false`, `--winner teamA|teamB`
- `--team-a` / `--team-b` comma-separated account names
- `--team-a-ids` / `--team-b-ids` comma-separated Discord user IDs

Set `REDIS_URL` to target a non-default Redis/Valkey. Without `--team-a-ids` / `--team-b-ids`
a listener resolves the fake `accountId`s through `account_discord`; pass IDs for a purely fake
match with no DB accounts.

## gen_armory_data

Regenerates the client data the website armory needs
(`apps/site/packages/backend/src/features/armory/generated/armoryData.ts`): talent trees with talent
names and icons, socket enchantment -> gem item, and glyph ids -> glyph spells. It reads
`Talent`, `TalentTab`, `GemProperties`, `GlyphProperties`, `Spell` and `SpellIcon` from `data/dbc`
(`scripts/extract_assets`) and gem items from `data/sql/base/db_world/item_template.sql`.

```bash
bun scripts/gen_armory_data
```

Without extracted DBCs, `--wago <build>` reads the same tables from wago.tools (a Wrath Classic
build, same ids as 3.3.5) and spell names/icons from Wowhead's tooltip API:

```bash
bun scripts/gen_armory_data --wago 3.4.3.54261
```
## restore_local_backup

Loads a production volume bundle (the `.tar` written by the server-side
`arenacraft-backup`) into the local `docker compose` stack. The bundle holds a `manifest.txt`
and one `<volume>.tar.zst` per volume; this script maps those names onto the compose project's
volumes (`mysql-data`, `valkey_data`, `redis-insight`), stops the project's containers, replaces
the volume contents and starts the containers again.

```bash
# see what would happen
./scripts/restore_local_backup /tmp/arenacraft-volumes-20261115-101500.tar --dry-run

# restore the production DB/Valkey data into the local docker compose stack
./scripts/restore_local_backup /tmp/arenacraft-volumes-20261115-101500.tar
```

Mapping:

- volume names are matched against the `volumes:` block of `docker-compose.yml` by suffix, so
  `arenacraft_mysql-data` maps to `<project>_mysql-data`;
- volumes with no local counterpart (the server backup dumps *every* volume of the deploy user)
  are skipped with a notice; `--strict` makes that an error and `--volume <from>=<to>` maps one
  explicitly;
- ownership is inherited from the local volume before it is replaced, so restoring a prod
  backup into a local volume owned by uid 999 keeps it readable by the mysql/valkey images.
  `--owner <uid:gid>` overrides that.

Options: `--compose <file>`, `--project <name>`, `--only <volume>`, `--skip <volume>`,
`--no-stop`, `--no-restart`, `--strict`, `-n/--dry-run`, `-y/--yes`.

Only containers of the target compose project are stopped (all of them: the world/auth/api
services talk to the same database), and only the ones that were running are started again.
The script refuses to touch a volume that is also mounted by a container outside the project.

Requires `tar` and `zstd` (both in `nix develop`) plus a working `docker` CLI - real docker or
the podman `docker` shim both work. Volumes are unpacked through a throwaway container running
the helper image (`docker.io/library/mysql:8.0` by default, `--helper-image` to change). Each
archive is integrity-checked before any container is stopped or volume touched.
