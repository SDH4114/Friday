import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ensureRayaHome, RAYA_MEMORY_DIR, RAYA_SESSIONS_PATH } from "../config/paths.js";
import type { RayaConfig } from "../config/config.js";
import { memorySkillHook } from "../memory/skill.js";

export type RayaSession = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  config: RayaConfig;
  messages: AgentMessage[];
};

type SessionFile = {
  activeSessionId?: string;
  sessions: RayaSession[];
};

function readSessionFile(): SessionFile {
  ensureRayaHome();
  if (!existsSync(RAYA_SESSIONS_PATH)) {
    return { sessions: [] };
  }
  const file = JSON.parse(readFileSync(RAYA_SESSIONS_PATH, "utf8")) as SessionFile;
  // Migrate session snapshots written before the Edit mode was renamed Build.
  for (const session of file.sessions) {
    if ((session.config as { mode?: string }).mode === "edit") {
      session.config = { ...session.config, mode: "build" };
    }
  }
  return file;
}

function writeSessionFile(file: SessionFile): void {
  ensureRayaHome();
  writeFileSync(RAYA_SESSIONS_PATH, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

function markdownTranscript(session: RayaSession): string {
  const when = new Date(session.updatedAt).toISOString();
  const messages = session.messages.map((message) => `\n## ${message.role}\n\n\`\`\`json\n${JSON.stringify(message, null, 2)}\n\`\`\``).join("\n");
  return `# Raya session: ${session.name}\n\n- id: ${session.id}\n- created: ${new Date(session.createdAt).toISOString()}\n- updated: ${when}\n- model: ${session.config.provider}/${session.config.model}\n- mode: ${session.config.mode}\n${messages}\n`;
}

function persistReadableTranscript(session: RayaSession): void {
  const day = new Date(session.updatedAt).toISOString().slice(0, 10);
  const directory = `${RAYA_MEMORY_DIR}/sessions/${day}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(`${directory}/${session.id}.md`, markdownTranscript(session), { mode: 0o600 });
  void memorySkillHook?.onSessionSaved(session);
}

export function getOrCreateActiveSession(config: RayaConfig): RayaSession {
  const file = readSessionFile();
  const active = file.sessions.find((session) => session.id === file.activeSessionId);
  if (active) {
    return active;
  }

  const now = Date.now();
  const session: RayaSession = {
    id: randomUUID().slice(0, 8),
    name: "default",
    createdAt: now,
    updatedAt: now,
    config,
    messages: []
  };
  file.sessions.unshift(session);
  file.activeSessionId = session.id;
  writeSessionFile(file);
  persistReadableTranscript(session);
  return session;
}

export function listSessions(): RayaSession[] {
  return readSessionFile().sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSession(session: RayaSession): void {
  const file = readSessionFile();
  const next = { ...session, updatedAt: Date.now() };
  const index = file.sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    file.sessions[index] = next;
  } else {
    file.sessions.unshift(next);
  }
  file.activeSessionId = next.id;
  writeSessionFile(file);
  persistReadableTranscript(next);
}

export function createSession(config: RayaConfig, name?: string): RayaSession {
  const now = Date.now();
  const session: RayaSession = {
    id: randomUUID().slice(0, 8),
    name: name?.trim() || `session-${new Date(now).toISOString().slice(0, 10)}`,
    createdAt: now,
    updatedAt: now,
    config,
    messages: []
  };
  const file = readSessionFile();
  file.sessions.unshift(session);
  file.activeSessionId = session.id;
  writeSessionFile(file);
  persistReadableTranscript(session);
  return session;
}

export function switchSession(idOrName: string): RayaSession {
  const file = readSessionFile();
  const session = file.sessions.find((item) => item.id === idOrName || item.name === idOrName);
  if (!session) {
    throw new Error(`Session not found: ${idOrName}`);
  }
  file.activeSessionId = session.id;
  writeSessionFile(file);
  return session;
}
