import type { RayaSession } from "../session/store.js";

/**
 * Optional memory extensions can inspect a completed session and perform extra
 * consolidation beyond Raya's built-in model-driven memory tool usage.
 */
export interface MemorySkill {
  id: string;
  onSessionSaved(session: RayaSession): Promise<void> | void;
}

export const memorySkillHook: MemorySkill | undefined = undefined;
