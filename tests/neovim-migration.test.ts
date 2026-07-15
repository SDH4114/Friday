import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("legacy Vim config migrates to Neovim without losing bindings", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-neovim-migration-"));
  try {
    writeFileSync(join(home, "config.json"), `${JSON.stringify({ vim_mode: true }, null, 2)}\n`);
    writeFileSync(join(home, "vim.json"), `${JSON.stringify({ start_mode: "insert", bindings: { left: ["H"] } }, null, 2)}\n`);
    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { ensureNeovimConfig } from "./src/tui/neovim.ts";',
      'console.log(JSON.stringify({ app: loadConfig(), editor: ensureNeovimConfig() }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    const migrated = JSON.parse(output) as {
      app: { neovim_mode: boolean; vim_mode?: boolean };
      editor: { start_mode: string; bindings: Record<string, string[]> };
    };
    assert.equal(migrated.app.neovim_mode, true);
    assert.equal(migrated.app.vim_mode, undefined);
    assert.equal(migrated.editor.start_mode, "insert");
    assert.deepEqual(migrated.editor.bindings.left, ["H"]);
    const saved = JSON.parse(readFileSync(join(home, "neovim.json"), "utf8")) as { bindings: Record<string, string[]> };
    assert.deepEqual(saved.bindings.left, ["H"]);
    assert.ok(saved.bindings.repeat_change?.includes("."));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
