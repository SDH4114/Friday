import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileDiff } from "../src/tools/file-diff.js";
import { getActiveTheme, setActiveTheme, theme } from "../src/tui/theme.js";
import { beginToolActivity, finishToolActivity, renderToolActivityPanel, startToolActivityRun, toolActivityDetailLines } from "../src/tui/tool-activity.js";
import { movePromptHistory, restoredTuiMode } from "../src/tui/app.js";

test("sunset theme uses red, pink, and orange RGB accents", () => {
  setActiveTheme("sunset");
  assert.equal(getActiveTheme(), "sunset");
  assert.match(theme.red, /255;59;77/);
  assert.match(theme.magenta, /255;61;142/);
  assert.match(theme.yellow, /255;159;67/);
  setActiveTheme("ocean");
});

test("sessions are isolated by their opening workspace", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-workspace-sessions-"));
  const first = join(home, "first");
  const second = join(home, "second");
  mkdirSync(first);
  mkdirSync(second);
  try {
    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { createSession, listSessions, saveSession } from "./src/session/store.ts";',
      `const first = ${JSON.stringify(first)}; const second = ${JSON.stringify(second)};`,
      'const a = createSession(loadConfig(), "First", first);',
      'a.messages = [{ role: "user", content: [{ type: "text", text: "a" }] }] as any;',
      'saveSession(a);',
      'const b = createSession(loadConfig(), "Second", second);',
      'b.messages = [{ role: "user", content: [{ type: "text", text: "b" }] }] as any;',
      'saveSession(b);',
      'console.log(JSON.stringify({ first: listSessions(first).map(x => x.name), second: listSessions(second).map(x => x.name) }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { first: ["First"], second: ["Second"] });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("each saved session restores its own Plan or Build mode", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-session-modes-"));
  const workspace = join(home, "workspace");
  mkdirSync(workspace);
  try {
    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { createSession, saveSession, switchSession } from "./src/session/store.ts";',
      `const workspace = ${JSON.stringify(workspace)}; const base = loadConfig();`,
      'const plan = createSession({ ...base, mode: "plan" }, "Plan work", workspace);',
      'plan.messages = [{ role: "user", content: [{ type: "text", text: "plan" }] }] as any; saveSession(plan);',
      'const build = createSession({ ...base, mode: "build" }, "Build work", workspace);',
      'build.messages = [{ role: "user", content: [{ type: "text", text: "build" }] }] as any; saveSession(build);',
      'console.log(JSON.stringify({ plan: switchSession(plan.id, workspace).config.mode, build: switchSession(build.id, workspace).config.mode }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { plan: "plan", build: "build" });
    assert.equal(restoredTuiMode("Build", "Plan"), "Build");
    assert.equal(restoredTuiMode("Plan", "Build"), "Plan");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("partial config updates never reset other or unknown config.json fields", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-config-merge-"));
  const configPath = join(home, "config.json");
  try {
    writeFileSync(configPath, JSON.stringify({ provider: "anthropic", model: "custom-model", mode: "build", customUserSetting: { keep: true } }));
    const script = [
      'import { updateConfig } from "./src/config/config.ts";',
      'updateConfig({ theme: "sunset" });'
    ].join("");
    execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    const stored = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(stored.provider, "anthropic");
    assert.equal(stored.model, "custom-model");
    assert.equal(stored.mode, "build");
    assert.equal(stored.theme, "sunset");
    assert.deepEqual(stored.customUserSetting, { keep: true });

    writeFileSync(configPath, "{ invalid json", "utf8");
    assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8", stdio: "pipe"
    }));
    assert.equal(readFileSync(configPath, "utf8"), "{ invalid json");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("changing the global theme does not replace the active session mode", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-theme-keeps-mode-"));
  try {
    const setup = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { createSession, saveSession } from "./src/session/store.ts";',
      'const session = createSession({ ...loadConfig(), mode: "build" }, "Build session");',
      'session.messages = [{ role: "user", content: [{ type: "text", text: "keep build" }] }] as any;',
      'saveSession(session);'
    ].join("");
    execFileSync(process.execPath, ["--import", "tsx", "-e", setup], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    execFileSync(process.execPath, ["--import", "tsx", "src/cli/index.ts", "config", "--theme", "sunset"], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    const inspect = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { listSessions } from "./src/session/store.ts";',
      'console.log(JSON.stringify({ globalMode: loadConfig().mode, theme: loadConfig().theme, sessionMode: listSessions()[0]?.config.mode }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", inspect], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { globalMode: "plan", theme: "sunset", sessionMode: "build" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("configured local model is registered as a keyless OpenAI-compatible provider", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-local-model-"));
  try {
    const script = [
      'import { loadConfig, saveConfig } from "./src/config/config.ts";',
      'import { createProviderRuntime, isProviderConfigured } from "./src/providers/runtime.ts";',
      'const config = loadConfig();',
      'config.localModels = [{ provider: "ollama", id: "qwen3:8b", name: "Qwen 3 8B", baseUrl: "http://127.0.0.1:11434/v1", contextWindow: 32768, maxTokens: 8192 }];',
      'saveConfig(config);',
      'const runtime = createProviderRuntime(config);',
      'const model = runtime.models.getModel("ollama", "qwen3:8b");',
      'console.log(JSON.stringify({ provider: model?.provider, api: model?.api, configured: await isProviderConfigured(runtime, "ollama", "qwen3:8b") }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), { provider: "ollama", api: "openai-completions", configured: true });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("file edits produce a readable colored-panel-ready diff", () => {
  const diff = createFileDiff("const old = 1;\n", "const next = 2;\n", "src/example.ts");
  assert.equal(diff.additions, 1);
  assert.equal(diff.deletions, 1);
  startToolActivityRun();
  beginToolActivity("edit", "Raya is editing src/example.ts", { path: "src/example.ts", content: "hidden" });
  finishToolActivity("edit", { details: { path: "src/example.ts", additions: diff.additions, deletions: diff.deletions, diff: diff.text, created: false } }, false);
  const panel = toolActivityDetailLines().join("\n");
  assert.match(panel, /Edited src\/example\.ts  \+1 -1 \[done\]/);
  assert.match(panel, /-const old = 1;/);
  assert.match(panel, /\+const next = 2;/);
  assert.doesNotMatch(panel, /hidden/);

  let rendered = "";
  renderToolActivityPanel({ write(value) { rendered += value; } }, (value, kind) => `${kind}:${value}`);
  assert.match(rendered, /deletion:│ -const old = 1;/);
  assert.match(rendered, /addition:│ \+const next = 2;/);
  assert.match(theme.diffRemoved, /48;2;145;28;48;38;2;255;238;241/);
  assert.match(theme.diffAdded, /48;2;20;104;55;38;2;238;255;242/);

  const afterFirstRender = rendered;
  renderToolActivityPanel({ write(value) { rendered += value; } }, (value, kind) => `${kind}:${value}`);
  assert.equal(rendered, afterFirstRender, "an unchanged diff must never be printed twice");

  beginToolActivity("read", "Raya is reading another.py", { path: "another.py" });
  renderToolActivityPanel({ write(value) { rendered += value; } }, (value, kind) => `${kind}:${value}`);
  assert.equal(rendered.match(/-const old = 1;/g)?.length, 1, "later activities must not redraw an earlier diff");
});

test("plain Up and Down navigate prompt history and restore the draft", () => {
  const history = ["first prompt", "second prompt"];
  let state = { index: history.length, draft: "" };
  let current = "unfinished draft";

  ({ value: current, state } = movePromptHistory(history, state, current, -1));
  assert.equal(current, "second prompt");
  ({ value: current, state } = movePromptHistory(history, state, current, -1));
  assert.equal(current, "first prompt");
  ({ value: current, state } = movePromptHistory(history, state, current, 1));
  assert.equal(current, "second prompt");
  ({ value: current, state } = movePromptHistory(history, state, current, 1));
  assert.equal(current, "unfinished draft");
  assert.equal(state.index, history.length);
});
