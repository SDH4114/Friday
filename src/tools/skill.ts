import { Type } from "@earendil-works/pi-ai";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { listAvailableSkills } from "../skills/loader.js";
import type { RayaTool } from "../types/tool.js";

const Parameters = Type.Object({
  name: Type.String({ description: "Exact skill name from the Available skills section." }),
  reference: Type.Optional(Type.String({ description: "Optional Markdown filename from this skill's references directory." }))
});

export function createUseSkillTool(): RayaTool<typeof Parameters, { name: string; path: string; reference?: string }> {
  return {
    name: "use_skill",
    label: "Use skill",
    description: "Mark a relevant Raya skill as active and load its complete instructions before applying it.",
    parameters: Parameters,
    async execute(_toolCallId, params) {
      const skill = listAvailableSkills().find((item) => item.name === params.name);
      if (!skill) throw new Error(`Unknown skill: ${params.name}`);
      if (params.reference) {
        if (basename(params.reference) !== params.reference || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(params.reference)) {
          throw new Error("Skill reference must be a plain Markdown filename.");
        }
        const referenceDirectory = join(dirname(skill.path), "references");
        if (existsSync(referenceDirectory) && lstatSync(referenceDirectory).isSymbolicLink()) {
          throw new Error("Skill references directory cannot be a symbolic link.");
        }
        const path = join(referenceDirectory, params.reference);
        if (!existsSync(path)) throw new Error(`Unknown reference for ${skill.name}: ${params.reference}`);
        if (lstatSync(path).isSymbolicLink()) throw new Error("Skill reference cannot be a symbolic link.");
        const content = readFileSync(path, "utf8").slice(0, 64_000);
        return {
          content: [{ type: "text", text: content }],
          details: { name: skill.name, path, reference: params.reference }
        };
      }
      return {
        content: [{ type: "text", text: skill.content }],
        details: { name: skill.name, path: skill.path }
      };
    }
  };
}
