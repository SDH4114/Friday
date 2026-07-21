import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, isUpdateApproved, readGithubVersion } from "../src/cli/update.js";

test("Raya update compares release and prerelease versions correctly", () => {
  assert.equal(compareVersions("0.1.1", "0.1.0"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.1"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0-rc.2"), -1);
});

test("Raya update reads a valid GitHub package version", async () => {
  const version = await readGithubVersion(async () => new Response(JSON.stringify({ version: "0.1.2" }), { status: 200 }));
  assert.equal(version, "0.1.2");
});

test("Raya update only accepts an explicit confirmation", () => {
  assert.equal(isUpdateApproved("y"), true);
  assert.equal(isUpdateApproved(" yes "), true);
  assert.equal(isUpdateApproved(""), false);
  assert.equal(isUpdateApproved("no"), false);
});

test("Raya update rejects malformed GitHub package metadata", async () => {
  await assert.rejects(() => readGithubVersion(async () => new Response(JSON.stringify({ version: "latest" }), { status: 200 })), /no valid version/);
});
