import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderWebApp } from "../src/web/ui.js";

test("Raya Web includes every requested application area", () => {
  const html = renderWebApp("0.2.0");
  for (const label of ["Chat", "Calendar", "Reminders", "Scheduled", "Workspaces", "Notes", "AGENTS.md", "SOUL.md", "Telegram"]) {
    assert.match(html, new RegExp(label.replace(".", "\\.")));
  }
  assert.match(html, /\[\[Note title\]\]/);
});

test("Raya Web renders the operational multi-pane workspace", () => {
  const html = renderWebApp("0.2.0");
  for (const marker of [
    'class="iconbar"',
    'id="session-list"',
    'placeholder="Message Raya…"',
    'data-rail-tab="files"',
    'data-rail-tab="AGENTS.md"',
    'data-rail-tab="SOUL.md"',
    "Provider / Model",
    "Context"
  ]) {
    assert.ok(html.includes(marker), `missing redesigned UI marker: ${marker}`);
  }
  assert.doesNotMatch(html, /Ask anything, run code/);
  assert.doesNotMatch(html, /Understand → inspect → act → verify/);
  assert.doesNotMatch(html, /Esc\s+stop the current run/);
});

test("top-level help lists web and every direct shortcut", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-help-"));
  for (const helpFlag of ["-h", "--help"]) {
    const help = execFileSync(process.execPath, ["--import", "tsx", "src/cli/index.ts", helpFlag], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    assert.match(help, /web \(demo\) \[options\]/);
    assert.match(help, /raya web \(demo\)\s+Open the full Raya Web app \(demo\)/);
    for (const command of ["commands", "web", "git", "yt", "search", "open", "gateway", "login", "logout", "providers", "models", "config", "status", "plugin"]) {
      assert.match(help, new RegExp(`\\b${command}\\b`));
    }
  }
});

test("web reminders persist Telegram and browser delivery metadata", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-schedule-"));
  const script = [
    "import { createScheduled } from './src/scheduler/store.ts';",
    "const task=createScheduled('Check build',new Date(Date.now()+60000).toISOString(),'none',{kind:'reminder',source:'web',webNotification:true});",
    "process.stdout.write(JSON.stringify(task));"
  ].join("");
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, RAYA_HOME: home },
    encoding: "utf8"
  });
  const task = JSON.parse(output) as { kind: string; source: string; webNotification: boolean };
  assert.deepEqual(task, { ...task, kind: "reminder", source: "web", webNotification: true });
});
