import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commandSuggestions } from "../src/tui/app.js";

const entrypoint = ["--import", "tsx", "src/cli/index.ts"];

function run(home: string, args: string[]): string {
  return execFileSync(process.execPath, [...entrypoint, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, RAYA_HOME: home },
    encoding: "utf8"
  });
}

test("profiles migrate legacy identity, clone predictably, and switch with the short command", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-profiles-"));
  try {
    writeFileSync(join(home, "SOUL.md"), "legacy soul\n", { mode: 0o600 });
    writeFileSync(join(home, "AGENTS.md"), "legacy instructions\n", { mode: 0o600 });
    writeFileSync(join(home, "MEMORY.md"), "legacy memory\n", { mode: 0o600 });

    assert.match(run(home, ["profile", "create", "coder", "--clone"]), /Created profile: coder/);
    const coder = join(home, "profiles", "coder");
    assert.equal(readFileSync(join(coder, "SOUL.md"), "utf8"), "legacy soul\n");
    assert.equal(readFileSync(join(coder, "AGENTS.md"), "utf8"), "legacy instructions\n");
    assert.equal(readFileSync(join(coder, "MEMORY.md"), "utf8"), "");

    assert.match(run(home, ["profile", "coder"]), /Active profile: coder/);
    const config = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
    assert.equal(config.activeProfile, "coder");
    assert.match(run(home, ["status"]), /profile: coder/);
    assert.match(run(home, ["profile", "list"]), /^Active profile: coder$/m);
    assert.match(run(home, ["profile", "--list"]), /^Active profile: coder$/m);
    assert.match(run(home, ["profile", "show", "coder"]), /SOUL\.md:/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("profile memory, system prompts, and sessions remain isolated", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-profile-isolation-"));
  const workspace = join(home, "workspace");
  mkdirSync(workspace);
  try {
    run(home, ["profile", "create", "coder"]);
    run(home, ["profile", "create", "writer"]);
    writeFileSync(join(home, "profiles", "coder", "SOUL.md"), "coder soul\n");
    writeFileSync(join(home, "profiles", "coder", "AGENTS.md"), "coder rules\n");
    writeFileSync(join(home, "profiles", "writer", "SOUL.md"), "writer soul\n");
    writeFileSync(join(workspace, "AGENTS.md"), "workspace rules\n");

    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { mutateMemory, readMemory } from "./src/memory/store.ts";',
      'import { createSystemPrompt } from "./src/agent/system-prompt.ts";',
      'import { createSession, listSessions, saveSession } from "./src/session/store.ts";',
      `const workspace = ${JSON.stringify(workspace)}; const base = loadConfig();`,
      'mutateMemory("add", "memory", "coder memory", undefined, "coder");',
      'mutateMemory("add", "memory", "writer memory", undefined, "writer");',
      'const coder = createSession({ ...base, activeProfile: "coder" }, "Coder", workspace);',
      'coder.messages = [{ role: "user", content: [{ type: "text", text: "code" }] }] as any; saveSession(coder);',
      'const writer = createSession({ ...base, activeProfile: "writer" }, "Writer", workspace);',
      'writer.messages = [{ role: "user", content: [{ type: "text", text: "write" }] }] as any; saveSession(writer);',
      'console.log(JSON.stringify({ coderMemory: readMemory("memory", "coder"), writerMemory: readMemory("memory", "writer"), coderSessions: listSessions(workspace, "coder").map(x => x.name), writerSessions: listSessions(workspace, "writer").map(x => x.name), prompt: createSystemPrompt(workspace, "", "coder") }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    const result = JSON.parse(output);
    assert.equal(result.coderMemory, "coder memory");
    assert.equal(result.writerMemory, "writer memory");
    assert.deepEqual(result.coderSessions, ["Coder"]);
    assert.deepEqual(result.writerSessions, ["Writer"]);
    assert.match(result.prompt, /coder soul/);
    assert.match(result.prompt, /coder rules/);
    assert.match(result.prompt, /workspace rules/);
    assert.match(result.prompt, /coder memory/);
    assert.doesNotMatch(result.prompt, /writer soul|writer memory/);

    assert.match(run(home, ["profile", "rename", "writer", "author"]), /Renamed profile writer to author/);
    const renamedSessions = execFileSync(process.execPath, ["--import", "tsx", "-e",
      `import { listSessions } from "./src/session/store.ts"; console.log(JSON.stringify(listSessions(${JSON.stringify(workspace)}, "author").map(x => x.name)));`
    ], { cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8" });
    assert.deepEqual(JSON.parse(renamedSessions), ["Writer"]);
    assert.match(run(home, ["profile", "delete", "author", "--yes"]), /Deleted profile: author/);
    assert.equal(existsSync(join(home, "profiles", "author")), false);
    const deletedSessions = execFileSync(process.execPath, ["--import", "tsx", "-e",
      `import { listSessions } from "./src/session/store.ts"; console.log(listSessions(${JSON.stringify(workspace)}, "author").length);`
    ], { cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8" });
    assert.equal(deletedSessions.trim(), "0");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("profile names are validated and the TUI profile menu exposes create and switch", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-profile-validation-"));
  try {
    const invalid = spawnSync(process.execPath, [...entrypoint, "profile", "create", "Bad Name"], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Profile name must/);

    const suggestions = commandSuggestions(
      "/profile ", 9, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      () => [
        { value: "/profile create", description: "Create profile", needsArgument: true },
        { value: "/profile use coder", label: "coder", description: "Switch profile" }
      ]
    );
    assert.equal(suggestions[0]?.value, "/profile create");
    assert.equal(suggestions[1]?.value, "/profile use coder");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
