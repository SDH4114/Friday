import type { RayaSession } from "../session/store.js";

/**
 * Future memory skills can inspect a completed session and selectively promote
 * durable facts. Raya deliberately ships no automatic extraction policy in v1.
 */
export interface MemorySkill {
  id: string;
  onSessionSaved(session: RayaSession): Promise<void> | void;
}

export const memorySkillHook: MemorySkill | undefined = undefined;
