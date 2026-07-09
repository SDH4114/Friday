import type { Agent } from "@earendil-works/pi-agent-core";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { color, theme } from "./theme.js";

export type TuiSessionInfo = {
  model: string;
  mode: string;
  directory: string;
  memory: string;
  session?: string;
};

export type SlashCommandContext = {
  agent: Agent;
  command: string;
};

function frameLine(value = ""): string {
  return `│  ${value.padEnd(43, " ")}│`;
}

function renderHeader(info: TuiSessionInfo): void {
  console.log("╭─────────────────────────────────────────────╮");
  console.log(frameLine("RAYA"));
  console.log(frameLine("Personal AI Operating System"));
  console.log("╰─────────────────────────────────────────────╯");
  console.log();
  console.log(`Model     : ${info.model}`);
  console.log(`Mode      : ${info.mode}`);
  console.log(`Directory : ${info.directory}`);
  console.log(`Memory    : ${info.memory}`);
  if (info.session) {
    console.log(`Session   : ${info.session}`);
  }
  console.log();
}

export async function runInteractiveTui(inputAgent: Agent, info: TuiSessionInfo, options?: {
  onCommand?: (context: SlashCommandContext) => Promise<Agent | void> | Agent | void;
  onAfterPrompt?: (agent: Agent) => Promise<void> | void;
}): Promise<void> {
  const rl = readline.createInterface({ input, output });
  let agent = inputAgent;

  renderHeader(info);

  try {
    while (true) {
      const prompt = await rl.question(color("[Agent] > ", theme.blue));
      const message = prompt.trim();

      if (!message) {
        continue;
      }

      if (message === "/exit" || message === "/quit") {
        console.log("Bye bye");
        break;
      }

      if (message === "/clear") {
        agent.reset();
        await options?.onAfterPrompt?.(agent);
        console.log(color("Conversation cleared.", theme.gray));
        continue;
      }

      if (message.startsWith("/")) {
        const nextAgent = await options?.onCommand?.({ agent, command: message });
        if (nextAgent) {
          agent = nextAgent;
        }
        continue;
      }

      await agent.prompt(message);
      await agent.waitForIdle();
      await options?.onAfterPrompt?.(agent);
      console.log();
    }
  } finally {
    rl.close();
  }
}
