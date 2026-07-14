import { Type } from "@earendil-works/pi-ai";
import { listAvailableSkills } from "../skills/loader.js";
import type { RayaTool } from "../types/tool.js";

const Parameters = Type.Object({
  name: Type.String({ description: "Exact skill name from the Available skills section." })
});

export function createUseSkillTool(): RayaTool<typeof Parameters, { name: string; path: string }> {
  return {
    name: "use_skill",
    label: "Use skill",
    description: "Mark a relevant Raya skill as active and load its complete instructions before applying it.",
    parameters: Parameters,
    async execute(_toolCallId, params) {
      const skill = listAvailableSkills().find((item) => item.name === params.name);
      if (!skill) throw new Error(`Unknown skill: ${params.name}`);
      return {
        content: [{ type: "text", text: skill.content }],
        details: { name: skill.name, path: skill.path }
      };
    }
  };
}
