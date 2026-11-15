#!/usr/bin/env bun
/**
 * restore_local_backup - load a production volume bundle into the local stack.
 *
 * The bundle is what `arenacraft-backup` writes on the server: an outer .tar
 * holding `manifest.txt` plus one `<volume>.tar.zst` (podman volume export)
 * per volume. This script maps the production volume names onto the local
 * compose project's volumes, stops the project's containers, replaces each
 * volume's contents and starts the containers again.
 *
 * Unrelated volumes in the bundle (the server backup dumps every podman volume
 * of the deploy user) are skipped unless they clearly map onto a local volume.
 *
 * Usage:
 *   ./scripts/restore_local_backup /tmp/arenacraft-volumes-20261115-101500.tar
 *   ./scripts/restore_local_backup bundle.tar --dry-run
 *   ./scripts/restore_local_backup bundle.tar --volume arenacraft_mysql-data=arenacraft_mysql-data
 *
 * Requires `tar`, `zstd` (both in the nix dev shell) and `docker` (real docker
 * or the podman `docker` shim used on this box: `docker compose` there is
 * podman-compose). Volumes are replaced through a throwaway container running
 * the helper image (mysql:8.0 by default), so no root storage access is needed.
 */
import { Command } from "commander";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { repoRoot } from "./lib/repo.ts";
import { confirmDestructive } from "./lib/safety.ts";

const DEFAULT_HELPER_IMAGE = "docker.io/library/mysql:8.0";
const HEALTH_TIMEOUT_MS = 180_000;

interface Manifest {
  timestamp?: string;
  hostname?: string;
  nixos?: string;
  volumes: string[];
}

interface ContainerInfo {
  name: string;
  state: string;
  service: string;
  image: string;
  /** named volumes mounted into the container */
  volumes: string[];
}

interface ArchiveMember {
  volume: string;
  /** raw tar member name, e.g. "./arenacraft_mysql-data.tar.zst" */
  member: string;
}

interface VolumePlan {
  archive: string;
  member: string;
  target: string;
  helperImage: string;
  existed: boolean;
  entries: number;
  currentOwner?: string;
  /** uid:gid applied after extraction; undefined keeps the archive's owners */
  owner?: string;
}

interface Options {
  compose: string;
  project?: string;
  volume: string[];
  only: string[];
  skip: string[];
  owner?: string;
  helperImage: string;
  stop: boolean;
  restart: boolean;
  strict: boolean;
  dryRun: boolean;
  yes: boolean;
}

interface ExecResult {
  code: number;
  out: string;
  err: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function shellJoin(cmd: string[]): string {
  return cmd
    .map((arg) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`))
    .join(" ");
}

async function exec(cmd: string[], opts: { quiet?: boolean } = {}): Promise<ExecResult> {
  const proc = Bun.spawn({ cmd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (code !== 0 && !opts.quiet) {
    const detail = (err.trim() || out.trim()).split("\n").slice(-5).join("\n");
    throw new Error(`${shellJoin(cmd)} failed (exit ${code})${detail ? `\n${detail}` : ""}`);
  }

  return { code, out, err };
}

interface PipelineStage {
  exited: Promise<number>;
  stdout?: ReadableStream<Uint8Array>;
}

/** Runs cmd1 | cmd2 | ... and returns the last stage's stdout. */
async function pipeline(stages: string[][]): Promise<string> {
  const procs: PipelineStage[] = [];

  for (let i = 0; i < stages.length; i++) {
    const proc = Bun.spawn({
      cmd: stages[i]!,
      stdin: i === 0 ? "ignore" : procs[i - 1]!.stdout!,
      stdout: "pipe",
      stderr: "inherit",
    });
    procs.push(proc as unknown as PipelineStage);
  }

  const last = procs[procs.length - 1]!;
  const output = new Response(last.stdout!).text();
  const codes = await Promise.all(procs.map((proc) => proc.exited));
  const out = await output;

  // A failing upstream stage can surface as SIGPIPE (141) in the others, so
  // report the furthest downstream non-zero exit: that is the real failure.
  for (let i = codes.length - 1; i >= 0; i--) {
    if (codes[i] !== 0) {
      throw new Error(`${shellJoin(stages[i]!)} failed (exit ${codes[i]})`);
    }
  }

  return out;
}

function normalizeMember(name: string): string {
  return name.replace(/^(\.\/)+/, "");
}

function parseManifest(text: string): Manifest {
  const manifest: Manifest = { volumes: [] };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (key === "volume") manifest.volumes.push(value);
    else if (key === "timestamp" || key === "hostname" || key === "nixos") manifest[key] = value;
  }

  return manifest;
}

/** Reads the volume keys from the top-level `volumes:` block of a compose file. */
async function readComposeVolumeKeys(path: string): Promise<string[]> {
  const lines = (await Bun.file(path).text()).split("\n");
  const keys: string[] = [];
  let inVolumes = false;

  for (const line of lines) {
    if (!inVolumes) {
      if (/^volumes:\s*(#.*)?$/.test(line)) inVolumes = true;
      continue;
    }

    if (/^\s*(#.*)?$/.test(line)) continue;
    if (!/^\s/.test(line)) break; // next top-level key

    const match = /^\s{2}([A-Za-z0-9_.-]+):\s*(#.*)?$/.exec(line);
    if (match) keys.push(match[1]!);
  }

  return keys;
}

async function listProjectContainers(project: string): Promise<ContainerInfo[]> {
  const format = '{{.Names}}\t{{.State}}\t{{.Label "com.docker.compose.service"}}';
  const listing = await exec([
    "docker", "ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", format,
  ]);

  const containers: ContainerInfo[] = [];
  for (const line of listing.out.split("\n")) {
    if (!line.trim()) continue;

    const [name, state, service] = line.split("\t");
    if (!name) continue;

    const image = (
      await exec(["docker", "inspect", "--format", "{{.Config.Image}}", name], { quiet: true })
    ).out.trim();
    const mountsRaw = (
      await exec(["docker", "inspect", "--format", "{{json .Mounts}}", name], { quiet: true })
    ).out.trim();

    let volumes: string[] = [];
    try {
      const mounts = JSON.parse(mountsRaw) as Array<{ Type?: string; Name?: string }>;
      volumes = mounts.filter((mount) => mount.Type === "volume" && mount.Name).map((mount) => mount.Name!);
    } catch {
      // no mount info: treat as not owning any named volume
    }

    containers.push({ name, state: state ?? "", service: service ?? "", image, volumes });
  }

  return containers;
}

async function probeVolume(
  name: string,
  image: string,
): Promise<{ existed: boolean; entries: number; owner?: string }> {
  const exists = (await exec(["docker", "volume", "inspect", name], { quiet: true })).code === 0;
  if (!exists) return { existed: false, entries: 0 };

  const probe = await exec(
    ["docker", "run", "--rm", "--user", "0:0", "-v", `${name}:/target`, "--entrypoint", "sh", image, "-c",
      "ls -nd /target; ls -A /target | wc -l"],
    { quiet: true },
  );

  if (probe.code !== 0) return { existed: true, entries: 0 };

  const [ownerLine = "", countLine = "0"] = probe.out.split("\n");
  const fields = ownerLine.trim().split(/\s+/);
  const owner = fields.length >= 4 ? `${fields[2]}:${fields[3]}` : undefined;
  const entries = Number.parseInt(countLine.trim(), 10);

  return {
    existed: true,
    entries: Number.isFinite(entries) ? entries : 0,
    owner: entries > 0 ? owner : undefined,
  };
}

function buildImportScript(owner: string | undefined): string {
  const script = [
    "set -e",
    // clear the volume without removing it: containers may still reference it
    "rm -rf /target/* /target/.[!.]* /target/..?*",
    "tar -xpf - -C /target",
    '[ -n "$(ls -A /target)" ]',
  ];

  if (owner) script.push(`chown -R ${owner} /target`);
  script.push("ls -A /target | wc -l");

  return script.join("\n");
}

function healthStatus(name: string): Promise<string> {
  return exec(
    ["docker", "inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}", name],
    { quiet: true },
  ).then((result) => (result.code === 0 ? result.out.trim() : "none"));
}

/** Decompresses the archive once, without writing anything, to catch corruption. */
async function verifyArchive(bundle: string, member: string): Promise<void> {
  await pipeline([
    ["tar", "-xOf", bundle, member],
    ["zstd", "-tq"],
  ]);
}

async function waitHealthy(names: string[]): Promise<void> {
  if (names.length === 0) return;

  const pending = new Set(names);
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (pending.size > 0 && Date.now() < deadline) {
    for (const name of [...pending]) {
      const status = await healthStatus(name);
      if (status === "starting") continue;

      if (status === "unhealthy") console.warn(`warning: ${name} is unhealthy after the restore`);
      pending.delete(name);
    }

    if (pending.size > 0) await Bun.sleep(1000);
  }

  for (const name of pending) console.warn(`warning: ${name} is still starting; not waiting any longer`);
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("restore_local_backup")
    .description("Restore a production volume bundle (arenacraft-backup) into the local docker compose stack.")
    .argument("<bundle>", "backup bundle produced by arenacraft-backup (.tar)")
    .option("--compose <file>", "compose file to target", join(repoRoot, "docker-compose.yml"))
    .option("--project <name>", "compose project name (default: COMPOSE_PROJECT_NAME or the compose directory)")
    .option("-v, --volume <mapping>", "explicit <archive-volume>=<local-volume> mapping (repeatable)", collect, [])
    .option("--only <volume>", "restore only this archive volume (repeatable)", collect, [])
    .option("--skip <volume>", "skip this archive volume (repeatable)", collect, [])
    .option("--owner <uid:gid>", "force ownership of restored files (default: keep the local volume's owner)")
    .option("--helper-image <image>", "image used to unpack volumes", DEFAULT_HELPER_IMAGE)
    .option("--no-stop", "do not stop local containers (refuses if one is running)")
    .option("--no-restart", "leave local containers stopped after the restore")
    .option("--strict", "fail when an archive volume has no local counterpart")
    .option("-n, --dry-run", "print the plan and exit")
    .option("-y, --yes", "skip the confirmation prompt")
    .parse(process.argv);

  const opts = program.opts<Options>();
  const bundleArg = program.args[0];
  if (!bundleArg) fail(`usage: restore_local_backup <bundle.tar> [options]`);

  const bundle = resolve(bundleArg);
  const composeFile = resolve(opts.compose);

  if (!existsSync(bundle)) fail(`bundle not found: ${bundle}`);
  if (!existsSync(composeFile)) fail(`compose file not found: ${composeFile}`);

  for (const tool of ["tar", "zstd", "docker"]) {
    if (!Bun.which(tool)) fail(`${tool} not found in PATH${tool === "zstd" ? " (nix develop provides it)" : ""}`);
  }

  if (opts.owner !== undefined && !/^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/.test(opts.owner)) {
    fail(`invalid --owner "${opts.owner}" (expected uid:gid)`);
  }

  const project =
    opts.project ??
    process.env.COMPOSE_PROJECT_NAME ??
    basename(dirname(composeFile))
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) {
    fail(`invalid compose project name "${project}" (use --project)`);
  }

  // ---- inspect the bundle -------------------------------------------------

  const rawListing = (await exec(["tar", "-tf", bundle])).out.split("\n").filter((line) => line.trim().length > 0);
  const members = new Map<string, string>();
  for (const raw of rawListing) {
    const normalized = normalizeMember(raw);
    if (normalized && !members.has(normalized)) members.set(normalized, raw);
  }

  const manifestMember = members.get("manifest.txt");
  if (!manifestMember) fail("bundle has no manifest.txt - this does not look like an arenacraft-backup bundle");

  const manifest = parseManifest((await exec(["tar", "-xOf", bundle, manifestMember])).out);

  const archives: ArchiveMember[] = [];
  for (const [normalized, raw] of members) {
    const match = /^([A-Za-z0-9_.-]+)\.tar\.zst$/.exec(normalized);
    if (!match) continue;

    const volume = match[1]!;
    if (!/^[A-Za-z0-9_.-]+$/.test(volume)) continue;
    archives.push({ volume, member: raw });
  }

  if (archives.length === 0) fail("bundle contains no <volume>.tar.zst archives");
  archives.sort((a, b) => a.volume.localeCompare(b.volume));

  const archiveNames = new Set(archives.map((archive) => archive.volume));
  const missingArchives = manifest.volumes.filter((volume) => !archiveNames.has(volume));
  if (missingArchives.length > 0) {
    console.warn(`warning: manifest lists volumes without an archive: ${missingArchives.join(", ")}`);
  }

  // ---- map archive volumes onto local volumes -----------------------------

  const localVolumes = new Set(
    (await exec(["docker", "volume", "ls", "--format", "{{.Name}}"])).out.split("\n").filter((name) => name.length > 0),
  );

  const overrides = new Map<string, string>();
  for (const entry of opts.volume) {
    const separator = entry.indexOf("=");
    if (separator <= 0 || separator === entry.length - 1) {
      fail(`invalid --volume mapping "${entry}" (expected <archive-volume>=<local-volume>)`);
    }
    overrides.set(entry.slice(0, separator), entry.slice(separator + 1));
  }

  const prefix = `${project}_`;
  const composeKeys = await readComposeVolumeKeys(composeFile);
  const localKeys = [...localVolumes]
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));
  // longest first so `valkey_data` wins over `data` if both were ever declared
  const candidateKeys = [...new Set([...composeKeys, ...localKeys])].sort((a, b) => b.length - a.length);

  const containers = await listProjectContainers(project);

  const resolveTarget = (volume: string): string | undefined => {
    const explicit = overrides.get(volume);
    if (explicit) return explicit;
    if (localVolumes.has(volume)) return volume;

    for (const key of candidateKeys) {
      if (volume === key || volume.endsWith(`_${key}`)) return `${prefix}${key}`;
    }

    return undefined;
  };

  const helperImageFor = (target: string): string =>
    containers.find((container) => container.image && container.volumes.includes(target))?.image ?? opts.helperImage;

  const plans: VolumePlan[] = [];
  const skipped: string[] = [];

  for (const archive of archives) {
    if (opts.only.length > 0 && !opts.only.includes(archive.volume)) {
      skipped.push(`${archive.volume} (not selected by --only)`);
      continue;
    }
    if (opts.skip.includes(archive.volume)) {
      skipped.push(`${archive.volume} (--skip)`);
      continue;
    }

    const target = resolveTarget(archive.volume);
    if (!target) {
      if (opts.strict) {
        fail(
          `no local counterpart for archive volume "${archive.volume}"\n` +
            `map it with --volume ${archive.volume}=<local-volume>`,
        );
      }
      skipped.push(`${archive.volume} (no local counterpart)`);
      continue;
    }

    if (!/^[A-Za-z0-9_.-]+$/.test(target)) fail(`refusing unsafe local volume name: ${target}`);

    plans.push({
      archive: archive.volume,
      member: archive.member,
      target,
      helperImage: helperImageFor(target),
      existed: false,
      entries: 0,
    });
  }

  if (plans.length === 0) fail("nothing to restore (check --only/--skip and the local volume names)");

  for (const plan of plans) {
    const probe = await probeVolume(plan.target, plan.helperImage);
    plan.existed = probe.existed;
    plan.entries = probe.entries;
    plan.currentOwner = probe.owner;
    plan.owner = opts.owner ?? probe.owner;
  }

  const targetVolumes = new Set(plans.map((plan) => plan.target));
  for (const plan of plans) {
    const users = (
      await exec(["docker", "ps", "-a", "--filter", `volume=${plan.target}`, "--format", "{{.Names}}"])
    ).out
      .split("\n")
      .filter((name) => name.length > 0);
    const foreign = users.filter((name) => !containers.some((container) => container.name === name));
    if (foreign.length > 0) {
      fail(`volume ${plan.target} is also used by container(s) outside project "${project}": ${foreign.join(", ")}`);
    }
  }

  const running = containers.filter((container) => container.state === "running");
  const runningOwners = running.filter((container) => container.volumes.some((volume) => targetVolumes.has(volume)));

  if (!opts.stop && runningOwners.length > 0) {
    fail(
      `refusing to restore while ${runningOwners.map((container) => container.name).join(", ")} is running\n` +
        `omit --no-stop to let the script stop and restart the project's containers`,
    );
  }

  const stopped = running.map((container) => container.name);
  const ownerNames = new Set(runningOwners.map((container) => container.name));

  // ---- plan + confirmation ------------------------------------------------

  console.log(`bundle:   ${bundle}`);
  if (manifest.timestamp) console.log(`created:  ${manifest.timestamp}`);
  if (manifest.hostname) console.log(`host:     ${manifest.hostname}`);
  if (manifest.nixos) console.log(`nixos:    ${manifest.nixos}`);
  console.log(`project:  ${project} (${composeFile})`);
  console.log("");
  console.log("volumes:");

  for (const plan of plans) {
    const state = plan.existed
      ? `existing, ${plan.entries} entries, owner ${plan.currentOwner ?? "unknown"}`
      : "new volume";
    console.log(`  ${plan.archive} -> ${plan.target} (${state})`);
    console.log(`    owner after restore: ${plan.owner ?? "kept from the archive"}`);
  }

  for (const entry of skipped) console.log(`  skipping ${entry}`);

  console.log("");
  if (!opts.stop) console.log("stop:     none (--no-stop)");
  else if (stopped.length === 0) console.log("stop:     none (no project containers running)");
  else console.log(`stop:     ${stopped.join(", ")}`);
  if (!opts.restart) console.log("restart:  none (--no-restart)");
  else if (stopped.length === 0) console.log("restart:  none (nothing was stopped)");
  else console.log(`restart:  ${stopped.join(", ")}`);

  if (opts.dryRun) {
    console.log("\ndry run: nothing changed");
    return;
  }

  const decision = await confirmDestructive({
    action: `replace ${plans.length} local volume(s) in project "${project}" with`,
    target: bundle,
    yes: opts.yes,
  });
  if (decision === "dry-run") return;

  // ---- restore ------------------------------------------------------------

  let restarting = false;
  let didStop = false;

  const restartContainers = async (): Promise<void> => {
    if (restarting || !opts.restart || !didStop || stopped.length === 0) return;
    restarting = true;

    const first = stopped.filter((name) => ownerNames.has(name));
    const rest = stopped.filter((name) => !ownerNames.has(name));

    try {
      if (first.length > 0) {
        await exec(["docker", "start", ...first]);
        await waitHealthy(first);
      }
      if (rest.length > 0) await exec(["docker", "start", ...rest]);

      if (stopped.length > 0) console.log(`started:  ${stopped.join(", ")}`);
    } catch (error) {
      console.error(`failed to restart containers: ${(error as Error).message}`);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void restartContainers().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
    });
  }

  try {
    for (const plan of plans) {
      console.log(`verifying ${plan.archive}...`);
      await verifyArchive(bundle, plan.member);
    }

    if (opts.stop && stopped.length > 0) {
      console.log(`\nstopping ${stopped.length} container(s)...`);
      didStop = true;
      await exec(["docker", "stop", ...stopped]);
    } else if (stopped.length > 0) {
      console.log("\nwarning: containers are still running (--no-stop)");
    }

    for (const plan of plans) {
      console.log(`restoring ${plan.archive} -> ${plan.target}${plan.owner ? ` (owner ${plan.owner})` : ""}`);

      if (!plan.existed) await exec(["docker", "volume", "create", plan.target]);

      const entries = (
        await pipeline([
          ["tar", "-xOf", bundle, plan.member],
          ["zstd", "-dcq"],
          [
            "docker", "run", "--rm", "-i", "--user", "0:0", "-v", `${plan.target}:/target`,
            "--entrypoint", "sh", plan.helperImage, "-c", buildImportScript(plan.owner),
          ],
        ])
      ).trim();

      console.log(`  ${entries} top-level entries`);
    }
  } finally {
    await restartContainers();
  }

  console.log(`\nrestored ${plans.length} volume(s) from ${bundle}`);
}

await main().catch((error: unknown) => {
  fail(`\n${error instanceof Error ? error.message : String(error)}`);
});
