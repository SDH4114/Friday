import type { Agent } from "@earendil-works/pi-agent-core";
import { emitKeypressEvents } from "node:readline";
import { visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { color, theme } from "./theme.js";
import { createNeovimState, ensureNeovimConfig, handleNeovimKey, type NeovimConfig, type NeovimState } from "./neovim.js";
import { DEFAULT_HOTKEYS, formatHotkey, matchesHotkey, type TuiHotkeys } from "./hotkeys.js";
import { RAYA_SLASH_COMMANDS } from "../agent/capabilities.js";

let activeNotificationHandler: ((message: string) => void) | undefined;
let activeRawInputHandler: ((data: Buffer | string) => void) | undefined;

export function notifyTui(message: string): void {
  if (activeNotificationHandler) activeNotificationHandler(message);
  else console.log(color(message, theme.yellow));
}

/** Count physical terminal rows, including soft wraps and explicit newlines. */
export function terminalPhysicalRows(lines: readonly string[], columns: number): number {
  const width = Math.max(1, columns);
  return lines.reduce((total, line) => total + line.split("\n").reduce(
    (rows, part) => rows + Math.max(1, Math.ceil(visibleWidth(part) / width)),
    0
  ), 0);
}

/** Ask the local terminal user before an agent performs a consequential action. */
export async function requestTerminalApproval(action: string, details: string): Promise<void> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error("Build action requires an interactive terminal approval.");
  }
  let selected = 0;
  let renderedRows = 0;
  const clear = (): void => {
    output.write(renderedRows > 0 ? `\x1b[${renderedRows}A\r\x1b[J` : "\r\x1b[J");
  };
  const draw = (): void => {
    const heading = "Approval required";
    const actionLine = `${action}: ${details}`;
    const choiceLine = `${selected === 0 ? "› Accept" : "  Accept"}    ${selected === 1 ? "› Refuse" : "  Refuse"}`;
    clear();
    output.write(`${color(heading, theme.yellow)}\n`);
    output.write(`${color(actionLine, theme.white)}\n`);
    output.write(`${selected === 0 ? color("› Accept", theme.green) : color("  Accept", theme.gray)}    ${selected === 1 ? color("› Refuse", theme.red) : color("  Refuse", theme.gray)}\n`);
    renderedRows = terminalPhysicalRows([heading, actionLine, choiceLine], output.columns ?? 80);
  };

  return new Promise<void>((resolve, reject) => {
    const finish = (approved: boolean): void => {
      input.setRawMode(false);
      input.off("keypress", onKeypress);
      input.pause();
      clear();
      approved ? resolve() : reject(new Error("Action refused by user."));
    };
    const onKeypress = (_text: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.name === "left" || key.name === "up") { if (selected !== 0) { selected = 0; draw(); } return; }
      if (key.name === "right" || key.name === "down") { if (selected !== 1) { selected = 1; draw(); } return; }
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
  thinkingLevel?: string;
  contextTokens?: number;
  contextWindow?: number;
  hotkeys?: TuiHotkeys;
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

export type TuiSkillSuggestion = {
  name: string;
  description: string;
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

export function restoredTuiMode(value: string | undefined, current: "Plan" | "Build"): "Plan" | "Build" {
  return value === "Plan" || value === "Build" ? value : current;
}

const slashCommands: CommandSuggestion[] = RAYA_SLASH_COMMANDS.map(([value, description]) => ({ value, description }));

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

function fitCell(value: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(value) <= width) return value + " ".repeat(width - visibleWidth(value));
  if (width === 1) return "…";
  let clipped = "";
  for (const character of Array.from(value)) {
    if (visibleWidth(`${clipped}${character}…`) > width) break;
    clipped += character;
  }
  const result = `${clipped}…`;
  return result + " ".repeat(Math.max(width - visibleWidth(result), 0));
}

function dashboardTitle(width: number, title: string): string {
  const innerWidth = Math.max(width - 2, 0);
  const rawLabel = `─ ${title} `;
  const label = visibleWidth(rawLabel) <= innerWidth ? rawLabel : fitCell(rawLabel, innerWidth).trimEnd();
  return `╭${label}${"─".repeat(Math.max(innerWidth - visibleWidth(label), 0))}╮`;
}

export function modelStatusLabel(info: Pick<TuiSessionInfo, "model" | "thinkingLevel">): string {
  return info.thinkingLevel ? `${info.model} (${info.thinkingLevel})` : info.model;
}

function statusLines(info: TuiSessionInfo): string[] {
  const brand = info.headerStyle === "large"
    ? [...largeRayaLogo, "A.P.P.L.E. SYSTEM"]
    : ["◢◤  RAYA  ◥◣", "A.P.P.L.E."];
  return [
    ...brand,
    "",
    `Model      ${modelStatusLabel(info)}`,
    `Mode       ${info.mode}`,
    `Workspace  ${info.directory}`,
    `Session    ${info.session ?? "Fresh session"}`,
    `Memory     ${info.memory}`
  ];
}

function protocolLines(hotkeys: TuiHotkeys = DEFAULT_HOTKEYS): string[] { return [
  "Raya A.P.P.L.E.",
  "Adaptive",
  "Personal",
  "Processing and",
  "Logic",
  "Engine",
  "",
  "CONTROL DECK",
  `${formatHotkey(hotkeys.toggleMode).padEnd(12)} switch Plan ↔ Build`,
  "/help        commands and shortcuts",
  "/sessions    continue earlier work",
  `/exit and ${formatHotkey(hotkeys.exit).padEnd(12)} quit`,
]; }

export function renderStartupDashboard(info: TuiSessionInfo, requestedWidth = 120): string[] {
  const width = Math.max(32, Math.floor(requestedWidth));
  const title = `Raya A.P.P.L.E.  v${info.version}`;
  const left = statusLines(info);
  const controls = protocolLines(info.hotkeys);

  if (width < 88) {
    const contentWidth = width - 4;
    const lines = [...left, "", ...controls];
    return [
      dashboardTitle(width, title),
      ...lines.map((line) => `│ ${fitCell(line, contentWidth)} │`),
      `╰${"─".repeat(width - 2)}╯`
    ];
  }

  const available = width - 7;
  const leftWidth = Math.max(34, Math.floor(available * 0.38));
  const rightWidth = available - leftWidth;
  const height = Math.max(left.length, controls.length);
  const rows = Array.from({ length: height }, (_, index) =>
    `│ ${fitCell(left[index] ?? "", leftWidth)} │ ${fitCell(controls[index] ?? "", rightWidth)} │`);
  return [
    dashboardTitle(width, title),
    ...rows,
    `╰${"─".repeat(leftWidth + 2)}┴${"─".repeat(rightWidth + 2)}╯`
  ];
}

function renderHeader(info: TuiSessionInfo): void {
  const width = output.columns ? Math.max(output.columns - 2, 32) : 120;
  console.log(color(renderStartupDashboard(info, width).join("\n"), theme.cyan));
  console.log();
}

function activeCommandStart(value: string, cursor: number): number | undefined {
  if (cursor === 0) return undefined;
  const start = value.lastIndexOf("/", Math.max(cursor - 1, 0));
  if (start < 0 || start >= cursor || /\s/.test(value.slice(start, cursor))) return undefined;
  return start;
}

export function commandSuggestions(
  value: string,
  cursor: number,
  sessionSuggestions: () => TuiSessionSuggestion[] = () => [],
  thinkingSuggestions: () => string[] = () => [],
  providerSuggestions: (value: string) => CommandSuggestion[] = () => [],
  modelSuggestions: (query: string) => CommandSuggestion[] = () => [],
  themeSuggestions: () => CommandSuggestion[] = () => [],
  skillSuggestions: () => TuiSkillSuggestion[] = () => []
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
  const skillPrefix = "/skills ";
  const skillStart = value.lastIndexOf(skillPrefix, cursor);
  if (skillStart >= 0 && (skillStart === 0 || /\s/.test(value[skillStart - 1]!)) && cursor >= skillStart + skillPrefix.length) {
    const query = value.slice(skillStart + skillPrefix.length, cursor).trim().toLowerCase();
    const skills = skillSuggestions().filter((skill) =>
      !query || `${skill.name} ${skill.description}`.toLowerCase().includes(query));
    return [
      { value: "Skills · Enter attaches to message:", description: "", selectable: false },
      ...(skills.length ? skills.map((skill) => ({
        value: `@skill:${skill.name}`,
        label: skill.name,
        description: "Attach to current message",
        needsArgument: true
      })) : [{ value: "  (none)", description: "", selectable: false }])
    ];
  }
  const securityPrefix = "/security ";
  if (value.startsWith(securityPrefix) && cursor >= securityPrefix.length) {
    const query = value.slice(securityPrefix.length, cursor).toLowerCase();
    return [
      { value: "/security standard", description: "Standard · ask before consequential actions" },
      { value: "/security full", description: "Full access · do not ask for approval" }
    ].filter((item) => item.value.slice(securityPrefix.length).startsWith(query));
  }
  if (value.startsWith("/theme ") && cursor === value.length) {
    return themeSuggestions();
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

export function attachSkillToPrompt(value: string, cursor: number, skillName: string): { value: string; cursor: number } {
  const start = value.lastIndexOf("/skills", cursor);
  if (start < 0 || (start > 0 && !/\s/.test(value[start - 1]!))) return { value, cursor };
  const insertion = `@skill:${skillName} `;
  const next = value.slice(0, start) + insertion + value.slice(cursor);
  return { value: next, cursor: start + insertion.length };
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
export type PromptHistoryState = { index: number; draft: string };

export function movePromptHistory(
  history: readonly string[],
  state: PromptHistoryState,
  currentValue: string,
  direction: -1 | 1
): { value: string; state: PromptHistoryState } {
  if (!history.length) return { value: currentValue, state };
  const draft = state.index === history.length ? currentValue : state.draft;
  const index = Math.max(0, Math.min(history.length, state.index + direction));
  return {
    value: index === history.length ? draft : history[index]!,
    state: { index, draft }
  };
}

const MODE_TOGGLE_PREFIX = "__RAYA_TOGGLE_MODE__";
const EXIT_SIGNAL = "__RAYA_EXIT__";
const MENU_OPEN_PREFIX = "__RAYA_OPEN_MENU__";
const MAX_VISIBLE_SUGGESTIONS = 12;
const MENU_COMMANDS = new Set(["/providers", "/models", "/thinking", "/theme", "/security", "/sessions", "/skills"]);

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

export function fitSuggestionLine(label: string, description: string, width: number): { label: string; description: string } {
  const safeWidth = Math.max(Math.floor(width), 4);
  const labelWidth = Math.min(18, Math.max(safeWidth - 3, 1));
  const descriptionWidth = Math.max(safeWidth - 2 - labelWidth - 1, 0);
  return {
    label: fitCell(label, labelWidth),
    description: descriptionWidth ? fitCell(description, descriptionWidth).trimEnd() : ""
  };
}

async function readTuiLine(mode: "Plan" | "Build", info: () => TuiSessionInfo, options?: {
  sessionSuggestions?: () => TuiSessionSuggestion[];
  thinkingSuggestions?: () => string[];
  providerSuggestions?: (value: string) => CommandSuggestion[];
  modelSuggestions?: (query: string) => CommandSuggestion[];
  themeSuggestions?: () => CommandSuggestion[];
  skillSuggestions?: () => TuiSkillSuggestion[];
  neovimMode?: boolean;
  neovimConfig?: NeovimConfig;
  hotkeys?: TuiHotkeys;
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
  let killBuffer = "";
  let historyState: PromptHistoryState = { index: history.length, draft: value };
  let deleteArmedValue: string | undefined;
  let menuDismissed = false;
  let settled = false;
  let onData: (data: Buffer | string) => void;
  const hotkeys = options?.hotkeys ?? info().hotkeys ?? DEFAULT_HOTKEYS;

  const render = (): void => {
    const current = info();
    // Leave the last terminal column unused: writing into it can trigger an
    // automatic wrap that readline reports as an extra physical row.
    const terminalWidth = Math.max((output.columns ?? 121) - 1, 32);
    const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions, options?.themeSuggestions, options?.skillSuggestions);
    if (selected >= suggestions.length) selected = Math.max(suggestions.length - 1, 0);
    if (suggestions[selected]?.selectable === false) selected = selectableIndex(suggestions, selected - 1, 1);
    // Paint over the previous frame instead of clearing the whole menu first.
    // Clearing first creates a visible blank frame on every arrow-key press.
    output.write("\r");
    let displayValue = value;
    if (neovimState?.mode === "VISUAL" && neovimState.selectionStart !== undefined && value.length) {
      const start = Math.min(neovimState.selectionStart, cursor);
      const end = Math.max(neovimState.selectionStart, cursor) + 1;
      displayValue = `${value.slice(0, start)}\x1b[7m${value.slice(start, end)}${theme.reset}${value.slice(end)}`;
    }
    output.write(color(label(), theme.blue) + color(displayValue, theme.white) + "\x1b[K\n");
    const windowStart = Math.max(0, Math.min(selected - Math.floor(MAX_VISIBLE_SUGGESTIONS / 2), suggestions.length - MAX_VISIBLE_SUGGESTIONS));
    const visibleSuggestions = suggestions.slice(windowStart, windowStart + MAX_VISIBLE_SUGGESTIONS);
    let suggestionLines = 0;
    if (windowStart > 0) {
      output.write(`${color(fitCell(`  ↑ ${windowStart} more`, terminalWidth).trimEnd(), theme.gray)}\x1b[K\n`);
      suggestionLines += 1;
    }
    for (const [visibleIndex, suggestion] of visibleSuggestions.entries()) {
      const index = windowStart + visibleIndex;
      if (suggestion.selectable === false) {
        output.write(`${color(fitCell(suggestion.value, terminalWidth).trimEnd(), theme.cyan)}\x1b[K\n`);
        suggestionLines += 1;
        continue;
      }
      const marker = index === selected ? color("›", theme.cyan) : " ";
      const description = sessionDeleteDescription(suggestion.deleteValue, deleteArmedValue, suggestion.description);
      const fitted = fitSuggestionLine(suggestion.label ?? suggestion.value, description, terminalWidth);
      const line = `${marker} ${color(fitted.label, theme.white)}${fitted.description ? ` ${color(fitted.description, theme.gray)}` : ""}`;
      output.write(`${line}\x1b[K\n`);
      suggestionLines += 1;
    }
    const hiddenBelow = suggestions.length - windowStart - visibleSuggestions.length;
    if (hiddenBelow > 0) {
      output.write(`${color(fitCell(`  ↓ ${hiddenBelow} more`, terminalWidth).trimEnd(), theme.gray)}\x1b[K\n`);
      suggestionLines += 1;
    }
    const used = compactTokens(current.contextTokens ?? 0);
    const limit = compactTokens(current.contextWindow ?? 0);
    const footer = `Context ${used}/${limit} · ${modelStatusLabel(current)} · ${current.directory} · Raya v${current.version}`;
    output.write(color(fitCell(footer, terminalWidth).trimEnd(), theme.gray) + "\x1b[K\n\x1b[J");
    visible = suggestionLines;
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
    if (echo) output.write(color(label(), theme.blue) + color(line, theme.white) + "\n");
    resolve(line);
  };

  const insertCommand = (suggestion: CommandSuggestion, addSpace: boolean): void => {
    if (suggestion.value.startsWith("@skill:")) {
      const attached = attachSkillToPrompt(value, cursor, suggestion.value.slice("@skill:".length));
      value = attached.value;
      cursor = attached.cursor;
      selected = 0;
      menuDismissed = false;
      return;
    }
    const start = activeCommandStart(value, cursor) ?? ((value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/theme") || value.startsWith("/security") || value.startsWith("/providers") || value.startsWith("/models") || value.startsWith("/skills")) ? 0 : undefined);
    if (start === undefined) return;
    const insertion = `${suggestion.value}${addSpace || suggestion.needsArgument ? " " : ""}`;
    value = value.slice(0, start) + insertion + value.slice(cursor);
    cursor = start + insertion.length;
    selected = 0;
    menuDismissed = false;
  };

  const navigateHistory = (direction: -1 | 1): void => {
    const next = movePromptHistory(history, historyState, value, direction);
    value = next.value;
    historyState = next.state;
    cursor = value.length;
    // Recalled prompts are plain history. Slash menus reopen only when the
    // user types or edits '/', while an already open slash menu keeps arrows.
    menuDismissed = true;
    selected = 0;
  };

  let onKeypress: (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string }) => void;
  const result = new Promise<string>((resolve) => {
    onData = (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (hotkeys.exit === "ctrl+c" && bytes.length === 1 && bytes[0] === 0x03) {
        finish(resolve, EXIT_SIGNAL, false);
        return;
      }
      if (hotkeys.cancel === "escape" && bytes.length === 1 && bytes[0] === 0x1b) {
        const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions, options?.themeSuggestions, options?.skillSuggestions);
        if (suggestions.length) {
          menuDismissed = true;
          selected = 0;
          render();
        }
      }
    };
    onKeypress = (text, key) => {
      const previousValue = value;
      const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions, options?.themeSuggestions, options?.skillSuggestions);
      if (matchesHotkey(text, key, hotkeys.exit)) {
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
      if (matchesHotkey(text, key, hotkeys.cancel) && suggestions.length) {
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
      if (matchesHotkey(text, key, hotkeys.toggleMode)) {
        finish(resolve, `${MODE_TOGGLE_PREFIX}${JSON.stringify({ value, cursor, neovimMode: neovimState?.mode })}`, false);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        if (suggestions.length) {
          const suggestion = suggestions[selected]!;
          if (suggestion.selectable === false) return;
          const commandAtStart = (activeCommandStart(value, cursor) === 0 || value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/theme") || value.startsWith("/security") || value.startsWith("/providers") || value.startsWith("/models") || value.startsWith("/skills")) && cursor === value.length;
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
      } else if (matchesHotkey(text, key, hotkeys.clearScreen)) {
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

async function runAgentPromptWithHotkeys(agent: Agent, message: string, hotkeys: TuiHotkeys): Promise<boolean> {
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
    if (hotkeys.cancel === "escape" && bytes.length === 1 && bytes[0] === 0x1b) cancel();
    if (hotkeys.exit === "ctrl+c" && bytes.length === 1 && bytes[0] === 0x03) exit();
  };
  const onKeypress = (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): void => {
    if (matchesHotkey(text, key, hotkeys.cancel)) cancel();
    if (matchesHotkey(text, key, hotkeys.exit)) exit();
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
  themeSuggestions?: () => TuiCommandSuggestion[];
  skillSuggestions?: () => TuiSkillSuggestion[];
  statusInfo?: () => TuiSessionInfo;
  onBeforePrompt?: () => Promise<(() => void) | void> | (() => void) | void;
  neovimMode?: boolean;
  neovimConfig?: NeovimConfig;
  hotkeys?: TuiHotkeys;
  onToggleMode?: (agent: Agent) => Promise<{ agent?: Agent; mode: "Plan" | "Build" }> | { agent?: Agent; mode: "Plan" | "Build" };
}): Promise<void> {
  let agent = inputAgent;
  let mode = info.mode as "Plan" | "Build";
  let draft: InputDraft | undefined;
  const hotkeys = options?.hotkeys ?? info.hotkeys ?? DEFAULT_HOTKEYS;
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
          const restoredMode = options?.statusInfo?.().mode;
          mode = restoredTuiMode(restoredMode, mode);
          loadPromptHistory();
        }
        continue;
      }

      const releasePrompt = await options?.onBeforePrompt?.();
      try {
        const messagesBeforePrompt = [...agent.state.messages];
        if (promptHistory.at(-1) !== message) promptHistory.push(message);
        const cancelled = await runAgentPromptWithHotkeys(agent, message, hotkeys);
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
