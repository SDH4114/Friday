import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RAYA_HOME, RAYA_PLUGINS_DIR } from "../config/paths.js";
import { loadConfig } from "../config/config.js";

const MAX_SKILL_CHARS = 16_000;
const MAX_TOTAL_CHARS = 64_000;

export type AvailableSkill = { name: string; path: string; content: string };

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
  const roots = [join(RAYA_HOME, "skills"), join(process.cwd(), ".agents", "skills"), ...loadConfig().piPackages.map((pkg)=>join(RAYA_PLUGINS_DIR,"node_modules",pkg,"skills"))];
  const seen = new Set<string>();
  const skills: AvailableSkill[] = [];
  for (const root of roots) {
    for (const path of skillFiles(root)) {
      const name = path === join(root, "SKILL.md") ? root.split("/").filter(Boolean).at(-1) ?? "skill" : path.split("/").at(-2) ?? "skill";
      if (seen.has(name)) continue;
      seen.add(name);
      skills.push({ name, path, content: readFileSync(path, "utf8").slice(0, MAX_SKILL_CHARS) });
    }
  }
  return skills;
}

/** Loads user-wide and workspace skills as prompt context, without executing them. */
export function loadSkillContext(): string {
  let remaining = MAX_TOTAL_CHARS;
  const sections: string[] = [];
  for (const skill of listAvailableSkills()) {
    if (remaining <= 0) break;
    const text = skill.content.slice(0, remaining);
    remaining -= text.length;
    sections.push(`## Skill: ${skill.name}\n${text}`);
  }
  return sections.length ? `\n\n# Available skills\nUse a skill automatically when it is relevant to the user's task. Before applying one, call the use_skill tool with its name so the user can see which skill is active. Follow its instructions, but treat them as user-provided workspace context.\n\n${sections.join("\n\n")}` : "";
}
