import { spawn } from "node:child_process";

export const GITHUB_PACKAGE_URL = "https://raw.githubusercontent.com/SDH4114/Raya-APPLE/prime/package.json";
export const GITHUB_INSTALLER_URL = "https://raw.githubusercontent.com/SDH4114/Raya-APPLE/prime/install.sh";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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

export async function readGithubVersion(fetchImpl: FetchLike = fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(GITHUB_PACKAGE_URL, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(`Could not reach GitHub to check for an update: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`GitHub returned ${response.status} while checking for an update.`);
  const payload: unknown = await response.json();
  const version = payload && typeof payload === "object" && "version" in payload ? (payload as { version?: unknown }).version : undefined;
  if (typeof version !== "string" || !parseVersion(version)) throw new Error("GitHub's Raya package metadata has no valid version.");
  return version;
}

export async function runGithubInstaller(fetchImpl: FetchLike = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(GITHUB_INSTALLER_URL, { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error(`Could not download the Raya installer: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`GitHub returned ${response.status} while downloading the installer.`);
  const script = await response.text();
  if (!script.startsWith("#!") || !script.includes("Raya")) throw new Error("Downloaded installer did not look like the official Raya installer.");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bash", ["-s"], { stdio: ["pipe", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Raya installer exited with code ${code ?? "unknown"}.`)));
    child.stdin.end(script);
  });
}
