#!/usr/bin/env node

import dotenv from "dotenv";
import OpenAI from "openai";
import { clearLine, cursorTo } from "node:readline";
import readline from "node:readline/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");

const theme = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  blue: "\x1b[38;5;67m",
  cyan: "\x1b[38;5;109m",
  orange: "\x1b[38;5;214m",
  red: "\x1b[38;5;167m",
  white: "\x1b[38;5;252m",
  muted: "\x1b[38;5;242m"
} as const;

function color(value: string, ...codes: string[]): string {
  return `${codes.join("")}${value}${theme.reset}`;
}

function formatPath(path: string): string {
  const home = homedir();

  if (path === home) {
    return "~";
  }

  if (path.startsWith(`${home}/`)) {
    return `~/${relative(home, path)}`;
  }

  return path;
}

function loadEnv(): string | undefined {
  const envPaths = [
    join(process.cwd(), ".env"),
    join(homedir(), ".raya", ".env"),
    join(packageRoot, ".env")
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    dotenv.config({ path: envPath, override: false });
    return envPath;
  }

  return undefined;
}

const envPath = loadEnv();
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
const mode = "Chat";
const memoryStatus = "Disabled";
const mcpStatus = "Disconnected";

if (!apiKey) {
  console.error(color("Missing OPENROUTER_API_KEY.", theme.red));
  console.error("Create one of these files and add your key:");
  console.error(`- ${join(process.cwd(), ".env")}`);
  console.error(`- ${join(homedir(), ".raya", ".env")}`);
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/haos/raya-agent",
    "X-Title": "Raya"
  }
});

const messages: ChatMessage[] = [
  {
    role: "system",
    content:
      "You are Raya, a calm, precise, minimal terminal assistant. Answer clearly and practically. Keep responses concise unless the user asks for depth."
  }
];

const rl = readline.createInterface({ input, output });

function printHeader(): void {
  console.clear();
  console.log(color("╭─────────────────────────────────────────────╮", theme.blue));
  console.log(color("│", theme.blue) + color("  RAYA                                       ", theme.white) + color("│", theme.blue));
  console.log(color("│", theme.blue) + color("  Personal AI Operating System               ", theme.muted) + color("│", theme.blue));
  console.log(color("╰─────────────────────────────────────────────╯", theme.blue));
  console.log();
  console.log(`${color("Model", theme.muted)}     : ${color(model, theme.white)}`);
  console.log(`${color("Mode", theme.muted)}      : ${color(mode, theme.white)}`);
  console.log(`${color("Workspace", theme.muted)} : ${color(formatPath(process.cwd()), theme.white)}`);
  console.log(`${color("Memory", theme.muted)}    : ${color(memoryStatus, theme.white)}`);
  console.log(`${color("MCP", theme.muted)}       : ${color(mcpStatus, theme.white)}`);
  console.log();
  console.log(`${color("Config", theme.muted)}    : ${color(envPath ? formatPath(envPath) : "No .env loaded", theme.white)}`);
  console.log();
  console.log(color("Ready.", theme.cyan));
}

function printError(message: string): void {
  console.error(`${color("error", theme.red)} ${color("›", theme.muted)} ${message}`);
  console.error();
}

function startThinkingTimer(): () => number {
  const startedAt = Date.now();

  if (!output.isTTY) {
    console.log(`${color("thinking", theme.orange)} ${color("...", theme.blue)}`);

    return () => (Date.now() - startedAt) / 1000;
  }

  const render = (): void => {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    cursorTo(output, 0);
    clearLine(output, 0);
    output.write(`${color("thinking", theme.orange)} ${color(`${elapsed}s`, theme.blue)}`);
  };

  render();
  const interval = setInterval(render, 100);

  return () => {
    clearInterval(interval);
    const elapsed = (Date.now() - startedAt) / 1000;
    cursorTo(output, 0);
    clearLine(output, 0);
    return elapsed;
  };
}

async function askRaya(): Promise<string> {
  const stopThinkingTimer = startThinkingTimer();
  let startedStreaming = false;
  let answer = "";

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";

      if (!content) {
        continue;
      }

      if (!startedStreaming) {
        const elapsed = stopThinkingTimer();
        console.log(`${color("thinking", theme.orange)} ${color(`${elapsed.toFixed(1)}s`, theme.blue)}`);
        output.write(`${color("raya", theme.cyan)} ${color("›", theme.muted)} `);
        startedStreaming = true;
      }

      output.write(content);
      answer += content;
    }

    if (!startedStreaming) {
      const elapsed = stopThinkingTimer();
      console.log(`${color("thinking", theme.orange)} ${color(`${elapsed.toFixed(1)}s`, theme.blue)}`);
    }

    console.log("\n");
    return answer.trim();
  } catch (error) {
    if (!startedStreaming) {
      stopThinkingTimer();
    }

    throw error;
  }
}

async function main(): Promise<void> {
  printHeader();

  while (true) {
    const userInput = (await rl.question(color("> ", theme.white))).trim();

    if (!userInput) {
      continue;
    }

    if (["/exit", "/quit"].includes(userInput.toLowerCase())) {
      break;
    }

    messages.push({ role: "user", content: userInput });
    console.log();

    try {
      const answer = await askRaya();
      messages.push({ role: "assistant", content: answer });
    } catch (error) {
      messages.pop();

      const message = error instanceof Error ? error.message : String(error);
      printError(message);
    }
  }

  rl.close();
  console.log(color("Bye.", theme.blue));
}

process.on("SIGINT", () => {
  rl.close();
  console.log(color("\nBye.", theme.blue));
  process.exit(0);
});

await main();
