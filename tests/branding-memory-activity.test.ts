import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { advanceSessionDeleteKey, renderLargeAppleWord, renderStartupDashboard, sessionDeleteDescription } from "../src/tui/app.js";
import { formatToolActivity } from "../src/tui/render-events.js";
import { theme } from "../src/tui/theme.js";
import { renderMarkdown } from "../src/tui/markdown.js";

test("large A.P.P.L.E. logo has five distinct dots and aligned rows", () => {
  const lines = renderLargeAppleWord();
  assert.equal(lines.length, 6);
  assert.equal(lines.at(-1)?.match(/•/g)?.length, 5);
  assert.equal(new Set(lines.map((line) => Array.from(line).length)).size, 1);
});

test("startup dashboard is Raya-specific, responsive, and geometrically aligned", () => {
  const info = {
    model: "GPT-5.4 Codex",
    mode: "Plan",
    directory: "~/giti/Raya-APPLE",
    memory: "Enabled",
    headerStyle: "small" as const,
    session: "Fresh session",
    version: "0.2.0"
  };
  const wide = renderStartupDashboard(info, 120);
  assert.ok(wide.every((line) => visibleWidth(line) === 120));
  assert.match(wide.join("\n"), /Raya A\.P\.P\.L\.E\./);
  assert.match(wide.join("\n"), /Raya A\.P\.P\.L\.E\./);
  assert.match(wide.join("\n"), /Adaptive/);
  assert.match(wide.join("\n"), /Personal/);
  assert.match(wide.join("\n"), /Processing and/);
  assert.match(wide.join("\n"), /Logic/);
  assert.match(wide.join("\n"), /Engine/);
  assert.doesNotMatch(wide.join("\n"), /RAYA PROTOCOL/);
  assert.doesNotMatch(wide.join("\n"), /Understand → inspect → act → verify/);
  assert.match(wide.join("\n"), /\/exit and Ctrl\+C\s+quit/);
  assert.doesNotMatch(wide.join("\n"), /Welcome back|Tips for getting started|What's new/);

  const narrow = renderStartupDashboard(info, 72);
  assert.ok(narrow.every((line) => visibleWidth(line) === 72));
  assert.doesNotMatch(narrow.join("\n"), /┴/);
});

test("all semantic interface colors resolve to the blue palette", () => {
  for (const code of [theme.red, theme.green, theme.yellow, theme.blue, theme.cyan, theme.magenta, theme.white, theme.gray]) {
    assert.match(code, /38;2;/);
    assert.doesNotMatch(code, /\x1b\[(?:31|32|33|35|37|90)m/);
  }
  const rendered = renderMarkdown("plain **strong** tail");
  assert.ok(rendered.startsWith(theme.white));
  assert.ok(rendered.endsWith(theme.reset));
  assert.match(rendered, new RegExp(`${theme.reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${theme.white.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} tail`));
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
