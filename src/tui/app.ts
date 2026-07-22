import type { Agent } from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai/compat";
import { emitKeypressEvents } from "node:readline";
import { visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { color, theme } from "./theme.js";
import { DEFAULT_HOTKEYS, formatHotkey, matchesHotkey, type TuiHotkeys } from "./hotkeys.js";
import { RAYA_SLASH_COMMANDS } from "../agent/capabilities.js";
import { insertClipboardImage, insertClipboardText, readClipboard, removeImageMarker, writeClipboardText } from "./clipboard.js";
import { activeWorkspaceMentionStart, attachWorkspaceMention, listWorkspaceMentions, type WorkspaceMention } from "./workspace-mentions.js";
import { characterSuggestions as getCharacterSuggestions } from "../character/catalog.js";

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
  profile?: string;
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
  workspaceMention?: WorkspaceMention;
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
    `Profile    ${info.profile ?? "default"}`,
    `Workspace  ${info.directory}`,
    `Session    ${info.session ?? "Fresh session"}`,
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
  skillSuggestions: () => TuiSkillSuggestion[] = () => [],
  workspaceSuggestions: () => WorkspaceMention[] = () => [],
  characterSuggestions: (query: string) => CommandSuggestion[] = (query) => getCharacterSuggestions(query),
  profileSuggestions: (query: string) => CommandSuggestion[] = () => []
): CommandSuggestion[] {
  const workspaceStart = activeWorkspaceMentionStart(value, cursor);
  if (workspaceStart !== undefined) {
    const query = value.slice(workspaceStart + 1, cursor).toLowerCase();
    const matches = workspaceSuggestions().filter((entry) =>
      !query || entry.path.toLowerCase().includes(query));
    return [
      { value: "Workspace · Enter attaches a file or folder:", description: "", selectable: false },
      ...(matches.length ? matches.map((entry) => ({
        value: entry.path,
        label: entry.type === "directory" ? `${entry.path}/` : entry.path,
        description: entry.type === "directory" ? "Folder" : "File",
        needsArgument: true,
        workspaceMention: entry
      })) : [{ value: "  (none)", description: "", selectable: false }])
    ];
  }
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
    const labels: Record<string, string> = { off: "Off", minimal: "Light", low: "Low", medium: "Medium", high: "High", xhigh: "Ultra", max: "Max" };
    const levels = thinkingSuggestions().map((id) => [id, labels[id] ?? id] as const);
    const query = value.slice(thinkingPrefix.length, cursor).toLowerCase();
    return levels.filter(([id, label]) => id.startsWith(query) || label.toLowerCase().startsWith(query))
      .map(([id, label]) => ({ value: `/thinking ${id}`, description: label }));
  }
  const characterPrefix = "/character ";
  if (value.startsWith(characterPrefix) && cursor >= characterPrefix.length) {
    return characterSuggestions(value.slice(characterPrefix.length, cursor));
  }
  const profilePrefix = "/profile ";
  if (value.startsWith(profilePrefix) && cursor >= profilePrefix.length) {
    return profileSuggestions(value.slice(profilePrefix.length, cursor));
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

export function lineWordStart(value: string, cursor: number): number {
  const lineStart = value.lastIndexOf("\n", Math.max(cursor - 1, 0)) + 1;
  let index = cursor;
  while (index > lineStart && /[^\S\n]/u.test(value[index - 1]!)) index -= 1;
  while (index > lineStart && !/\s/u.test(value[index - 1]!)) index -= 1;
  return index;
}

export function lineWordEnd(value: string, cursor: number): number {
  const newline = value.indexOf("\n", cursor);
  const lineEnd = newline === -1 ? value.length : newline;
  let index = cursor;
  while (index < lineEnd && /[^\S\n]/u.test(value[index]!)) index += 1;
  while (index < lineEnd && !/\s/u.test(value[index]!)) index += 1;
  return index;
}

const promptGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function promptGraphemeBoundaries(value: string): number[] {
  return [0, ...[...promptGraphemeSegmenter.segment(value)].map((item) => item.index + item.segment.length)];
}

export function promptPreviousCharacter(value: string, cursor: number): number {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const boundaries = promptGraphemeBoundaries(value);
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    if (boundaries[index]! < safeCursor) return boundaries[index]!;
  }
  return 0;
}

export function promptNextCharacter(value: string, cursor: number): number {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  return promptGraphemeBoundaries(value).find((boundary) => boundary > safeCursor) ?? value.length;
}

export function promptLineStart(value: string, cursor: number): number {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  return safeCursor === 0 ? 0 : value.lastIndexOf("\n", safeCursor - 1) + 1;
}

export function promptLineEnd(value: string, cursor: number): number {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const newline = value.indexOf("\n", safeCursor);
  return newline === -1 ? value.length : newline;
}

function promptCharacterClass(character: string): "space" | "word" | "punctuation" {
  if (/\s/u.test(character)) return "space";
  return /[\p{L}\p{N}_]/u.test(character) ? "word" : "punctuation";
}

export function promptWordStart(value: string, cursor: number): number {
  let index = Math.max(0, Math.min(cursor, value.length));
  while (index > 0) {
    const previous = promptPreviousCharacter(value, index);
    if (promptCharacterClass(value.slice(previous, index)) !== "space") break;
    index = previous;
  }
  if (index === 0) return 0;
  let previous = promptPreviousCharacter(value, index);
  const targetClass = promptCharacterClass(value.slice(previous, index));
  while (index > 0) {
    previous = promptPreviousCharacter(value, index);
    if (promptCharacterClass(value.slice(previous, index)) !== targetClass) break;
    index = previous;
  }
  return index;
}

export function promptWordEnd(value: string, cursor: number): number {
  let index = Math.max(0, Math.min(cursor, value.length));
  while (index < value.length) {
    const next = promptNextCharacter(value, index);
    if (promptCharacterClass(value.slice(index, next)) !== "space") break;
    index = next;
  }
  if (index >= value.length) return value.length;
  let next = promptNextCharacter(value, index);
  const targetClass = promptCharacterClass(value.slice(index, next));
  while (index < value.length) {
    next = promptNextCharacter(value, index);
    if (promptCharacterClass(value.slice(index, next)) !== targetClass) break;
    index = next;
  }
  return index;
}

export function promptSelectionRange(cursor: number, anchor?: number): { start: number; end: number } | undefined {
  if (anchor === undefined || anchor === cursor) return undefined;
  return { start: Math.min(anchor, cursor), end: Math.max(anchor, cursor) };
}

export function movePromptCursorVertically(
  value: string,
  cursor: number,
  direction: -1 | 1,
  preferredColumn?: number
): { cursor: number; preferredColumn: number } {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const lines = value.split("\n");
  const beforeCursor = value.slice(0, safeCursor).split("\n");
  const currentLine = beforeCursor.length - 1;
  const currentColumn = beforeCursor.at(-1)?.length ?? 0;
  const column = preferredColumn ?? currentColumn;
  const targetLine = Math.max(0, Math.min(lines.length - 1, currentLine + direction));
  const targetStart = lines.slice(0, targetLine).reduce((offset, line) => offset + line.length + 1, 0);
  return {
    cursor: targetStart + Math.min(column, lines[targetLine]?.length ?? 0),
    preferredColumn: column
  };
}

export function deletePromptLine(value: string, cursor: number): {
  value: string;
  cursor: number;
  removedImageIndexes: number[];
} {
  if (!value) return { value, cursor: 0, removedImageIndexes: [] };
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const lineStart = safeCursor === 0 ? 0 : value.lastIndexOf("\n", safeCursor - 1) + 1;
  const nextNewline = value.indexOf("\n", safeCursor);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const deleteStart = nextNewline === -1 && lineStart > 0 ? lineStart - 1 : lineStart;
  const deleteEnd = nextNewline === -1 ? lineEnd : lineEnd + 1;
  return deletePromptRange(value, deleteStart, deleteEnd);
}

export function deletePromptRange(value: string, start: number, end: number): {
  value: string;
  cursor: number;
  removedImageIndexes: number[];
} {
  const safeStart = Math.max(0, Math.min(start, end, value.length));
  const safeEnd = Math.max(safeStart, Math.min(Math.max(start, end), value.length));
  const removedImageIndexes = [...value.slice(safeStart, safeEnd).matchAll(/\[Image (\d+)\]/gu)]
    .map((match) => Number(match[1]) - 1)
    .filter((index, position, indexes) => index >= 0 && indexes.indexOf(index) === position)
    .sort((left, right) => left - right);
  const withoutRange = `${value.slice(0, safeStart)}${value.slice(safeEnd)}`;
  const renumbered = withoutRange.replace(/\[Image (\d+)\]/gu, (marker, rawNumber: string) => {
    const number = Number(rawNumber);
    const removedBefore = removedImageIndexes.filter((index) => index + 1 < number).length;
    return removedBefore ? `[Image ${number - removedBefore}]` : marker;
  });
  return { value: renumbered, cursor: Math.min(safeStart, renumbered.length), removedImageIndexes };
}

export function isDeletePromptLineKey(key: { name?: string; ctrl?: boolean; sequence?: string }): boolean {
  return key.sequence === "\x08"
    || (key.ctrl === true && (key.name === "h" || key.name === "backspace" || key.name === "delete"));
}

function isSuperModifiedKey(key: { sequence?: string }): boolean {
  const sequence = key.sequence ?? "";
  return /\x1b\[(?:1;)?(?:9|10)[A-Za-z~]$/u.test(sequence)
    || /\x1b\[[0-9:]+;(?:9|10)u$/u.test(sequence);
}

/** A compact prompt editor with terminal dropdowns for commands and workspace mentions. */
type InputDraft = { value: string; cursor: number; images?: ImageContent[] };
type TuiLineResult = { line: string; images: ImageContent[] };

/** Sanitize prompt text without replacing real line breaks with visible symbols. */
export function displayPromptValue(value: string): string {
  return value
    .replace(/\t/gu, "  ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/gu, "�");
}

function takeDisplayStart(value: string, width: number): string {
  if (visibleWidth(value) <= width) return value;
  if (width <= 1) return "…".slice(0, Math.max(width, 0));
  let result = "";
  for (const character of Array.from(value)) {
    if (visibleWidth(`${result}${character}…`) > width) break;
    result += character;
  }
  return `${result}…`;
}

function takeDisplayEnd(value: string, width: number): string {
  if (visibleWidth(value) <= width) return value;
  if (width <= 1) return "…".slice(0, Math.max(width, 0));
  let result = "";
  for (const character of Array.from(value).reverse()) {
    if (visibleWidth(`…${character}${result}`) > width) break;
    result = `${character}${result}`;
  }
  return `…${result}`;
}

export function promptViewport(value: string, cursor: number, width: number): { text: string; cursorColumn: number } {
  const safeWidth = Math.max(Math.floor(width), 1);
  const before = displayPromptValue(value.slice(0, cursor));
  const after = displayPromptValue(value.slice(cursor));
  const afterReservation = Math.min(visibleWidth(after), Math.floor(safeWidth / 3));
  const visibleBefore = takeDisplayEnd(before, safeWidth - afterReservation);
  const visibleAfter = takeDisplayStart(after, safeWidth - visibleWidth(visibleBefore));
  return { text: `${visibleBefore}${visibleAfter}`, cursorColumn: visibleWidth(visibleBefore) };
}

const MAX_VISIBLE_INPUT_LINES = 6;

export function multilinePromptViewport(
  value: string,
  cursor: number,
  width: number,
  maxLines = MAX_VISIBLE_INPUT_LINES
): { rows: string[]; cursorRow: number; cursorColumn: number } {
  const lines = value.split("\n");
  const beforeCursor = value.slice(0, cursor).split("\n");
  const currentLine = beforeCursor.length - 1;
  const lineCursor = beforeCursor.at(-1)?.length ?? 0;
  const visibleLineCount = Math.max(Math.floor(maxLines), 1);
  const start = Math.max(0, Math.min(currentLine - Math.floor(visibleLineCount / 2), lines.length - visibleLineCount));
  const end = Math.min(start + visibleLineCount, lines.length);
  const topIndicator = start > 0 ? [`… ${start} lines above`] : [];
  const bottomIndicator = end < lines.length ? [`… ${lines.length - end} lines below`] : [];
  const visibleLines = lines.slice(start, end).map((line, index) =>
    promptViewport(line, start + index === currentLine ? lineCursor : line.length, width).text);
  const currentViewport = promptViewport(lines[currentLine] ?? "", lineCursor, width);
  return {
    rows: [...topIndicator, ...visibleLines, ...bottomIndicator],
    cursorRow: topIndicator.length + currentLine - start,
    cursorColumn: currentViewport.cursorColumn
  };
}

function selectedMultilinePromptRows(value: string, cursor: number, anchor: number, width: number): string[] {
  const viewport = multilinePromptViewport(value, cursor, width);
  const range = promptSelectionRange(cursor, anchor);
  if (!range) return viewport.rows;
  const lines = value.split("\n");
  const beforeCursor = value.slice(0, cursor).split("\n");
  const currentLine = beforeCursor.length - 1;
  const visibleLineCount = Math.max(MAX_VISIBLE_INPUT_LINES, 1);
  const start = Math.max(0, Math.min(currentLine - Math.floor(visibleLineCount / 2), lines.length - visibleLineCount));
  const end = Math.min(start + visibleLineCount, lines.length);
  const rowOffset = start > 0 ? 1 : 0;
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const rows = [...viewport.rows];
  for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    if (visibleWidth(displayPromptValue(line)) > width) continue;
    const lineStart = offsets[lineIndex] ?? 0;
    const lineEnd = lineStart + line.length;
    const localStart = Math.max(0, Math.min(line.length, range.start - lineStart));
    const localEnd = Math.max(0, Math.min(line.length, range.end - lineStart));
    const selectsCharacters = localStart < localEnd && range.end > lineStart && range.start < lineEnd;
    const selectsNewline = lineIndex < lines.length - 1 && range.start <= lineEnd && range.end > lineEnd;
    if (!selectsCharacters && !selectsNewline) continue;
    const before = displayPromptValue(line.slice(0, localStart));
    const selected = displayPromptValue(line.slice(localStart, localEnd));
    const after = displayPromptValue(line.slice(localEnd));
    const newlineMarker = selectsNewline ? "\x1b[7m \x1b[27m" : "";
    rows[rowOffset + lineIndex - start] = `${before}${selected ? `\x1b[7m${selected}\x1b[27m` : ""}${after}${newlineMarker}`;
  }
  return rows;
}

export function styleImageMarkers(value: string): string {
  return value.replace(/\[Image \d+\]/gu, (marker) => `\x1b[7m${marker}\x1b[27m`);
}

const LEGACY_SHIFT_ENTER_SEQUENCE = "\x1b[27;2;13~";
const LEGACY_SHIFT_ENTER_PREFIX = "\x1b[27;2;";
const LEGACY_SHIFT_ENTER_SUFFIX = "13~";
const SHIFT_ENTER_SEQUENCES = ["\n", "\x1b\r", "\x1b[13;2u", "\x1b[13;2~", LEGACY_SHIFT_ENTER_SEQUENCE] as const;

type DecodedTerminalKey = {
  text: string;
  key: { name?: string; ctrl: boolean; meta: boolean; shift: boolean; sequence: string };
};

const KITTY_FUNCTION_KEYS = new Map<number, string>([
  [57348, "insert"], [57349, "delete"], [57350, "left"], [57351, "right"],
  [57352, "up"], [57353, "down"], [57354, "pageup"], [57355, "pagedown"],
  [57356, "home"], [57357, "end"]
]);

export function decodeTerminalKeySequence(sequence: string): DecodedTerminalKey | undefined {
  const csiU = sequence.match(/^\x1b\[(\d+)(?::\d+)?;(\d+)(?::\d+)?u$/u);
  const modifyOtherKeys = sequence.match(/^\x1b\[27;(\d+);(\d+)~$/u);
  const rawCodepoint = csiU?.[1] ?? modifyOtherKeys?.[2];
  const rawModifier = csiU?.[2] ?? modifyOtherKeys?.[1];
  if (!rawCodepoint || !rawModifier) return undefined;
  const codepoint = Number(rawCodepoint);
  const modifierBits = Math.max(Number(rawModifier) - 1, 0);
  const shift = (modifierBits & 1) !== 0;
  const alt = (modifierBits & 2) !== 0;
  const ctrl = (modifierBits & 4) !== 0;
  const superKey = (modifierBits & 8) !== 0;
  const protocolMeta = (modifierBits & 32) !== 0;
  const character = codepoint >= 0 && codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : "";
  const specialName = KITTY_FUNCTION_KEYS.get(codepoint)
    ?? ({ 8: "backspace", 9: "tab", 13: "enter", 27: "escape", 127: "backspace" } as Record<number, string>)[codepoint];
  const name = specialName ?? (character.length === 1 ? character.toLowerCase() : undefined);
  const meta = alt || superKey || protocolMeta;
  const text = specialName || ctrl || meta ? "" : shift ? character.toUpperCase() : character;
  return { text, key: { name, ctrl, meta, shift, sequence } };
}

export function isShiftEnterSequence(raw: string): boolean {
  return SHIFT_ENTER_SEQUENCES.some((sequence) => raw === sequence);
}

export function advanceLegacyShiftEnterKeypress(
  suffix: string | undefined,
  sequence: string
): { kind: "inactive" | "newline" } | { kind: "pending"; suffix: string } | { kind: "replay"; text: string } {
  if (sequence === LEGACY_SHIFT_ENTER_PREFIX) return { kind: "pending", suffix: "" };
  if (suffix === undefined) return { kind: "inactive" };
  const candidate = `${suffix}${sequence}`;
  if (LEGACY_SHIFT_ENTER_SUFFIX.startsWith(candidate)) {
    return candidate === LEGACY_SHIFT_ENTER_SUFFIX
      ? { kind: "newline" }
      : { kind: "pending", suffix: candidate };
  }
  return { kind: "replay", text: suffix };
}

export function isShiftEnterKey(key: { name?: string; shift?: boolean }): boolean {
  return (key.name === "return" || key.name === "enter") && key.shift === true;
}
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
const MENU_COMMANDS = new Set(["/providers", "/models", "/thinking", "/character", "/profile", "/theme", "/security", "/sessions", "/skills"]);

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
  characterSuggestions?: (query: string) => CommandSuggestion[];
  profileSuggestions?: (query: string) => CommandSuggestion[];
  hotkeys?: TuiHotkeys;
  workspace?: string;
}, draft?: InputDraft, history: string[] = []): Promise<TuiLineResult> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error("Raya's interactive TUI requires a TTY terminal.");
  }

  let value = draft?.value ?? "";
  const images = [...(draft?.images ?? [])];
  const label = (): string => value.startsWith("!") ? "[Term] > " : `[${mode}] > `;
  let cursor = Math.min(draft?.cursor ?? value.length, value.length);
  let selected = 0;
  let visible = 0;
  let killBuffer = "";
  let verticalCursorColumn: number | undefined;
  let selectionAnchor: number | undefined;
  let historyState: PromptHistoryState = { index: history.length, draft: value };
  let deleteArmedValue: string | undefined;
  let menuDismissed = false;
  let settled = false;
  let bracketedPaste = "";
  let collectingBracketedPaste = false;
  let suppressKeypressesForDataChunk = false;
  let modifyOtherKeysCandidate: { modifier: string; suffix: string } | undefined;
  let clipboardPastePending = false;
  let workspaceMentionCache: WorkspaceMention[] | undefined;
  let renderedCursorRow = 0;
  let onData: (data: Buffer | string) => void;
  const hotkeys = options?.hotkeys ?? info().hotkeys ?? DEFAULT_HOTKEYS;
  const workspaceSuggestions = (): WorkspaceMention[] => {
    workspaceMentionCache ??= listWorkspaceMentions(options?.workspace ?? process.cwd());
    return workspaceMentionCache;
  };

  const render = (): void => {
    const current = info();
    // Leave the last terminal column unused: writing into it can trigger an
    // automatic wrap that readline reports as an extra physical row.
    const terminalWidth = Math.max((output.columns ?? 121) - 1, 32);
    const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions, options?.themeSuggestions, options?.skillSuggestions, workspaceSuggestions, options?.characterSuggestions, options?.profileSuggestions);
    if (selected >= suggestions.length) selected = Math.max(suggestions.length - 1, 0);
    if (suggestions[selected]?.selectable === false) selected = selectableIndex(suggestions, selected - 1, 1);
    // Paint over the previous frame instead of clearing the whole menu first.
    // Clearing first creates a visible blank frame on every arrow-key press.
    output.write(`\r${renderedCursorRow > 0 ? `\x1b[${renderedCursorRow}A` : ""}`);
    const inputWidth = Math.max(terminalWidth - visibleWidth(label()), 1);
    const multilineViewport = multilinePromptViewport(value, cursor, inputWidth);
    const displayRows = selectionAnchor === undefined
      ? multilineViewport.rows
      : selectedMultilinePromptRows(value, cursor, selectionAnchor, inputWidth);
    for (const [index, row] of displayRows.entries()) {
      const prefix = index === 0 ? color(label(), theme.blue) : " ".repeat(visibleWidth(label()));
      output.write(prefix + color(styleImageMarkers(row), theme.white) + "\x1b[K\n");
    }
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
    const footer = `Context ${used}/${limit} · ${modelStatusLabel(current)} · Profile ${current.profile ?? "default"} · ${current.directory} · Raya v${current.version}`;
    output.write(color(fitCell(footer, terminalWidth).trimEnd(), theme.gray) + "\x1b[K\n\x1b[J");
    visible = suggestionLines;
    const rowsUp = displayRows.length + visible + 1 - multilineViewport.cursorRow;
    const cursorColumn = visibleWidth(label()) + multilineViewport.cursorColumn;
    output.write(`\x1b[${rowsUp}A\r\x1b[${cursorColumn}C`);
    renderedCursorRow = multilineViewport.cursorRow;
  };

  const finish = (resolve: (result: TuiLineResult) => void, line: string, echo = true): void => {
    if (settled) return;
    settled = true;
    input.setRawMode(false);
    input.off("keypress", onKeypress);
    if (activeRawInputHandler === onData) activeRawInputHandler = undefined;
    input.pause();
    activeNotificationHandler = undefined;
    output.write("\x1b[?2004l");
    output.write(`\r${renderedCursorRow > 0 ? `\x1b[${renderedCursorRow}A` : ""}\x1b[J`);
    if (echo) {
      const viewport = multilinePromptViewport(line, line.length, Math.max((output.columns ?? 121) - 1 - visibleWidth(label()), 1));
      for (const [index, row] of viewport.rows.entries()) {
        const prefix = index === 0 ? color(label(), theme.blue) : " ".repeat(visibleWidth(label()));
        output.write(prefix + color(styleImageMarkers(row), theme.white) + "\n");
      }
    }
    resolve({ line, images: [...images] });
  };

  const insertPastedText = (text: string): void => {
    const selection = promptSelectionRange(cursor, selectionAnchor);
    if (selection) {
      const deleted = deletePromptRange(value, selection.start, selection.end);
      value = deleted.value;
      cursor = deleted.cursor;
      for (const imageIndex of [...deleted.removedImageIndexes].reverse()) images.splice(imageIndex, 1);
    }
    const next = insertClipboardText(value, cursor, text);
    value = next.value;
    cursor = next.cursor;
    selectionAnchor = undefined;
    verticalCursorColumn = undefined;
    selected = 0;
    menuDismissed = false;
    render();
  };

  const pasteFromClipboard = async (): Promise<void> => {
    if (clipboardPastePending) return;
    clipboardPastePending = true;
    try {
      const payload = await readClipboard();
      if (settled) return;
      if (!payload) {
        notifyTui("Clipboard is empty or this clipboard format is not supported.");
      } else if (payload.kind === "text") {
        insertPastedText(payload.text);
      } else {
        const selection = promptSelectionRange(cursor, selectionAnchor);
        if (selection) {
          const deleted = deletePromptRange(value, selection.start, selection.end);
          value = deleted.value;
          cursor = deleted.cursor;
          for (const imageIndex of [...deleted.removedImageIndexes].reverse()) images.splice(imageIndex, 1);
        }
        images.push(payload.image);
        const next = insertClipboardImage(value, cursor, images.length);
        value = next.value;
        cursor = next.cursor;
        selectionAnchor = undefined;
        verticalCursorColumn = undefined;
        selected = 0;
        menuDismissed = false;
        render();
      }
    } catch (error) {
      notifyTui(`Could not paste clipboard: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clipboardPastePending = false;
    }
  };

  const insertCommand = (suggestion: CommandSuggestion, addSpace: boolean): void => {
    if (suggestion.workspaceMention) {
      const attached = attachWorkspaceMention(value, cursor, suggestion.workspaceMention.path, suggestion.workspaceMention.type);
      value = attached.value;
      cursor = attached.cursor;
      selectionAnchor = undefined;
      selected = 0;
      menuDismissed = false;
      return;
    }
    if (suggestion.value.startsWith("@skill:")) {
      const attached = attachSkillToPrompt(value, cursor, suggestion.value.slice("@skill:".length));
      value = attached.value;
      cursor = attached.cursor;
      selectionAnchor = undefined;
      selected = 0;
      menuDismissed = false;
      return;
    }
    const start = activeCommandStart(value, cursor) ?? ((value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/character") || value.startsWith("/theme") || value.startsWith("/security") || value.startsWith("/providers") || value.startsWith("/models") || value.startsWith("/skills")) ? 0 : undefined);
    if (start === undefined) return;
    const insertion = `${suggestion.value}${addSpace || suggestion.needsArgument ? " " : ""}`;
    value = value.slice(0, start) + insertion + value.slice(cursor);
    cursor = start + insertion.length;
    selectionAnchor = undefined;
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
    verticalCursorColumn = undefined;
    selectionAnchor = undefined;
  };

  const moveEditorCursor = (nextCursor: number, extendSelection: boolean): void => {
    if (extendSelection) selectionAnchor ??= cursor;
    else selectionAnchor = undefined;
    cursor = Math.max(0, Math.min(nextCursor, value.length));
    if (selectionAnchor === cursor) selectionAnchor = undefined;
  };

  const navigatePromptLine = (direction: -1 | 1, extendSelection: boolean): void => {
    const next = movePromptCursorVertically(value, cursor, direction, verticalCursorColumn);
    moveEditorCursor(next.cursor, extendSelection);
    verticalCursorColumn = next.preferredColumn;
  };

  const deleteEditorRange = (start: number, end: number): void => {
    const deleted = deletePromptRange(value, start, end);
    value = deleted.value;
    cursor = deleted.cursor;
    selectionAnchor = undefined;
    for (const imageIndex of [...deleted.removedImageIndexes].reverse()) images.splice(imageIndex, 1);
  };

  const deleteSelection = (): boolean => {
    const selection = promptSelectionRange(cursor, selectionAnchor);
    if (!selection) return false;
    deleteEditorRange(selection.start, selection.end);
    return true;
  };

  const copySelection = async (cut: boolean): Promise<void> => {
    const selection = promptSelectionRange(cursor, selectionAnchor);
    if (!selection) return;
    const selectedText = value.slice(selection.start, selection.end);
    try {
      await writeClipboardText(selectedText);
    } catch {
      output.write(`\x1b]52;c;${Buffer.from(selectedText, "utf8").toString("base64")}\x07`);
    }
    if (settled || !cut) return;
    deleteSelection();
    selected = 0;
    menuDismissed = false;
    render();
  };

  let onKeypress: (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string }) => void;
  const result = new Promise<TuiLineResult>((resolve) => {
    onData = (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const raw = bytes.toString("utf8");
      const pasteStart = "\x1b[200~";
      const pasteEnd = "\x1b[201~";
      if (collectingBracketedPaste || raw.includes(pasteStart)) {
        suppressKeypressesForDataChunk = true;
        queueMicrotask(() => { suppressKeypressesForDataChunk = false; });
        const chunk = collectingBracketedPaste ? raw : raw.slice(raw.indexOf(pasteStart) + pasteStart.length);
        collectingBracketedPaste = true;
        const end = chunk.indexOf(pasteEnd);
        if (end === -1) {
          bracketedPaste += chunk;
        } else {
          bracketedPaste += chunk.slice(0, end);
          const pasted = bracketedPaste;
          bracketedPaste = "";
          collectingBracketedPaste = false;
          insertPastedText(pasted);
        }
        return;
      }
      if (bytes.length === 1 && bytes[0] === 0x16) {
        suppressKeypressesForDataChunk = true;
        queueMicrotask(() => { suppressKeypressesForDataChunk = false; });
        void pasteFromClipboard();
        return;
      }
      if (hotkeys.exit === "ctrl+c" && bytes.length === 1 && bytes[0] === 0x03) {
        if (promptSelectionRange(cursor, selectionAnchor)) {
          return;
        }
        finish(resolve, EXIT_SIGNAL, false);
        return;
      }
      if (hotkeys.cancel === "escape" && bytes.length === 1 && bytes[0] === 0x1b) {
        const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions, options?.themeSuggestions, options?.skillSuggestions, workspaceSuggestions, options?.characterSuggestions, options?.profileSuggestions);
        if (suggestions.length) {
          menuDismissed = true;
          selected = 0;
          render();
        }
      }
    };
    onKeypress = (text, key) => {
      if (isShiftEnterSequence(key.sequence ?? "")) {
        modifyOtherKeysCandidate = undefined;
        insertPastedText("\n");
        return;
      }
      let decodedKey = decodeTerminalKeySequence(key.sequence ?? "");
      const modifyOtherKeysPrefix = (key.sequence ?? "").match(/^\x1b\[27;(\d+);$/u);
      if (!decodedKey && modifyOtherKeysPrefix) {
        modifyOtherKeysCandidate = { modifier: modifyOtherKeysPrefix[1]!, suffix: "" };
        return;
      }
      if (!decodedKey && modifyOtherKeysCandidate) {
        modifyOtherKeysCandidate.suffix += key.sequence ?? text;
        if (/^\d*$/u.test(modifyOtherKeysCandidate.suffix)) return;
        if (/^\d+~$/u.test(modifyOtherKeysCandidate.suffix)) {
          decodedKey = decodeTerminalKeySequence(`\x1b[27;${modifyOtherKeysCandidate.modifier};${modifyOtherKeysCandidate.suffix}`);
          modifyOtherKeysCandidate = undefined;
        } else {
          const replay = modifyOtherKeysCandidate.suffix;
          modifyOtherKeysCandidate = undefined;
          if (replay) insertPastedText(replay);
          return;
        }
      }
      if (decodedKey) {
        text = decodedKey.text;
        key = { ...key, ...decodedKey.key };
      }
      if (suppressKeypressesForDataChunk) return;
      if (clipboardPastePending && (key.name === "return" || key.name === "enter" || (key.ctrl && key.name === "v"))) return;
      const previousValue = value;
      if (key.name !== "up" && key.name !== "down") verticalCursorColumn = undefined;
      const suggestions = menuDismissed ? [] : commandSuggestions(value, cursor, options?.sessionSuggestions, options?.thinkingSuggestions, options?.providerSuggestions, options?.modelSuggestions, options?.themeSuggestions, options?.skillSuggestions, workspaceSuggestions, options?.characterSuggestions, options?.profileSuggestions);
      if ((key.meta || key.ctrl) && key.name === "c" && promptSelectionRange(cursor, selectionAnchor)) {
        void copySelection(false).catch((error) => notifyTui(`Could not copy selection: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
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
        render();
        return;
      }
      if (key.name === "up" && suggestions.length && !key.shift && !key.ctrl && !key.meta) {
        verticalCursorColumn = undefined;
        selected = selectableIndex(suggestions, selected, -1);
        render();
        return;
      }
      if (key.name === "down" && suggestions.length && !key.shift && !key.ctrl && !key.meta) {
        verticalCursorColumn = undefined;
        selected = selectableIndex(suggestions, selected, 1);
        render();
        return;
      }
      if (key.name === "up" || key.name === "down") {
        const direction = key.name === "up" ? -1 : 1;
        if (isSuperModifiedKey(key) || key.meta) {
          moveEditorCursor(direction === -1 ? 0 : value.length, key.shift === true);
          verticalCursorColumn = undefined;
          render();
          return;
        }
        if (value.includes("\n") || key.shift || key.ctrl) {
          navigatePromptLine(direction, key.shift === true);
          render();
          return;
        }
      }
      if (!suggestions.length && !key.shift && !key.ctrl && !key.meta && key.name === "up") {
        navigateHistory(-1);
        render();
        return;
      }
      if (!suggestions.length && !key.shift && !key.ctrl && !key.meta && key.name === "down") {
        navigateHistory(1);
        render();
        return;
      }
      if (matchesHotkey(text, key, hotkeys.toggleMode)) {
        finish(resolve, `${MODE_TOGGLE_PREFIX}${JSON.stringify({ value, cursor })}`, false);
        return;
      }
      if (key.name === "escape" && selectionAnchor !== undefined) {
        selectionAnchor = undefined;
        render();
        return;
      }
      if ((key.ctrl || key.meta) && key.name === "a") {
        selectionAnchor = 0;
        cursor = value.length;
        verticalCursorColumn = undefined;
        render();
        return;
      }
      if ((key.meta || key.ctrl) && key.name === "v") {
        void pasteFromClipboard();
        return;
      }
      if ((key.meta || key.ctrl) && key.name === "x") {
        if (!promptSelectionRange(cursor, selectionAnchor) && value) {
          const start = promptLineStart(value, cursor);
          const end = promptLineEnd(value, cursor);
          selectionAnchor = start;
          cursor = end < value.length ? end + 1 : end;
        }
        void copySelection(true).catch((error) => notifyTui(`Could not cut selection: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      if (key.name === "left" || key.name === "right") {
        const forward = key.name === "right";
        const selection = promptSelectionRange(cursor, selectionAnchor);
        const nextCursor = selection && !key.shift && !key.ctrl && !key.meta
          ? (forward ? selection.end : selection.start)
          : isSuperModifiedKey(key)
            ? (forward ? promptLineEnd(value, cursor) : promptLineStart(value, cursor))
            : (key.ctrl || key.meta)
              ? (forward ? promptWordEnd(value, cursor) : promptWordStart(value, cursor))
              : (forward ? promptNextCharacter(value, cursor) : promptPreviousCharacter(value, cursor));
        moveEditorCursor(nextCursor, key.shift === true);
        verticalCursorColumn = undefined;
        render();
        return;
      }
      if (key.name === "home" || key.name === "end") {
        const forward = key.name === "end";
        const nextCursor = key.ctrl || key.meta || isSuperModifiedKey(key)
          ? (forward ? value.length : 0)
          : (forward ? promptLineEnd(value, cursor) : promptLineStart(value, cursor));
        moveEditorCursor(nextCursor, key.shift === true);
        verticalCursorColumn = undefined;
        render();
        return;
      }
      if (isShiftEnterKey(key)) {
        insertPastedText("\n");
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        if (suggestions.length) {
          const suggestion = suggestions[selected]!;
          if (suggestion.selectable === false) return;
          const commandAtStart = (activeCommandStart(value, cursor) === 0 || value.startsWith("/sessions") || value.startsWith("/thinking") || value.startsWith("/character") || value.startsWith("/profile") || value.startsWith("/theme") || value.startsWith("/security") || value.startsWith("/providers") || value.startsWith("/models") || value.startsWith("/skills")) && cursor === value.length;
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
      const standardDeletionKey = (
        key.name === "backspace" || key.name === "delete"
        || (key.ctrl && ["h", "d", "w", "u", "k"].includes(key.name ?? ""))
        || (key.meta && ["backspace", "delete", "d"].includes(key.name ?? ""))
      );
      if (standardDeletionKey && deleteSelection()) {
        selected = 0;
        menuDismissed = false;
        render();
        return;
      }
      const markerDirection = (key.name === "backspace" && !isDeletePromptLineKey(key))
        || (key.meta && key.name === "backspace")
        ? "backward"
        : (key.name === "delete" && !key.ctrl)
          || (key.ctrl && key.name === "d") ? "forward" : undefined;
      if (markerDirection) {
        const removed = removeImageMarker(value, cursor, markerDirection);
        if (removed) {
          value = removed.value;
          cursor = removed.cursor;
          if (removed.imageIndex >= 0 && removed.imageIndex < images.length) images.splice(removed.imageIndex, 1);
          selected = 0;
          menuDismissed = false;
          render();
          return;
        }
      }
      if (key.ctrl && key.shift && key.name === "k") {
        const deleted = deletePromptLine(value, cursor);
        value = deleted.value;
        cursor = deleted.cursor;
        selectionAnchor = undefined;
        for (const imageIndex of [...deleted.removedImageIndexes].reverse()) images.splice(imageIndex, 1);
      } else if (key.ctrl && key.name === "e") {
        moveEditorCursor(promptLineEnd(value, cursor), key.shift === true);
      } else if (key.ctrl && key.name === "u") {
        const start = promptLineStart(value, cursor);
        killBuffer = value.slice(start, cursor);
        deleteEditorRange(start, cursor);
      } else if (key.ctrl && key.name === "k") {
        const end = promptLineEnd(value, cursor);
        killBuffer = value.slice(cursor, end);
        deleteEditorRange(cursor, end);
      } else if (isDeletePromptLineKey(key)) {
        const deleted = deletePromptLine(value, cursor);
        killBuffer = "";
        value = deleted.value;
        cursor = deleted.cursor;
        selectionAnchor = undefined;
        for (const imageIndex of [...deleted.removedImageIndexes].reverse()) images.splice(imageIndex, 1);
      } else if ((key.ctrl && key.name === "w") || (key.meta && key.name === "backspace")) {
        const start = promptWordStart(value, cursor);
        killBuffer = value.slice(start, cursor);
        deleteEditorRange(start, cursor);
      } else if (key.ctrl && key.name === "d") {
        deleteEditorRange(cursor, promptNextCharacter(value, cursor));
      } else if (key.ctrl && key.name === "t" && cursor > 0 && cursor < value.length) {
        const leftStart = promptPreviousCharacter(value, cursor);
        const rightEnd = promptNextCharacter(value, cursor);
        const left = value.slice(leftStart, cursor);
        const right = value.slice(cursor, rightEnd);
        value = value.slice(0, leftStart) + right + left + value.slice(rightEnd);
        cursor = rightEnd;
      } else if (matchesHotkey(text, key, hotkeys.clearScreen)) {
        output.write("\x1b[2J\x1b[H");
      } else if ((key.meta && (key.name === "d" || key.name === "delete"))) {
        const end = promptWordEnd(value, cursor);
        killBuffer = value.slice(cursor, end);
        deleteEditorRange(cursor, end);
      } else if (key.name === "backspace" || (key.ctrl && key.name === "h")) {
        deleteEditorRange(promptPreviousCharacter(value, cursor), cursor);
      } else if (key.name === "delete") {
        deleteEditorRange(cursor, promptNextCharacter(value, cursor));
      } else if (text && !key.ctrl && !key.sequence?.startsWith("\x1b")) {
        insertPastedText(text);
        return;
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
    output.write("\x1b[>1u\x1b[?2004h");
    activeNotificationHandler = (message) => {
      output.write(`\r${renderedCursorRow > 0 ? `\x1b[${renderedCursorRow}A` : ""}\x1b[J`);
      renderedCursorRow = 0;
      output.write(`${color(message, theme.yellow)}\n`);
      render();
    };
    render();
  });

  return result.finally(() => {
    output.write("\x1b[<u\x1b[?2004l");
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

async function runAgentPromptWithHotkeys(agent: Agent, message: string, images: ImageContent[], hotkeys: TuiHotkeys): Promise<boolean> {
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
    await agent.prompt(message, images);
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
  characterSuggestions?: (query: string) => TuiCommandSuggestion[];
  profileSuggestions?: (query: string) => TuiCommandSuggestion[];
  statusInfo?: () => TuiSessionInfo;
  onBeforePrompt?: () => Promise<(() => void) | void> | (() => void) | void;
  hotkeys?: TuiHotkeys;
  workspace?: string;
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
      const promptResult = await readTuiLine(mode, options?.statusInfo ?? (() => ({ ...info, mode })), options, draft, promptHistory);
      const prompt = promptResult.line;
      draft = undefined;
      const message = prompt.trim();

      if (prompt === EXIT_SIGNAL) {
        console.log("Bye bye");
        break;
      }

      if (prompt.startsWith(MODE_TOGGLE_PREFIX)) {
        draft = { ...JSON.parse(prompt.slice(MODE_TOGGLE_PREFIX.length)) as InputDraft, images: promptResult.images };
        const result = await options?.onToggleMode?.(agent);
        if (result) {
          agent = result.agent ?? agent;
          mode = result.mode;
        }
        continue;
      }

      if (prompt.startsWith(MENU_OPEN_PREFIX)) {
        const command = prompt.slice(MENU_OPEN_PREFIX.length);
        draft = { value: `${command} `, cursor: command.length + 1, images: promptResult.images };
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
        const cancelled = await runAgentPromptWithHotkeys(agent, message, promptResult.images, hotkeys);
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
