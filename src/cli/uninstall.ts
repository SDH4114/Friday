import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { RAYA_HOME } from "../config/paths.js";
import { RAYA_BACKUP_ROOT } from "../backup/store.js";
import { commandInvocation, pathSeparator, rayaLauncherNames } from "../platform.js";

export function isUninstallApproved(answer: string): boolean {
  return answer.trim() === "UNINSTALL";
}

function assertSafeRemovalTarget(path: string): void {
  const target = resolve(path);
  const home = resolve(homedir());
  if (target === home || target === resolve("/") || target.length < 5) {
    throw new Error(`Refusing unsafe uninstall target: ${target}`);
  }
}

function launcherCandidates(): string[] {
  const pathEntries = (process.env.PATH ?? "")
    .split(pathSeparator())
    .map((entry) => entry.trim().replace(/^"(.*)"$/u, "$1"))
    .filter(Boolean);
  const candidates = pathEntries.flatMap((entry) => rayaLauncherNames().map((name) => join(entry, name)));
  if (process.platform !== "win32") candidates.push(join(homedir(), ".local", "bin", "raya"));
  return [...new Set(candidates)];
}

function isWindowsNpmShim(candidate: string): boolean {
  if (process.platform !== "win32" || !["raya.cmd", "raya.ps1"].includes(basename(candidate).toLowerCase())) return false;
  try {
    const normalized = readFileSync(candidate, "utf8").replaceAll("\\", "/").toLowerCase();
    return normalized.includes("node_modules/@sdh4114/raya/dist/cli/index.js");
  } catch {
    return false;
  }
}

function removableLaunchers(): string[] {
  const executable = resolve(process.argv[1] ?? "");
  return launcherCandidates().filter((candidate) => {
    if (!existsSync(candidate)) return false;
    const stat = lstatSync(candidate);
    if (!stat.isSymbolicLink()) return stat.isFile() && isWindowsNpmShim(candidate);
    try {
      return realpathSync(candidate) === realpathSync(executable);
    } catch {
      return false;
    }
  });
}

function runNpmUninstall(): Promise<void> {
  return new Promise((resolveCommand, reject) => {
    const invocation = commandInvocation("npm", ["uninstall", "-g", "@sdh4114/raya"]);
    const child = spawn(invocation.command, invocation.args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolveCommand() : reject(new Error(`npm uninstall exited ${code ?? 1}`)));
  });
}

export interface UninstallResult {
  removed: string[];
  preserved: string[];
}

export async function uninstallRaya(options: { keepBackups?: boolean; skipPackage?: boolean } = {}): Promise<UninstallResult> {
  assertSafeRemovalTarget(RAYA_HOME);
  assertSafeRemovalTarget(RAYA_BACKUP_ROOT);
  const launchers = removableLaunchers();
  if (!options.skipPackage) await runNpmUninstall();

  const removed: string[] = [];
  for (const launcher of launchers) {
    rmSync(launcher, { force: true });
    removed.push(launcher);
  }
  if (existsSync(RAYA_HOME)) {
    rmSync(RAYA_HOME, { recursive: true, force: true });
    removed.push(RAYA_HOME);
  }
  if (!options.keepBackups && existsSync(RAYA_BACKUP_ROOT)) {
    rmSync(RAYA_BACKUP_ROOT, { recursive: true, force: true });
    removed.push(RAYA_BACKUP_ROOT);
  }
  return { removed, preserved: options.keepBackups ? [RAYA_BACKUP_ROOT] : [] };
}
