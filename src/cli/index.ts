#!/usr/bin/env node

import { Command } from "commander";
import type { Agent } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, normalizeConfig, updateConfig, type RayaConfig } from "../config/config.js";
import { RAYA_CONFIG_PATH, RAYA_SKILLS_DIR } from "../config/paths.js";
import { readSecret, writeSecret } from "../config/secrets.js";
import {
  createProviderRuntime,
  getConfiguredModel,
  getProvider,
  isProviderConfigured,
  loginProvider,
  logoutProvider
} from "../providers/runtime.js";
import { createRayaAgent, createRayaTools } from "../agent/create-agent.js";
import { commandMatchesAutoApprovePrefix } from "../tools/shell.js";
import { formatToolActivity, renderAgentEvent } from "../tui/render-events.js";
import { notifyTui, requestTerminalApproval, runInteractiveTui } from "../tui/app.js";
import { color, setActiveTheme, theme, themeLabels, THEME_IDS, type ThemeId } from "../tui/theme.js";
import { renderMarkdown } from "../tui/markdown.js";
import { ensureNeovimConfig } from "../tui/neovim.js";
import { startTelegramService } from "../telegram/service.js";
import type { ToolExecutionPolicy } from "../types/tool.js";
import { startScheduler } from "../scheduler/store.js";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { RAYA_PLUGINS_DIR } from "../config/paths.js";
import { openApplication, openUrl, runGitShortcut, webSearchUrl, youtubeSearchUrl } from "./shortcuts.js";
import { normalizePiPackageName } from "../plugins/package.js";
import { runWebServer } from "../web/server.js";
import { formatMcpStatusLines, McpRuntime } from "../mcp/client.js";
import { ensureBuiltinSkills } from "../skills/bootstrap.js";
import { listAvailableSkills } from "../skills/loader.js";
import {
  createSession,
  deleteSession,
  findSession,
  getOrCreateActiveSession,
  listSessions,
  saveSession,
  switchSession,
  type RayaSession
} from "../session/store.js";

const program = new Command();
const VERSION = "0.2.0";
setActiveTheme(loadConfig().theme);

class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.tail.catch(() => undefined);
    this.tail = previous.then(() => gate);
    await previous;
    return release;
  }

  async run<T>(operation: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try { return await operation(); }
    finally { release(); }
  }
}

async function promptWithAbort(agent: Agent, prompt: string, signal: AbortSignal): Promise<void> {
  const abort = (): void => agent.abort();
  if (signal.aborted) throw new Error("Telegram service stopped.");
  signal.addEventListener("abort", abort, { once: true });
  try {
    await agent.prompt(prompt);
    await agent.waitForIdle();
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

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

function availablePreferredProviders(runtime: ReturnType<typeof createProviderRuntime>) {
  const available = new Set(runtime.models.getProviders().map((provider) => provider.id));
  return preferredProviders.filter((item) => available.has(item.id));
}

function printProviderMenu(runtime: ReturnType<typeof createProviderRuntime>): void {
  console.log("Choose provider:");
  const providers = runtime.models.getProviders();
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  let index = 1;

  for (const item of availablePreferredProviders(runtime)) {
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
  const numbered = availablePreferredProviders(runtime);
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`\nProvider [${fallback}] > `)).trim();
    if (!answer) return fallback;
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= numbered.length) {
      return numbered[numeric - 1]!.id;
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
      const approved = action === "run shell command" && config.autoApproveCommands.some((command) => commandMatchesAutoApprovePrefix(details, command));
      if (!approved) await requestTerminalApproval(action, details);
    }
  };
}

function applyConfigToAgent(agent: Agent, config: RayaConfig, models: ReturnType<typeof createProviderRuntime>["models"], model?: Model<any>, mcp?: McpRuntime): void {
  if (model) {
    agent.state.model = model;
  }
  agent.state.thinkingLevel = config.thinkingLevel;
  agent.state.tools = createRayaTools({ config, model: model ?? agent.state.model, models, toolPolicy: buildToolPolicy(config), mcp });
}

async function connectConfiguredMcp(config: RayaConfig, options: { only?: string; strict?: boolean; quiet?: boolean } = {}): Promise<McpRuntime> {
  const mcp = await McpRuntime.connect(config, { clientVersion: VERSION, only: options.only, strict: options.strict });
  if (!options.quiet) {
    for (const status of mcp.statuses.filter((item) => item.enabled && !item.connected)) {
      console.error(color(`MCP ${status.name}: unavailable · ${status.error}`, theme.yellow));
    }
    if (mcp.connectedCount) {
      const toolCount = mcp.statuses.reduce((sum, item) => sum + item.tools, 0);
      console.log(color(`MCP: ${mcp.connectedCount} server${mcp.connectedCount === 1 ? "" : "s"} connected · ${toolCount} tools`, theme.cyan));
    }
  }
  return mcp;
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function assignments(values: string[], label: string): Record<string, string> {
  return Object.fromEntries(values.map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0) throw new Error(`${label} must use KEY=VALUE.`);
    return [value.slice(0, separator), value.slice(separator + 1)];
  }));
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
  console.log(color(`RAYA — restored session: ${session.name}`, theme.cyan));
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
      if (content.type === "text" && content.text?.trim()) console.log(`${renderMarkdown(content.text.trim())}\n`);
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
    if (allowedChatId && !/^-?\d+$/.test(allowedChatId)) throw new Error("Telegram chat ID must be an integer.");
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
  const mcp = await connectConfiguredMcp(config);
  let session = getOrCreateActiveSession(config);
  session.config = { ...session.config, mcpServers: config.mcpServers };
  try {
    const gateway = startTelegramService({
      token,
      allowedChatId: readSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID"),
      onStatus: (status) => console.log(color(
        status === "disconnected"
          ? "Telegram: connection lost · retrying automatically"
          : "Telegram: connection restored",
        status === "disconnected" ? theme.yellow : theme.green
      )),
      onPrompt: async (prompt, toolPolicy, signal) => {
        let response = "";
        const agent = createRayaAgent({
          config: session.config,
          model: getConfiguredModel(runtime, session.config.provider, session.config.model),
          models: runtime.models,
          toolPolicy,
          mcp,
          onEvent: (event) => {
            if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") response += event.assistantMessageEvent.delta;
          }
        });
        agent.state.messages = session.messages;
        await promptWithAbort(agent, prompt, signal);
        session.messages = agent.state.messages;
        saveSession(session);
        return response || lastAssistantText(agent);
      }
    });
    const chatId=readSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID");
    const stopScheduled=startScheduler(async (task)=>{
      if (!chatId) throw new Error("Scheduled delivery requires a Telegram chat ID. Run raya gateway --setup.");
      await gateway.sendMessage(chatId,`Reminder: ${task.message}`);
    }, (error) => console.error(color(`Scheduler: ${error.message}`, theme.red)));
    console.log(color("Telegram gateway running. Press Ctrl+C to stop.", theme.cyan));
    await new Promise<void>((resolve) => process.once("SIGINT", resolve));
    stopScheduled();
    await gateway.stop();
  } finally {
    await mcp.close();
  }
}

program
  .name("raya")
  .description("Open-source AI coding agent harness for the terminal.")
  .version(VERSION)
  .addHelpText("after", `
Examples and direct commands:
  raya                         Start the terminal interface
  raya web                     Open the full Raya Web app
  raya git                     Stage, commit, and push the current repository
  raya yt <text>               Open a YouTube search
  raya search <text>           Open a web search
  raya open <application>      Open a desktop application
  raya gateway --setup         Configure Telegram delivery
  raya gateway --start         Run the Telegram gateway
  raya mcp list                Show configured MCP servers
  raya skills list             Show available built-in and user skills
  raya local add <model>       Add an Ollama/local OpenAI-compatible model
  raya "explain this repo"     Run a one-shot prompt
`);

program
  .command("local")
  .argument("<action>", "add, remove, or list")
  .argument("[model]", "Local model id")
  .description("Manage Ollama, LM Studio, vLLM, or other local OpenAI-compatible models.")
  .option("--provider <provider>", "Local provider id.", "ollama")
  .option("--base-url <url>", "OpenAI-compatible /v1 endpoint.")
  .option("--name <name>", "Display name.")
  .option("--context-window <tokens>", "Context window.", "32768")
  .option("--max-tokens <tokens>", "Maximum output tokens.", "8192")
  .action((action: string, modelId: string | undefined, rawOptions: unknown) => {
    const options = commandOptions<{ provider?: string; baseUrl?: string; name?: string; contextWindow?: string; maxTokens?: string }>(rawOptions);
    const config = loadConfig();
    setActiveTheme(config.theme);
    if (action === "list") {
      if (!config.localModels.length) {
        console.log("No local models configured. Add one with: raya local add <model>");
        return;
      }
      for (const item of config.localModels) {
        console.log(`${item.provider}\t${item.id}\t${item.baseUrl}\t${item.contextWindow} context`);
      }
      return;
    }
    if (!modelId?.trim()) throw new Error(`Usage: raya local ${action} <model> [--provider ollama]`);
    const provider = options.provider?.trim().toLowerCase() || "ollama";
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(provider)) throw new Error("--provider must contain lowercase letters, numbers, dots, underscores, or hyphens.");
    if (action === "remove") {
      const localModels = config.localModels.filter((item) => !(item.provider === provider && item.id === modelId));
      if (localModels.length === config.localModels.length) throw new Error(`Local model not found: ${provider}/${modelId}`);
      updateConfig({ localModels });
      console.log(color(`Removed local model ${provider}/${modelId}.`, theme.green));
      return;
    }
    if (action !== "add") throw new Error("Local action must be add, remove, or list.");
    const defaultUrl = provider === "lmstudio" ? "http://127.0.0.1:1234/v1" : "http://127.0.0.1:11434/v1";
    const baseUrl = (options.baseUrl ?? defaultUrl).replace(/\/$/, "");
    const parsedUrl = new URL(baseUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error("--base-url must use http or https.");
    const contextWindow = Number(options.contextWindow);
    const maxTokens = Number(options.maxTokens);
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) throw new Error("--context-window must be a positive integer.");
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) throw new Error("--max-tokens must be a positive integer.");
    const nextModel: RayaConfig["localModels"][number] = {
      provider,
      id: modelId,
      name: options.name?.trim() || `${modelId} (${provider})`,
      baseUrl,
      contextWindow,
      maxTokens
    };
    const localModels = config.localModels.filter((item) => !(item.provider === provider && item.id === modelId));
    updateConfig({ localModels: [...localModels, nextModel] });
    console.log(color(`Added ${provider}/${modelId} at ${baseUrl}. Select it with /models or raya config --provider ${provider} --model ${modelId}.`, theme.green));
  });

program
  .command("web")
  .description("Open the full local Raya Web app.")
  .option("-p, --port <port>", "Local port. Defaults to 4177.", "4177")
  .option("--no-open", "Start without opening the browser.")
  .action(async (rawOptions: unknown) => {
    const options = commandOptions<{ port?: string; open?: boolean }>(rawOptions);
    const port = Number(options.port ?? "4177");
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be an integer from 1 to 65535.");
    await runWebServer({ port, open: options.open, version: VERSION });
  });

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
        let packageName: string;
        try { packageName = normalizePiPackageName(name); }
        catch { console.log(`${name}\tinvalid package name`); continue; }
        const manifestPath=join(RAYA_PLUGINS_DIR,"node_modules",packageName,"package.json");
        if(!existsSync(manifestPath)){console.log(`${name}\tmissing`);continue;}
        const manifest=JSON.parse(readFileSync(manifestPath,"utf8")) as {pi?:{skills?:string[];extensions?:string[]}};
        const skills=manifest.pi?.skills?.length?`skills:${manifest.pi.skills.length}`:"skills:0";
        const extensions=manifest.pi?.extensions?.length?`native-extensions:${manifest.pi.extensions.length} (adapter required)`:"native-extensions:0";
        console.log(`${name}\t${skills}\t${extensions}`);
      }
      return;
    }
    if(action!=="install"||!packageArg)throw new Error("Usage: raya plugin install npm:<package>");
    const packageName=normalizePiPackageName(packageArg);mkdirSync(RAYA_PLUGINS_DIR,{recursive:true,mode:0o700});
    await new Promise<void>((resolve,reject)=>{const child=spawn("npm",["install","--prefix",RAYA_PLUGINS_DIR,"--ignore-scripts","--no-audit","--no-fund","--",packageName],{stdio:"inherit"});child.on("close",code=>code===0?resolve():reject(new Error(`npm exited ${code}`)));child.on("error",reject);});
    updateConfig({ piPackages: [...new Set([...config.piPackages, packageName])] });
    console.log(`Installed ${packageName}. Skills are loaded on the next session. Native Pi extensions require a Raya adapter.`);
  });

program
  .command("mcp")
  .argument("[action]", "list, add, enable, disable, remove, or test", "list")
  .argument("[name]", "MCP server name")
  .description("Configure and diagnose MCP servers.")
  .option("--command <command>", "Executable for a local stdio MCP server.")
  .option("--arg <value>", "Repeatable stdio argument. Use --arg=-y for values beginning with -.", collectOption, [])
  .option("--cwd <path>", "Working directory for a stdio server.")
  .option("--env <KEY=VALUE>", "Repeatable environment value. Supports ${ENV_VAR} placeholders.", collectOption, [])
  .option("--url <url>", "Streamable HTTP MCP endpoint.")
  .option("--header <KEY=VALUE>", "Repeatable HTTP header. Supports ${ENV_VAR} placeholders.", collectOption, [])
  .option("--approval <mode>", "always, writes, or never", "writes")
  .option("--timeout <ms>", "Connection timeout in milliseconds.", "30000")
  .option("--tool-timeout <ms>", "Tool call timeout in milliseconds.", "120000")
  .option("--disabled", "Add the server in a disabled state.")
  .action(async (action: string, name: string | undefined, rawOptions: unknown) => {
    const config = loadConfig();
    const options = commandOptions<{
      command?: string; arg: string[]; cwd?: string; env: string[]; url?: string; header: string[];
      approval: "always" | "writes" | "never"; timeout: string; toolTimeout: string; disabled?: boolean;
    }>(rawOptions);
    if (action === "list") {
      const entries = Object.entries(config.mcpServers);
      if (!entries.length) {
        console.log(`No MCP servers configured. Add one with: raya mcp add <name> --command <executable>`);
        return;
      }
      for (const [serverName, server] of entries.sort(([a], [b]) => a.localeCompare(b))) {
        const target = server.transport === "stdio" ? [server.command, ...server.args].join(" ") : server.url;
        console.log(`${serverName}\t${server.enabled ? "enabled" : "disabled"}\t${server.transport}\t${server.approval}\t${target}`);
      }
      return;
    }
    if (!name) throw new Error(`Usage: raya mcp ${action} <name>`);
    if (action === "enable" || action === "disable") {
      const current = config.mcpServers[name];
      if (!current) throw new Error(`Unknown MCP server: ${name}`);
      updateConfig({ mcpServers: { ...config.mcpServers, [name]: { ...current, enabled: action === "enable" } } });
      console.log(`MCP ${name}: ${action === "enable" ? "enabled" : "disabled"}.`);
      return;
    }
    if (action === "remove") {
      if (!config.mcpServers[name]) throw new Error(`Unknown MCP server: ${name}`);
      const next = { ...config.mcpServers };
      delete next[name];
      updateConfig({ mcpServers: next });
      console.log(`Removed MCP server ${name}.`);
      return;
    }
    if (action === "test") {
      const mcp = await connectConfiguredMcp(config, { only: name, strict: true, quiet: true });
      try {
        const status = mcp.statuses.find((item) => item.name === name);
        console.log(color(`MCP ${name}: connected · ${status?.tools ?? 0} tools`, theme.green));
      } finally {
        await mcp.close();
      }
      return;
    }
    if (action !== "add") throw new Error("MCP action must be list, add, enable, disable, remove, or test.");
    if (Boolean(options.command) === Boolean(options.url)) throw new Error("Use exactly one of --command (stdio) or --url (Streamable HTTP).");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) throw new Error("MCP name may contain letters, numbers, dots, underscores, and hyphens.");
    const timeoutMs = Number(options.timeout);
    const toolTimeoutMs = Number(options.toolTimeout);
    if (!Number.isInteger(timeoutMs) || !Number.isInteger(toolTimeoutMs)) throw new Error("MCP timeouts must be integer milliseconds.");
    const common = { enabled: !options.disabled, approval: options.approval, timeoutMs, toolTimeoutMs };
    const server = options.command
      ? { ...common, transport: "stdio" as const, command: options.command, args: options.arg, ...(options.cwd ? { cwd: options.cwd } : {}), env: assignments(options.env, "--env") }
      : { ...common, transport: "http" as const, url: options.url!, headers: assignments(options.header, "--header") };
    const normalized = normalizeConfig({ ...config, mcpServers: { ...config.mcpServers, [name]: server } });
    updateConfig({ mcpServers: normalized.mcpServers });
    console.log(color(`Saved MCP server ${name} (${server.transport}, ${server.enabled ? "enabled" : "disabled"}).`, theme.green));
    console.log(`Test it with: raya mcp test ${name}`);
  });

program
  .command("skills")
  .argument("[action]", "list or sync", "list")
  .description("List skills or install missing built-in Raya skills.")
  .action((action: string) => {
    if (action === "sync") {
      const installed = ensureBuiltinSkills();
      console.log(installed.length ? `Installed built-in skills: ${installed.join(", ")}` : "Built-in skills are already installed.");
      console.log(`Skills directory: ${RAYA_SKILLS_DIR}`);
      return;
    }
    if (action !== "list") throw new Error("Skills action must be list or sync.");
    const skills = listAvailableSkills();
    if (!skills.length) { console.log("(none)"); return; }
    for (const skill of skills) console.log(`${skill.name}\t${skill.path}`);
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
    console.log(`design: ${config.headerStyle}`);
    console.log(`theme: ${config.theme}`);
    console.log(`neovim_mode: ${config.neovim_mode}`);
    const enabledMcp = Object.entries(config.mcpServers).filter(([, server]) => server.enabled).map(([name]) => name);
    console.log(`mcp_enabled: ${enabledMcp.length ? enabledMcp.join(", ") : "(none)"}`);
    console.log(`skills: ${listAvailableSkills().length} loaded from ${RAYA_SKILLS_DIR}`);
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
  .command("yt")
  .argument("<query...>", "Text to search for on YouTube.")
  .description("Open YouTube search results in the browser.")
  .action(async (query: string[]) => {
    const text = query.join(" ").trim();
    await openUrl(youtubeSearchUrl(text));
    console.log(`YouTube search opened: ${text}`);
  });

program
  .command("search")
  .alias("serach")
  .argument("<query...>", "Text to search for in the browser.")
  .description("Open a web search in the browser.")
  .action(async (query: string[]) => {
    const text = query.join(" ").trim();
    await openUrl(webSearchUrl(text));
    console.log(`Web search opened: ${text}`);
  });

program
  .command("git")
  .description("Stage all changes, create a commit, and push it.")
  .action(runGitShortcut);

program
  .command("open")
  .argument("<application...>", "Application name to open.")
  .description("Open an application.")
  .action(async (application: string[]) => {
    const name = application.join(" ").trim();
    await openApplication(name);
    console.log(`Opened application: ${name}`);
  });

program
  .command("config")
  .description("Update simple Raya settings.")
  .option("--provider <provider>", "Set provider id.")
  .option("--model <model>", "Set model id.")
  .option("--mode <mode>", "Set default mode: plan or build.")
  .option("--thinking <level>", "Set thinking level: off, minimal, low, medium, high, xhigh.")
  .option("--security <mode>", "Set security mode: standard or full.")
  .option("--design <style>", "Set startup design: small or large.")
  .option("--theme <theme>", "Set global theme: ocean or sunset.")
  .option("--neovim <boolean>", "Enable or disable Neovim input mode: true or false.")
  .action((rawOptions: unknown) => {
    const options = commandOptions<{ provider?: string; model?: string; mode?: string; thinking?: string; security?: string; design?: string; theme?: string; neovim?: string }>(rawOptions);
    const config = loadConfig();
    if (options.mode !== undefined && options.mode !== "plan" && options.mode !== "build") throw new Error("--mode must be plan or build.");
    if (options.thinking !== undefined && !["off", "minimal", "low", "medium", "high", "xhigh"].includes(options.thinking)) throw new Error("--thinking must be off, minimal, low, medium, high, or xhigh.");
    if (options.security !== undefined && options.security !== "standard" && options.security !== "full") throw new Error("--security must be standard or full.");
    if (options.neovim !== undefined && options.neovim !== "true" && options.neovim !== "false") throw new Error("--neovim must be true or false.");
    if (options.design !== undefined && options.design !== "small" && options.design !== "large") throw new Error("--design must be small or large.");
    if (options.theme !== undefined && !THEME_IDS.includes(options.theme as ThemeId)) throw new Error("--theme must be ocean or sunset.");
    let provider = config.provider;
    let modelId = config.model;
    if (options.provider !== undefined || options.model !== undefined) {
      const runtime = createProviderRuntime();
      provider = options.provider ?? config.provider;
      getProvider(runtime, provider);
      const fallbackModel = provider === config.provider ? config.model : runtime.models.getModels(provider)[0]?.id;
      modelId = options.model ?? fallbackModel ?? "";
      if (!modelId) throw new Error(`Provider has no known models: ${provider}`);
      getConfiguredModel(runtime, provider, modelId);
    }
    const patch: Partial<RayaConfig> = {};
    if (options.provider !== undefined || options.model !== undefined) {
      patch.provider = provider;
      patch.model = modelId;
    }
    if (options.mode !== undefined) patch.mode = options.mode as RayaConfig["mode"];
    if (options.thinking !== undefined) patch.thinkingLevel = options.thinking as RayaConfig["thinkingLevel"];
    if (options.security !== undefined) patch.securityMode = options.security as RayaConfig["securityMode"];
    if (options.design !== undefined) patch.headerStyle = options.design as RayaConfig["headerStyle"];
    if (options.theme !== undefined) patch.theme = options.theme as ThemeId;
    if (options.neovim !== undefined) patch.neovim_mode = options.neovim === "true";
    const next = updateConfig(patch);
    setActiveTheme(next.theme);
    if (next.neovim_mode) ensureNeovimConfig();
    const session = getOrCreateActiveSession(next);
    session.config = normalizeConfig({ ...session.config, ...patch, theme: next.theme });
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
    setActiveTheme(config.theme);
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

    const mcp = await connectConfiguredMcp(config);

    const agent = createRayaAgent({
      config,
      model,
      models: runtime.models,
      onEvent: renderAgentEvent,
      toolPolicy: buildToolPolicy(config),
      mcp
    });
    agent.state.messages = session.messages;
    const sessionLock = new AsyncLock();

    const rebuildAgent = (nextSession = session): Agent => {
      const globalConfig = loadConfig();
      nextSession.config = { ...nextSession.config, theme: globalConfig.theme, mcpServers: globalConfig.mcpServers };
      setActiveTheme(globalConfig.theme);
      const nextModel = getConfiguredModel(runtime, nextSession.config.provider, nextSession.config.model);
      const nextAgent = createRayaAgent({
        config: nextSession.config,
        model: nextModel,
        models: runtime.models,
        onEvent: renderAgentEvent,
        toolPolicy: buildToolPolicy(nextSession.config),
        mcp
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
        "/theme                         choose and apply the global theme",
        "/security                      choose Standard or Full access",
        "/sessions                     create, open, or delete a session",
        "/mcps                         show configured and enabled MCP servers",
        "/skills                       show available skills",
        "/About                        what Raya is and what she can do",
        "/status                       show current config",
        "/clear                        clear current session messages",
        "/exit                         quit"
      ].join("\n"));
    };

    const handleCommand = async (activeAgent: Agent, command: string): Promise<Agent | void> => {
      const [rawName, ...args] = command.slice(1).split(/\s+/).filter(Boolean);
      const name = rawName?.toLowerCase();

      if (!name || name === "help") {
        printHelp();
        return;
      }

      if (name === "about") {
        console.log(renderMarkdown([
          "# Raya A.P.P.L.E.",
          "",
          "**Adaptive Personal Processing and Logic Engine**",
          "",
          "Raya is a personal AI operating system and coding agent that works with you directly from the terminal. She is designed to understand a goal, inspect the real environment, plan the work, carry it out, and preserve useful context for later.",
          "",
          "Raya can:",
          "- read, create, and edit project files;",
          "- run terminal commands and work with applications;",
          "- search the web when current information is needed;",
          "- follow personal ~/.raya instructions or the nearest workspace AGENTS.md and SOUL.md;",
          "- remember durable preferences and project knowledge in USER.md and MEMORY.md;",
          "- search and read previous Raya sessions;",
          "- use skills, subagents, schedules, and Telegram integration;",
          "- connect to local and remote MCP servers, tools, resources, and prompts;",
          "- work safely in Plan mode or make changes in Build mode.",
          "",
          "The goal of Raya is simple: turn a conversation into completed, verifiable work while becoming more useful to you over time."
        ].join("\n")));
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
        applyConfigToAgent(activeAgent, config, runtime.models, model, mcp);
        persist(activeAgent);
        return;
      }

      if (name === "theme") {
        const requested = (args[0] === "global" || args[0] === "session" ? args[1] : args[0]) as ThemeId | undefined;
        if (!requested || !THEME_IDS.includes(requested)) {
          console.log(`Current global theme: ${themeLabels[loadConfig().theme]}. Use /theme and choose a theme.`);
          return;
        }
        config = { ...config, theme: requested };
        session.config = config;
        setActiveTheme(requested);
        updateConfig({ theme: requested });
        persist(activeAgent);
        console.log(color(`${themeLabels[requested]} is now the global theme.`, theme.green));
        return;
      }

      if (name === "security") {
        const securityMode = args[0];
        if (securityMode !== "standard" && securityMode !== "full") {
          console.log(`Current security: ${config.securityMode}. Use /security and select a mode.`);
          return;
        }
        config = { ...config, securityMode };
        applyConfigToAgent(activeAgent, config, runtime.models, model, mcp);
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
        if (action === "delete") {
          const target = args[1];
          if (!target) throw new Error("Choose a session to delete from the /sessions menu.");
          const selected = findSession(target);
          if (!selected) throw new Error(`Session not found: ${target}`);
          try {
            await requestTerminalApproval("Delete session", `${selected.name} (${selected.id})`);
          } catch (error) {
            if (error instanceof Error && error.message === "Action refused by user.") {
              console.log(color("Session deletion cancelled.", theme.gray));
              return;
            }
            throw error;
          }
          persist(activeAgent);
          const deleted = deleteSession(target);
          console.log(color(`Deleted session: ${deleted.name}`, theme.green));
          if (deleted.id === session.id) {
            const next = createSession(config);
            console.log(color("Started a new empty session.", theme.gray));
            return rebuildAgent(next);
          }
          return;
        }
        console.log("Use /sessions to create, open, or delete a session.");
        return;
      }

      if (name === "status") {
        console.log(`Provider  : ${config.provider}`);
        console.log(`Model     : ${config.model}`);
        console.log(`Mode      : ${config.mode === "plan" ? "Plan" : "Build"}`);
        console.log(`Security  : ${config.securityMode}`);
        console.log(`Design    : ${config.headerStyle}`);
        console.log(`Theme     : ${themeLabels[config.theme]}`);
        console.log(`Neovim mode  : ${config.neovim_mode ? "Enabled" : "Disabled"}`);
        const enabledMcp = Object.entries(config.mcpServers).filter(([, server]) => server.enabled).map(([serverName]) => serverName);
        console.log(`MCP servers   : ${enabledMcp.length ? enabledMcp.join(", ") : "None"}`);
        console.log(`Skills        : ${listAvailableSkills().length}`);
        console.log(`Session   : ${session.name}`);
        console.log(`Config    : ${RAYA_CONFIG_PATH}`);
        console.log("Credentials: stored securely");
        return;
      }

      if (name === "mcps" || name === "mcp") {
        console.log(formatMcpStatusLines(mcp.statuses).join("\n"));
        return;
      }

      if (name === "skills") {
        for (const skill of listAvailableSkills()) console.log(`${skill.name.padEnd(22)} ${skill.path}`);
        return;
      }

      console.log(`Unknown command: /${name}. Use /help.`);
    };

    if (prompt) {
      try {
        await agent.prompt(prompt);
        await agent.waitForIdle();
        persist(agent);
        console.log();
      } finally {
        await mcp.close();
      }
      return;
    }

    const telegramToken = readSecret("RAYA_TELEGRAM_BOT_TOKEN");
    const telegramChatId = readSecret("RAYA_TELEGRAM_ALLOWED_CHAT_ID");
    const telegram = telegramToken ? startTelegramService({
      token: telegramToken,
      allowedChatId: telegramChatId,
      onStatus: (status) => notifyTui(status === "disconnected"
        ? "Telegram: connection lost · retrying automatically"
        : "Telegram: connection restored"),
      onPrompt: async (remotePrompt, toolPolicy, signal) => sessionLock.run(async () => {
          let streamed = "";
          const remoteAgent = createRayaAgent({
            config,
            model,
            models: runtime.models,
            toolPolicy,
            mcp,
            onEvent: (event) => {
              if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
                streamed += event.assistantMessageEvent.delta;
              }
            }
          });
          remoteAgent.state.messages = session.messages;
          await promptWithAbort(remoteAgent, remotePrompt, signal);
          persist(remoteAgent);
          return streamed || lastAssistantText(remoteAgent);
        })
    }) : undefined;

    if (telegram) console.log(color("Telegram listener started for this Raya session.", theme.cyan));
    const stopScheduler = startScheduler(async (task) => {
      if (!telegram || !telegramChatId) throw new Error("Scheduled delivery requires Telegram setup: raya gateway --setup");
      await telegram.sendMessage(telegramChatId, `Reminder: ${task.message}`);
    }, (error) => notifyTui(`Scheduler error: ${error.message}`));
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
        headerStyle: config.headerStyle,
        session: session.name,
        version: VERSION,
        contextTokens: 0,
        contextWindow: model.contextWindow
      }, {
        onCommand: ({ agent: activeAgent, command }) => sessionLock.run(() => handleCommand(activeAgent, command)),
        onBeforePrompt: () => sessionLock.acquire(),
        onAfterPrompt: (activeAgent) => persist(activeAgent),
        onToggleMode: (activeAgent) => sessionLock.run(() => {
          config = { ...config, mode: config.mode === "plan" ? "build" : "plan" };
          applyConfigToAgent(activeAgent, config, runtime.models, model, mcp);
          persist(activeAgent);
          return { mode: config.mode === "plan" ? "Plan" : "Build" };
        }),
        sessionSuggestions: () => listSessions().map((item) => ({
          id: item.id,
          name: item.name,
          detail: `${item.config.provider}/${item.config.model} · ${item.config.mode}`
        })),
        thinkingSuggestions: () => getSupportedThinkingLevels(model),
        themeSuggestions: () => {
          const globalTheme = loadConfig().theme;
          return [
            { value: "Global theme:", description: "", selectable: false },
            ...THEME_IDS.map((id) => ({
              value: `/theme ${id}`,
              label: themeLabels[id],
              description: id === globalTheme ? "Current global theme" : "Apply globally"
            }))
          ];
        },
        providerSuggestions: (value) => {
          const managed = value.match(/^\/providers manage (\S+)\s*$/)?.[1];
          if (managed) {
            const connected = connectedProviders.has(managed);
            const local = config.localModels.some((item) => item.provider === managed);
            return [
              { value: `/providers use ${managed}`, description: local ? "Use this local provider" : connected ? "Use this connected provider" : "Connect and use this provider" },
              ...(!local ? [{ value: `/providers connect ${managed}`, description: connected ? "Update API key / reconnect" : "Connect provider" }] : [])
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
            headerStyle: config.headerStyle,
            session: session.name,
            version: VERSION,
            contextTokens,
            contextWindow: model.contextWindow
          };
        },
        neovimMode: config.neovim_mode,
        neovimConfig: config.neovim_mode ? ensureNeovimConfig() : undefined
      });
    } finally {
      process.off("SIGINT", exitImmediately);
      stopScheduler();
      await telegram?.stop();
      await mcp.close();
    }
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(color(message, theme.red));
  process.exitCode = 1;
});
