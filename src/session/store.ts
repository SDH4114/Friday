import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureRayaHome, RAYA_MEMORY_DIR, RAYA_SESSIONS_PATH } from "../config/paths.js";
import { normalizeConfig, type RayaConfig } from "../config/config.js";
import { memorySkillHook } from "../memory/skill.js";
import { writePrivateFileAtomic } from "../storage/atomic-file.js";

export type RayaSession = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  config: RayaConfig;
  messages: AgentMessage[];
  workspace: string;
  autoNamed?: boolean;
};

type SessionFile = {
  activeSessionId?: string;
  sessions: RayaSession[];
};

const StoredSessionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().min(1).max(500),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  config: z.unknown(),
  messages: z.array(z.unknown()),
  workspace: z.string().min(1).optional(),
  autoNamed: z.boolean().optional()
});

const SessionFileSchema = z.object({
  activeSessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  sessions: z.array(StoredSessionSchema)
});

function normalizeWorkspace(workspace = process.cwd()): string {
  try { return realpathSync(workspace); }
  catch { return workspace; }
}

function readSessionFile(): SessionFile {
  ensureRayaHome();
  if (!existsSync(RAYA_SESSIONS_PATH)) {
    return { sessions: [] };
  }
  const parsed = SessionFileSchema.parse(JSON.parse(readFileSync(RAYA_SESSIONS_PATH, "utf8")));
  const migratedWorkspace = normalizeWorkspace();
  const migrated = parsed.sessions.some((session) => !session.workspace);
  const file: SessionFile = {
    ...(parsed.activeSessionId ? { activeSessionId: parsed.activeSessionId } : {}),
    sessions: parsed.sessions.map((session) => ({
      ...session,
      config: normalizeConfig(session.config),
      messages: session.messages as AgentMessage[],
      workspace: normalizeWorkspace(session.workspace ?? migratedWorkspace),
      autoNamed: session.autoNamed ?? true
    }))
  };
  if (migrated) writeSessionFile(file);
  return file;
}

function writeSessionFile(file: SessionFile): void {
  ensureRayaHome();
  writePrivateFileAtomic(RAYA_SESSIONS_PATH, `${JSON.stringify(file, null, 2)}\n`);
}

function markdownTranscript(session: RayaSession): string {
  const when = new Date(session.updatedAt).toISOString();
  const messages = session.messages.map((message) => `\n## ${message.role}\n\n\`\`\`json\n${JSON.stringify(message, null, 2)}\n\`\`\``).join("\n");
  return `# Raya session: ${session.name}\n\n- id: ${session.id}\n- workspace: ${session.workspace}\n- created: ${new Date(session.createdAt).toISOString()}\n- updated: ${when}\n- model: ${session.config.provider}/${session.config.model}\n- mode: ${session.config.mode}\n${messages}\n`;
}

function persistReadableTranscript(session: RayaSession): void {
  const day = new Date(session.updatedAt).toISOString().slice(0, 10);
  const directory = `${RAYA_MEMORY_DIR}/sessions/${day}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writePrivateFileAtomic(`${directory}/${session.id}.md`, markdownTranscript(session));
  void memorySkillHook?.onSessionSaved(session);
}

export function getOrCreateActiveSession(config: RayaConfig, workspace = process.cwd()): RayaSession {
  const file = readSessionFile();
  const normalized = normalizeWorkspace(workspace);
  const active = file.sessions.find((session) => session.id === file.activeSessionId && session.workspace === normalized);
  if (active) {
    return active;
  }

  return createSession(config, undefined, normalized);
}

export function listSessions(workspace = process.cwd()): RayaSession[] {
  const normalized = normalizeWorkspace(workspace);
  return readSessionFile().sessions.filter((session) => session.workspace === normalized).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findSession(idOrName: string, workspace = process.cwd()): RayaSession | undefined {
  const normalized = normalizeWorkspace(workspace);
  return readSessionFile().sessions.find((item) => item.workspace === normalized && (item.id === idOrName || item.name === idOrName));
}

function deleteReadableTranscripts(sessionId: string): void {
  const root = `${RAYA_MEMORY_DIR}/sessions`;
  if (!existsSync(root)) return;
  for (const day of readdirSync(root, { withFileTypes: true })) {
    if (!day.isDirectory()) continue;
    const transcript = `${root}/${day.name}/${sessionId}.md`;
    if (existsSync(transcript)) unlinkSync(transcript);
  }
}

export function deleteSession(idOrName: string, workspace = process.cwd()): RayaSession {
  const file = readSessionFile();
  const normalized = normalizeWorkspace(workspace);
  const index = file.sessions.findIndex((item) => item.workspace === normalized && (item.id === idOrName || item.name === idOrName));
  if (index < 0) throw new Error(`Session not found: ${idOrName}`);
  const [deleted] = file.sessions.splice(index, 1);
  if (!deleted) throw new Error(`Session not found: ${idOrName}`);
  if (file.activeSessionId === deleted.id) file.activeSessionId = file.sessions[0]?.id;
  writeSessionFile(file);
  deleteReadableTranscripts(deleted.id);
  return deleted;
}

export function saveSession(session: RayaSession): void {
  const file = readSessionFile();
  const index = file.sessions.findIndex((item) => item.id === session.id);
  if (!session.messages.length) {
    if (index >= 0) {
      file.sessions.splice(index, 1);
      if (file.activeSessionId === session.id) file.activeSessionId = file.sessions[0]?.id;
      writeSessionFile(file);
    }
    return;
  }
  const next = {
    ...session,
    name: session.autoNamed ? session.name : sessionNameFromFirstPrompt(session),
    autoNamed: true,
    updatedAt: Date.now()
  };
  session.name = next.name;
  session.autoNamed = true;
  session.updatedAt = next.updatedAt;
  if (index >= 0) {
    file.sessions[index] = next;
  } else {
    file.sessions.unshift(next);
  }
  file.activeSessionId = next.id;
  writeSessionFile(file);
  persistReadableTranscript(next);
}

export function createSession(config: RayaConfig, name?: string, workspace = process.cwd()): RayaSession {
  const now = Date.now();
  const session: RayaSession = {
    id: randomUUID().slice(0, 8),
    name: name?.trim() || "New session",
    createdAt: now,
    updatedAt: now,
    config,
    messages: [],
    workspace: normalizeWorkspace(workspace),
    autoNamed: Boolean(name?.trim())
  };
  return session;
}

function sessionNameFromFirstPrompt(session: RayaSession): string {
  const firstUser = session.messages.find((message) => message.role === "user") as { content?: Array<{ type?: string; text?: string }> } | undefined;
  const text = firstUser?.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join(" ") ?? "";
  const clean = text
    .replace(/[`*_>#\[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Raya conversation";
  const words = clean.split(" ").slice(0, 8).join(" ");
  const shortened = words.length > 56 ? `${words.slice(0, 53).trimEnd()}…` : words;
  return shortened.charAt(0).toUpperCase() + shortened.slice(1);
}

export function switchSession(idOrName: string, workspace = process.cwd()): RayaSession {
  const file = readSessionFile();
  const normalized = normalizeWorkspace(workspace);
  const session = file.sessions.find((item) => item.workspace === normalized && (item.id === idOrName || item.name === idOrName));
  if (!session) {
    throw new Error(`Session not found: ${idOrName}`);
  }
  file.activeSessionId = session.id;
  writeSessionFile(file);
  return session;
}
