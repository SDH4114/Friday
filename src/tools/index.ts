import type { RayaConfig } from "../config/config.js";
import type { RayaTool, ToolExecutionPolicy } from "../types/tool.js";
import { createAppControlTool } from "./app-control.js";
import { createListFilesTool, createReadFileTool, createWriteFileTool } from "./files.js";
import { createShellTool } from "./shell.js";
import { createWebTool } from "./web.js";
import { createMemoryTool } from "./memory.js";
import { createScheduleTool } from "./schedule.js";

export function createDefaultTools(config: RayaConfig, policy: ToolExecutionPolicy = {}): RayaTool[] {
  const tools: RayaTool[] = [createListFilesTool(), createReadFileTool(), createShellTool(config, policy), createWebTool(config), createMemoryTool(), createScheduleTool()];
  if (config.mode === "build") {
    tools.push(createWriteFileTool(policy), createAppControlTool(policy));
  }
  return tools;
}
