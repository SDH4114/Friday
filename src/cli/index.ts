#!/usr/bin/env node

import { Command } from "commander";
import type { Agent } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, saveConfig, type RayaConfig } from "../config/config.js";
import { RAYA_CONFIG_PATH } from "../config/paths.js";
import { readSecret, writeSecret } from "../config/secrets.js";
import {
  createProviderRuntime,
  getConfiguredModel,
  isProviderConfigured,
  loginProvider,
  logoutProvider
} from "../providers/runtime.js";
import { createRayaAgent } from "../agent/create-agent.js";
import { createDefaultTools } from "../tools/index.js";
import { formatToolActivity, renderAgentEvent } from "../tui/render-events.js";
import { notifyTui, requestTerminalApproval, runInteractiveTui } from "../tui/app.js";
import { color, theme } from "../tui/theme.js";
import { startTelegramService } from "../telegram/service.js";
import type { ToolExecutionPolicy } from "../types/tool.js";
import { startScheduler } from "../scheduler/store.js";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { RAYA_PLUGINS_DIR } from "../config/paths.js";
import {
  createSession,
  getOrCreateActiveSession,
  listSessions,
  saveSession,
  switchSession,
  type RayaSession
} from "../session/store.js";

const program = new Command();
const VERSION = "0.2.0";

function formatDirectory(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~/${relative(home, path)}`.replace(/\/$/, "") : path;
}

const preferredProviders = [
  { id: "openai-codex", label: "OpenAI Codex", hint: "ChatGPT/Codex OAuth subscription login" },
  { id: "anthropic", label: "Anthropic", hint: "Anthropic API key" },
  { id: "openrouter", label: "OpenRouter", hint: "OpenRouter API key" },
  { id: "opencode", label: "OpenCode Zen", hint: "OpenCode API key" },
  { id: "huggingface", label: "Hugging Face", hint: "Hugging Face API token" }
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
    console.log(`- ${provider.id} (${authLabel(provider)})`);
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

function buildToolPolicy(config: RayaConfig): ToolExecutionPolicy {
  if (config.mode !== "build" || config.securityMode === "full") return {};
  return {
    confirmDangerousAction: async (action, details) => {
      const approved = action === "run shell command" && config.autoApproveCommands.some((command) => details.startsWith(command));
      if (!approved) await requestTerminalApproval(action, details);
    }
  };
}

function applyConfigToAgent(agent: Agent, config: RayaConfig, model?: Model<any>): void {
  if (model) {
    agent.state.model = model;
  }
  agent.state.thinkingLevel = config.thinkingLevel;
  agent.state.tools = createDefaultTools(config, buildToolPolicy(config));
}

function commandOptions<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === "object" && "opts" in value && typeof (value as { opts?: unknown }).opts === "function") {
    return (value as { opts: () => T }).opts();
  }
  return (value ?? {}) as T;
}

function lastAssistantText(agent: Agent): string {
  const message = [...agent.state.messages].reverse().find((item) => item.role === "assistant") as { content?: Array<{ type: string; text?: string }> } | undefined;
  return message?.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "";
}

function renderRestoredSession(session: RayaSession): void {
  output.write("\x1b[2J\x1b[H");
  console.log(color(`RAYA — restored session: ${session.name} (${session.id})`, theme.cyan));
  console.log(color(`${session.config.provider}/${session.config.model} · ${session.config.mode}`, theme.gray));
  console.log();

  let rayaPrinted = false;
  for (const message of session.messages as unknown[]) {
    const item = message as { role?: string; content?: Array<{ type?: string; text?: string; name?: string; arguments?: unknown }> };
    if (item.role === "user") {
      const text = item.content?.filter((content) => content.type === "text").map((content) => content.text ?? "").join("").trim();
      if (!text) continue;
      const mode = session.config.mode === "plan" ? "Plan" : "Build";
      console.log(`${color(`[${mode}] >`, theme.blue)} ${text}\n`);
      rayaPrinted = false;
      continue;
    }
    if (item.role !== "assistant") continue;
    if (!rayaPrinted) {
      console.log(`${color("Raya", theme.cyan)}\n`);
      rayaPrinted = true;
    }
    for (const content of item.content ?? []) {
      if (content.type === "text" && content.text?.trim()) console.log(`${content.text.trim()}\n`);
      if (content.type === "toolCall" && content.name) console.log(color(formatToolActivity(content.name, content.arguments), theme.gray));
    }
  }
}

async function configureTelegramOnFirstRun(config: RayaConfig, force = false): Promise<RayaConfig> {
  if (!force && readSecret("RAYA_TELEGRAM_BOT_TOKEN")) return config;
  const rl = readline.createInterface({ input, output });
  try {
    const token = (await rl.question("Telegram bot token (optional; press Enter to skip) > ")).trim();
    if (!token) return config;
    const allowedChatId = (await rl.question("Telegram chat ID to allow (optional; press Enter to allow any chat) > ")).trim();
    writeSecret("RAYA_TELEGRAM_BOT_TOKEN", token);
    writeSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID", allowedChatId || undefined);
    return config;
  } finally {
    rl.close();
  }
}

async function runGateway(config: RayaConfig): Promise<void> {
  const token = readSecret("RAYA_TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Telegram is not configured. Run: raya gateway --setup");
  const runtime = createProviderRuntime();
  const model = getConfiguredModel(runtime, config.provider, config.model);
  if (!(await isProviderConfigured(runtime, config.provider, model.id))) {
    throw new Error("OpenAI/provider login is required before starting the Telegram gateway.");
  }
  let session = getOrCreateActiveSession(config);
  const gateway = startTelegramService({
    token,
    allowedChatId: readSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID"),
    onError: (error) => console.error(color(`Telegram: ${error.message}`, theme.red)),
    onPrompt: async (prompt, toolPolicy) => {
      let response = "";
      const agent = createRayaAgent({
        config: session.config,
        model: getConfiguredModel(runtime, session.config.provider, session.config.model),
        models: runtime.models,
        toolPolicy,
        onEvent: (event) => {
          if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") response += event.assistantMessageEvent.delta;
        }
      });
      agent.state.messages = session.messages;
      await agent.prompt(prompt);
      await agent.waitForIdle();
      session.messages = agent.state.messages;
      saveSession(session);
      return response || lastAssistantText(agent);
    }
  });
  const chatId=readSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID");
  const stopScheduled=startScheduler((task)=>{if(chatId)void gateway.sendMessage(chatId,`Reminder: ${task.message}`);else console.log(`Reminder: ${task.message}`);});
  console.log(color("Telegram gateway running. Press Ctrl+C to stop.", theme.cyan));
  await new Promise<void>((resolve) => process.once("SIGINT", resolve));
  stopScheduled();
  await gateway.stop();
}

program
  .name("raya")
  .description("Open-source AI coding agent harness for the terminal.")
  .version(VERSION);

program
  .command("login")
  .argument("[provider]", "Provider id to login. Defaults to configured provider.")
  .description("Login to OpenAI Codex through the ChatGPT/Codex OAuth flow.")
  .action(async (providerArg?: string) => {
    const config = loadConfig();
    const runtime = createProviderRuntime();
    const provider = providerArg ?? (await chooseProvider(runtime, config.provider));
    await loginProvider(runtime, provider);
    console.log(color("Saved provider OAuth session securely.", theme.green));
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
  .command("gateway")
  .description("Configure, start, or restart the local Telegram gateway.")
  .option("--setup", "Ask for Telegram bot token and allowed chat ID.")
  .option("--start", "Start the Telegram gateway in this terminal.")
  .option("--restart", "Restart the Telegram gateway with a fresh connection in this terminal.")
  .action(async (rawOptions: unknown) => {
    const options = commandOptions<{ setup?: boolean; start?: boolean; restart?: boolean }>(rawOptions);
    let config = loadConfig();
    if (options.setup) config = await configureTelegramOnFirstRun(config, true);
    if (options.start || options.restart) {
      if (options.restart) console.log("Restarting Telegram gateway...");
      await runGateway(config);
    } else if (!options.setup) {
      console.log("Use raya gateway --setup, raya gateway --start, or raya gateway --restart.");
    }
  });

program
  .command("plugin")
  .argument("<action>", "install or list")
  .argument("[package]", "pi package, for example npm:pi-subagents")
  .description("Install or list configured pi packages.")
  .action(async (action:string, packageArg?:string) => {
    const config=loadConfig();
    if(action==="list"){
      if(!config.piPackages.length){console.log("(none)");return;}
      for(const name of config.piPackages){
        const manifestPath=join(RAYA_PLUGINS_DIR,"node_modules",name,"package.json");
        if(!existsSync(manifestPath)){console.log(`${name}\tmissing`);continue;}
        const manifest=JSON.parse(readFileSync(manifestPath,"utf8")) as {pi?:{skills?:string[];extensions?:string[]}};
        const skills=manifest.pi?.skills?.length?`skills:${manifest.pi.skills.length}`:"skills:0";
        const extensions=manifest.pi?.extensions?.length?`native-extensions:${manifest.pi.extensions.length} (adapter required)`:"native-extensions:0";
        console.log(`${name}\t${skills}\t${extensions}`);
      }
      return;
    }
    if(action!=="install"||!packageArg)throw new Error("Usage: raya plugin install npm:<package>");
    const packageName=packageArg.replace(/^npm:/,"");mkdirSync(RAYA_PLUGINS_DIR,{recursive:true,mode:0o700});
    await new Promise<void>((resolve,reject)=>{const child=spawn("npm",["install","--prefix",RAYA_PLUGINS_DIR,packageName],{stdio:"inherit"});child.on("close",code=>code===0?resolve():reject(new Error(`npm exited ${code}`)));child.on("error",reject);});
    saveConfig({...config,piPackages:[...new Set([...config.piPackages,packageName])]});
    console.log(`Installed ${packageName}. Skills are loaded on the next session. Native Pi extensions require a Raya adapter.`);
  });

program
  .command("status")
  .description("Show local Raya configuration and auth status.")
  .action(async () => {
    const config = loadConfig();
    const runtime = createProviderRuntime();
    const loggedIn = await isProviderConfigured(runtime, config.provider, config.model);

    console.log(`config: ${RAYA_CONFIG_PATH}`);
    console.log("credentials: stored securely");
    console.log(`provider: ${config.provider}`);
    console.log(`model: ${config.model}`);
    console.log(`mode: ${config.mode}`);
    console.log(`security: ${config.securityMode}`);
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
  .option("--mode <mode>", "Set default mode: plan or build.")
  .option("--thinking <level>", "Set thinking level: off, minimal, low, medium, high, xhigh.")
  .option("--security <mode>", "Set security mode: standard or full.")
  .action((rawOptions: unknown) => {
    const options = commandOptions<{ provider?: string; model?: string; mode?: string; thinking?: string; security?: string }>(rawOptions);
    const config = loadConfig();
    const next = {
      ...config,
      provider: options.provider ?? config.provider,
      model: options.model ?? config.model,
      mode: (options.mode ?? config.mode) as typeof config.mode,
      thinkingLevel: (options.thinking ?? config.thinkingLevel) as typeof config.thinkingLevel
      ,securityMode: (options.security ?? config.securityMode) as typeof config.securityMode
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
    const prompt = promptParts.join(" ").trim();
    let config = loadConfig();
    const runtime = createProviderRuntime();
    const connectedProviders = new Set<string>();
    await Promise.all(runtime.models.getProviders().map(async (provider) => {
      if (await isProviderConfigured(runtime, provider.id)) connectedProviders.add(provider.id);
    }));
    if (options.runModel) config = { ...config, model: options.runModel };
    let model = getConfiguredModel(runtime, config.provider, options.runModel ?? config.model);

    if (!(await isProviderConfigured(runtime, config.provider, model.id))) {
      console.log(color(`No credential found for ${config.provider}. Starting login.\n`, theme.yellow));
      await loginProvider(runtime, config.provider);
      connectedProviders.add(config.provider);
      console.log(color("Login complete.\n", theme.green));
    }

    let session = createSession(config);

    if (!prompt) {
      config = await configureTelegramOnFirstRun(config);
      session.config = config;
      saveSession(session);
    }

    const agent = createRayaAgent({
      config,
      model,
      models: runtime.models,
      onEvent: renderAgentEvent,
      toolPolicy: buildToolPolicy(config)
    });
    agent.state.messages = session.messages;

    const rebuildAgent = (nextSession = session): Agent => {
      const nextModel = getConfiguredModel(runtime, nextSession.config.provider, nextSession.config.model);
      const nextAgent = createRayaAgent({
        config: nextSession.config,
        model: nextModel,
        models: runtime.models,
        onEvent: renderAgentEvent,
        toolPolicy: buildToolPolicy(nextSession.config)
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
    };

    const printHelp = (): void => {
      console.log([
        "/help                         show commands",
        "/providers                    connect, update, or choose a provider",
        "/models                       browse and choose models from all providers",
        "/thinking                      choose reasoning level",
        "/security                      choose Standard or Full access",
        "/sessions                     create or open a session",
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
        const action = args[0];
        const provider = args[1];
        if (!action || action === "manage" || !provider) {
          console.log("Use /providers and choose a provider, then Connect / update key or Use provider.");
          return;
        }
        if (action === "connect") {
          await loginProvider(runtime, provider);
          connectedProviders.add(provider);
          console.log(color(`${provider} connected. Existing provider credentials were kept.`, theme.green));
          return;
        }
        if (action !== "use") throw new Error("Unknown /providers action.");
        if (!connectedProviders.has(provider)) {
          await loginProvider(runtime, provider);
          connectedProviders.add(provider);
        }
        const firstModel = runtime.models.getModels(provider)[0];
        if (!firstModel) throw new Error(`Provider has no known models: ${provider}`);
        config = { ...config, provider, model: firstModel.id };
        persist(activeAgent);
        console.log(color(`Provider: ${provider}, model: ${firstModel.id}`, theme.green));
        return rebuildAgent(session);
      }

      if (name === "models") {
        if (args[0] !== "select" || !args[1] || !args[2]) {
          console.log("Use /models and choose a model from the dropdown.");
          return;
        }
        const provider = args[1];
        const modelId = args.slice(2).join(" ");
        if (!connectedProviders.has(provider)) {
          await loginProvider(runtime, provider);
          connectedProviders.add(provider);
        }
        model = getConfiguredModel(runtime, provider, modelId);
        config = { ...config, provider, model: model.id };
        persist(activeAgent);
        console.log(color(`Model: ${model.name} · ${provider}`, theme.green));
        return rebuildAgent(session);
      }

      if (name === "thinking") {
        const requested = args[0] === "ultra" ? "xhigh" : args[0];
        const supported = getSupportedThinkingLevels(model);
        if (!requested || !supported.includes(requested as typeof supported[number])) {
          console.log(`This model supports: ${supported.join(", ") || "no configurable reasoning levels"}.`);
          return;
        }
        config = { ...config, thinkingLevel: requested as RayaConfig["thinkingLevel"] };
        applyConfigToAgent(activeAgent, config);
        persist(activeAgent);
        return;
      }

      if (name === "security") {
        const securityMode = args[0];
        if (securityMode !== "standard" && securityMode !== "full") {
          console.log(`Current security: ${config.securityMode}. Use /security and select a mode.`);
          return;
        }
        config = { ...config, securityMode };
        applyConfigToAgent(activeAgent, config);
        persist(activeAgent);
        console.log(color(`Security: ${securityMode === "full" ? "Full access" : "Standard"}`, theme.green));
        return;
      }

      if (name === "sessions") {
        const action = args[0];
        if (action === "new") {
          persist(activeAgent);
          const next = createSession(config);
          const nextAgent = rebuildAgent(next);
          renderRestoredSession(next);
          return nextAgent;
        }
        if (action === "open") {
          const target = args[1];
          if (!target) throw new Error("Choose a session from the /sessions menu.");
          persist(activeAgent);
          const next = switchSession(target);
          const nextAgent = rebuildAgent(next);
          renderRestoredSession(next);
          return nextAgent;
        }
        console.log("Use /sessions and select New session or an existing session.");
        return;
      }

      if (name === "status") {
        console.log(`Provider  : ${config.provider}`);
        console.log(`Model     : ${config.model}`);
        console.log(`Mode      : ${config.mode === "plan" ? "Plan" : "Build"}`);
        console.log(`Security  : ${config.securityMode}`);
        console.log(`Session   : ${session.id} ${session.name}`);
        console.log(`Config    : ${RAYA_CONFIG_PATH}`);
        console.log("Credentials: stored securely");
        return;
      }

      console.log(`Unknown command: /${name}. Use /help.`);
    };

    if (prompt) {
      await agent.prompt(prompt);
      await agent.waitForIdle();
      persist(agent);
      console.log();
      return;
    }

    const telegramToken = readSecret("RAYA_TELEGRAM_BOT_TOKEN");
    const telegram = telegramToken ? startTelegramService({
      token: telegramToken,
      allowedChatId: readSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID"),
      onError: (error) => notifyTui(`Telegram unavailable: ${error.message}`),
      onPrompt: async (remotePrompt, toolPolicy) => {
        let streamed = "";
        const remoteAgent = createRayaAgent({
          config,
          model,
          models: runtime.models,
          toolPolicy,
          onEvent: (event) => {
            if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
              streamed += event.assistantMessageEvent.delta;
            }
          }
        });
        remoteAgent.state.messages = session.messages;
        await remoteAgent.prompt(remotePrompt);
        await remoteAgent.waitForIdle();
        persist(remoteAgent);
        return streamed || lastAssistantText(remoteAgent);
      }
    }) : undefined;

    if (telegram) console.log(color("Telegram listener started for this Raya session.", theme.cyan));
    const stopScheduler = startScheduler((task) => notifyTui(`Reminder: ${task.message}`));
    let signalExitStarted = false;
    const exitImmediately = (): void => {
      if (signalExitStarted) return;
      signalExitStarted = true;
      console.log("\nBye bye");
      stopScheduler();
      void telegram?.stop().finally(() => process.exit(0));
      if (!telegram) process.exit(0);
    };
    process.on("SIGINT", exitImmediately);
    try {
      await runInteractiveTui(agent, {
        model: model.name,
        mode: config.mode === "plan" ? "Plan" : "Build",
        directory: formatDirectory(process.cwd()),
        memory: "Enabled",
        session: `${session.id} ${session.name}`,
        version: VERSION,
        contextTokens: 0,
        contextWindow: model.contextWindow
      }, {
        onCommand: ({ agent: activeAgent, command }) => handleCommand(activeAgent, command),
        onAfterPrompt: (activeAgent) => persist(activeAgent),
        onToggleMode: (activeAgent) => {
          config = { ...config, mode: config.mode === "plan" ? "build" : "plan" };
          applyConfigToAgent(activeAgent, config);
          persist(activeAgent);
          return { mode: config.mode === "plan" ? "Plan" : "Build" };
        },
        sessionSuggestions: () => listSessions().map((item) => ({
          id: item.id,
          name: item.name,
          detail: `${item.config.provider}/${item.config.model} · ${item.config.mode}`
        })),
        thinkingSuggestions: () => getSupportedThinkingLevels(model),
        providerSuggestions: (value) => {
          const managed = value.match(/^\/providers manage (\S+)\s*$/)?.[1];
          if (managed) {
            const connected = connectedProviders.has(managed);
            return [
              { value: `/providers use ${managed}`, description: connected ? "Use this connected provider" : "Connect and use this provider" },
              { value: `/providers connect ${managed}`, description: connected ? "Update API key / reconnect" : "Connect provider" }
            ];
          }
          const query = value === "/providers" ? "" : value.slice("/providers ".length).trim().toLowerCase();
          const providers = [...runtime.models.getProviders()]
            .filter((provider) => !query || `${provider.id} ${provider.name}`.toLowerCase().includes(query))
            .sort((a, b) => a.name.localeCompare(b.name));
          const suggestion = (provider: typeof providers[number]) => ({
              value: `/providers manage ${provider.id}`,
              description: `${provider.name} · ${connectedProviders.has(provider.id) ? "connected" : authLabel(provider)}`,
              needsArgument: true
            });
          const setUped = providers.filter((provider) => connectedProviders.has(provider.id));
          const others = providers.filter((provider) => !connectedProviders.has(provider.id));
          return [
            { value: "SetUped:", description: "", selectable: false },
            ...(setUped.length ? setUped.map(suggestion) : [{ value: "  (none)", description: "", selectable: false }]),
            { value: "Others:", description: "", selectable: false },
            ...(others.length ? others.map(suggestion) : [{ value: "  (none)", description: "", selectable: false }])
          ];
        },
        modelSuggestions: (query) => {
          const normalized = query.toLowerCase().trim();
          return runtime.models.getProviders()
            .flatMap((provider) => runtime.models.getModels(provider.id).map((item) => ({ provider, item })))
            .filter(({ provider, item }) => !normalized || `${provider.id} ${provider.name} ${item.id} ${item.name}`.toLowerCase().includes(normalized))
            .sort((a, b) => {
              const aRank = a.provider.id === config.provider ? 2 : connectedProviders.has(a.provider.id) ? 1 : 0;
              const bRank = b.provider.id === config.provider ? 2 : connectedProviders.has(b.provider.id) ? 1 : 0;
              return bRank - aRank || a.provider.name.localeCompare(b.provider.name) || a.item.name.localeCompare(b.item.name);
            })
            .map(({ provider, item }) => ({
              value: `/models select ${provider.id} ${item.id}`,
              description: `${provider.name} · ${item.name}${provider.id === config.provider && item.id === config.model ? " · active" : ""}`
            }));
        },
        statusInfo: () => {
          const assistantMessages = session.messages.filter((message) => message.role === "assistant") as Array<{ usage?: { totalTokens?: number } }>;
          const contextTokens = [...assistantMessages].reverse().find((message) => message.usage?.totalTokens)?.usage?.totalTokens ?? 0;
          return {
            model: model.name,
            mode: config.mode === "plan" ? "Plan" : "Build",
            directory: formatDirectory(process.cwd()),
            memory: "Enabled",
            session: `${session.id} ${session.name}`,
            version: VERSION,
            contextTokens,
            contextWindow: model.contextWindow
          };
        }
      });
    } finally {
      process.off("SIGINT", exitImmediately);
      stopScheduler();
      await telegram?.stop();
    }
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(color(message, theme.red));
  process.exitCode = 1;
});
