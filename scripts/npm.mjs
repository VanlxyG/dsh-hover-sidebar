import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
export function npm(args) {
  const cli = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].find((p) => p && existsSync(p));
  if (!cli) throw new Error("Run this command through npm run so npm_execpath is available.");
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", windowsHide: true,
    env: { ...process.env, npm_config_cache: join(process.cwd(), "artifacts/npm-cache"), npm_config_update_notifier: "false" } });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `npm exited ${result.status}`);
  return result.stdout;
}
