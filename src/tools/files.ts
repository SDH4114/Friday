import { Type } from "@earendil-works/pi-ai";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { RayaTool } from "../types/tool.js";

const ReadFileParameters = Type.Object({
  path: Type.String({ description: "Workspace-relative file path to read." })
});

const WriteFileParameters = Type.Object({
  path: Type.String({ description: "Workspace-relative file path to write." }),
  content: Type.String({ description: "Full new file content." })
});

const ListFilesParameters = Type.Object({
  path: Type.Optional(Type.String({ description: "Workspace-relative directory path. Defaults to current directory." })),
  maxEntries: Type.Optional(Type.Number({ description: "Maximum number of entries. Defaults to 200." }))
});

function workspacePath(path: string): string {
  const root = process.cwd();
  const resolved = resolve(root, path);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`Path escapes workspace: ${path}`);
  }
  return resolved;
}

function displayPath(path: string): string {
  return relative(process.cwd(), path) || ".";
}

export function createReadFileTool(): RayaTool<typeof ReadFileParameters, { path: string }> {
  return {
    name: "read_file",
    label: "Read file",
    description: "Read a text file from the current workspace.",
    parameters: ReadFileParameters,
    async execute(_toolCallId, params) {
      const path = workspacePath(params.path);
      const text = readFileSync(path, "utf8");
      return {
        content: [{ type: "text", text: `path: ${displayPath(path)}\n\n${text}` }],
        details: { path: displayPath(path) }
      };
    }
  };
}

export function createWriteFileTool(): RayaTool<typeof WriteFileParameters, { path: string; bytes: number }> {
  return {
    name: "write_file",
    label: "Write file",
    description: "Create or overwrite a text file in the current workspace. Available only in Edit mode.",
    parameters: WriteFileParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const path = workspacePath(params.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, params.content, "utf8");
      return {
        content: [{ type: "text", text: `wrote ${Buffer.byteLength(params.content, "utf8")} bytes to ${displayPath(path)}` }],
        details: { path: displayPath(path), bytes: Buffer.byteLength(params.content, "utf8") }
      };
    }
  };
}

export function createListFilesTool(): RayaTool<typeof ListFilesParameters, { entries: string[] }> {
  return {
    name: "list_files",
    label: "List files",
    description: "List files and directories in the current workspace.",
    parameters: ListFilesParameters,
    async execute(_toolCallId, params) {
      const start = workspacePath(params.path ?? ".");
      const maxEntries = Math.min(params.maxEntries ?? 200, 1000);
      if (!existsSync(start)) {
        throw new Error(`Path does not exist: ${params.path ?? "."}`);
      }

      const entries: string[] = [];
      const visit = (path: string): void => {
        if (entries.length >= maxEntries) {
          return;
        }
        const stat = statSync(path);
        if (stat.isDirectory()) {
          for (const entry of readdirSync(path)) {
            if (entry === "node_modules" || entry === ".git" || entry === "dist") {
              continue;
            }
            visit(resolve(path, entry));
          }
          return;
        }
        entries.push(displayPath(path));
      };

      visit(start);
      return {
        content: [{ type: "text", text: entries.join("\n") || "(empty)" }],
        details: { entries }
      };
    }
  };
}
