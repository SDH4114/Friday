import { z } from "zod";

export type TuiKey = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  cmd: "meta",
  command: "meta",
  option: "meta"
};

const NAMED_KEYS = new Set([
  "backspace", "delete", "down", "end", "enter", "escape", "home", "left",
  "pagedown", "pageup", "right", "space", "tab", "up"
]);

export function normalizeHotkey(value: string): string {
  const parts = value.toLowerCase().trim().split("+").map((part) => KEY_ALIASES[part.trim()] ?? part.trim());
  if (!parts.length || parts.some((part) => !part)) throw new Error(`Invalid hotkey: ${value}`);
  const modifiers = new Set(parts.slice(0, -1));
  if ([...modifiers].some((part) => part !== "ctrl" && part !== "meta" && part !== "shift")) {
    throw new Error(`Invalid hotkey modifier: ${value}`);
  }
  const key = parts.at(-1)!;
  if (!NAMED_KEYS.has(key) && !/^[a-z0-9]$/.test(key) && !/^f(?:[1-9]|1[0-2])$/.test(key)) {
    throw new Error(`Invalid hotkey key: ${value}`);
  }
  return [...(["ctrl", "meta", "shift"] as const).filter((modifier) => modifiers.has(modifier)), key].join("+");
}

export const HotkeySchema = z.string().min(1).max(40).transform((value, context) => {
  try { return normalizeHotkey(value); }
  catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
    return z.NEVER;
  }
});

export const DEFAULT_HOTKEYS = {
  toggleMode: "tab",
  cancel: "escape",
  exit: "ctrl+c",
  clearScreen: "ctrl+l"
} as const;

export const HotkeysSchema = z.object({
  toggleMode: HotkeySchema.default(DEFAULT_HOTKEYS.toggleMode),
  cancel: HotkeySchema.default(DEFAULT_HOTKEYS.cancel),
  exit: HotkeySchema.default(DEFAULT_HOTKEYS.exit),
  clearScreen: HotkeySchema.default(DEFAULT_HOTKEYS.clearScreen)
}).superRefine((hotkeys, context) => {
  const entries = Object.entries(hotkeys);
  for (const [action, binding] of entries) {
    const duplicate = entries.find(([otherAction, otherBinding]) => otherAction !== action && otherBinding === binding);
    if (duplicate) context.addIssue({ code: "custom", path: [action], message: `Hotkey conflicts with ${duplicate[0]}: ${binding}` });
  }
});

export type TuiHotkeys = z.infer<typeof HotkeysSchema>;

export function matchesHotkey(text: string, key: TuiKey, binding: string): boolean {
  const normalized = normalizeHotkey(binding);
  const parts = normalized.split("+");
  const expected = parts.at(-1)!;
  const actualName = KEY_ALIASES[(key.name ?? "").toLowerCase()] ?? (key.name ?? "").toLowerCase();
  const actual = actualName || (text === " " ? "space" : text.toLowerCase());
  return actual === expected
    && Boolean(key.ctrl) === parts.includes("ctrl")
    && Boolean(key.meta) === parts.includes("meta")
    && Boolean(key.shift) === parts.includes("shift");
}

export function formatHotkey(value: string): string {
  return normalizeHotkey(value).split("+").map((part) => (({
    ctrl: "Ctrl",
    meta: process.platform === "darwin" ? "Option" : "Alt",
    shift: "Shift",
    escape: "Escape",
    enter: "Enter",
    tab: "Tab",
    space: "Space"
  })[part] ?? (part.length === 1 ? part.toUpperCase() : part))).join("+");
}
