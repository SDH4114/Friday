import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findNearestWorkspaceInstruction, findPreferredWorkspaceInstruction } from "../src/agent/workspace-instructions.js";

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

test("Raya home AGENTS.md and SOUL.md win independently, with nearest-file fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "raya-instruction-priority-"));
  try {
    const home = join(root, ".raya");
    const project = join(root, "project");
    const nested = join(project, "src");
    mkdirSync(home, { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(home, "AGENTS.md"), "home agents");
    writeFileSync(join(project, "AGENTS.md"), "project agents");
    writeFileSync(join(project, "SOUL.md"), "project soul");

    const agents = findPreferredWorkspaceInstruction("AGENTS.md", home, nested);
    const soul = findPreferredWorkspaceInstruction("SOUL.md", home, nested);
    assert.equal(agents?.path, join(home, "AGENTS.md"));
    assert.equal(agents?.content, "home agents");
    assert.equal(soul?.path, join(project, "SOUL.md"));
    assert.equal(soul?.content, "project soul");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
