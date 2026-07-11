import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "@earendil-works/pi-ai";

export type RayaTool<TParameters extends TSchema = TSchema, TDetails = unknown> =
  AgentTool<TParameters, TDetails>;

export type RayaToolResult<TDetails = unknown> = AgentToolResult<TDetails>;

export type RayaToolInput<TParameters extends TSchema> = Static<TParameters>;

/** A deliberately small extension point for local or remote execution policies. */
export type ToolExecutionPolicy = {
  confirmDangerousAction?: (action: string, details: string) => Promise<void>;
};
