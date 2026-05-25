#!/usr/bin/env node
// Wraps the official Foundry CLI to convert _source/<pack>/*.json into LevelDB packs/<pack>.
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = ["manifest-tulpa-spells", "manifest-tulpa-actors"];

function run(args) {
  const r = spawnSync("npx", ["-y", "@foundryvtt/foundryvtt-cli", ...args], { stdio: "inherit", cwd: ROOT, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const pack of PACKS) {
  const out = resolve(ROOT, "packs", pack);
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  // foundryvtt-cli signature: package pack --id <module> --type Module -n <pack> --in <src> --out <parent>
  // The CLI creates <out>/<pack>/ itself; plan's positional form omitted --id/--type entirely.
  run(["package", "pack", "-n", pack, "--id", "manifest-tulpa", "--type", "Module", "--in", `_source/${pack}`, "--out", "packs"]);
}

console.log("All packs built.");
