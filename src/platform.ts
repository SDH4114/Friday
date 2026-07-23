import { join, posix, win32 } from "node:path";

export function executableName(command: string, targetPlatform: NodeJS.Platform = process.platform): string {
  if (targetPlatform === "win32" && (command === "npm" || command === "npx")) {
    return `${command}.cmd`;
  }
  return command;
}

export function commandInvocation(
  command: string,
  args: string[],
  targetPlatform: NodeJS.Platform = process.platform,
  nodeExecutable = process.execPath
): { command: string; args: string[] } {
  const pathApi = targetPlatform === "win32" ? win32 : posix;
  const name = pathApi.basename(command).toLowerCase().replace(/\.cmd$/u, "");
  if (targetPlatform === "win32" && (name === "npm" || name === "npx")) {
    return {
      command: nodeExecutable,
      args: [pathApi.join(pathApi.dirname(nodeExecutable), "node_modules", "npm", "bin", `${name}-cli.js`), ...args]
    };
  }
  return { command: executableName(command, targetPlatform), args };
}

export function pathSeparator(targetPlatform: NodeJS.Platform = process.platform): string {
  return targetPlatform === "win32" ? ";" : ":";
}

export function defaultShell(
  targetPlatform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env
): string {
  return targetPlatform === "win32"
    ? environment.ComSpec ?? environment.COMSPEC ?? "cmd.exe"
    : environment.SHELL ?? "/bin/sh";
}

export function npmGlobalBin(prefix: string, targetPlatform: NodeJS.Platform = process.platform): string {
  return targetPlatform === "win32" ? prefix : join(prefix, "bin");
}

export function rayaLauncherNames(targetPlatform: NodeJS.Platform = process.platform): string[] {
  return targetPlatform === "win32" ? ["raya.cmd", "raya.ps1", "raya"] : ["raya"];
}
