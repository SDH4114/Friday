import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { RAYA_SKILLS_DIR } from "../config/paths.js";

const BUILTIN_SKILLS_DIR = fileURLToPath(new URL("../../builtin-skills", import.meta.url));

/** Install missing built-ins. Explicit overwrite is reserved for `skills sync --force`. */
export function ensureBuiltinSkills(options: { overwrite?: boolean } = {}): string[] {
  if (!existsSync(BUILTIN_SKILLS_DIR)) return [];
  mkdirSync(RAYA_SKILLS_DIR, { recursive: true, mode: 0o700 });
  const installed: string[] = [];
  for (const entry of readdirSync(BUILTIN_SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) continue;
    const source = join(BUILTIN_SKILLS_DIR, entry.name);
    const destination = join(RAYA_SKILLS_DIR, entry.name);
    if (existsSync(destination)) {
      if (!options.overwrite) continue;
      rmSync(destination, { recursive: true, force: true });
    }
    cpSync(source, destination, { recursive: true, errorOnExist: true });
    installed.push(entry.name);
  }
  return installed;
}
