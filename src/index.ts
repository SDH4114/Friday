#!/usr/bin/env node

import dotenv from "dotenv";
import OpenAI from "openai";
import { clearLine, cursorTo, emitKeypressEvents } from "node:readline";
import readline from "node:readline/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type WebPage = SearchResult & {
  text: string;
  fetched: boolean;
  error?: string;
};

type RayaResponse = {
  answer: string;
  inputTokens: number;
  outputTokens: number;
  seconds: number;
};

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
const contextWindowTokens = Number(process.env.OPENROUTER_CONTEXT_TOKENS ?? "128000");
const mode = "Chat";
const memoryStatus = "Disabled";
const mcpStatus = "Disconnected";
const pageContentLimit = Number(process.env.RAYA_SEARCH_PAGE_CHARS ?? "6000");
const commandSuggestions = [
  { name: "/search <query>", description: "Search web, read pages, answer with sources" },
  { name: "/web <query>", description: "Alias for /search" },
  { name: "/exit", description: "Quit Raya" },
  { name: "/quit", description: "Quit Raya" }
];

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
      "You are Raya, a calm, precise, minimal terminal assistant. Answer clearly and practically. Keep responses concise unless the user asks for depth. When web search context is provided, use it for current information and cite source URLs briefly."
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
  console.log(`${color("Web", theme.muted)}       : ${color("/search fetches pages", theme.white)}`);
  console.log();
  console.log(`${color("Config", theme.muted)}    : ${color(envPath ? formatPath(envPath) : "No .env loaded", theme.white)}`);
  console.log();
  console.log(color("Ready.", theme.cyan));
}

function printError(message: string): void {
  console.error(`${color("error", theme.red)} ${color("›", theme.muted)} ${message}`);
  console.error();
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapDuckDuckGoUrl(value: string): string {
  try {
    const decoded = decodeHtml(value);
    const normalized = decoded.startsWith("//") ? `https:${decoded}` : decoded;
    const url = new URL(normalized);
    const unwrapped = url.searchParams.get("uddg");

    return unwrapped ? decodeURIComponent(unwrapped) : url.toString();
  } catch {
    return decodeHtml(value);
  }
}

function contentToText(content: ChatMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return JSON.stringify(content);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateMessagesTokens(items: ChatMessage[]): number {
  return items.reduce((total, item) => total + estimateTokens(`${item.role}: ${contentToText(item.content)}`), 0);
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return String(value);
}

function printStats(response: RayaResponse): void {
  const contextTokens = estimateMessagesTokens(messages);
  const contextPercent = Math.min(100, (contextTokens / contextWindowTokens) * 100);
  const tokensPerSecond = response.seconds > 0 ? response.outputTokens / response.seconds : 0;

  console.log(
    `${color("stats", theme.muted)} ${color("›", theme.muted)} ` +
      `${tokensPerSecond.toFixed(1)} tok/s · ` +
      `context ${formatNumber(contextTokens)}/${formatNumber(contextWindowTokens)} (${contextPercent.toFixed(1)}%) · ` +
      `answer ${formatNumber(response.outputTokens)} tokens`
  );
  console.log();
}

function stripHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Raya/0.1 (+https://github.com/haos/raya-agent)",
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(result: SearchResult): Promise<WebPage> {
  try {
    const response = await fetchWithTimeout(result.url, 8000);

    if (!response.ok) {
      return { ...result, text: "", fetched: false, error: `${response.status} ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return { ...result, text: "", fetched: false, error: `Unsupported content type: ${contentType || "unknown"}` };
    }

    const body = await response.text();
    const text = stripHtml(body).slice(0, pageContentLimit);

    return { ...result, text, fetched: text.length > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...result, text: "", fetched: false, error: message };
  }
}

async function fetchPages(results: SearchResult[]): Promise<WebPage[]> {
  return Promise.all(results.map((result) => fetchPage(result)));
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Raya/0.1 (+https://github.com/haos/raya-agent)",
      Accept: "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const resultBlocks = html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g) ?? [];

  return resultBlocks
    .map((block): SearchResult | undefined => {
      const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);

      if (!linkMatch) {
        return undefined;
      }

      return {
        title: decodeHtml(linkMatch[2] ?? ""),
        url: unwrapDuckDuckGoUrl(linkMatch[1] ?? ""),
        snippet: decodeHtml(snippetMatch?.[1] ?? snippetMatch?.[2] ?? "")
      };
    })
    .filter((result): result is SearchResult => Boolean(result?.title && result.url))
    .slice(0, 5);
}

function formatSearchContext(query: string, pages: WebPage[]): string {
  const date = new Date().toISOString();
  const sources = pages
    .map((page, index) => {
      const content = page.fetched
        ? `Page text excerpt:\n${page.text}`
        : `Page fetch failed: ${page.error ?? "unknown error"}\nSearch snippet fallback: ${page.snippet || "No snippet."}`;

      return `${index + 1}. ${page.title}\nURL: ${page.url}\n${content}`;
    })
    .join("\n\n");

  return `Web context for "${query}". Search time: ${date}. The following linked pages were fetched and inserted into the context window. Use the fetched page text for current information. Cite source URLs when relevant. If a page failed, only use its snippet as a weak fallback.\n\n${sources}`;
}

function printSearchResults(pages: WebPage[]): void {
  const fetchedCount = pages.filter((page) => page.fetched).length;
  console.log(color("web", theme.orange) + color(" ›", theme.muted) + ` ${pages.length} results · ${fetchedCount} pages loaded into context`);

  for (const [index, page] of pages.entries()) {
    const status = page.fetched ? color("loaded", theme.cyan) : color("snippet only", theme.orange);
    console.log(`${color(`${index + 1}.`, theme.muted)} ${color(page.title, theme.white)} ${status}`);
    console.log(`   ${color(page.url, theme.blue)}`);
  }

  console.log();
}

function printCommandSuggestions(): void {
  console.log();
  console.log(color("commands", theme.orange));

  for (const command of commandSuggestions) {
    console.log(`  ${color(command.name.padEnd(18), theme.white)} ${color(command.description, theme.muted)}`);
  }

  console.log();
}

function renderPrompt(buffer: string): void {
  cursorTo(output, 0);
  clearLine(output, 0);
  output.write(color("> ", theme.white) + buffer);
}

async function readUserInput(): Promise<string | undefined> {
  if (input.isTTY && output.isTTY) {
    return readInteractiveInput();
  }

  try {
    return await rl.question(color("> ", theme.white));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;

    if (code === "ERR_USE_AFTER_CLOSE") {
      return undefined;
    }

    throw error;
  }
}

async function readInteractiveInput(): Promise<string | undefined> {
  return new Promise((resolve) => {
    let buffer = "";
    let suggestionsVisible = false;

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
    };

    const redraw = (): void => {
      renderPrompt(buffer);
    };

    const showSuggestions = (): void => {
      if (suggestionsVisible) {
        return;
      }

      suggestionsVisible = true;
      printCommandSuggestions();
      redraw();
    };

    const onKeypress = (character: string | undefined, key: { name?: string; ctrl?: boolean; sequence?: string }): void => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        console.log(color("\nBye.", theme.blue));
        process.exit(0);
      }

      if (key.name === "return") {
        cleanup();
        console.log();
        resolve(buffer);
        return;
      }

      if (key.name === "backspace") {
        buffer = buffer.slice(0, -1);
        redraw();
        return;
      }

      if (key.name === "escape") {
        buffer = "";
        redraw();
        return;
      }

      if (character && character >= " " && !key.ctrl) {
        buffer += character;

        if (buffer === "/") {
          showSuggestions();
          return;
        }

        redraw();
      }
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on("keypress", onKeypress);
    redraw();
  });
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

async function askRaya(): Promise<RayaResponse> {
  const requestStartedAt = Date.now();
  const inputTokens = estimateMessagesTokens(messages);
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

    const trimmedAnswer = answer.trim();
    const seconds = (Date.now() - requestStartedAt) / 1000;

    console.log("\n");

    return {
      answer: trimmedAnswer,
      inputTokens,
      outputTokens: estimateTokens(trimmedAnswer),
      seconds
    };
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
    const rawUserInput = await readUserInput();

    if (rawUserInput === undefined) {
      break;
    }

    const userInput = rawUserInput.trim();

    if (!userInput) {
      continue;
    }

    if (["/exit", "/quit"].includes(userInput.toLowerCase())) {
      break;
    }

    const messagesBeforeTurn = messages.length;
    const searchCommand = userInput.match(/^\/(search|web)\s+(.+)/i);

    if (searchCommand) {
      const query = searchCommand[2]?.trim() ?? "";

      if (!query) {
        printError("Usage: /search your query");
        continue;
      }

      try {
        console.log();
        console.log(`${color("web", theme.orange)} ${color("›", theme.muted)} searching ${color(query, theme.white)}`);
        const results = await searchWeb(query);

        if (results.length === 0) {
          printError("No search results found.");
          continue;
        }

        console.log(`${color("web", theme.orange)} ${color("›", theme.muted)} loading pages into context`);
        const pages = await fetchPages(results);
        printSearchResults(pages);
        messages.push({ role: "system", content: formatSearchContext(query, pages) });
        messages.push({ role: "user", content: `Using the fetched web page context above, answer this current question: ${query}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(message);
        continue;
      }
    } else {
      messages.push({ role: "user", content: userInput });
    }

    console.log();

    try {
      const response = await askRaya();
      messages.push({ role: "assistant", content: response.answer });
      printStats(response);
    } catch (error) {
      messages.splice(messagesBeforeTurn);

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
