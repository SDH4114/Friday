import assert from "node:assert/strict";
import test from "node:test";
import { advanceSessionDeleteKey, renderLargeAppleWord, sessionDeleteDescription } from "../src/tui/app.js";
import { formatToolActivity } from "../src/tui/render-events.js";

test("large A.P.P.L.E. logo has five distinct dots and aligned rows", () => {
  const lines = renderLargeAppleWord();
  assert.equal(lines.length, 6);
  assert.equal(lines.at(-1)?.match(/•/g)?.length, 5);
  assert.equal(new Set(lines.map((line) => Array.from(line).length)).size, 1);
});

test("memory activity names the file Raya is writing", () => {
  assert.equal(formatToolActivity("memory", { target: "user" }), "Raya is memorizing this in USER.md");
  assert.equal(formatToolActivity("memory", { target: "memory" }), "Raya is memorizing this in MEMORY.md");
});

test("session deletion requires two consecutive d presses on the same selection", () => {
  const first = advanceSessionDeleteKey("/sessions delete abc123");
  assert.deepEqual(first, { kind: "armed", value: "/sessions delete abc123" });
  assert.deepEqual(advanceSessionDeleteKey("/sessions delete abc123", first.value), {
    kind: "delete",
    command: "/sessions delete abc123"
  });
  assert.deepEqual(advanceSessionDeleteKey("/sessions delete different", first.value), {
    kind: "armed",
    value: "/sessions delete different"
  });
  assert.equal(sessionDeleteDescription(undefined, undefined, "Show available commands"), "Show available commands");
  assert.equal(
    sessionDeleteDescription("/sessions delete abc123", "/sessions delete abc123", "session detail"),
    "Press d again to delete · confirmation follows"
  );
});
