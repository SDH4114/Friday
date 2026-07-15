import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("deleting a session removes it from storage and session browsing", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-session-delete-"));
  try {
    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { createSession, deleteSession, listSessions, saveSession } from "./src/session/store.ts";',
      'import { createSessionsTool } from "./src/tools/sessions.ts";',
      'const session = createSession(loadConfig(), "Delete me");',
      'session.messages = [{ role: "user", content: [{ type: "text", text: "remember me" }] }] as any;',
      'saveSession(session);',
      'const tool = createSessionsTool();',
      'const before = await tool.execute("test", { action: "search", query: "remember me" } as any);',
      'deleteSession(session.id);',
      'const after = await tool.execute("test", { action: "search", query: "remember me" } as any);',
      'console.log(JSON.stringify({ stored: listSessions().length, before: before.content[0]?.text, after: after.content[0]?.text }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    const result = JSON.parse(output) as { stored: number; before: string; after: string };
    assert.equal(result.stored, 0);
    assert.match(result.before, /Delete me/);
    assert.equal(result.after, "(no matching sessions)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
