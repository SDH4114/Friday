import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const entrypoint = ["--import", "tsx", "src/cli/index.ts"];

function run(home: string, args: string[]): string {
  return execFileSync(process.execPath, [...entrypoint, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, RAYA_HOME: home, NO_COLOR: "1" },
    encoding: "utf8"
  });
}

test("users can create, discover, run, inspect, and remove direct commands", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-custom-commands-"));
  const created = run(home, [
    "commands", "add", "greet", "--description", "Print supplied arguments", "--",
    process.execPath, "-e", "console.log(process.argv.slice(1).join('|'))"
  ]);
  assert.match(created, /Created raya greet/);
  assert.match(created, /Runs:/);

  assert.match(run(home, ["commands", "list"]), /^greet\tPrint supplied arguments$/m);
  assert.match(run(home, ["commands", "show", "greet"]), /description: Print supplied arguments/);
  assert.equal(run(home, ["greet", "one", "--two"]).trim(), "one|--two");
  assert.match(run(home, ["--help"]), /greet \[args\.\.\.\]\s+Print supplied arguments/);

  const stored = JSON.parse(readFileSync(join(home, "commands.json"), "utf8")) as unknown[];
  assert.equal(stored.length, 1);
  assert.equal(statSync(join(home, "commands.json")).mode & 0o777, 0o600);

  assert.match(run(home, ["commands", "remove", "greet"]), /Removed custom command: greet/);
  assert.match(run(home, ["commands", "list"]), /No custom commands/);
});

test("custom commands cannot shadow built-ins or overwrite names accidentally", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-custom-command-guards-"));
  const builtIn = spawnSync(process.execPath, [...entrypoint, "commands", "add", "git", "--", "echo", "unsafe"], {
    cwd: process.cwd(),
    env: { ...process.env, RAYA_HOME: home, NO_COLOR: "1" },
    encoding: "utf8"
  });
  assert.equal(builtIn.status, 1);
  assert.match(builtIn.stderr, /Cannot replace built-in Raya command: git/);

  run(home, ["commands", "add", "hello", "--", "echo", "first"]);
  const duplicate = spawnSync(process.execPath, [...entrypoint, "commands", "add", "hello", "--", "echo", "second"], {
    cwd: process.cwd(),
    env: { ...process.env, RAYA_HOME: home, NO_COLOR: "1" },
    encoding: "utf8"
  });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /Use --force to replace it/);
  run(home, ["commands", "add", "hello", "--force", "--", "echo", "second"]);
  assert.equal(run(home, ["hello"]).trim(), "second");
});
