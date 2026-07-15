import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
