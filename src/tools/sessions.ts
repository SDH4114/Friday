import { Type } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { findSession, listSessions, type RayaSession } from "../session/store.js";
import type { RayaTool } from "../types/tool.js";

const Parameters = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("search"), Type.Literal("read")]),
  id: Type.Optional(Type.String({ description: "Session id or exact name for read." })),
  query: Type.Optional(Type.String({ description: "Text to search for across previous sessions." })),
  limit: Type.Optional(Type.Number({ description: "Maximum results, from 1 to 20." }))
});

function contentText(message: AgentMessage): string {
  const item = message as { role?: string; content?: Array<{ type?: string; text?: string; name?: string }> };
  return (item.content ?? []).map((content) => {
    if (content.type === "text") return content.text ?? "";
    if (content.type === "toolCall") return `[tool: ${content.name ?? "unknown"}]`;
    return "";
  }).filter(Boolean).join("\n");
}

function sessionSummary(session: RayaSession): string {
  return `${session.id}\t${session.name}\t${new Date(session.updatedAt).toISOString()}\t${session.messages.length} messages`;
}

function sessionTranscript(session: RayaSession): string {
  const messages = session.messages.map((message) => {
    const text = contentText(message).trim();
    return text ? `## ${message.role}\n${text}` : "";
  }).filter(Boolean).join("\n\n");
  return `# ${session.name}\n\nid: ${session.id}\nupdated: ${new Date(session.updatedAt).toISOString()}\nmodel: ${session.config.provider}/${session.config.model}\n\n${messages}`.slice(0, 24_000);
}

export function createSessionsTool(profile = "default"): RayaTool<typeof Parameters, { action: string; count?: number; id?: string }> {
  return {
    name: "sessions",
    label: "Sessions",
    description: "Browse previous Raya conversations. List sessions, search their text, or read one transcript. This tool is read-only.",
    parameters: Parameters,
    async execute(_toolCallId, params) {
      if (params.action === "read") {
        if (!params.id) throw new Error("id is required for read");
        const session = findSession(params.id, process.cwd(), profile);
        if (!session) throw new Error(`Session not found: ${params.id}`);
        return { content: [{ type: "text", text: sessionTranscript(session) }], details: { action: "read", id: session.id } };
      }

      const sessions = listSessions(process.cwd(), profile);
      const limit = Math.max(1, Math.min(Math.floor(params.limit ?? 10), 20));
      if (params.action === "list") {
        const selected = sessions.slice(0, limit);
        return {
          content: [{ type: "text", text: selected.map(sessionSummary).join("\n") || "(no saved sessions)" }],
          details: { action: "list", count: selected.length }
        };
      }

      const query = params.query?.trim().toLowerCase();
      if (!query) throw new Error("query is required for search");
      const matches = sessions.filter((session) => {
        const text = `${session.name}\n${session.messages.map(contentText).join("\n")}`.toLowerCase();
        return text.includes(query);
      }).slice(0, limit);
      return {
        content: [{ type: "text", text: matches.map(sessionSummary).join("\n") || "(no matching sessions)" }],
        details: { action: "search", count: matches.length }
      };
    }
  };
}
