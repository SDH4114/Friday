import type { Agent } from "@earendil-works/pi-agent-core";
import { emitKeypressEvents } from "node:readline";
import { visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { color, theme } from "./theme.js";
import { createNeovimState, ensureNeovimConfig, handleNeovimKey, type NeovimConfig, type NeovimState } from "./neovim.js";

let activeNotificationHandler: ((message: string) => void) | undefined;
let activeRawInputHandler: ((data: Buffer | string) => void) | undefined;

export function notifyTui(message: string): void {
  if (activeNotificationHandler) activeNotificationHandler(message);
  else console.log(color(message, theme.yellow));
}

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
  headerStyle: "small" | "large";
  session?: string;
  version: string;
  contextTokens?: number;
  contextWindow?: number;
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
  label?: string;
  description: string;
  deleteValue?: string;
  needsArgument?: boolean;
  selectable?: boolean;
};

export type TuiCommandSuggestion = CommandSuggestion;

const slashCommands: CommandSuggestion[] = [
  { value: "/help", description: "Show available commands" },
  { value: "/providers", description: "Connect, update, or choose providers" },
  { value: "/models", description: "Browse and choose models from all providers" },
  { value: "/thinking", description: "Set reasoning level" },
  { value: "/security", description: "Choose security mode" },
  { value: "/sessions", description: "Create/open sessions · dd deletes selected" },
  { value: "/About", description: "What Raya is and what she can do" },
  { value: "/status", description: "Show current status" },
  { value: "/clear", description: "Clear this conversation" },
  { value: "/exit", description: "Exit Raya" }
];

const largeRayaLogo = [
  "██████╗  █████╗ ██╗   ██╗ █████╗ ",
  "██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗",
  "██████╔╝███████║ ╚████╔╝ ███████║",
  "██╔══██╗██╔══██║  ╚██╔╝  ██╔══██║",
  "██║  ██║██║  ██║   ██║   ██║  ██║",
  "╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝",
];

const largeAppleGlyphs: Record<string, readonly string[]> = {
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
  L: ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
  ".": ["   ", "   ", "   ", "   ", "   ", " • "]
};

export function renderLargeAppleWord(): string[] {
  const glyphs = Array.from("A.P.P.L.E.").map((character) => largeAppleGlyphs[character]!);
  return Array.from({ length: 6 }, (_, row) => glyphs.map((glyph) => glyph[row]!).join(" "));
}

const rayaAppleLogo = [...largeRayaLogo, "", ...renderLargeAppleWord()];

function renderHeader(info: TuiSessionInfo): void {
  console.log(color(info.headerStyle === "large" ? rayaAppleLogo.join("\n") : "Raya A.P.P.L.E.", theme.cyan));
  console.log();
  console.log(`Model     : ${info.model}`);
  console.log(`Mode      : ${info.mode}`);
  console.log(`Directory : ${info.directory}`);
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
  thinkingSuggestions: () => string[] = () => [],
  providerSuggestions: (value: string) => CommandSuggestion[] = () => [],
  modelSuggestions: (query: string) => CommandSuggestion[] = () => []
): CommandSuggestion[] {
  const sessionPrefix = "/sessions ";
  if (value.startsWith(sessionPrefix) && cursor >= sessionPrefix.length) {
    const query = value.slice(sessionPrefix.length, cursor).toLowerCase();
    const sessions = sessionSuggestions()
      .filter((session) => `${session.id} ${session.name}`.toLowerCase().includes(query));
    const open = sessions.map((session) => ({
      value: `/sessions open ${session.id}`,
      deleteValue: `/sessions delete ${session.id}`,
      label: session.name,
      description: session.detail
    }));
    return [
      { value: "/sessions new", description: "New session" },
      { value: "Sessions · Enter open · dd delete:", description: "", selectable: false },
      ...(open.length ? open : [{ value: "  (none)", description: "", selectable: false }])
    ];
  }
  const thinkingPrefix = "/thinking ";
  if (value.startsWith(thinkingPrefix) && cursor >= thinkingPrefix.length) {
    const labels: Record<string, string> = { off: "Off", minimal: "Light", low: "Low", medium: "Medium", high: "High", xhigh: "Ultra" };
    const levels = thinkingSuggestions().map((id) => [id, labels[id] ?? id] as const);
    const query = value.slice(thinkingPrefix.length, cursor).toLowerCase();
    return levels.filter(([id, label]) => id.startsWith(query) || label.toLowerCase().startsWith(query))
      .map(([id, label]) => ({ value: `/thinking ${id}`, description: label }));
  }
  const securityPrefix = "/security ";
  if (value.startsWith(securityPrefix) && cursor >= securityPrefix.length) {
    const query = value.slice(securityPrefix.length, cursor).toLowerCase();
    return [
      { value: "/security standard", description: "Standard · ask before consequential actions" },
      { value: "/security full", description: "Full access · do not ask for approval" }
    ].filter((item) => item.value.slice(securityPrefix.length).startsWith(query));
  }
  if (value.startsWith("/providers ") && cursor === value.length) {
    return providerSuggestions(value);
  }
  if (value.startsWith("/models ") && cursor === value.length) {
    const query = value.slice("/models ".length);
    return modelSuggestions(query);
  }
  const start = activeCommandStart(value, cursor);
  if (start === undefined) return [];
  const query = value.slice(start, cursor).toLowerCase();
  return slashCommands.filter((command) => command.value.toLowerCase().startsWith(query)).slice(0, 12);
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
type InputDraft = { value: string; cursor: number; neovimMode?: NeovimState["mode"] };
const MODE_TOGGLE_PREFIX = "__RAYA_TOGGLE_MODE__";
const EXIT_SIGNAL = "__RAYA_EXIT__";
const MENU_OPEN_PREFIX = "__RAYA_OPEN_MENU__";
const MAX_VISIBLE_SUGGESTIONS = 12;
const MENU_COMMANDS = new Set(["/providers", "/models", "/thinking", "/security", "/sessions"]);

export type SessionDeleteKeyResult =
  | { kind: "armed"; value: string }
  | { kind: "delete"; command: string };

export function advanceSessionDeleteKey(deleteValue: string, armedValue?: string): SessionDeleteKeyResult {
  return armedValue === deleteValue
    ? { kind: "delete", command: deleteValue }
    : { kind: "armed", value: deleteValue };
}

export function sessionDeleteDescription(deleteValue: string | undefined, armedValue: string | undefined, fallback: string): string {
  return deleteValue && deleteValue === armedValue
    ? "Press d again to delete · confirmation follows"
    : fallback;
}

function selectableIndex(suggestions: CommandSuggestion[], start: number, direction: 1 | -1): number {
  if (!suggestions.some((item) => item.selectable !== false)) return 0;
  let index = start;
  for (let attempts = 0; attempts < suggestions.length; attempts += 1) {
    index = (index + direction + suggestions.length) % suggestions.length;
    if (suggestions[index]?.selectable !== false) return index;
  }
  return 0;
}

function compactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

async function readTuiLine(mode: "Plan" | "Build", info: () => TuiSessionInfo, options?: {
  sessionSuggestions?: () => TuiSessionSuggestion[];
  thinkingSuggestions?: () => string[];
  providerSuggestions?: (value: string) => CommandSuggestion[];
  modelSuggestions?: (query: string) => CommandSuggestion[];
  neovimMode?: boolean;
  neovimConfig?: NeovimConfig;
}, draft?: InputDraft, history: string[] = []): Promise<string> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error("Raya's interactive TUI requires a TTY terminal.");
  }

  let value = draft?.value ?? "";
  const neovimConfig = options?.neovimMode ? (options.neovimConfig ?? ensureNeovimConfig()) : undefined;
  const neovimState: NeovimState | undefined = neovimConfig ? createNeovimState(neovimConfig) : undefined;
  if (neovimState && draft?.neovimMode) neovimState.mode = draft.neovimMode;
  const label = (): string => value.startsWith("!") ? "[Term] > " : neovimState && neovimConfig?.show_mode ? `[${mode}] [${neovimState.mode}] > ` : `[${mode}] > `;
  let cursor = Math.min(draft?.cursor ?? value.length, value.length);
  let selected = 0;
  let visible = 0;
  let renderedLines = 0;
  let killBuffer = "";
  let historyIndex = history.length;
  let historyDraft = value;
  let deleteArmedValue: string | undefined;
  let menuDismissed = false;
  let settled = false;
  let onData: (data: Buffer | string) => void;

  const render = (): void => {
    const current = info();
    const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions);
    if (selected >= suggestions.length) selected = Math.max(suggestions.length - 1, 0);
    if (suggestions[selected]?.selectable === false) selected = selectableIndex(suggestions, selected - 1, 1);
    if (renderedLines > 0) output.write(`\x1b[${renderedLines}B\r\x1b[J\x1b[${renderedLines}A\r`);
    output.write("\r\x1b[J");
    let displayValue = value;
    if (neovimState?.mode === "VISUAL" && neovimState.selectionStart !== undefined && value.length) {
      const start = Math.min(neovimState.selectionStart, cursor);
      const end = Math.max(neovimState.selectionStart, cursor) + 1;
      displayValue = `${value.slice(0, start)}\x1b[7m${value.slice(start, end)}${theme.reset}${value.slice(end)}`;
    }
    output.write(color(label(), theme.blue) + displayValue + "\n");
    const windowStart = Math.max(0, Math.min(selected - Math.floor(MAX_VISIBLE_SUGGESTIONS / 2), suggestions.length - MAX_VISIBLE_SUGGESTIONS));
    const visibleSuggestions = suggestions.slice(windowStart, windowStart + MAX_VISIBLE_SUGGESTIONS);
    let suggestionLines = 0;
    if (windowStart > 0) {
      output.write(`${color(`  ↑ ${windowStart} more`, theme.gray)}\n`);
      suggestionLines += 1;
    }
    for (const [visibleIndex, suggestion] of visibleSuggestions.entries()) {
      const index = windowStart + visibleIndex;
      if (suggestion.selectable === false) {
        output.write(`${color(suggestion.value, theme.cyan)}\n`);
        suggestionLines += 1;
        continue;
      }
      const marker = index === selected ? color("›", theme.cyan) : " ";
      const description = sessionDeleteDescription(suggestion.deleteValue, deleteArmedValue, suggestion.description);
      const line = `${marker} ${(suggestion.label ?? suggestion.value).padEnd(18)} ${color(description, theme.gray)}`;
      output.write(`${line}\n`);
      suggestionLines += 1;
    }
    const hiddenBelow = suggestions.length - windowStart - visibleSuggestions.length;
    if (hiddenBelow > 0) {
      output.write(`${color(`  ↓ ${hiddenBelow} more`, theme.gray)}\n`);
      suggestionLines += 1;
    }
    const used = compactTokens(current.contextTokens ?? 0);
    const limit = compactTokens(current.contextWindow ?? 0);
    output.write(color(`Context ${used}/${limit} · ${current.model} · ${current.directory} · Raya v${current.version}`, theme.gray) + "\n");
    visible = suggestionLines;
    renderedLines = visible + 2;
    const cursorColumn = visibleWidth(label()) + visibleWidth(value.slice(0, cursor));
    output.write(`\x1b[${visible + 2}A\r\x1b[${cursorColumn}C`);
  };

  const finish = (resolve: (line: string) => void, line: string, echo = true): void => {
    if (settled) return;
    settled = true;
    input.setRawMode(false);
    input.off("keypress", onKeypress);
    if (activeRawInputHandler === onData) activeRawInputHandler = undefined;
    input.pause();
    activeNotificationHandler = undefined;
    output.write("\r\x1b[J");
    if (echo) output.write(color(label(), theme.blue) + line + "\n");
    resolve(line);
  };

  const insertCommand = (suggestion: CommandSuggestion, addSpace: boolean): void => {
    const start = activeCommandStart(value, cursor) ?? ((value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/security") || value.startsWith("/providers") || value.startsWith("/models")) ? 0 : undefined);
    if (start === undefined) return;
    const insertion = `${suggestion.value}${addSpace || suggestion.needsArgument ? " " : ""}`;
    value = value.slice(0, start) + insertion + value.slice(cursor);
    cursor = start + insertion.length;
    selected = 0;
    menuDismissed = false;
  };

  const navigateHistory = (direction: -1 | 1): void => {
    if (!history.length) return;
    if (historyIndex === history.length) historyDraft = value;
    historyIndex = Math.max(0, Math.min(history.length, historyIndex + direction));
    value = historyIndex === history.length ? historyDraft : history[historyIndex]!;
    cursor = value.length;
    menuDismissed = true;
    selected = 0;
  };

  let onKeypress: (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string }) => void;
  const result = new Promise<string>((resolve) => {
    onData = (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (bytes.length === 1 && bytes[0] === 0x03) {
        finish(resolve, EXIT_SIGNAL, false);
        return;
      }
      if (bytes.length === 1 && bytes[0] === 0x1b) {
        const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions);
        if (suggestions.length) {
          menuDismissed = true;
          selected = 0;
          render();
        }
      }
    };
    onKeypress = (text, key) => {
      const previousValue = value;
      const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions);
      if (key.ctrl && key.name === "c") {
        finish(resolve, EXIT_SIGNAL, false);
        return;
      }
      const deleteValue = suggestions[selected]?.deleteValue;
      if (!key.ctrl && !key.meta && text === "d" && deleteValue) {
        const next = advanceSessionDeleteKey(deleteValue, deleteArmedValue);
        if (next.kind === "delete") {
          finish(resolve, next.command);
          return;
        }
        deleteArmedValue = next.value;
        render();
        return;
      }
      deleteArmedValue = undefined;
      if (key.name === "escape" && suggestions.length) {
        menuDismissed = true;
        selected = 0;
        if (!neovimState) {
          render();
          return;
        }
      }
      if (key.name === "up" && suggestions.length) {
        selected = selectableIndex(suggestions, selected, -1);
        render();
        return;
      }
      if (key.name === "down" && suggestions.length) {
        selected = selectableIndex(suggestions, selected, 1);
        render();
        return;
      }
      if (!suggestions.length && (key.name === "up" || (neovimState?.mode === "NORMAL" && (text === "k" || (key.ctrl && key.name === "p"))))) {
        navigateHistory(-1);
        render();
        return;
      }
      if (!suggestions.length && (key.name === "down" || (neovimState?.mode === "NORMAL" && (text === "j" || (key.ctrl && key.name === "n"))))) {
        navigateHistory(1);
        render();
        return;
      }
      if (neovimState?.mode === "NORMAL" && suggestions.length && (text === "k" || (key.ctrl && key.name === "p"))) {
        selected = selectableIndex(suggestions, selected, -1);
        render();
        return;
      }
      if (neovimState?.mode === "NORMAL" && suggestions.length && (text === "j" || (key.ctrl && key.name === "n"))) {
        selected = selectableIndex(suggestions, selected, 1);
        render();
        return;
      }
      if (key.name === "tab") {
        finish(resolve, `${MODE_TOGGLE_PREFIX}${JSON.stringify({ value, cursor, neovimMode: neovimState?.mode })}`, false);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        if (suggestions.length) {
          const suggestion = suggestions[selected]!;
          if (suggestion.selectable === false) return;
          const commandAtStart = (activeCommandStart(value, cursor) === 0 || value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/security") || value.startsWith("/providers") || value.startsWith("/models")) && cursor === value.length;
          if (commandAtStart && MENU_COMMANDS.has(suggestion.value)) {
            finish(resolve, `${MENU_OPEN_PREFIX}${suggestion.value}`, false);
            return;
          }
          if (suggestion.needsArgument || !commandAtStart) {
            insertCommand(suggestion, !commandAtStart);
            render();
            return;
          }
          finish(resolve, suggestion.value);
          return;
        }
        if (MENU_COMMANDS.has(value.trim())) {
          finish(resolve, `${MENU_OPEN_PREFIX}${value.trim()}`, false);
          return;
        }
        finish(resolve, value);
        return;
      }
      if (neovimState && neovimConfig) {
        const edited = handleNeovimKey(value, cursor, text, key, neovimState, neovimConfig);
        if (edited.submit) {
          finish(resolve, edited.value);
          return;
        }
        value = edited.value;
        cursor = edited.cursor;
        selected = 0;
        if (value !== previousValue) menuDismissed = false;
        render();
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
      if (value !== previousValue) menuDismissed = false;
      render();
    };
    activeRawInputHandler = onData;
    input.on("keypress", onKeypress);
    input.setRawMode(true);
    input.resume();
    activeNotificationHandler = (message) => {
      output.write("\r\x1b[J");
      output.write(`${color(message, theme.yellow)}\n`);
      render();
    };
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

async function runAgentPromptWithEscape(agent: Agent, message: string): Promise<boolean> {
  let cancelled = false;
  const cancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    agent.abort();
    output.write(`\n${color("Cancelled.", theme.gray)}\n`);
  };
  const exit = (): void => {
    if (!cancelled) {
      cancelled = true;
      agent.abort();
    }
    process.kill(process.pid, "SIGINT");
  };
  const onData = (data: Buffer | string): void => {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (bytes.length === 1 && bytes[0] === 0x1b) cancel();
    if (bytes.length === 1 && bytes[0] === 0x03) exit();
  };
  const onKeypress = (_text: string, key: { name?: string; ctrl?: boolean }): void => {
    if (key.name === "escape") cancel();
    if (key.ctrl && key.name === "c") exit();
  };

  activeRawInputHandler = onData;
  input.on("keypress", onKeypress);
  input.setRawMode?.(true);
  input.resume();
  try {
    await agent.prompt(message);
    await agent.waitForIdle();
  } catch (error) {
    if (!cancelled) throw error;
  } finally {
    if (activeRawInputHandler === onData) activeRawInputHandler = undefined;
    input.off("keypress", onKeypress);
    input.setRawMode?.(false);
    input.pause();
  }
  return cancelled;
}

export async function runInteractiveTui(inputAgent: Agent, info: TuiSessionInfo, options?: {
  onCommand?: (context: SlashCommandContext) => Promise<Agent | void> | Agent | void;
  onAfterPrompt?: (agent: Agent) => Promise<void> | void;
  sessionSuggestions?: () => TuiSessionSuggestion[];
  thinkingSuggestions?: () => string[];
  providerSuggestions?: (value: string) => TuiCommandSuggestion[];
  modelSuggestions?: (query: string) => TuiCommandSuggestion[];
  statusInfo?: () => TuiSessionInfo;
  onBeforePrompt?: () => Promise<(() => void) | void> | (() => void) | void;
  neovimMode?: boolean;
  neovimConfig?: NeovimConfig;
  onToggleMode?: (agent: Agent) => Promise<{ agent?: Agent; mode: "Plan" | "Build" }> | { agent?: Agent; mode: "Plan" | "Build" };
}): Promise<void> {
  let agent = inputAgent;
  let mode = info.mode as "Plan" | "Build";
  let draft: InputDraft | undefined;
  const promptHistory: string[] = [];

  const loadPromptHistory = (): void => {
    promptHistory.length = 0;
    for (const message of agent.state.messages as Array<{ role?: string; content?: Array<{ type?: string; text?: string }> }>) {
      if (message.role !== "user") continue;
      const text = message.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("").trim();
      if (text) promptHistory.push(text);
    }
  };
  loadPromptHistory();

  output.write("\x1b[2J\x1b[H");
  renderHeader(info);
  const routeRawInput = (data: Buffer | string): void => activeRawInputHandler?.(data);
  input.on("data", routeRawInput);
  // Keep standalone Escape responsive instead of waiting for a possible Alt sequence.
  emitKeypressEvents(input, { escapeCodeTimeout: 80 } as never);

  try {
    while (true) {
      const prompt = await readTuiLine(mode, options?.statusInfo ?? (() => ({ ...info, mode })), options, draft, promptHistory);
      draft = undefined;
      const message = prompt.trim();

      if (prompt === EXIT_SIGNAL) {
        console.log("Bye bye");
        break;
      }

      if (prompt.startsWith(MODE_TOGGLE_PREFIX)) {
        draft = JSON.parse(prompt.slice(MODE_TOGGLE_PREFIX.length)) as InputDraft;
        const result = await options?.onToggleMode?.(agent);
        if (result) {
          agent = result.agent ?? agent;
          mode = result.mode;
        }
        continue;
      }

      if (prompt.startsWith(MENU_OPEN_PREFIX)) {
        const command = prompt.slice(MENU_OPEN_PREFIX.length);
        draft = { value: `${command} `, cursor: command.length + 1 };
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
          loadPromptHistory();
        }
        continue;
      }

      const releasePrompt = await options?.onBeforePrompt?.();
      try {
        const messagesBeforePrompt = [...agent.state.messages];
        if (promptHistory.at(-1) !== message) promptHistory.push(message);
        const cancelled = await runAgentPromptWithEscape(agent, message);
        if (cancelled) {
          agent.state.messages = messagesBeforePrompt;
          continue;
        }
        await options?.onAfterPrompt?.(agent);
        console.log();
      } finally {
        releasePrompt?.();
      }
    }
  } finally {
    input.off("data", routeRawInput);
    activeRawInputHandler = undefined;
    if (input.isTTY && input.setRawMode) input.setRawMode(false);
    input.pause();
  }
}
