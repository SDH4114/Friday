import { Type } from "@earendil-works/pi-ai";
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import type { RayaTool, ToolExecutionPolicy } from "../types/tool.js";

const execFileAsync = promisify(execFile);
const AppParameters = Type.Object({
  action: Type.Union([Type.Literal("open"), Type.Literal("close")]),
  target: Type.String({ description: "Application name, executable, or macOS app bundle name." })
});

export function createAppControlTool(policy: ToolExecutionPolicy = {}): RayaTool<typeof AppParameters, { action: string; target: string }> {
  return {
    name: "app_control",
    label: "App control",
    description: "Open an application or close a named application/process on macOS or Linux.",
    parameters: AppParameters,
    executionMode: "sequential",
    async execute(_id, params) {
      await policy.confirmDangerousAction?.(`${params.action} application`, params.target);
      const isMac = platform() === "darwin";
      if (params.action === "open") {
        if (isMac) await execFileAsync("open", ["-a", params.target]);
        else await execFileAsync("xdg-open", [params.target]);
      } else if (isMac) {
        await execFileAsync("osascript", ["-e", `tell application \"${params.target.replaceAll('"', '\\"')}\" to quit`]);
      } else {
        await execFileAsync("pkill", ["-f", params.target]);
      }
      const details = { action: params.action, target: params.target };
      return { content: [{ type: "text", text: `${params.action} requested for ${params.target}` }], details };
    }
  };
}
