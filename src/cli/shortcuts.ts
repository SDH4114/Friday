import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function encodeSearchQuery(query: string): string {
  return encodeURIComponent(query.trim()).replaceAll("%20", "+");
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeSearchQuery(query)}`;
}

export function webSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeSearchQuery(query)}`;
}

export async function openUrl(url: string): Promise<void> {
  if (platform() === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }
  await execFileAsync("xdg-open", [url]);
}

export async function openApplication(application: string): Promise<void> {
  const target = application.trim();
  if (!target) throw new Error("Specify an application name: raya open <application>");

  if (platform() === "darwin") {
    await execFileAsync("open", ["-a", target]);
    return;
  }

  const child = spawn(target, [], { detached: true, stdio: "ignore" });
  child.unref();
}

async function runGit(args: string[]): Promise<void> {
  const result = await execFileAsync("git", args, { cwd: process.cwd() });
  if (result.stdout.trim()) process.stdout.write(result.stdout);
  if (result.stderr.trim()) process.stderr.write(result.stderr);
}

export async function runGitShortcut(): Promise<void> {
  console.log("git add .");
  await runGit(["add", "."]);

  const rl = readline.createInterface({ input, output });
  try {
    const message = (await rl.question("Commit message > ")).trim();
    if (!message) throw new Error("Commit message cannot be empty.");
    console.log("git commit -m \"…\"");
    await runGit(["commit", "-m", message]);
  } finally {
    rl.close();
  }

  console.log("git push");
  await runGit(["push"]);
}
