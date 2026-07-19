import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { advanceSessionDeleteKey, attachSkillToPrompt, commandSuggestions, fitSuggestionLine, modelStatusLabel, renderLargeAppleWord, renderStartupDashboard, sessionDeleteDescription, terminalPhysicalRows } from "../src/tui/app.js";
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
  assert.doesNotMatch(wide.join("\n"), /Esc\s+stop the current run/);
  assert.doesNotMatch(wide.join("\n"), /Welcome back|Tips for getting started|What's new/);
  const rayaRow = wide.find((line) => line.includes("RAYA"));
  const appleRow = wide.find((line) => line.includes("A.P.P.L.E.") && !line.includes("Raya A.P.P.L.E."));
  assert.ok(rayaRow && appleRow);
  const leftColumnWidth = wide[1]!.indexOf("│", 1) - 1;
  const leftCell = (line: string): string => line.slice(2, 2 + leftColumnWidth);
  assert.equal(leftCell(rayaRow).indexOf("◢◤  RAYA  ◥◣"), 0);
  assert.equal(leftCell(appleRow).indexOf("A.P.P.L.E."), 0);

  const fullTerminal = renderStartupDashboard(info, 160);
  assert.ok(fullTerminal.every((line) => visibleWidth(line) === 160));
  assert.ok(fullTerminal[0]!.startsWith("╭─ Raya A.P.P.L.E."));

  const extraWideTerminal = renderStartupDashboard(info, 220);
  assert.ok(extraWideTerminal.every((line) => visibleWidth(line) === 220));

  const narrow = renderStartupDashboard(info, 72);
  assert.ok(narrow.every((line) => visibleWidth(line) === 72));
  assert.doesNotMatch(narrow.join("\n"), /┴/);

});

test("model status includes the current reasoning level", () => {
  assert.equal(modelStatusLabel({ model: "GPT-5.5", thinkingLevel: "medium" }), "GPT-5.5 (medium)");
  assert.equal(modelStatusLabel({ model: "GPT-5.5" }), "GPT-5.5");
});

test("skills command opens a selectable attachment list and about stays lowercase", () => {
  const skills = commandSuggestions(
    "/skills ", 8, () => [], () => [], () => [], () => [], () => [],
    () => [{ name: "debugging", description: "Diagnose failures" }]
  );
  assert.equal(skills[0]?.selectable, false);
  assert.deepEqual(skills[1], {
    value: "@skill:debugging",
    label: "debugging",
    description: "Attach to current message",
    needsArgument: true
  });
  const about = commandSuggestions("/abo", 4);
  assert.equal(about[0]?.value, "/about");
  assert.equal(about.some((item) => item.value === "/About"), false);

  const first = attachSkillToPrompt("/skills ", 8, "debugging");
  assert.equal(first.value, "@skill:debugging ");
  const secondMenu = `${first.value}/skills `;
  const second = attachSkillToPrompt(secondMenu, secondMenu.length, "implementation");
  assert.equal(second.value, "@skill:debugging @skill:implementation ");
  const repeatedMenu = commandSuggestions(
    secondMenu, secondMenu.length, () => [], () => [], () => [], () => [], () => [],
    () => [{ name: "implementation", description: "Implement changes" }]
  );
  assert.equal(repeatedMenu[1]?.value, "@skill:implementation");
});

test("long skill descriptions fit one physical terminal line", () => {
  const fitted = fitSuggestionLine(
    "excalidraw-diagram-generator",
    "Generate Excalidraw diagrams from natural language descriptions and very long architecture requests.",
    80
  );
  assert.equal(visibleWidth(`› ${fitted.label} ${fitted.description}`) <= 80, true);
  assert.match(fitted.label, /…/);
  assert.match(fitted.description, /…/);
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

test("approval frames count wrapped command rows before repainting", () => {
  assert.equal(terminalPhysicalRows(["Approval required", "run shell command: short", "› Accept    Refuse"], 80), 3);
  assert.equal(terminalPhysicalRows(["Approval required", `run shell command: ${"x".repeat(170)}`, "Accept    › Refuse"], 80), 5);
  assert.equal(terminalPhysicalRows(["Approval required", "run MCP tool: server/tool\n{\n  \"value\": true\n}", "› Accept    Refuse"], 80), 6);
});
