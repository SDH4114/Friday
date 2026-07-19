import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeConfig } from "../src/config/config.js";
import { matchesHotkey, normalizeHotkey } from "../src/tui/hotkeys.js";

test("header design defaults to small and persists large", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-design-"));
  try {
    const script = [
      'import { loadConfig, saveConfig } from "./src/config/config.ts";',
      'const first = loadConfig();',
      'saveConfig({ ...first, headerStyle: "large" });',
      'console.log(JSON.stringify({ defaultStyle: first.headerStyle, savedStyle: loadConfig().headerStyle }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { defaultStyle: "small", savedStyle: "large" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("TUI hotkeys normalize, match, reject conflicts, and persist", () => {
  assert.equal(normalizeHotkey("Command+Shift+P"), "meta+shift+p");
  assert.equal(matchesHotkey("p", { name: "p", meta: true, shift: true }, "meta+shift+p"), true);
  assert.throws(() => normalizeConfig({ hotkeys: { toggleMode: "ctrl+x", cancel: "ctrl+x" } }), /conflicts/);
  assert.throws(() => normalizeConfig({ hotkeys: { exit: "ctrl+banana" } }), /Invalid hotkey/);

  const home = mkdtempSync(join(tmpdir(), "raya-hotkeys-"));
  try {
    const script = [
      'import { loadConfig, updateConfig } from "./src/config/config.ts";',
      'const current = loadConfig();',
      'updateConfig({ hotkeys: { ...current.hotkeys, toggleMode: "ctrl+m", exit: "ctrl+q" } });',
      'console.log(JSON.stringify(loadConfig().hotkeys));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { toggleMode: "ctrl+m", cancel: "escape", exit: "ctrl+q", clearScreen: "ctrl+l" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
