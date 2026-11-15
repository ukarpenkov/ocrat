import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const root = process.cwd();

export function readConfig() {
  return JSON.parse(fs.readFileSync(path.join(root, "neutralino.config.json"), "utf8"));
}

export function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function firstExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}
