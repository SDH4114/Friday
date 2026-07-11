import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Models, Model } from "@earendil-works/pi-ai";
import type { RayaConfig } from "../config/config.js";
import { createDefaultTools } from "../tools/index.js";
import type { ToolExecutionPolicy } from "../types/tool.js";
import { createSystemPrompt } from "./system-prompt.js";
import { createSubagentTool } from "../tools/subagent.js";

export function createRayaAgent(input: {
  config: RayaConfig;
  model: Model<any>;
  models: Models;
  onEvent: (event: AgentEvent) => Promise<void> | void;
  toolPolicy?: ToolExecutionPolicy;
}): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: createSystemPrompt(),
      model: input.model,
      thinkingLevel: input.config.thinkingLevel,
      tools: [...createDefaultTools(input.config, input.toolPolicy), createSubagentTool(input.config,input.model,input.models,input.toolPolicy)],
      messages: []
    },
    streamFn: (model, context, options) => input.models.streamSimple(model, context, options),
    convertToLlm: (messages: AgentMessage[]) => messages as any,
    toolExecution: "sequential",
    maxRetryDelayMs: 60_000
  });

  agent.subscribe(async (event) => input.onEvent(event));
  return agent;
}
