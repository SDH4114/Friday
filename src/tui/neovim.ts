import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureRayaHome, RAYA_LEGACY_VIM_CONFIG_PATH, RAYA_NEOVIM_CONFIG_PATH } from "../config/paths.js";

export type NeovimMode = "NORMAL" | "INSERT" | "VISUAL" | "REPLACE";
export type NeovimKey = { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string };
type Snapshot = { value: string; cursor: number };
type Operator = "delete" | "change" | "yank";
type FindCommand = "f" | "F" | "t" | "T";
type RecordedKey = { text: string; key: NeovimKey };

export type NeovimState = {
  mode: NeovimMode;
  pending: string;
  count: string;
  operator?: Operator;
  operatorCount: number;
  register: string;
  selectionStart?: number;
  undo: Snapshot[];
  redo: Snapshot[];
  insertUndoOpen: boolean;
  lastFind?: { command: FindCommand; character: string };
  recording?: RecordedKey[];
  recordingStartValue?: string;
  lastChange?: RecordedKey[];
  replaying?: boolean;
};

export type NeovimConfig = {
  start_mode: "normal" | "insert";
  show_mode: boolean;
  clipboard: "internal";
  max_undo: number;
  bindings: Record<string, string[]>;
};

export const DEFAULT_NEOVIM_CONFIG: NeovimConfig = {
  start_mode: "normal",
  show_mode: true,
  clipboard: "internal",
  max_undo: 200,
  bindings: {
    normal_mode: ["Escape", "Ctrl+["], insert_before: ["i"], insert_after: ["a"], insert_start: ["I"], insert_end: ["A"],
    insert_first_non_blank: ["gI"], open_end: ["o"], open_start: ["O"], visual_mode: ["v"], visual_line: ["V"],
    replace_once: ["r"], replace_mode: ["R"], left: ["h", "Left", "Backspace"], right: ["l", "Right", " "],
    word_forward: ["w"], WORD_forward: ["W"], word_backward: ["b"], WORD_backward: ["B"], word_end: ["e"], WORD_end: ["E"],
    line_start: ["0", "Home"], first_non_blank: ["^"], line_end: ["$", "End"], document_start: ["gg"], document_end: ["G"],
    find_forward: ["f"], find_backward: ["F"], till_forward: ["t"], till_backward: ["T"], repeat_find: [";"], reverse_find: [","],
    delete: ["d"], change: ["c"], yank: ["y"], delete_char: ["x", "Delete"], delete_before: ["X"],
    paste_after: ["p"], paste_before: ["P"], undo: ["u"], redo: ["Ctrl+r"],
    delete_to_end: ["D"], change_to_end: ["C"], yank_to_end: ["Y"], substitute: ["s"], substitute_line: ["S"],
    command_palette: ["/"], toggle_case: ["~"], repeat_change: ["."]
  }
};

export function ensureNeovimConfig(): NeovimConfig {
  ensureRayaHome();
  const sourcePath = existsSync(RAYA_NEOVIM_CONFIG_PATH)
    ? RAYA_NEOVIM_CONFIG_PATH
    : existsSync(RAYA_LEGACY_VIM_CONFIG_PATH) ? RAYA_LEGACY_VIM_CONFIG_PATH : undefined;
  if (!sourcePath) {
    writeFileSync(RAYA_NEOVIM_CONFIG_PATH, `${JSON.stringify(DEFAULT_NEOVIM_CONFIG, null, 2)}\n`, { mode: 0o600 });
    return DEFAULT_NEOVIM_CONFIG;
  }
  try {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8")) as Partial<NeovimConfig>;
    const merged: NeovimConfig = {
      ...DEFAULT_NEOVIM_CONFIG,
      ...raw,
      max_undo: Number.isInteger(raw.max_undo) && Number(raw.max_undo) > 0 ? Number(raw.max_undo) : DEFAULT_NEOVIM_CONFIG.max_undo,
      bindings: { ...DEFAULT_NEOVIM_CONFIG.bindings, ...(raw.bindings ?? {}) }
    };
    if (sourcePath !== RAYA_NEOVIM_CONFIG_PATH || JSON.stringify(raw) !== JSON.stringify(merged)) {
      writeFileSync(RAYA_NEOVIM_CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
    }
    return merged;
  } catch {
    return DEFAULT_NEOVIM_CONFIG;
  }
}

export function createNeovimState(config: NeovimConfig): NeovimState {
  return {
    mode: config.start_mode === "insert" ? "INSERT" : "NORMAL",
    pending: "",
    count: "",
    operatorCount: 1,
    register: "",
    undo: [],
    redo: [],
    insertUndoOpen: false
  };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const MAX_COUNT = 9_999;

function graphemes(value: string): Array<{ start: number; end: number; text: string }> {
  return [...segmenter.segment(value)].map((item) => ({ start: item.index, end: item.index + item.segment.length, text: item.segment }));
}

function clampInsert(value: string, cursor: number): number {
  if (cursor <= 0) return 0;
  if (cursor >= value.length) return value.length;
  const parts = graphemes(value);
  return parts.find((part) => cursor <= part.start)?.start ?? value.length;
}

function clampNormal(value: string, cursor: number): number {
  if (!value) return 0;
  const parts = graphemes(value);
  if (cursor <= 0) return 0;
  if (cursor >= value.length) return parts.at(-1)?.start ?? 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) if (parts[index]!.start <= cursor) return parts[index]!.start;
  return 0;
}

function nextCharacter(value: string, cursor: number, count = 1, allowEnd = false): number {
  const starts = graphemes(value).map((part) => part.start);
  const current = starts.findIndex((start) => start >= cursor);
  const target = Math.max(0, (current < 0 ? starts.length : current) + count);
  return target >= starts.length ? (allowEnd ? value.length : starts.at(-1) ?? 0) : starts[target]!;
}

function previousCharacter(value: string, cursor: number, count = 1): number {
  const starts = graphemes(value).map((part) => part.start);
  let index = -1;
  for (let at = starts.length - 1; at >= 0; at -= 1) if (starts[at]! < cursor) { index = at; break; }
  index = Math.max(0, index - count + 1);
  return starts[index] ?? 0;
}

function characterEnd(value: string, cursor: number): number {
  return graphemes(value).find((part) => part.start === clampNormal(value, cursor))?.end ?? cursor;
}

function token(text: string, key: NeovimKey): string {
  if (key.ctrl && key.name) return `Ctrl+${key.name}`;
  if (key.meta && key.name) return `Alt+${key.name}`;
  const named: Record<string, string> = {
    escape: "Escape", left: "Left", right: "Right", up: "Up", down: "Down", home: "Home", end: "End",
    delete: "Delete", backspace: "Backspace", return: "Enter", enter: "Enter", tab: "Tab"
  };
  return (key.name && named[key.name]) || text || key.sequence || "";
}

function isBinding(config: NeovimConfig, action: string, input: string): boolean {
  return config.bindings[action]?.includes(input) ?? false;
}

function actionFor(config: NeovimConfig, input: string): string | undefined {
  return Object.entries(config.bindings).find(([, keys]) => keys.includes(input))?.[0];
}

type CharacterClass = "space" | "word" | "punct";
function characterClass(value: string): CharacterClass {
  if (/^\s+$/u.test(value)) return "space";
  if (/^[\p{L}\p{N}_]+$/u.test(value)) return "word";
  return "punct";
}

function wordStartForward(value: string, cursor: number, count: number, big: boolean): number {
  const parts = graphemes(value);
  if (!parts.length) return 0;
  let index = Math.max(0, parts.findIndex((part) => part.start >= cursor));
  for (let step = 0; step < count; step += 1) {
    const initial = big ? (characterClass(parts[index]?.text ?? "") === "space" ? "space" : "word") : characterClass(parts[index]?.text ?? "");
    while (index < parts.length && (big ? (characterClass(parts[index]!.text) === "space" ? "space" : "word") : characterClass(parts[index]!.text)) === initial) index += 1;
    while (index < parts.length && characterClass(parts[index]!.text) === "space") index += 1;
  }
  return index >= parts.length ? value.length : parts[index]!.start;
}

function wordStartBackward(value: string, cursor: number, count: number, big: boolean): number {
  const parts = graphemes(value);
  if (!parts.length) return 0;
  let found = -1;
  for (let at = parts.length - 1; at >= 0; at -= 1) if (parts[at]!.start < cursor) { found = at; break; }
  let index = Math.max(0, found);
  for (let step = 0; step < count; step += 1) {
    while (index > 0 && characterClass(parts[index]!.text) === "space") index -= 1;
    const initial = big ? "word" : characterClass(parts[index]!.text);
    while (index > 0) {
      const previous = big ? (characterClass(parts[index - 1]!.text) === "space" ? "space" : "word") : characterClass(parts[index - 1]!.text);
      if (previous !== initial) break;
      index -= 1;
    }
  }
  return parts[index]?.start ?? 0;
}

function wordEndForward(value: string, cursor: number, count: number, big: boolean): number {
  const parts = graphemes(value);
  if (!parts.length) return 0;
  let index = Math.max(0, parts.findIndex((part) => part.start >= cursor));
  for (let step = 0; step < count; step += 1) {
    if (step > 0 && index < parts.length) index += 1;
    while (index < parts.length && characterClass(parts[index]!.text) === "space") index += 1;
    if (index >= parts.length) return parts.at(-1)!.start;
    const initial = big ? "word" : characterClass(parts[index]!.text);
    while (index + 1 < parts.length) {
      const next = big ? (characterClass(parts[index + 1]!.text) === "space" ? "space" : "word") : characterClass(parts[index + 1]!.text);
      if (next !== initial) break;
      index += 1;
    }
  }
  return parts[Math.min(index, parts.length - 1)]!.start;
}

type Motion = "left" | "right" | "wordForward" | "WORDForward" | "wordBackward" | "WORDBackward" | "wordEnd" | "WORDEnd" | "start" | "first" | "end" | "top" | "bottom";

function motionFor(config: NeovimConfig, input: string): Motion | undefined {
  const map: Array<[string, Motion]> = [
    ["left", "left"], ["right", "right"], ["word_forward", "wordForward"], ["WORD_forward", "WORDForward"],
    ["word_backward", "wordBackward"], ["WORD_backward", "WORDBackward"], ["word_end", "wordEnd"], ["WORD_end", "WORDEnd"],
    ["line_start", "start"], ["first_non_blank", "first"], ["line_end", "end"], ["document_start", "top"], ["document_end", "bottom"]
  ];
  return map.find(([action]) => isBinding(config, action, input))?.[1];
}

function move(value: string, cursor: number, motion: Motion, count: number): number {
  if (motion === "left") return previousCharacter(value, cursor, count);
  if (motion === "right") return nextCharacter(value, cursor, count);
  if (motion === "wordForward") return clampNormal(value, wordStartForward(value, cursor, count, false));
  if (motion === "WORDForward") return clampNormal(value, wordStartForward(value, cursor, count, true));
  if (motion === "wordBackward") return wordStartBackward(value, cursor, count, false);
  if (motion === "WORDBackward") return wordStartBackward(value, cursor, count, true);
  if (motion === "wordEnd") return wordEndForward(value, cursor, count, false);
  if (motion === "WORDEnd") return wordEndForward(value, cursor, count, true);
  if (motion === "first") return value.search(/\S|$/u);
  if (motion === "end" || motion === "bottom") return clampNormal(value, value.length);
  return 0;
}

function findCharacter(value: string, cursor: number, command: FindCommand, character: string, count: number): number | undefined {
  const parts = graphemes(value);
  const current = Math.max(0, parts.findIndex((part) => part.start === clampNormal(value, cursor)));
  const forward = command === "f" || command === "t";
  let remaining = count;
  if (forward) {
    for (let index = current + 1; index < parts.length; index += 1) {
      if (parts[index]!.text === character && --remaining === 0) return command === "t" ? parts[Math.max(current, index - 1)]!.start : parts[index]!.start;
    }
  } else {
    for (let index = current - 1; index >= 0; index -= 1) {
      if (parts[index]!.text === character && --remaining === 0) return command === "T" ? parts[Math.min(parts.length - 1, index + 1)]!.start : parts[index]!.start;
    }
  }
  return undefined;
}

function normalizeRange(start: number, end: number): [number, number] {
  return start <= end ? [start, end] : [end, start];
}

function motionRange(value: string, cursor: number, motion: Motion, count: number): [number, number] {
  if (motion === "start" || motion === "top") return [0, characterEnd(value, cursor) > cursor ? cursor : cursor];
  if (motion === "first") return normalizeRange(value.search(/\S|$/u), cursor);
  if (motion === "end" || motion === "bottom") return [cursor, value.length];
  if (motion === "wordForward" || motion === "WORDForward") {
    const target = wordStartForward(value, cursor, count, motion === "WORDForward");
    return normalizeRange(cursor, target === cursor ? characterEnd(value, cursor) : target);
  }
  if (motion === "wordEnd" || motion === "WORDEnd") {
    const target = move(value, cursor, motion, count);
    return normalizeRange(cursor, characterEnd(value, target));
  }
  const target = move(value, cursor, motion, count);
  return target < cursor ? [target, cursor] : [cursor, target];
}

function innerWordRange(value: string, cursor: number, around: boolean): [number, number] {
  const parts = graphemes(value);
  if (!parts.length) return [0, 0];
  let index = Math.max(0, parts.findIndex((part) => part.start === clampNormal(value, cursor)));
  if (characterClass(parts[index]!.text) === "space") {
    const next = parts.findIndex((part, at) => at >= index && characterClass(part.text) !== "space");
    if (next >= 0) index = next;
  }
  const kind = characterClass(parts[index]!.text);
  let start = index;
  let end = index + 1;
  while (start > 0 && characterClass(parts[start - 1]!.text) === kind) start -= 1;
  while (end < parts.length && characterClass(parts[end]!.text) === kind) end += 1;
  if (around) {
    const originalEnd = end;
    while (end < parts.length && characterClass(parts[end]!.text) === "space") end += 1;
    if (end === originalEnd) while (start > 0 && characterClass(parts[start - 1]!.text) === "space") start -= 1;
  }
  return [parts[start]!.start, parts[end - 1]!.end];
}

function delimiterRange(value: string, cursor: number, delimiter: string, around: boolean): [number, number] | undefined {
  const pairs: Record<string, [string, string]> = { "(": ["(", ")"], ")": ["(", ")"], "[": ["[", "]"], "]": ["[", "]"], "{": ["{", "}"], "}": ["{", "}"], "<": ["<", ">"], ">": ["<", ">"] };
  const [open, close] = pairs[delimiter] ?? [delimiter, delimiter];
  const left = value.lastIndexOf(open, cursor);
  const right = value.indexOf(close, open === close ? Math.max(cursor + 1, left + 1) : cursor);
  if (left < 0 || right < 0 || right < left) return undefined;
  return around ? [left, right + close.length] : [left + open.length, right];
}

function pushUndo(state: NeovimState, config: NeovimConfig, value: string, cursor: number): void {
  state.undo.push({ value, cursor });
  state.undo = state.undo.slice(-config.max_undo);
  state.redo = [];
}

function beginInsertEdit(state: NeovimState, config: NeovimConfig, value: string, cursor: number): void {
  if (state.insertUndoOpen) return;
  pushUndo(state, config, value, cursor);
  state.insertUndoOpen = true;
}

function resetCommand(state: NeovimState): void {
  state.pending = "";
  state.count = "";
  state.operator = undefined;
  state.operatorCount = 1;
}

function applyRange(value: string, cursor: number, range: [number, number], operator: Operator, state: NeovimState, config: NeovimConfig): { value: string; cursor: number } {
  const [start, end] = normalizeRange(...range);
  if (start === end) return { value, cursor };
  state.register = value.slice(start, end);
  if (operator === "yank") return { value, cursor: clampNormal(value, start) };
  pushUndo(state, config, value, cursor);
  const next = value.slice(0, start) + value.slice(end);
  if (operator === "change") {
    state.mode = "INSERT";
    state.insertUndoOpen = true;
    return { value: next, cursor: Math.min(start, next.length) };
  }
  return { value: next, cursor: clampNormal(next, start) };
}

export type NeovimEditResult = { value: string; cursor: number; handled: boolean; submit?: boolean };

function handleNeovimKeyInternal(value: string, cursor: number, text: string, key: NeovimKey, state: NeovimState, config: NeovimConfig): NeovimEditResult {
  const input = token(text, key);
  cursor = state.mode === "INSERT" || state.mode === "REPLACE" ? clampInsert(value, cursor) : clampNormal(value, cursor);

  if (state.mode === "INSERT" || state.mode === "REPLACE") {
    if (isBinding(config, "normal_mode", input)) {
      state.mode = "NORMAL";
      state.insertUndoOpen = false;
      resetCommand(state);
      return { value, cursor: clampNormal(value, previousCharacter(value, cursor)), handled: true };
    }
    if (input === "Enter") return { value, cursor, handled: true, submit: true };
    if (input === "Left") return { value, cursor: previousCharacter(value, cursor), handled: true };
    if (input === "Right") return { value, cursor: nextCharacter(value, cursor, 1, true), handled: true };
    if (input === "Home" || input === "Ctrl+a") return { value, cursor: 0, handled: true };
    if (input === "End" || input === "Ctrl+e") return { value, cursor: value.length, handled: true };
    if (input === "Backspace" || input === "Ctrl+h") {
      if (cursor > 0) {
        beginInsertEdit(state, config, value, cursor);
        const start = previousCharacter(value, cursor);
        value = value.slice(0, start) + value.slice(cursor);
        cursor = start;
      }
      return { value, cursor, handled: true };
    }
    if (input === "Delete") {
      if (cursor < value.length) {
        beginInsertEdit(state, config, value, cursor);
        value = value.slice(0, cursor) + value.slice(characterEnd(value, cursor));
      }
      return { value, cursor, handled: true };
    }
    if (input === "Ctrl+w") {
      const start = wordStartBackward(value, cursor, 1, false);
      if (start < cursor) {
        beginInsertEdit(state, config, value, cursor);
        value = value.slice(0, start) + value.slice(cursor);
        cursor = start;
      }
      return { value, cursor, handled: true };
    }
    if (input === "Ctrl+u") {
      if (cursor > 0) beginInsertEdit(state, config, value, cursor);
      return { value: value.slice(cursor), cursor: 0, handled: true };
    }
    if (text && !key.ctrl && !key.meta && !key.sequence?.startsWith("\x1b")) {
      beginInsertEdit(state, config, value, cursor);
      if (state.mode === "REPLACE" && cursor < value.length) value = value.slice(0, cursor) + text + value.slice(characterEnd(value, cursor));
      else value = value.slice(0, cursor) + text + value.slice(cursor);
      return { value, cursor: cursor + text.length, handled: true };
    }
    return { value, cursor, handled: false };
  }

  if (input === "Enter") return { value, cursor, handled: true, submit: true };
  if (isBinding(config, "normal_mode", input)) {
    state.mode = "NORMAL";
    state.selectionStart = undefined;
    resetCommand(state);
    return { value, cursor, handled: true };
  }

  if (state.pending.startsWith("find:") || state.pending.startsWith("operator-find:")) {
    const operatorFind = state.pending.startsWith("operator-find:");
    const command = state.pending.slice(operatorFind ? 14 : 5) as FindCommand;
    const count = Math.max(Number(state.count || "1"), 1);
    const operator = state.operator;
    if (!text) return { value, cursor, handled: true };
    const target = findCharacter(value, cursor, command, text, count);
    resetCommand(state);
    if (target !== undefined) {
      state.lastFind = { command, character: text };
      if (operatorFind && operator) {
        const range: [number, number] = target < cursor ? [target, characterEnd(value, cursor)] : [cursor, characterEnd(value, target)];
        return { ...applyRange(value, cursor, range, operator, state, config), handled: true };
      }
      return { value, cursor: target, handled: true };
    }
    return { value, cursor, handled: true };
  }
  if (state.pending === "replace") {
    resetCommand(state);
    if (text && value) {
      pushUndo(state, config, value, cursor);
      return { value: value.slice(0, cursor) + text + value.slice(characterEnd(value, cursor)), cursor, handled: true };
    }
    return { value, cursor, handled: true };
  }
  if (state.pending === "g") {
    const sequence = `g${input}`;
    resetCommand(state);
    if (isBinding(config, "document_start", sequence)) return { value, cursor: 0, handled: true };
    if (isBinding(config, "insert_first_non_blank", sequence)) {
      state.mode = "INSERT";
      return { value, cursor: 0, handled: true };
    }
    return { value, cursor, handled: true };
  }
  if (state.pending === "operator-g") {
    const operator = state.operator;
    const valid = isBinding(config, "document_start", `g${input}`);
    resetCommand(state);
    if (operator && valid) return { ...applyRange(value, cursor, [0, value.length], operator, state, config), handled: true };
    return { value, cursor, handled: true };
  }

  const count = Math.min(Math.max(Number(state.count || "1"), 1), MAX_COUNT);
  if (/^[1-9]$/u.test(input) || (/^\d$/u.test(input) && state.count)) {
    state.count = String(Math.min(Number(`${state.count}${input}`), MAX_COUNT));
    return { value, cursor, handled: true };
  }

  if (state.operator) {
    const operator = state.operator;
    const totalCount = Math.min(state.operatorCount * count, MAX_COUNT);
    if (input === "i" || input === "a") {
      state.pending = `text:${input}`;
      return { value, cursor, handled: true };
    }
    if (state.pending.startsWith("text:")) {
      const around = state.pending === "text:a";
      const range = input === "w" || input === "W" ? innerWordRange(value, cursor, around) : delimiterRange(value, cursor, input, around);
      resetCommand(state);
      if (!range) return { value, cursor, handled: true };
      return { ...applyRange(value, cursor, range, operator, state, config), handled: true };
    }
    const sameOperator = (operator === "delete" && isBinding(config, "delete", input))
      || (operator === "change" && isBinding(config, "change", input))
      || (operator === "yank" && isBinding(config, "yank", input));
    if (sameOperator) {
      resetCommand(state);
      return { ...applyRange(value, cursor, [0, value.length], operator, state, config), handled: true };
    }
    const motion = motionFor(config, input);
    if (motion) {
      const changeWord = operator === "change" && (motion === "wordForward" || motion === "WORDForward")
        && characterClass(value.slice(cursor, characterEnd(value, cursor))) !== "space";
      const range = changeWord
        ? [cursor, characterEnd(value, wordEndForward(value, cursor, totalCount, motion === "WORDForward"))] as [number, number]
        : motionRange(value, cursor, motion, totalCount);
      resetCommand(state);
      return { ...applyRange(value, cursor, range, operator, state, config), handled: true };
    }
    const operatorAction = actionFor(config, input);
    if (operatorAction === "find_forward" || operatorAction === "find_backward" || operatorAction === "till_forward" || operatorAction === "till_backward") {
      const findMap: Record<string, FindCommand> = { find_forward: "f", find_backward: "F", till_forward: "t", till_backward: "T" };
      state.pending = `operator-find:${findMap[operatorAction]}`;
      return { value, cursor, handled: true };
    }
    if (input === "g") {
      state.pending = "operator-g";
      return { value, cursor, handled: true };
    }
    resetCommand(state);
    return { value, cursor, handled: true };
  }

  if (state.mode === "VISUAL") {
    const visualOperator = isBinding(config, "delete", input) || isBinding(config, "delete_char", input) ? "delete"
      : isBinding(config, "change", input) ? "change" : isBinding(config, "yank", input) ? "yank" : undefined;
    if (visualOperator) {
      const start = Math.min(state.selectionStart ?? cursor, cursor);
      const end = characterEnd(value, Math.max(state.selectionStart ?? cursor, cursor));
      state.selectionStart = undefined;
      state.mode = "NORMAL";
      return { ...applyRange(value, cursor, [start, end], visualOperator, state, config), handled: true };
    }
    if (isBinding(config, "paste_after", input) || isBinding(config, "paste_before", input)) {
      const start = Math.min(state.selectionStart ?? cursor, cursor);
      const end = characterEnd(value, Math.max(state.selectionStart ?? cursor, cursor));
      const pasted = state.register.repeat(count);
      const replaced = value.slice(start, end);
      pushUndo(state, config, value, cursor);
      const next = value.slice(0, start) + pasted + value.slice(end);
      state.register = replaced;
      state.mode = "NORMAL";
      state.selectionStart = undefined;
      state.count = "";
      return { value: next, cursor: clampNormal(next, start + Math.max(pasted.length - 1, 0)), handled: true };
    }
  }

  const action = actionFor(config, input);
  const motion = motionFor(config, input);
  if (motion) {
    state.count = "";
    return { value, cursor: move(value, cursor, motion, count), handled: true };
  }
  if (input === "g") { state.pending = "g"; return { value, cursor, handled: true }; }
  if (action === "find_forward" || action === "find_backward" || action === "till_forward" || action === "till_backward") {
    const findMap: Record<string, FindCommand> = { find_forward: "f", find_backward: "F", till_forward: "t", till_backward: "T" };
    state.pending = `find:${findMap[action]}`;
    return { value, cursor, handled: true };
  }
  if ((action === "repeat_find" || action === "reverse_find") && state.lastFind) {
    const reverse: Record<FindCommand, FindCommand> = { f: "F", F: "f", t: "T", T: "t" };
    const command = action === "reverse_find" ? reverse[state.lastFind.command] : state.lastFind.command;
    const target = findCharacter(value, cursor, command, state.lastFind.character, count);
    state.count = "";
    return { value, cursor: target ?? cursor, handled: true };
  }
  if (action === "delete" || action === "change" || action === "yank") {
    state.operator = action;
    state.operatorCount = count;
    state.count = "";
    return { value, cursor, handled: true };
  }
  if (action === "insert_before" || action === "insert_after" || action === "insert_start" || action === "insert_end" || action === "open_end" || action === "open_start") {
    state.mode = "INSERT";
    state.count = "";
    if (action === "insert_after") cursor = nextCharacter(value, cursor, 1, true);
    if (action === "insert_start") cursor = value.search(/\S|$/u);
    if (action === "open_start") cursor = 0;
    if (action === "insert_end" || action === "open_end") cursor = value.length;
    return { value, cursor, handled: true };
  }
  if (action === "visual_mode" || action === "visual_line") {
    if (state.mode === "VISUAL" && action === "visual_mode") {
      state.mode = "NORMAL"; state.selectionStart = undefined;
    } else {
      state.mode = "VISUAL";
      state.selectionStart = action === "visual_line" ? 0 : cursor;
      if (action === "visual_line") cursor = clampNormal(value, value.length);
    }
    return { value, cursor, handled: true };
  }
  if (action === "replace_once") { state.pending = "replace"; return { value, cursor, handled: true }; }
  if (action === "replace_mode") { state.mode = "REPLACE"; return { value, cursor, handled: true }; }
  if (action === "command_palette") {
    pushUndo(state, config, value, cursor);
    state.insertUndoOpen = true;
    state.mode = "INSERT";
    return { value: `${value.slice(0, cursor)}/${value.slice(cursor)}`, cursor: cursor + 1, handled: true };
  }
  if (action === "delete_char" || action === "substitute") {
    if (!value) return { value, cursor, handled: true };
    const end = nextCharacter(value, cursor, count, true);
    const changed = applyRange(value, cursor, [cursor, end], action === "substitute" ? "change" : "delete", state, config);
    return { ...changed, handled: true };
  }
  if (action === "delete_before") {
    const start = previousCharacter(value, cursor, count);
    return { ...applyRange(value, cursor, [start, cursor], "delete", state, config), handled: true };
  }
  if (action === "delete_to_end" || action === "change_to_end") {
    return { ...applyRange(value, cursor, [cursor, value.length], action === "change_to_end" ? "change" : "delete", state, config), handled: true };
  }
  if (action === "yank_to_end") {
    state.register = value.slice(cursor);
    return { value, cursor, handled: true };
  }
  if (action === "substitute_line") return { ...applyRange(value, cursor, [0, value.length], "change", state, config), handled: true };
  if (action === "paste_after" || action === "paste_before") {
    if (!state.register) return { value, cursor, handled: true };
    pushUndo(state, config, value, cursor);
    const at = action === "paste_after" ? nextCharacter(value, cursor, 1, true) : cursor;
    const pasted = state.register.repeat(count);
    const next = value.slice(0, at) + pasted + value.slice(at);
    return { value: next, cursor: clampNormal(next, at + pasted.length - 1), handled: true };
  }
  if (action === "undo") {
    const previous = state.undo.pop();
    if (!previous) return { value, cursor, handled: true };
    state.redo.push({ value, cursor });
    return { value: previous.value, cursor: clampNormal(previous.value, previous.cursor), handled: true };
  }
  if (action === "redo") {
    const next = state.redo.pop();
    if (!next) return { value, cursor, handled: true };
    state.undo.push({ value, cursor });
    return { value: next.value, cursor: clampNormal(next.value, next.cursor), handled: true };
  }
  if (action === "toggle_case" && value) {
    pushUndo(state, config, value, cursor);
    let next = value;
    let at = cursor;
    for (let step = 0; step < count && at < next.length; step += 1) {
      const end = characterEnd(next, at);
      const character = next.slice(at, end);
      const toggled = character === character.toLocaleUpperCase() ? character.toLocaleLowerCase() : character.toLocaleUpperCase();
      next = next.slice(0, at) + toggled + next.slice(end);
      at = nextCharacter(next, at);
    }
    return { value: next, cursor: clampNormal(next, at), handled: true };
  }
  return { value, cursor, handled: false };
}

function beginsChange(config: NeovimConfig, input: string, state: NeovimState): boolean {
  if (state.mode !== "NORMAL" || state.operator || state.pending) return false;
  const action = actionFor(config, input);
  return action === "delete" || action === "change" || action === "delete_char" || action === "delete_before"
    || action === "delete_to_end" || action === "change_to_end" || action === "substitute" || action === "substitute_line"
    || action === "insert_before" || action === "insert_after" || action === "insert_start" || action === "insert_end"
    || action === "open_start" || action === "open_end" || action === "replace_once" || action === "replace_mode"
    || action === "paste_after" || action === "paste_before" || action === "toggle_case" || action === "command_palette";
}

export function handleNeovimKey(value: string, cursor: number, text: string, key: NeovimKey, state: NeovimState, config: NeovimConfig): NeovimEditResult {
  const input = token(text, key);
  if (!state.replaying && isBinding(config, "repeat_change", input) && state.mode === "NORMAL" && state.lastChange?.length) {
    const repetitions = Math.min(Math.max(Number(state.count || "1"), 1), MAX_COUNT);
    state.count = "";
    state.replaying = true;
    let result: NeovimEditResult = { value, cursor, handled: true };
    try {
      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        for (const recorded of state.lastChange) {
          result = handleNeovimKeyInternal(result.value, result.cursor, recorded.text, recorded.key, state, config);
        }
      }
    } finally {
      state.replaying = false;
    }
    return result;
  }

  if (!state.replaying && !state.recording && beginsChange(config, input, state)) {
    state.recording = [];
    state.recordingStartValue = value;
  }
  if (!state.replaying && state.recording) state.recording.push({ text, key: { ...key } });

  const result = handleNeovimKeyInternal(value, cursor, text, key, state, config);
  if (!state.replaying && state.recording && state.mode === "NORMAL" && !state.operator && !state.pending) {
    if (result.value !== state.recordingStartValue) state.lastChange = state.recording;
    state.recording = undefined;
    state.recordingStartValue = undefined;
  }
  return result;
}
