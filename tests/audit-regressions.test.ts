import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { splitTelegramMessage } from "../src/telegram/service.js";
import { createListFilesTool, createReadFileTool } from "../src/tools/files.js";
import { requiresShellApproval } from "../src/tools/shell.js";

test("old session configs are fully normalized before use", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-session-config-"));
  try {
    writeFileSync(join(home, "sessions.json"), JSON.stringify({
      sessions: [{ id: "old", name: "Old", createdAt: 1, updatedAt: 1, config: { provider: "openai-codex", model: "gpt-5.4", mode: "edit" }, messages: [] }]
    }));
    const script = [
      'import { listSessions } from "./src/session/store.ts";',
      'const config = listSessions()[0].config;',
      'console.log(JSON.stringify({ mode: config.mode, design: config.headerStyle, blocked: config.blockedCommands, neovim: config.neovim_mode }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { mode: "build", design: "small", blocked: ["rm"], neovim: false });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("workspace file tools reject symlink escapes and do not traverse symlinked directories", async () => {
  const root = mkdtempSync(join(tmpdir(), "raya-files-root-"));
  const outside = mkdtempSync(join(tmpdir(), "raya-files-outside-"));
  const original = process.cwd();
  try {
    writeFileSync(join(outside, "secret.txt"), "outside");
    mkdirSync(join(outside, "folder"));
    writeFileSync(join(outside, "folder", "nested.txt"), "outside nested");
    symlinkSync(join(outside, "secret.txt"), join(root, "secret-link"));
    symlinkSync(join(outside, "folder"), join(root, "folder-link"));
    process.chdir(root);

    const read = createReadFileTool();
    await assert.rejects(() => read.execute("test", { path: "secret-link" }), /symbolic link/);

    const list = createListFilesTool();
    const result = await list.execute("test", { path: "." });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    assert.match(text, /folder-link -> \[symbolic link\]/);
    assert.doesNotMatch(text, /nested\.txt/);
  } finally {
    process.chdir(original);
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Telegram messages are split instead of silently truncated", () => {
  const text = `${"a".repeat(3_500)}\n${"b".repeat(3_500)}`;
  const chunks = splitTelegramMessage(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 4_000));
  assert.equal(chunks.join("\n"), text);
});

test("standard security asks before any shell command that is not clearly read-only", () => {
  assert.equal(requiresShellApproval("git status"), false);
  assert.equal(requiresShellApproval("rg TODO src"), false);
  assert.equal(requiresShellApproval("echo changed > file.txt"), true);
  assert.equal(requiresShellApproval("node -e process.exit(0)"), true);
  assert.equal(requiresShellApproval("git restore file.txt"), true);
});
