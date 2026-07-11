import type { RayaConfig } from "../config/config.js";
import type { RayaTool, ToolExecutionPolicy } from "../types/tool.js";
import { createAppControlTool } from "./app-control.js";
import { createListFilesTool, createReadFileTool, createWriteFileTool } from "./files.js";
import { createShellTool } from "./shell.js";
import { createWebTool } from "./web.js";

export function createDefaultTools(config: RayaConfig, policy: ToolExecutionPolicy = {}): RayaTool[] {
  const tools: RayaTool[] = [createListFilesTool(), createReadFileTool(), createShellTool(config, policy), createWebTool(config), createAppControlTool(policy)];
  if (config.mode === "edit") {
    tools.push(createWriteFileTool(policy));
  }
  return tools;
}
