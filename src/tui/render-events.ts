import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { stdout as output } from "node:process";
import { color, theme } from "./theme.js";

function textFromToolResult(result: unknown): string {
  const maybe = result as Partial<ToolResultMessage>;
  const first = maybe.content?.[0];
  return first?.type === "text" ? first.text : JSON.stringify(result);
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

export function renderAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case "turn_start":
      output.write(color("\nRaya ", theme.cyan));
      break;

    case "message_update": {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        output.write(update.delta);
      }
      break;
    }

    case "message_end": {
      const message = event.message as AssistantMessage;
      if (message.role === "assistant" && !assistantText(message)) {
        output.write("\n");
      } else {
        output.write("\n");
      }
      break;
    }

    case "tool_execution_start": {
      const args = truncateToWidth(JSON.stringify(event.args), 120);
      console.log(color(`\ntool ${event.toolName}`, theme.yellow), color(args, theme.gray));
      break;
    }

    case "tool_execution_end": {
      const status = event.isError ? color("error", theme.red) : color("ok", theme.green);
      const text = truncateToWidth(textFromToolResult(event.result).replace(/\s+/g, " "), 180);
      console.log(`${color("tool result", theme.yellow)} ${status} ${color(text, theme.gray)}`);
      break;
    }

    default:
      break;
  }
}
