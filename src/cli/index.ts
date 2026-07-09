#!/usr/bin/env node

import { Command } from "commander";
import type { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, saveConfig, type RayaConfig } from "../config/config.js";
import { RAYA_AUTH_PATH, RAYA_CONFIG_PATH } from "../config/paths.js";
import {
  createProviderRuntime,
  getConfiguredModel,
  isProviderConfigured,
  loginProvider,
  logoutProvider
} from "../providers/runtime.js";
import { createRayaAgent } from "../agent/create-agent.js";
import { createDefaultTools } from "../tools/index.js";
import { renderAgentEvent } from "../tui/render-events.js";
import { runInteractiveTui } from "../tui/app.js";
import { color, theme } from "../tui/theme.js";
import { homedir } from "node:os";
import { relative } from "node:path";
import {
  createSession,
  getOrCreateActiveSession,
  listSessions,
  saveSession,
  switchSession,
  type RayaSession
} from "../session/store.js";

const program = new Command();
const VERSION = "0.1.1";

function formatDirectory(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~/${relative(home, path)}`.replace(/\/$/, "") : path;
}

const preferredProviders = [
  { id: "anthropic", label: "Anthropic API", hint: "Claude with ANTHROPIC_API_KEY or stored key" },
  { id: "openai", label: "ChatGPT / OpenAI API", hint: "OpenAI API key" },
  { id: "openai-codex", label: "Codex", hint: "ChatGPT/Codex OAuth subscription login" },
  { id: "opencode", label: "OpenCode Zen", hint: "OpenCode API key" },
  { id: "openrouter", label: "OpenRouter", hint: "OpenRouter API key" }
];

function authLabel(provider: { auth: { oauth?: unknown; apiKey?: unknown } }): string {
  const labels = [];
  if (provider.auth.apiKey) labels.push("api");
  if (provider.auth.oauth) labels.push("oauth");
  return labels.join("+") || "unknown";
}

function printProviderMenu(runtime: ReturnType<typeof createProviderRuntime>): void {
  console.log("Choose provider:");
  const providers = runtime.models.getProviders();
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  let index = 1;

  for (const item of preferredProviders) {
    const provider = byId.get(item.id);
    if (!provider) continue;
    console.log(`${index}. ${item.label} (${provider.id}) - ${authLabel(provider)} - ${item.hint}`);
    index += 1;
  }

  console.log("\nOther providers:");
  for (const provider of [...providers].sort((a, b) => a.id.localeCompare(b.id))) {
    if (preferredProviders.some((item) => item.id === provider.id)) continue;
    console.log(`- ${provider.id} - ${provider.name} - ${authLabel(provider)}`);
  }
}

async function chooseProvider(runtime: ReturnType<typeof createProviderRuntime>, fallback: string): Promise<string> {
  printProviderMenu(runtime);
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`\nProvider [${fallback}] > `)).trim();
    if (!answer) return fallback;
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= preferredProviders.length) {
      return preferredProviders[numeric - 1]!.id;
    }
    return answer;
  } finally {
    rl.close();
  }
}

function applyConfigToAgent(agent: Agent, config: RayaConfig, model?: Model<any>): void {
  if (model) {
    agent.state.model = model;
  }
  agent.state.thinkingLevel = config.thinkingLevel;
  agent.state.tools = createDefaultTools(config);
}

function commandOptions<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === "object" && "opts" in value && typeof (value as { opts?: unknown }).opts === "function") {
    return (value as { opts: () => T }).opts();
  }
  return (value ?? {}) as T;
}

program
  .name("raya")
  .description("Open-source AI coding agent harness for the terminal.")
  .version(VERSION);

program
  .command("login")
  .argument("[provider]", "Provider id to login. Defaults to configured provider.")
  .description("Login to a provider. Without an argument, shows a provider menu first.")
  .action(async (providerArg?: string) => {
    const config = loadConfig();
    const runtime = createProviderRuntime();
    const provider = providerArg ?? (await chooseProvider(runtime, config.provider));
    await loginProvider(runtime, provider);
    console.log(color(`Saved provider session to ${RAYA_AUTH_PATH}`, theme.green));
  });

program
  .command("logout")
  .argument("[provider]", "Provider id to logout. Defaults to configured provider.")
  .description("Delete the local provider credential.")
  .action(async (providerArg?: string) => {
    const config = loadConfig();
    const runtime = createProviderRuntime();
    await logoutProvider(runtime, providerArg ?? config.provider);
    console.log(color("Logged out.", theme.green));
  });

program
  .command("status")
  .description("Show local Raya configuration and auth status.")
  .action(async () => {
    const config = loadConfig();
    const runtime = createProviderRuntime();
    const loggedIn = await isProviderConfigured(runtime, config.provider, config.model);

    console.log(`config: ${RAYA_CONFIG_PATH}`);
    console.log(`auth: ${RAYA_AUTH_PATH}`);
    console.log(`provider: ${config.provider}`);
    console.log(`model: ${config.model}`);
    console.log(`mode: ${config.mode}`);
    console.log(`logged_in: ${loggedIn}`);
  });

program
  .command("providers")
  .description("List built-in providers exposed by pi-ai.")
  .action(() => {
    const runtime = createProviderRuntime();
    for (const provider of [...runtime.models.getProviders()].sort((a, b) => a.id.localeCompare(b.id))) {
      console.log(`${provider.id}\t${provider.name}\t${authLabel(provider)}`);
    }
  });

program
  .command("models")
  .description("List models for a provider.")
  .option("-p, --provider <provider>", "Provider id. Defaults to configured provider.")
  .action((rawOptions: unknown) => {
    const options = commandOptions<{ provider?: string }>(rawOptions);
    const config = loadConfig();
    const runtime = createProviderRuntime();
    const provider = options.provider ?? config.provider;
    for (const model of runtime.models.getModels(provider)) {
      console.log(`${model.id}\t${model.name}`);
    }
  });

program
  .command("config")
  .description("Update simple Raya settings.")
  .option("--provider <provider>", "Set provider id.")
  .option("--model <model>", "Set model id.")
  .option("--mode <mode>", "Set mode: plan or edit.")
  .option("--thinking <level>", "Set thinking level: off, minimal, low, medium, high, xhigh.")
  .action((rawOptions: unknown) => {
    const options = commandOptions<{ provider?: string; model?: string; mode?: string; thinking?: string }>(rawOptions);
    const config = loadConfig();
    const next = {
      ...config,
      provider: options.provider ?? config.provider,
      model: options.model ?? config.model,
      mode: (options.mode ?? config.mode) as typeof config.mode,
      thinkingLevel: (options.thinking ?? config.thinkingLevel) as typeof config.thinkingLevel
    };
    saveConfig(next);
    const session = getOrCreateActiveSession(next);
    session.config = next;
    saveSession(session);
    console.log(color(`Saved ${RAYA_CONFIG_PATH}`, theme.green));
  });

program
  .argument("[prompt...]", "Optional one-shot prompt. Without a prompt, Raya starts interactive TUI.")
  .option("--run-model <model>", "Override model for this one-shot or interactive run.")
  .action(async (promptParts: string[], rawOptions: unknown) => {
    const options = commandOptions<{ runModel?: string }>(rawOptions);
    let config = loadConfig();
    const runtime = createProviderRuntime();
    let session = getOrCreateActiveSession(config);
    config = { ...config, ...session.config, mode: session.config.mode ?? config.mode };
    session.config = config;
    let model = getConfiguredModel(runtime, config.provider, options.runModel ?? config.model);

    if (!(await isProviderConfigured(runtime, config.provider, model.id))) {
      console.log(color(`No credential found for ${config.provider}. Starting login.\n`, theme.yellow));
      await loginProvider(runtime, config.provider);
      console.log(color("Login complete.\n", theme.green));
    }

    const agent = createRayaAgent({
      config,
      model,
      models: runtime.models,
      onEvent: renderAgentEvent
    });
    agent.state.messages = session.messages;

    const rebuildAgent = (nextSession = session): Agent => {
      const nextModel = getConfiguredModel(runtime, nextSession.config.provider, nextSession.config.model);
      const nextAgent = createRayaAgent({
        config: nextSession.config,
        model: nextModel,
        models: runtime.models,
        onEvent: renderAgentEvent
      });
      nextAgent.state.messages = nextSession.messages;
      model = nextModel;
      config = nextSession.config;
      session = nextSession;
      return nextAgent;
    };

    const persist = (activeAgent: Agent): void => {
      session.messages = activeAgent.state.messages;
      session.config = config;
      saveSession(session);
      saveConfig(config);
    };

    const printHelp = (): void => {
      console.log([
        "/help                         show commands",
        "/providers                    list providers",
        "/login [provider]             login/add provider credential",
        "/provider <provider>           switch provider",
        "/models [provider]             list models",
        "/model <model>                 switch model",
        "/mode plan|edit                switch Plan/Edit mode",
        "/sessions                     list sessions",
        "/session new [name]            create session",
        "/session switch <id|name>      switch session",
        "/status                       show current config",
        "/clear                        clear current session messages",
        "/exit                         quit"
      ].join("\n"));
    };

    const handleCommand = async (activeAgent: Agent, command: string): Promise<Agent | void> => {
      const [name, ...args] = command.slice(1).split(/\s+/).filter(Boolean);

      if (!name || name === "help") {
        printHelp();
        return;
      }

      if (name === "providers") {
        printProviderMenu(runtime);
        return;
      }

      if (name === "login") {
        const provider = args[0] ?? (await chooseProvider(runtime, config.provider));
        await loginProvider(runtime, provider);
        console.log(color(`Saved provider session to ${RAYA_AUTH_PATH}`, theme.green));
        return;
      }

      if (name === "provider") {
        const provider = args[0];
        if (!provider) {
          console.log(`Current provider: ${config.provider}`);
          return;
        }
        const firstModel = runtime.models.getModels(provider)[0];
        if (!firstModel) throw new Error(`Provider has no known models: ${provider}`);
        config = { ...config, provider, model: firstModel.id };
        persist(activeAgent);
        console.log(color(`Provider: ${provider}, model: ${firstModel.id}`, theme.green));
        return rebuildAgent(session);
      }

      if (name === "models") {
        const provider = args[0] ?? config.provider;
        for (const item of runtime.models.getModels(provider)) {
          console.log(`${item.id}\t${item.name}`);
        }
        return;
      }

      if (name === "model") {
        const modelId = args[0];
        if (!modelId) {
          console.log(`Current model: ${config.model}`);
          return;
        }
        model = getConfiguredModel(runtime, config.provider, modelId);
        config = { ...config, model: model.id };
        applyConfigToAgent(activeAgent, config, model);
        persist(activeAgent);
        console.log(color(`Model: ${model.name}`, theme.green));
        return;
      }

      if (name === "mode") {
        const mode = args[0];
        if (mode !== "plan" && mode !== "edit") {
          console.log(`Current mode: ${config.mode}. Use /mode plan or /mode edit.`);
          return;
        }
        config = { ...config, mode };
        applyConfigToAgent(activeAgent, config);
        persist(activeAgent);
        console.log(color(`Mode: ${mode === "plan" ? "Plan" : "Edit"}`, theme.green));
        return;
      }

      if (name === "sessions") {
        for (const item of listSessions()) {
          const marker = item.id === session.id ? "*" : " ";
          console.log(`${marker} ${item.id}\t${item.name}\t${item.config.provider}/${item.config.model}\t${item.config.mode}`);
        }
        return;
      }

      if (name === "session") {
        const subcommand = args[0];
        if (subcommand === "new") {
          persist(activeAgent);
          const next = createSession(config, args.slice(1).join(" "));
          console.log(color(`Session: ${next.id} ${next.name}`, theme.green));
          return rebuildAgent(next);
        }
        if (subcommand === "switch") {
          const target = args[1];
          if (!target) throw new Error("Usage: /session switch <id|name>");
          persist(activeAgent);
          const next = switchSession(target);
          console.log(color(`Session: ${next.id} ${next.name}`, theme.green));
          return rebuildAgent(next);
        }
        console.log("Usage: /session new [name] or /session switch <id|name>");
        return;
      }

      if (name === "status") {
        console.log(`Provider  : ${config.provider}`);
        console.log(`Model     : ${config.model}`);
        console.log(`Mode      : ${config.mode === "plan" ? "Plan" : "Edit"}`);
        console.log(`Session   : ${session.id} ${session.name}`);
        console.log(`Config    : ${RAYA_CONFIG_PATH}`);
        console.log(`Auth      : ${RAYA_AUTH_PATH}`);
        return;
      }

      console.log(`Unknown command: /${name}. Use /help.`);
    };

    const prompt = promptParts.join(" ").trim();

    if (prompt) {
      await agent.prompt(prompt);
      await agent.waitForIdle();
      persist(agent);
      console.log();
      return;
    }

    await runInteractiveTui(agent, {
      model: model.name,
      mode: config.mode === "plan" ? "Plan" : "Edit",
      directory: formatDirectory(process.cwd()),
      memory: "Enabled",
      session: `${session.id} ${session.name}`
    }, {
      onCommand: ({ agent: activeAgent, command }) => handleCommand(activeAgent, command),
      onAfterPrompt: (activeAgent) => persist(activeAgent)
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(color(message, theme.red));
  process.exitCode = 1;
});
