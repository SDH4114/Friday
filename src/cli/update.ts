import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdateCheckpoint, type BackupListItem } from "../backup/store.js";

export const GITHUB_COMMIT_URL = "https://api.github.com/repos/SDH4114/Raya-APPLE/commits/prime";
export const GITHUB_RAW_URL = "https://raw.githubusercontent.com/SDH4114/Raya-APPLE";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type InstallerRunner = (script: string, environment: NodeJS.ProcessEnv) => Promise<void>;

export type GithubRelease = { commit: string; version: string };
export type InstallerKind = "powershell" | "shell";
export interface CheckedUpdateOptions {
  createCheckpoint?: (currentVersion: string, targetVersion: string) => Promise<BackupListItem>;
  install?: (commit: string) => Promise<void>;
  onCheckpoint?: (checkpoint: BackupListItem) => void;
}

function parseVersion(value: string): { core: number[]; prerelease: string[] } | undefined {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return undefined;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4]?.split(".") ?? [] };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("Raya update received an invalid version number.");
  for (let index = 0; index < a.core.length; index += 1) {
    const difference = a.core[index]! - b.core[index]!;
    if (difference) return Math.sign(difference);
  }
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const current = a.prerelease[index];
    const target = b.prerelease[index];
    if (current === undefined) return -1;
    if (target === undefined) return 1;
    if (current === target) continue;
    const currentNumber = /^\d+$/.test(current) ? Number(current) : undefined;
    const targetNumber = /^\d+$/.test(target) ? Number(target) : undefined;
    if (currentNumber !== undefined && targetNumber !== undefined) return Math.sign(currentNumber - targetNumber);
    if (currentNumber !== undefined) return -1;
    if (targetNumber !== undefined) return 1;
    return current.localeCompare(target);
  }
  return 0;
}

export function isUpdateApproved(answer: string): boolean {
  return ["y", "yes"].includes(answer.trim().toLowerCase());
}

async function fetchGithubJson(fetchImpl: FetchLike, url: string, message: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/vnd.github+json" } });
  } catch (error) {
    throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`GitHub returned ${response.status} while checking for an update.`);
  return response.json();
}

export async function readGithubRelease(fetchImpl: FetchLike = fetch): Promise<GithubRelease> {
  const commitPayload = await fetchGithubJson(fetchImpl, GITHUB_COMMIT_URL, "Could not reach GitHub to check for an update");
  const commit = commitPayload && typeof commitPayload === "object" && "sha" in commitPayload ? (commitPayload as { sha?: unknown }).sha : undefined;
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/i.test(commit)) throw new Error("GitHub's Raya branch has no valid commit reference.");
  const payload = await fetchGithubJson(fetchImpl, `${GITHUB_RAW_URL}/${commit}/package.json`, "Could not read Raya's package metadata from GitHub");
  const version = payload && typeof payload === "object" && "version" in payload ? (payload as { version?: unknown }).version : undefined;
  if (typeof version !== "string" || !parseVersion(version)) throw new Error("GitHub's Raya package metadata has no valid version.");
  return { commit, version };
}

export async function readGithubVersion(fetchImpl: FetchLike = fetch): Promise<string> {
  return (await readGithubRelease(fetchImpl)).version;
}

export function installerKind(targetPlatform: NodeJS.Platform = process.platform): InstallerKind {
  return targetPlatform === "win32" ? "powershell" : "shell";
}

export function installerPath(targetPlatform: NodeJS.Platform = process.platform): string {
  return installerKind(targetPlatform) === "powershell" ? "install.ps1" : "install.sh";
}

const runInstallerScript: InstallerRunner = (script, environment) => new Promise<void>((resolve, reject) => {
  const kind = installerKind();
  const child = spawn(
    kind === "powershell" ? "powershell.exe" : "bash",
    kind === "powershell"
      ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"]
      : ["-s"],
    {
    stdio: ["pipe", "inherit", "inherit"],
    env: environment
    }
  );
  child.once("error", reject);
  child.stdin.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Raya installer exited with code ${code ?? "unknown"}.`)));
  child.stdin.end(script);
});

export async function runGithubInstaller(
  commit: string,
  fetchImpl: FetchLike = fetch,
  runner: InstallerRunner = runInstallerScript
): Promise<void> {
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("Raya update received an invalid GitHub commit reference.");
  const path = installerPath();
  let response: Response;
  try {
    response = await fetchImpl(`${GITHUB_RAW_URL}/${commit}/${path}`, { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error(`Could not download the Raya installer: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`GitHub returned ${response.status} while downloading the installer.`);
  const script = await response.text();
  const looksOfficial = installerKind() === "powershell"
    ? script.includes("# Raya Windows installer")
    : script.startsWith("#!") && script.includes("Raya");
  if (!looksOfficial) throw new Error("Downloaded installer did not look like the official Raya installer.");

  // Even if a future installer accidentally initializes Raya, route all state
  // writes to a disposable RAYA_HOME. The user's real .raya is never exposed
  // to the installer process during an update.
  const isolatedStateRoot = mkdtempSync(join(tmpdir(), "raya-update-state-"));
  try {
    await runner(script, {
      ...process.env,
      RAYA_UPDATE_MODE: "1",
      RAYA_UPDATE_CHECKPOINT_CREATED: "1",
      RAYA_REPO_REF: commit,
      RAYA_HOME: join(isolatedStateRoot, "raya-home")
    });
  } finally {
    rmSync(isolatedStateRoot, { recursive: true, force: true });
  }
}

/**
 * Keep the recovery point and installation order in one tested invariant:
 * installation is unreachable until a complete checkpoint exists.
 */
export async function installGithubReleaseWithCheckpoint(
  currentVersion: string,
  release: GithubRelease,
  options: CheckedUpdateOptions = {}
): Promise<BackupListItem> {
  const checkpoint = await (options.createCheckpoint ?? createUpdateCheckpoint)(currentVersion, release.version);
  options.onCheckpoint?.(checkpoint);
  await (options.install ?? runGithubInstaller)(release.commit);
  return checkpoint;
}
