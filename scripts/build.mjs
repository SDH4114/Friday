import { chmodSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync("dist", { recursive: true, force: true });

const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

if (process.platform !== "win32") chmodSync("dist/cli/index.js", 0o755);
