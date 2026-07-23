import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { installerKind, installerPath } from "../src/cli/update.js";
import { urlOpenCommand } from "../src/cli/shortcuts.js";
import { commandInvocation, defaultShell, executableName, npmGlobalBin, pathSeparator, rayaLauncherNames } from "../src/platform.js";

test("Windows resolves native shells, npm shims, PATH, and launchers", () => {
  assert.equal(executableName("npm", "win32"), "npm.cmd");
  assert.equal(executableName("git", "win32"), "git");
  assert.equal(defaultShell("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" }), "C:\\Windows\\System32\\cmd.exe");
  assert.equal(pathSeparator("win32"), ";");
  assert.equal(npmGlobalBin("C:\\Users\\Raya\\AppData\\Roaming\\npm", "win32"), "C:\\Users\\Raya\\AppData\\Roaming\\npm");
  assert.deepEqual(rayaLauncherNames("win32"), ["raya.cmd", "raya.ps1", "raya"]);
  assert.deepEqual(commandInvocation("npx", ["-y", "server"], "win32", "C:\\Program Files\\nodejs\\node.exe"), {
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js", "-y", "server"]
  });
  assert.deepEqual(commandInvocation("npm.cmd", ["test"], "win32", "C:\\nodejs\\node.exe"), {
    command: "C:\\nodejs\\node.exe",
    args: ["C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js", "test"]
  });
});

test("Windows opens URLs without xdg-open and updater selects PowerShell", () => {
  assert.deepEqual(urlOpenCommand("https://example.com/", "win32"), {
    executable: "rundll32.exe",
    args: ["url.dll,FileProtocolHandler", "https://example.com/"]
  });
  assert.equal(installerKind("win32"), "powershell");
  assert.equal(installerPath("win32"), "install.ps1");
  assert.equal(installerPath("darwin"), "install.sh");
  assert.equal(installerPath("linux"), "install.sh");
});

test("Windows installer installs prerequisites, packs Raya, preserves state, and exposes raya.cmd", () => {
  const installer = readFileSync(join(process.cwd(), "install.ps1"), "utf8");
  assert.match(installer, /# Raya Windows installer/);
  assert.match(installer, /OpenJS\.NodeJS\.LTS/);
  assert.match(installer, /Git\.Git/);
  assert.match(installer, /RAYA_UPDATE_MODE/);
  assert.match(installer, /RAYA_UPDATE_CHECKPOINT_CREATED/);
  assert.match(installer, /npm\.cmd pack --ignore-scripts/);
  assert.match(installer, /npm\.cmd.*"install", "-g"/s);
  assert.match(installer, /raya\.cmd/);
  assert.match(installer, /SetEnvironmentVariable\("Path"/);
  assert.match(installer, /Preserved existing Raya state/);
});

test("package build and published files are Windows-safe", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    files: string[];
    scripts: Record<string, string>;
  };
  assert.ok(packageJson.files.includes("install.ps1"));
  assert.equal(packageJson.scripts.build, "node scripts/build.mjs");
  assert.doesNotMatch(packageJson.scripts.build, /\brm\b|\bchmod\b/);
});
