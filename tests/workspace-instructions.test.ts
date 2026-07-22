import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findNearestWorkspaceInstruction } from "../src/agent/workspace-instructions.js";

test("nearest AGENTS.md wins while walking up from the working directory", () => {
  const root = mkdtempSync(join(tmpdir(), "raya-agents-"));
  try {
    const project = join(root, "project");
    const nested = join(project, "packages", "app", "src");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "root instructions");
    writeFileSync(join(project, "AGENTS.md"), "project instructions");

    const result = findNearestWorkspaceInstruction("AGENTS.md", nested);
    assert.equal(result?.path, join(project, "AGENTS.md"));
    assert.equal(result?.content, "project instructions");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
