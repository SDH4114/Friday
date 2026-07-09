import type { RayaConfig } from "../config/config.js";
import type { RayaTool } from "../types/tool.js";
import { createListFilesTool, createReadFileTool, createWriteFileTool } from "./files.js";
import { createShellTool } from "./shell.js";
import { createWebTool } from "./web.js";

export function createDefaultTools(config: RayaConfig): RayaTool[] {
  const tools: RayaTool[] = [createListFilesTool(), createReadFileTool(), createShellTool(config), createWebTool(config)];
  if (config.mode === "edit") {
    tools.push(createWriteFileTool());
  }
  return tools;
}
