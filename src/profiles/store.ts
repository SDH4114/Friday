import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { join } from "node:path";
import { DEFAULT_SOUL } from "../character/catalog.js";
import {
  ensureRayaHome,
  RAYA_HOME,
  RAYA_MEMORY_PATH,
  RAYA_PROFILES_DIR,
  RAYA_SOUL_PATH
} from "../config/paths.js";
import { writePrivateFileAtomic } from "../storage/atomic-file.js";

export const DEFAULT_PROFILE = "default";
export const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type RayaProfilePaths = {
  directory: string;
  soul: string;
  agents: string;
  memory: string;
  sessions: string;
  metadata: string;
};

export type RayaProfile = {
  name: string;
  path: string;
  createdAt?: string;
  clonedFrom?: string;
  soulBytes: number;
  agentsBytes: number;
  memoryBytes: number;
};

type ProfileMetadata = {
  version: 1;
  name: string;
  createdAt: string;
  clonedFrom?: string;
  renamedFrom?: string;
};

function normalizeProfileName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!PROFILE_NAME_PATTERN.test(normalized)) {
    throw new Error("Profile name must start with a lowercase letter or number and contain only lowercase letters, numbers, hyphens, or underscores (maximum 32 characters).");
  }
  return normalized;
}

export function profilePaths(name: string): RayaProfilePaths {
  const normalized = normalizeProfileName(name);
  const directory = join(RAYA_PROFILES_DIR, normalized);
  return {
    directory,
    soul: join(directory, "SOUL.md"),
    agents: join(directory, "AGENTS.md"),
    memory: join(directory, "MEMORY.md"),
    sessions: join(directory, "sessions"),
    metadata: join(directory, "profile.json")
  };
}

function readIfPresent(path: string, fallback = ""): string {
  return existsSync(path) ? readFileSync(path, "utf8") : fallback;
}

function writeProfileFile(path: string, content: string): void {
  writePrivateFileAtomic(path, content ? `${content.trimEnd()}\n` : "");
}

function seedProfile(
  name: string,
  content: { soul: string; agents: string; memory: string },
  clonedFrom?: string
): RayaProfilePaths {
  const paths = profilePaths(name);
  if (existsSync(paths.directory)) throw new Error(`Profile already exists: ${name}`);
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  try {
    writeProfileFile(paths.soul, content.soul);
    writeProfileFile(paths.agents, content.agents);
    writeProfileFile(paths.memory, content.memory);
    const metadata: ProfileMetadata = {
      version: 1,
      name,
      createdAt: new Date().toISOString(),
      ...(clonedFrom ? { clonedFrom } : {})
    };
    writePrivateFileAtomic(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
    return paths;
  } catch (error) {
    rmSync(paths.directory, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Create the managed default profile once and copy legacy root files into it.
 * The old files are preserved so migration is additive and recoverable.
 */
export function ensureDefaultProfile(): RayaProfilePaths {
  ensureRayaHome();
  mkdirSync(RAYA_PROFILES_DIR, { recursive: true, mode: 0o700 });
  const paths = profilePaths(DEFAULT_PROFILE);
  if (!existsSync(paths.directory)) {
    seedProfile(DEFAULT_PROFILE, {
      soul: readIfPresent(RAYA_SOUL_PATH, DEFAULT_SOUL),
      agents: readIfPresent(join(RAYA_HOME, "AGENTS.md")),
      memory: readIfPresent(RAYA_MEMORY_PATH)
    });
  }
  ensureProfileFiles(DEFAULT_PROFILE);
  return paths;
}

function ensureProfileFiles(name: string): RayaProfilePaths {
  const paths = profilePaths(name);
  if (!existsSync(paths.directory) || !lstatSync(paths.directory).isDirectory()) {
    throw new Error(`Profile does not exist: ${name}. Create it with: raya profile create ${name}`);
  }
  if (!existsSync(paths.soul)) writeProfileFile(paths.soul, DEFAULT_SOUL);
  if (!existsSync(paths.agents)) writeProfileFile(paths.agents, "");
  if (!existsSync(paths.memory)) writeProfileFile(paths.memory, "");
  if (!existsSync(paths.metadata)) {
    const metadata: ProfileMetadata = { version: 1, name, createdAt: new Date().toISOString() };
    writePrivateFileAtomic(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  return paths;
}

export function ensureProfile(name: string): RayaProfilePaths {
  const normalized = normalizeProfileName(name);
  ensureDefaultProfile();
  return ensureProfileFiles(normalized);
}

export function createProfile(
  name: string,
  options: { clone?: boolean; cloneAll?: boolean; cloneFrom?: string } = {}
): RayaProfilePaths {
  const normalized = normalizeProfileName(name);
  ensureDefaultProfile();
  if (normalized === DEFAULT_PROFILE) throw new Error("The default profile already exists.");
  if (options.clone && options.cloneAll) throw new Error("Use either --clone or --clone-all, not both.");
  const sourceName = normalizeProfileName(options.cloneFrom ?? DEFAULT_PROFILE);
  if (options.cloneFrom && !options.clone && !options.cloneAll) {
    throw new Error("--clone-from requires --clone or --clone-all.");
  }
  const source = options.clone || options.cloneAll ? ensureProfile(sourceName) : undefined;
  return seedProfile(normalized, {
    soul: source ? readIfPresent(source.soul, DEFAULT_SOUL) : DEFAULT_SOUL,
    agents: source ? readIfPresent(source.agents) : "",
    memory: options.cloneAll && source ? readIfPresent(source.memory) : ""
  }, source ? sourceName : undefined);
}

function fileSize(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

export function listProfiles(): RayaProfile[] {
  ensureDefaultProfile();
  return readdirSync(RAYA_PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && PROFILE_NAME_PATTERN.test(entry.name))
    .map((entry) => {
      const paths = ensureProfileFiles(entry.name);
      let metadata: Partial<ProfileMetadata> = {};
      try { metadata = JSON.parse(readFileSync(paths.metadata, "utf8")) as Partial<ProfileMetadata>; }
      catch { /* Details remain optional when user-edited metadata is malformed. */ }
      return {
        name: entry.name,
        path: paths.directory,
        ...(typeof metadata.createdAt === "string" ? { createdAt: metadata.createdAt } : {}),
        ...(typeof metadata.clonedFrom === "string" ? { clonedFrom: metadata.clonedFrom } : {}),
        soulBytes: fileSize(paths.soul),
        agentsBytes: fileSize(paths.agents),
        memoryBytes: fileSize(paths.memory)
      };
    })
    .sort((a, b) => a.name === DEFAULT_PROFILE ? -1 : b.name === DEFAULT_PROFILE ? 1 : a.name.localeCompare(b.name));
}

export function renameProfile(currentName: string, nextName: string): RayaProfilePaths {
  const current = normalizeProfileName(currentName);
  const next = normalizeProfileName(nextName);
  if (current === DEFAULT_PROFILE) throw new Error("The default profile cannot be renamed.");
  ensureProfile(current);
  const from = profilePaths(current);
  const to = profilePaths(next);
  if (existsSync(to.directory)) throw new Error(`Profile already exists: ${next}`);
  let previous: Partial<ProfileMetadata> = {};
  try { previous = JSON.parse(readFileSync(from.metadata, "utf8")) as Partial<ProfileMetadata>; }
  catch { /* Preserve the profile even when optional metadata was user-edited. */ }
  renameSync(from.directory, to.directory);
  const metadata: ProfileMetadata = {
    version: 1,
    name: next,
    createdAt: typeof previous.createdAt === "string" ? previous.createdAt : new Date().toISOString(),
    ...(typeof previous.clonedFrom === "string" ? { clonedFrom: previous.clonedFrom } : {}),
    renamedFrom: current
  };
  writePrivateFileAtomic(to.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  return to;
}

export function deleteProfile(name: string): void {
  const normalized = normalizeProfileName(name);
  if (normalized === DEFAULT_PROFILE) throw new Error("The default profile cannot be deleted.");
  const paths = ensureProfile(normalized);
  rmSync(paths.directory, { recursive: true, force: false });
}
