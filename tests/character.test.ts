import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_SOUL, LEGACY_DEFAULT_SOUL, CHARACTER_PROFILES, characterProfile, characterSuggestions } from "../src/character/catalog.js";
import { ensureDefaultSoul } from "../src/config/paths.js";
import { commandSuggestions } from "../src/tui/app.js";

test("character catalog exposes the selectable profiles", () => {
  assert.equal(CHARACTER_PROFILES.length, 16);
  assert.equal(CHARACTER_PROFILES[0]?.id, "default");
  assert.match(characterProfile("pirate")?.soul ?? "", /# Raya — Pirate/);
  assert.equal(characterSuggestions("tech")[0]?.value, "/character technical");
  assert.equal(commandSuggestions("/character ", "/character ".length).length, 16);
  for (const profile of CHARACTER_PROFILES.filter((item) => item.id !== "none" && item.id !== "default")) {
    assert.match(profile.soul, /^# Raya — /);
    assert.match(profile.soul, /## Working style/);
    assert.match(profile.soul, /honesty, safety, or competence/);
  }
});

test("default SOUL.md is created once and user edits are preserved", () => {
  const root = mkdtempSync(join(tmpdir(), "raya-character-"));
  const soulPath = join(root, "SOUL.md");
  try {
    ensureDefaultSoul(soulPath);
    const installed = readFileSync(soulPath, "utf8");
    assert.equal(installed, `${DEFAULT_SOUL}\n`);
    assert.match(installed, /^# Raya\n/);
    assert.match(installed, /I am here\. Let us understand the problem and solve it properly\./);
    writeFileSync(soulPath, LEGACY_DEFAULT_SOUL);
    ensureDefaultSoul(soulPath);
    assert.equal(readFileSync(soulPath, "utf8"), `${DEFAULT_SOUL}\n`);
    writeFileSync(soulPath, "my custom Raya personality\n");
    ensureDefaultSoul(soulPath);
    assert.equal(readFileSync(soulPath, "utf8"), "my custom Raya personality\n");
    assert.ok(DEFAULT_SOUL.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
