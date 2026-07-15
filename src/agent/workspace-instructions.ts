import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type WorkspaceInstruction = {
  path: string;
  content: string;
};

export function findNearestWorkspaceInstruction(name: string, startDirectory = process.cwd()): WorkspaceInstruction | undefined {
  let directory = resolve(startDirectory);
  while (true) {
    const path = join(directory, name);
    if (existsSync(path)) {
      return { path, content: readFileSync(path, "utf8").slice(0, 24_000) };
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

export function findPreferredWorkspaceInstruction(
  name: string,
  rayaHome: string,
  startDirectory = process.cwd()
): WorkspaceInstruction | undefined {
  const homePath = join(resolve(rayaHome), name);
  if (existsSync(homePath)) {
    return { path: homePath, content: readFileSync(homePath, "utf8").slice(0, 24_000) };
  }
  return findNearestWorkspaceInstruction(name, startDirectory);
}
