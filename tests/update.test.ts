import assert from "node:assert/strict";
import test from "node:test";
import { GITHUB_COMMIT_URL, readGithubRelease, compareVersions, isUpdateApproved, readGithubVersion } from "../src/cli/update.js";

test("Raya update compares release and prerelease versions correctly", () => {
  assert.equal(compareVersions("0.1.1", "0.1.0"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.1"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0-rc.2"), -1);
});

test("Raya update reads a valid GitHub package version", async () => {
  const commit = "a".repeat(40);
  const version = await readGithubVersion(async (url) => new Response(JSON.stringify(url === GITHUB_COMMIT_URL ? { sha: commit } : { version: "0.1.2" }), { status: 200 }));
  assert.equal(version, "0.1.2");
});

test("Raya update pins the package metadata to GitHub's current commit", async () => {
  const commit = "b".repeat(40);
  const visited: string[] = [];
  const release = await readGithubRelease(async (url) => {
    visited.push(url);
    return new Response(JSON.stringify(url === GITHUB_COMMIT_URL ? { sha: commit } : { version: "0.1.2" }), { status: 200 });
  });
  assert.deepEqual(release, { commit, version: "0.1.2" });
  assert.equal(visited[1], `https://raw.githubusercontent.com/SDH4114/Raya-APPLE/${commit}/package.json`);
});

test("Raya update only accepts an explicit confirmation", () => {
  assert.equal(isUpdateApproved("y"), true);
  assert.equal(isUpdateApproved(" yes "), true);
  assert.equal(isUpdateApproved(""), false);
  assert.equal(isUpdateApproved("no"), false);
});

test("Raya update rejects malformed GitHub package metadata", async () => {
  const commit = "c".repeat(40);
  await assert.rejects(() => readGithubVersion(async (url) => new Response(JSON.stringify(url === GITHUB_COMMIT_URL ? { sha: commit } : { version: "latest" }), { status: 200 })), /no valid version/);
});
