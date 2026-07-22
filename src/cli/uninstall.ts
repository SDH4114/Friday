import { spawn } from "node:child_process";
import { existsSync, lstatSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { RAYA_HOME } from "../config/paths.js";
import { RAYA_BACKUP_ROOT } from "../backup/store.js";

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
  const pathEntries = (process.env.PATH ?? "").split(":").filter(Boolean);
  return [...new Set([...pathEntries.map((entry) => join(entry, "raya")), join(homedir(), ".local", "bin", "raya")])];
}

function removableLaunchers(): string[] {
  const executable = resolve(process.argv[1] ?? "");
  return launcherCandidates().filter((candidate) => {
    if (!existsSync(candidate)) return false;
    const stat = lstatSync(candidate);
    if (!stat.isSymbolicLink()) return false;
    try {
      return realpathSync(candidate) === realpathSync(executable);
    } catch {
      return false;
    }
  });
}

function runNpmUninstall(): Promise<void> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn("npm", ["uninstall", "-g", "@sdh4114/raya"], { stdio: "inherit" });
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
