import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { stdout as output } from "node:process";
import { color, theme } from "./theme.js";
import { beginToolActivity, collapseToolActivities, finishToolActivity, renderToolActivityPanel, startToolActivityRun } from "./tool-activity.js";
import { renderMarkdown } from "./markdown.js";

let streamedAssistantText = "";

function textFromToolResult(result: unknown): string {
  const maybe = result as Partial<ToolResultMessage>;
  const first = maybe.content?.[0];
  return first?.type === "text" ? first.text : JSON.stringify(result);
}

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === "string") return record[key] as string;
  return undefined;
}

function assistantText(message: AssistantMessage): string {
  return message.content.filter((item) => item.type === "text").map((item) => item.text).join("");
}

export function formatToolActivity(toolName: string, args: unknown): string {
  const target = firstString(args, ["path", "query", "url", "name", "skill", "command", "task"]);
  switch (toolName) {
    case "read_file": return `Raya is reading ${target ?? "a file"}`;
    case "write_file": return `Raya is editing ${target ?? "a file"}`;
    case "list_files": return `Raya is reading ${target ?? "the workspace"}`;
    case "web": return `Raya is searching ${target ?? "the web"}`;
    case "use_skill": return `Raya is using skill ${target ?? ""}`.trim();
    case "shell": return `Raya is running ${target ?? "a terminal command"}`;
    case "subagent": return `Raya is delegating ${target ?? "a task"}`;
    case "memory": {
      const target = firstString(args, ["target"]);
      const file = target === "user" ? "USER.md" : "MEMORY.md";
      return `Raya is memorizing this in ${file}`;
    }
    case "sessions": return `Raya is browsing ${target ?? "previous sessions"}`;
    default: return `Raya is using ${toolName.replaceAll("_", " ")}`;
  }
}

export function renderAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case "agent_start": {
      streamedAssistantText = "";
      startToolActivityRun();
      output.write(`\n${color("Raya", theme.cyan)}\n\n`);
      break;
    }

    case "message_update": {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        streamedAssistantText += update.delta;
      }
      break;
    }

    case "message_end": {
      const message = event.message as AssistantMessage;
      if (message.role === "assistant") {
        const text = assistantText(message) || streamedAssistantText;
        if (text.trim()) output.write(`${renderMarkdown(text)}\n\n`);
        streamedAssistantText = "";
      }
      break;
    }

    case "tool_execution_start": {
      const summary = formatToolActivity(event.toolName, event.args);
      beginToolActivity(event.toolCallId, summary, event.args);
      renderToolActivityPanel(output, (line) => color(line, theme.gray));
      break;
    }

    case "tool_execution_end": {
      const result = textFromToolResult(event.result).replace(/\s+/g, " ");
      finishToolActivity(event.toolCallId, result, event.isError);
      renderToolActivityPanel(output, (line) => color(line, theme.gray));
      if (event.isError) output.write(`${color("Raya action failed", theme.red)} ${color(result, theme.gray)}\n`);
      break;
    }

    case "agent_end": {
      collapseToolActivities();
      break;
    }

    default:
      break;
  }
}
