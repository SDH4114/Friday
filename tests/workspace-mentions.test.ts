import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commandSuggestions } from "../src/tui/app.js";
import { activeWorkspaceMentionStart, attachWorkspaceMention, listWorkspaceMentions } from "../src/tui/workspace-mentions.js";

test("@ opens an unlimited workspace file and folder catalog", () => {
  const root = mkdtempSync(join(tmpdir(), "raya-mentions-"));
  try {
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    mkdirSync(join(root, "node_modules", "package"), { recursive: true });
    writeFileSync(join(root, "README.md"), "docs");
    writeFileSync(join(root, "src", "app.ts"), "app");
    writeFileSync(join(root, "src", "nested", "value.ts"), "value");
    writeFileSync(join(root, "node_modules", "package", "index.js"), "dependency");

    const mentions = listWorkspaceMentions(root);
    assert.deepEqual(mentions, [
      { path: "node_modules", type: "directory" },
      { path: "README.md", type: "file" },
      { path: "src", type: "directory" },
      { path: join("src", "app.ts"), type: "file" },
      { path: join("src", "nested"), type: "directory" },
      { path: join("src", "nested", "value.ts"), type: "file" }
    ]);

    const suggestions = commandSuggestions("@app", 4, undefined, undefined, undefined, undefined, undefined, undefined, () => mentions);
    assert.equal(suggestions[0]?.selectable, false);
    assert.equal(suggestions[1]?.workspaceMention?.path, join("src", "app.ts"));
    assert.equal(suggestions[1]?.description, "File");

    const many = Array.from({ length: 1_500 }, (_, index) => ({ path: `file-${index}.txt`, type: "file" as const }));
    assert.equal(commandSuggestions("@", 1, undefined, undefined, undefined, undefined, undefined, undefined, () => many).length, 1_501);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workspace mentions can be attached repeatedly and preserve paths with spaces", () => {
  assert.equal(activeWorkspaceMentionStart("inspect @", 9), 8);
  const first = attachWorkspaceMention("inspect @", 9, "src/My File.ts", "file");
  assert.equal(first.value, 'inspect @file:"src/My File.ts" ');
  const secondDraft = `${first.value}@`;
  const second = attachWorkspaceMention(secondDraft, secondDraft.length, "src/components", "directory");
  assert.equal(second.value, 'inspect @file:"src/My File.ts" @folder:"src/components" ');
});
