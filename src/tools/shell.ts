import { Type } from "@earendil-works/pi-ai";
import { spawn } from "node:child_process";
import type { RayaConfig } from "../config/config.js";
import type { RayaTool } from "../types/tool.js";

const ShellParameters = Type.Object({
  command: Type.String({
    description: "Shell command to run in the current workspace."
  })
});

type ShellDetails = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} chars]`;
}

function assertAllowedInMode(command: string, mode: RayaConfig["mode"]): void {
  if (mode !== "plan") {
    return;
  }

  const blocked = /\b(rm|mv|cp|touch|mkdir|rmdir|chmod|chown|git\s+(commit|push|reset|checkout|clean|merge|rebase)|npm\s+(install|uninstall|update|link)|pnpm\s+(install|add|remove)|yarn\s+(add|remove|install))\b/;
  if (blocked.test(command)) {
    throw new Error("Plan mode allows read-only shell commands only. Switch to Edit mode with /mode edit.");
  }
}

export function createShellTool(config: RayaConfig): RayaTool<typeof ShellParameters, ShellDetails> {
  return {
    name: "shell",
    label: "Shell",
    description:
      "Run a shell command in the current working directory. Use this for build, test, git, and inspection commands.",
    parameters: ShellParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      assertAllowedInMode(params.command, config.mode);
      const result = await new Promise<ShellDetails>((resolve) => {
        const child = spawn(params.command, {
          cwd: process.cwd(),
          shell: process.env.SHELL ?? "/bin/sh",
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, config.shellTimeoutMs);

        const abort = () => {
          timedOut = true;
          child.kill("SIGTERM");
        };

        signal?.addEventListener("abort", abort, { once: true });

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });

        child.on("close", (exitCode) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
          resolve({
            command: params.command,
            exitCode,
            stdout: truncate(stdout, 20_000),
            stderr: truncate(stderr, 20_000),
            timedOut
          });
        });
      });

      const content = [
        `command: ${result.command}`,
        `exit_code: ${result.exitCode}`,
        result.timedOut ? "timed_out: true" : undefined,
        result.stdout ? `stdout:\n${result.stdout}` : undefined,
        result.stderr ? `stderr:\n${result.stderr}` : undefined
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        content: [{ type: "text", text: content }],
        details: result
      };
    }
  };
}
