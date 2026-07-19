import { lstatSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export type WorkspaceMention = {
  path: string;
  type: "file" | "directory";
};

const NON_RECURSIVE_DIRECTORIES = new Set([".git", "node_modules", "dist"]);

export function listWorkspaceMentions(root: string): WorkspaceMention[] {
  const mentions: WorkspaceMention[] = [];
  const visit = (directory: string): void => {
    let names: string[];
    try {
      names = readdirSync(directory).sort((a, b) => a.localeCompare(b));
    } catch {
      return;
    }
    for (const name of names) {
      if (name === ".DS_Store") continue;
      const absolutePath = join(directory, name);
      let stat;
      try {
        stat = lstatSync(absolutePath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      const path = relative(root, absolutePath);
      if (stat.isDirectory()) {
        mentions.push({ path, type: "directory" });
        if (!NON_RECURSIVE_DIRECTORIES.has(name)) visit(absolutePath);
      } else if (stat.isFile()) {
        mentions.push({ path, type: "file" });
      }
    }
  };
  visit(root);
  return mentions;
}

export function activeWorkspaceMentionStart(value: string, cursor: number): number | undefined {
  if (cursor === 0) return undefined;
  const start = value.lastIndexOf("@", cursor - 1);
  if (start < 0 || (start > 0 && !/\s/u.test(value[start - 1]!))) return undefined;
  const token = value.slice(start, cursor);
  if (/\s/u.test(token) || token.startsWith("@skill:") || token.startsWith("@file:") || token.startsWith("@folder:")) return undefined;
  return start;
}

export function attachWorkspaceMention(
  value: string,
  cursor: number,
  path: string,
  type: WorkspaceMention["type"]
): { value: string; cursor: number } {
  const start = activeWorkspaceMentionStart(value, cursor);
  if (start === undefined) return { value, cursor };
  const kind = type === "directory" ? "folder" : "file";
  const insertion = `@${kind}:${JSON.stringify(path)} `;
  const next = `${value.slice(0, start)}${insertion}${value.slice(cursor)}`;
  return { value: next, cursor: start + insertion.length };
}
