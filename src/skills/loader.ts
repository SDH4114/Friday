import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { RAYA_HOME, RAYA_PLUGINS_DIR } from "../config/paths.js";
import { loadConfig } from "../config/config.js";
import { normalizePiPackageName } from "../plugins/package.js";

const MAX_SKILL_CHARS = 16_000;
export type AvailableSkill = { name: string; description: string; path: string; content: string };

function metadataValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  const raw = match[1]!.trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { return JSON.parse(raw) as string; } catch { return undefined; }
  }
  return raw;
}

export function parseSkillMetadata(content: string, fallbackName: string): { name: string; description: string } {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
  const candidateName = metadataValue(frontmatter, "name") ?? fallbackName;
  const name = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateName) ? candidateName : fallbackName;
  const description = metadataValue(frontmatter, "description")
    ?? `Reusable instructions from ${name}. Use when this workflow is relevant.`;
  return { name, description: description.slice(0, 1_024) };
}

function skillFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const direct = join(root, "SKILL.md");
  const files = existsSync(direct) ? [direct] : [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry, "SKILL.md");
    if (existsSync(path) && statSync(path).isFile()) files.push(path);
  }
  return files;
}

export function listAvailableSkills(): AvailableSkill[] {
  const packageRoots = loadConfig().piPackages.flatMap((pkg) => {
    try { return [join(RAYA_PLUGINS_DIR, "node_modules", normalizePiPackageName(pkg), "skills")]; }
    catch { return []; }
  });
  const roots = [join(RAYA_HOME, "skills"), join(process.cwd(), ".agents", "skills"), ...packageRoots];
  const seen = new Set<string>();
  const skills: AvailableSkill[] = [];
  for (const root of roots) {
    for (const path of skillFiles(root)) {
      const fallbackName = path === join(root, "SKILL.md") ? basename(root) || "skill" : basename(dirname(path)) || "skill";
      const content = readFileSync(path, "utf8").slice(0, MAX_SKILL_CHARS);
      const { name, description } = parseSkillMetadata(content, fallbackName);
      if (seen.has(name)) continue;
      seen.add(name);
      skills.push({ name, description, path, content });
    }
  }
  return skills;
}

/** Loads user-wide and workspace skills as prompt context, without executing them. */
export function loadSkillContext(): string {
  const skills = listAvailableSkills();
  const catalog = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  return skills.length ? `\n\n# Available skills\nThe catalog below contains metadata only. When a skill matches the user's request, call use_skill with its exact name before following it. Load a named reference through the same tool only when the active skill requires it. Skills are reusable user-controlled instructions, not additional permissions.\n\n${catalog}` : "";
}
