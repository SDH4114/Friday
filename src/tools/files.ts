import { Type } from "@earendil-works/pi-ai";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { RayaTool, ToolExecutionPolicy } from "../types/tool.js";

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

const MAX_READ_BYTES = 128 * 1024;

function readTextBounded(path: string): string {
  const descriptor = openSync(path, "r");
  try {
    const size = fstatSync(descriptor).size;
    const length = Math.min(size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(descriptor, buffer, 0, length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    return size > bytesRead ? `${text}\n\n[truncated ${size - bytesRead} bytes]` : text;
  } finally {
    closeSync(descriptor);
  }
}

function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function workspacePath(path: string, allowMissing = false): string {
  const lexicalRoot = resolve(process.cwd());
  const realRoot = realpathSync(lexicalRoot);
  const resolved = resolve(lexicalRoot, path);
  if (!isInside(lexicalRoot, resolved)) {
    throw new Error(`Path escapes workspace: ${path}`);
  }

  let existing = resolved;
  while (!existsSync(existing)) {
    if (!allowMissing) throw new Error(`Path does not exist: ${path}`);
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`Path escapes workspace: ${path}`);
    existing = parent;
  }
  if (!isInside(realRoot, realpathSync(existing))) {
    throw new Error(`Path escapes workspace through a symbolic link: ${path}`);
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
      const text = readTextBounded(path);
      return {
        content: [{ type: "text", text: `path: ${displayPath(path)}\n\n${text}` }],
        details: { path: displayPath(path) }
      };
    }
  };
}

export function createWriteFileTool(policy: ToolExecutionPolicy = {}): RayaTool<typeof WriteFileParameters, { path: string; bytes: number }> {
  return {
    name: "write_file",
    label: "Write file",
    description: "Create or overwrite a text file in the current workspace. Available only in Build mode.",
    parameters: WriteFileParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      await policy.confirmDangerousAction?.("write file", params.path);
      const path = workspacePath(params.path, true);
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
      const maxEntries = Math.max(1, Math.min(Math.floor(params.maxEntries ?? 200), 1000));

      const entries: string[] = [];
      const visit = (path: string): void => {
        if (entries.length >= maxEntries) {
          return;
        }
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) {
          entries.push(`${displayPath(path)} -> [symbolic link]`);
          return;
        }
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
