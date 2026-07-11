import type { Agent } from "@earendil-works/pi-agent-core";
import { emitKeypressEvents } from "node:readline";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { color, theme } from "./theme.js";

/** Ask the local terminal user before an agent performs a consequential action. */
export async function requestTerminalApproval(action: string, details: string): Promise<void> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error("Build action requires an interactive terminal approval.");
  }
  let selected = 0;
  let rendered = false;
  const draw = (): void => {
    output.write(rendered ? "\x1b[3A\r\x1b[J" : "\r\x1b[J");
    output.write(`${color("Approval required", theme.yellow)}\n`);
    output.write(`${action}: ${details}\n`);
    output.write(`${selected === 0 ? color("› Accept", theme.green) : "  Accept"}    ${selected === 1 ? color("› Refuse", theme.red) : "  Refuse"}\n`);
    rendered = true;
  };

  return new Promise<void>((resolve, reject) => {
    const finish = (approved: boolean): void => {
      input.setRawMode(false);
      input.off("keypress", onKeypress);
      input.pause();
      output.write("\x1b[3A\r\x1b[J");
      approved ? resolve() : reject(new Error("Action refused by user."));
    };
    const onKeypress = (_text: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.name === "left" || key.name === "up") { selected = 0; draw(); return; }
      if (key.name === "right" || key.name === "down") { selected = 1; draw(); return; }
      if (key.name === "return" || key.name === "enter") { finish(selected === 0); return; }
      if (key.name === "escape" || (key.ctrl && key.name === "c")) { finish(false); }
    };
    input.on("keypress", onKeypress);
    input.setRawMode(true);
    input.resume();
    draw();
  });
}

export type TuiSessionInfo = {
  model: string;
  mode: string;
  directory: string;
  memory: string;
  session?: string;
};

export type SlashCommandContext = {
  agent: Agent;
  command: string;
};

export type TuiSessionSuggestion = {
  id: string;
  name: string;
  detail: string;
};

type CommandSuggestion = {
  value: string;
  description: string;
  needsArgument?: boolean;
};

const slashCommands: CommandSuggestion[] = [
  { value: "/help", description: "Show available commands" },
  { value: "/providers", description: "Show OpenAI Codex provider" },
  { value: "/login", description: "Login with OpenAI Codex OAuth" },
  { value: "/models", description: "List available models" },
  { value: "/model", description: "Switch the active model", needsArgument: true },
  { value: "/thinking", description: "Set reasoning level", needsArgument: true },
  { value: "/security", description: "Choose security mode", needsArgument: true },
  { value: "/sessions", description: "Create or open a saved session", needsArgument: true },
  { value: "/status", description: "Show current status" },
  { value: "/clear", description: "Clear this conversation" },
  { value: "/exit", description: "Exit Raya" }
];

function frameLine(value = ""): string {
  return `│  ${value.padEnd(43, " ")}│`;
}

function renderHeader(info: TuiSessionInfo): void {
  console.log("╭─────────────────────────────────────────────╮");
  console.log(frameLine("RAYA"));
  console.log(frameLine("Personal AI Operating System"));
  console.log("╰─────────────────────────────────────────────╯");
  console.log();
  console.log(`Model     : ${info.model}`);
  console.log(`Mode      : ${info.mode}`);
  console.log(`Directory : ${info.directory}`);
  console.log(`Memory    : ${info.memory}`);
  if (info.session) {
    console.log(`Session   : ${info.session}`);
  }
  console.log();
}

function activeCommandStart(value: string, cursor: number): number | undefined {
  if (cursor === 0) return undefined;
  const start = value.lastIndexOf("/", Math.max(cursor - 1, 0));
  if (start < 0 || start >= cursor || /\s/.test(value.slice(start, cursor))) return undefined;
  return start;
}

function commandSuggestions(
  value: string,
  cursor: number,
  sessionSuggestions: () => TuiSessionSuggestion[] = () => [],
  thinkingSuggestions: () => string[] = () => []
): CommandSuggestion[] {
  const sessionPrefix = "/sessions ";
  if ((value === "/sessions" && cursor === value.length) || (value.startsWith(sessionPrefix) && cursor >= sessionPrefix.length)) {
    const query = value === "/sessions" ? "" : value.slice(sessionPrefix.length, cursor).toLowerCase();
    const sessions = sessionSuggestions()
      .filter((session) => `${session.id} ${session.name}`.toLowerCase().includes(query))
      .slice(0, 8)
      .map((session) => ({ value: `/sessions open ${session.id}`, description: `${session.name} · ${session.detail}` }));
    return [{ value: "/sessions new", description: "New session" }, ...sessions];
  }
  const thinkingPrefix = "/thinking ";
  if ((value === "/thinking" && cursor === value.length) || (value.startsWith(thinkingPrefix) && cursor >= thinkingPrefix.length)) {
    const labels: Record<string, string> = { off: "Off", minimal: "Light", low: "Low", medium: "Medium", high: "High", xhigh: "Ultra" };
    const levels = thinkingSuggestions().map((id) => [id, labels[id] ?? id] as const);
    const query = value === "/thinking" ? "" : value.slice(thinkingPrefix.length, cursor).toLowerCase();
    return levels.filter(([id, label]) => id.startsWith(query) || label.toLowerCase().startsWith(query))
      .map(([id, label]) => ({ value: `/thinking ${id}`, description: label }));
  }
  const securityPrefix = "/security ";
  if ((value === "/security" && cursor === value.length) || (value.startsWith(securityPrefix) && cursor >= securityPrefix.length)) {
    const query = value === "/security" ? "" : value.slice(securityPrefix.length, cursor).toLowerCase();
    return [
      { value: "/security standard", description: "Standard · ask before consequential actions" },
      { value: "/security full", description: "Full access · do not ask for approval" }
    ].filter((item) => item.value.slice(securityPrefix.length).startsWith(query));
  }
  const start = activeCommandStart(value, cursor);
  if (start === undefined) return [];
  const query = value.slice(start, cursor).toLowerCase();
  return slashCommands.filter((command) => command.value.startsWith(query)).slice(0, 12);
}

function wordStart(value: string, cursor: number): number {
  let index = cursor;
  while (index > 0 && /\s/.test(value[index - 1]!)) index -= 1;
  while (index > 0 && !/\s/.test(value[index - 1]!)) index -= 1;
  return index;
}

function wordEnd(value: string, cursor: number): number {
  let index = cursor;
  while (index < value.length && /\s/.test(value[index]!)) index += 1;
  while (index < value.length && !/\s/.test(value[index]!)) index += 1;
  return index;
}

/** A one-line editor with a terminal dropdown for slash commands. */
async function readTuiLine(mode: "Plan" | "Build", sessionSuggestions?: () => TuiSessionSuggestion[], thinkingSuggestions?: () => string[]): Promise<string> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error("Raya's interactive TUI requires a TTY terminal.");
  }

  let value = "";
  const label = (): string => value.startsWith("!") ? "[Term] > " : `[${mode}] > `;
  let cursor = 0;
  let selected = 0;
  let visible = 0;
  let killBuffer = "";
  let exitWarning = false;
  let exitTimer: NodeJS.Timeout | undefined;

  const render = (): void => {
    const suggestions = commandSuggestions(value, cursor, sessionSuggestions, thinkingSuggestions);
    if (selected >= suggestions.length) selected = Math.max(suggestions.length - 1, 0);
    output.write("\r\x1b[J");
    output.write(color(label(), theme.blue) + value + "\n");
    if (exitWarning) output.write(color("Press Ctrl+C again to exit.", theme.yellow) + "\n");
    for (const [index, suggestion] of suggestions.entries()) {
      const marker = index === selected ? color("›", theme.cyan) : " ";
      const line = `${marker} ${suggestion.value.padEnd(18)} ${color(suggestion.description, theme.gray)}`;
      output.write(`${line}\n`);
    }
    visible = suggestions.length;
    output.write(`\x1b[${visible + (exitWarning ? 2 : 1)}A\r\x1b[${label().length + cursor}C`);
  };

  const finish = (resolve: (line: string) => void, line: string, echo = true): void => {
    input.setRawMode(false);
    input.off("keypress", onKeypress);
    input.pause();
    if (exitTimer) clearTimeout(exitTimer);
    output.write("\r\x1b[J");
    if (echo) output.write(color(label(), theme.blue) + line + "\n");
    resolve(line);
  };

  const insertCommand = (suggestion: CommandSuggestion, addSpace: boolean): void => {
    const start = activeCommandStart(value, cursor) ?? ((value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/security")) ? 0 : undefined);
    if (start === undefined) return;
    const insertion = `${suggestion.value}${addSpace || suggestion.needsArgument ? " " : ""}`;
    value = value.slice(0, start) + insertion + value.slice(cursor);
    cursor = start + insertion.length;
    selected = 0;
  };

  let onKeypress: (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string }) => void;
  const result = new Promise<string>((resolve) => {
    onKeypress = (text, key) => {
      const suggestions = commandSuggestions(value, cursor, sessionSuggestions, thinkingSuggestions);
      if (key.ctrl && key.name === "c") {
        if (exitWarning) {
          finish(resolve, "/exit");
          return;
        }
        exitWarning = true;
        exitTimer = setTimeout(() => {
          exitWarning = false;
          render();
        }, 1_000);
        render();
        return;
      }
      exitWarning = false;
      if (exitTimer) clearTimeout(exitTimer);
      if (key.name === "up" && suggestions.length) {
        selected = (selected - 1 + suggestions.length) % suggestions.length;
        render();
        return;
      }
      if (key.name === "down" && suggestions.length) {
        selected = (selected + 1) % suggestions.length;
        render();
        return;
      }
      if (key.name === "tab" && !value) {
        finish(resolve, "__RAYA_TOGGLE_MODE__", false);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        if (suggestions.length) {
          const suggestion = suggestions[selected]!;
          const commandAtStart = (activeCommandStart(value, cursor) === 0 || value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/security")) && cursor === value.length;
          if (suggestion.needsArgument || !commandAtStart) {
            insertCommand(suggestion, !commandAtStart);
            render();
            return;
          }
          finish(resolve, suggestion.value);
          return;
        }
        finish(resolve, value);
        return;
      }
      if (key.ctrl && key.name === "a") {
        cursor = 0;
      } else if (key.ctrl && key.name === "e") {
        cursor = value.length;
      } else if (key.ctrl && key.name === "u") {
        killBuffer = value.slice(0, cursor);
        value = value.slice(cursor);
        cursor = 0;
      } else if (key.ctrl && key.name === "k") {
        killBuffer = value.slice(cursor);
        value = value.slice(0, cursor);
      } else if ((key.ctrl && (key.name === "w" || key.name === "backspace")) || (key.meta && key.name === "backspace")) {
        const start = wordStart(value, cursor);
        killBuffer = value.slice(start, cursor);
        value = value.slice(0, start) + value.slice(cursor);
        cursor = start;
      } else if (key.ctrl && key.name === "y") {
        value = value.slice(0, cursor) + killBuffer + value.slice(cursor);
        cursor += killBuffer.length;
      } else if (key.ctrl && key.name === "d") {
        value = value.slice(0, cursor) + value.slice(cursor + 1);
      } else if (key.ctrl && key.name === "t" && cursor > 0 && cursor < value.length) {
        const left = value[cursor - 1]!;
        const right = value[cursor]!;
        value = value.slice(0, cursor - 1) + right + left + value.slice(cursor + 1);
        cursor += 1;
      } else if (key.ctrl && key.name === "l") {
        output.write("\x1b[2J\x1b[H");
      } else if ((key.meta && key.name === "b") || (key.ctrl && key.name === "left")) {
        cursor = wordStart(value, cursor);
      } else if ((key.meta && key.name === "f") || (key.ctrl && key.name === "right")) {
        cursor = wordEnd(value, cursor);
      } else if ((key.meta && key.name === "d") || (key.ctrl && key.name === "delete")) {
        const end = wordEnd(value, cursor);
        killBuffer = value.slice(cursor, end);
        value = value.slice(0, cursor) + value.slice(end);
      } else if (key.name === "backspace" || (key.ctrl && key.name === "h")) {
        if (cursor > 0) value = value.slice(0, cursor - 1) + value.slice(cursor);
        cursor = Math.max(cursor - 1, 0);
      } else if (key.name === "delete") {
        value = value.slice(0, cursor) + value.slice(cursor + 1);
      } else if (key.name === "home") {
        cursor = 0;
      } else if (key.name === "end") {
        cursor = value.length;
      } else if (key.name === "left") {
        cursor = Math.max(cursor - 1, 0);
      } else if (key.name === "right") {
        cursor = Math.min(cursor + 1, value.length);
      } else if (text && !key.ctrl && !key.sequence?.startsWith("\x1b")) {
        value = value.slice(0, cursor) + text + value.slice(cursor);
        cursor += text.length;
      } else {
        return;
      }
      selected = 0;
      render();
    };
    input.on("keypress", onKeypress);
    input.setRawMode(true);
    input.resume();
    render();
  });

  return result.finally(() => {
    visible = 0;
  });
}

async function runTerminalCommand(command: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn(command, { cwd: process.cwd(), shell: process.env.SHELL ?? "/bin/zsh", stdio: "inherit" });
    child.on("close", () => resolve());
    child.on("error", (error) => {
      console.error(error.message);
      resolve();
    });
  });
}

export async function runInteractiveTui(inputAgent: Agent, info: TuiSessionInfo, options?: {
  onCommand?: (context: SlashCommandContext) => Promise<Agent | void> | Agent | void;
  onAfterPrompt?: (agent: Agent) => Promise<void> | void;
  sessionSuggestions?: () => TuiSessionSuggestion[];
  thinkingSuggestions?: () => string[];
  onToggleMode?: (agent: Agent) => Promise<{ agent?: Agent; mode: "Plan" | "Build" }> | { agent?: Agent; mode: "Plan" | "Build" };
}): Promise<void> {
  let agent = inputAgent;
  let mode = info.mode as "Plan" | "Build";

  output.write("\x1b[2J\x1b[H");
  renderHeader(info);
  emitKeypressEvents(input);

  try {
    while (true) {
      const prompt = await readTuiLine(mode, options?.sessionSuggestions, options?.thinkingSuggestions);
      const message = prompt.trim();

      if (prompt === "__RAYA_TOGGLE_MODE__") {
        const result = await options?.onToggleMode?.(agent);
        if (result) {
          agent = result.agent ?? agent;
          mode = result.mode;
        }
        continue;
      }

      if (!message) {
        continue;
      }

      if (message === "/exit" || message === "/quit") {
        console.log("Bye bye");
        break;
      }

      if (message === "/clear") {
        agent.reset();
        await options?.onAfterPrompt?.(agent);
        console.log(color("Conversation cleared.", theme.gray));
        continue;
      }

      if (prompt.startsWith("!")) {
        const command = prompt.slice(1).trim();
        if (command) await runTerminalCommand(command);
        console.log();
        continue;
      }

      if (message.startsWith("/")) {
        const nextAgent = await options?.onCommand?.({ agent, command: message });
        if (nextAgent) {
          agent = nextAgent;
        }
        continue;
      }

      await agent.prompt(message);
      await agent.waitForIdle();
      await options?.onAfterPrompt?.(agent);
      console.log();
    }
  } finally {
    if (input.isTTY && input.setRawMode) input.setRawMode(false);
    input.pause();
  }
}
