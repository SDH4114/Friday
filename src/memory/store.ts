import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureRayaHome, RAYA_MEMORY_PATH, RAYA_USER_MEMORY_PATH } from "../config/paths.js";
import { writePrivateFileAtomic } from "../storage/atomic-file.js";

const LIMITS = { memory: 2200, user: 1375 } as const;
export type MemoryTarget = keyof typeof LIMITS;
const pathFor = (target: MemoryTarget) => target === "user" ? RAYA_USER_MEMORY_PATH : RAYA_MEMORY_PATH;
export function readMemory(target: MemoryTarget): string { const p = pathFor(target); return existsSync(p) ? readFileSync(p, "utf8").trim() : ""; }
export function memorySnapshot(): string {
  ensureRayaHome();
  for (const target of ["memory", "user"] as MemoryTarget[]) { const path=pathFor(target); if(!existsSync(path))writeFileSync(path,"",{mode:0o600}); }
  return (["memory", "user"] as MemoryTarget[]).map((target) => {
    const text = readMemory(target); return `## ${target === "user" ? "USER PROFILE" : "MEMORY"} (${text.length}/${LIMITS[target]})\n${text || "(empty)"}`;
  }).join("\n\n");
}
export function mutateMemory(action: "add"|"replace"|"remove", target: MemoryTarget, content?: string, oldText?: string): string {
  ensureRayaHome(); let current = readMemory(target); const entries = current ? current.split(/\n§\n/) : [];
  if ((action === "replace" || action === "remove") && !oldText?.trim()) throw new Error("old_text is required");
  if ((action === "add" || action === "replace") && !content?.trim()) throw new Error("content is required");
  if (content && /ignore previous|system prompt|api[_ -]?key|ssh-rsa/i.test(content)) throw new Error("Memory entry rejected by security scan.");
  if (action === "add") { if (!entries.includes(content!)) entries.push(content!); }
  else { const matches = entries.map((e,i)=>e.includes(oldText!)?i:-1).filter(i=>i>=0); if (matches.length !== 1) throw new Error(`old_text must match exactly one entry; matched ${matches.length}`); action === "remove" ? entries.splice(matches[0]!,1) : entries.splice(matches[0]!,1,content!); }
  current = entries.filter(Boolean).join("\n§\n"); if (current.length > LIMITS[target]) throw new Error(`Memory limit exceeded: ${current.length}/${LIMITS[target]}`);
  writePrivateFileAtomic(pathFor(target), `${current}\n`); return `${target}: ${current.length}/${LIMITS[target]}`;
}
