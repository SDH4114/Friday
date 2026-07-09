#!/usr/bin/env node

import dotenv from "dotenv";
import OpenAI from "openai";
import { execFile } from "node:child_process";
import { clearLine, cursorTo, emitKeypressEvents } from "node:readline";
import readline from "node:readline/promises";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type RayaMode = "Chat" | "Plan" | "Build";
type ConfigMode = RayaMode | "Agent";

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

type ImageAttachment = {
	id: number;
	placeholder: string;
	dataUrl: string;
};

type TurnInput = {
	text: string;
	attachments: ImageAttachment[];
};

type RayaConfig = {
	model: string;
	models: string[];
	mode: ConfigMode;
	contextTokens: number;
	search: {
		maxResults: number;
		pageChars: number;
		fetchTimeoutMs: number;
	};
	images: {
		maxDimension: number;
		jpegQuality: number;
	};
	retries: {
		maxAttempts: number;
		initialDelayMs: number;
	};
	openrouter: {
		apiKey?: string;
		baseURL: string;
		referer: string;
		title: string;
	};
};

type LoadedConfig = {
	config: RayaConfig;
	paths: string[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const execFileAsync = promisify(execFile);

const defaultConfig: RayaConfig = {
	model: "google/gemma-4-31b-it:free",
	models: [
		"google/gemma-4-31b-it:free",
		"openai/gpt-4o-mini",
		"anthropic/claude-3.5-sonnet",
		"google/gemini-2.0-flash-001",
	],
	mode: "Chat",
	contextTokens: 128000,
	search: {
		maxResults: 5,
		pageChars: 6000,
		fetchTimeoutMs: 8000,
	},
	images: {
		maxDimension: 1280,
		jpegQuality: 80,
	},
	retries: {
		maxAttempts: 3,
		initialDelayMs: 1200,
	},
	openrouter: {
		baseURL: "https://openrouter.ai/api/v1",
		referer: "https://github.com/haos/raya-agent",
		title: "Raya",
	},
};

const theme = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	blue: "\x1b[38;5;67m",
	cyan: "\x1b[38;5;109m",
	orange: "\x1b[38;5;214m",
	red: "\x1b[38;5;167m",
	white: "\x1b[38;5;252m",
	muted: "\x1b[38;5;242m",
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

function loadEnv(): string[] {
	const envPaths = [
		join(process.cwd(), ".env"),
		join(homedir(), ".raya", ".env"),
		join(packageRoot, ".env"),
	];
	const loadedPaths: string[] = [];

	for (const envPath of envPaths) {
		if (!existsSync(envPath)) {
			continue;
		}

		dotenv.config({ path: envPath, override: false });
		loadedPaths.push(envPath);
	}

	return loadedPaths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function normalizeMode(value: unknown): RayaMode {
	const normalized = typeof value === "string" ? value.toLowerCase() : "";

	if (normalized === "plan") {
		return "Plan";
	}

	if (normalized === "build" || normalized === "agent") {
		return "Build";
	}

	return "Chat";
}

function optionalStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const strings = value.filter(
		(item): item is string => typeof item === "string" && item.length > 0,
	);
	return strings.length > 0 ? strings : undefined;
}

function mergeConfig(base: RayaConfig, raw: unknown): RayaConfig {
	if (!isRecord(raw)) {
		return base;
	}

	const search = isRecord(raw.search) ? raw.search : undefined;
	const images = isRecord(raw.images) ? raw.images : undefined;
	const retries = isRecord(raw.retries) ? raw.retries : undefined;
	const openrouter = isRecord(raw.openrouter) ? raw.openrouter : undefined;
	const mode = normalizeMode(raw.mode ?? base.mode);
	const apiKey = optionalString(openrouter?.apiKey) ?? base.openrouter.apiKey;

	return {
		...base,
		model: optionalString(raw.model) ?? base.model,
		models: optionalStringArray(raw.models) ?? base.models,
		mode,
		contextTokens: optionalNumber(raw.contextTokens) ?? base.contextTokens,
		search: {
			...base.search,
			maxResults: optionalNumber(search?.maxResults) ?? base.search.maxResults,
			pageChars: optionalNumber(search?.pageChars) ?? base.search.pageChars,
			fetchTimeoutMs:
				optionalNumber(search?.fetchTimeoutMs) ?? base.search.fetchTimeoutMs,
		},
		images: {
			...base.images,
			maxDimension:
				optionalNumber(images?.maxDimension) ?? base.images.maxDimension,
			jpegQuality:
				optionalNumber(images?.jpegQuality) ?? base.images.jpegQuality,
		},
		retries: {
			...base.retries,
			maxAttempts:
				optionalNumber(retries?.maxAttempts) ?? base.retries.maxAttempts,
			initialDelayMs:
				optionalNumber(retries?.initialDelayMs) ?? base.retries.initialDelayMs,
		},
		openrouter: {
			...base.openrouter,
			...(apiKey ? { apiKey } : {}),
			baseURL: optionalString(openrouter?.baseURL) ?? base.openrouter.baseURL,
			referer: optionalString(openrouter?.referer) ?? base.openrouter.referer,
			title: optionalString(openrouter?.title) ?? base.openrouter.title,
		},
	};
}

function readConfigFile(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not read config ${path}: ${message}`);
	}
}

function ensureGlobalConfig(path: string): void {
	if (existsSync(path)) {
		return;
	}

	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(defaultConfig, null, 2)}\n`, {
		mode: 0o600,
	});
}

function loadConfig(): LoadedConfig {
	const globalConfigPath = join(homedir(), ".raya", "config.json");
	const configPaths = [
		globalConfigPath,
		join(process.cwd(), ".raya", "config.json"),
		join(process.cwd(), "raya.config.json"),
	];
	let config = defaultConfig;
	const loadedPaths: string[] = [];

	ensureGlobalConfig(globalConfigPath);

	for (const configPath of configPaths) {
		if (!existsSync(configPath)) {
			continue;
		}

		try {
			config = mergeConfig(config, readConfigFile(configPath));
			loadedPaths.push(configPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(color(`Invalid config file: ${configPath}`, theme.red));
			console.error(message);
			process.exit(1);
		}
	}

	return { config, paths: loadedPaths };
}

const envPaths = loadEnv();
const { config, paths: configPaths } = loadConfig();
const apiKey = process.env.OPENROUTER_API_KEY ?? config.openrouter.apiKey;
let currentModel = process.env.OPENROUTER_MODEL ?? config.model;
const contextWindowTokens = Number(
	process.env.OPENROUTER_CONTEXT_TOKENS ?? config.contextTokens,
);
let currentMode = normalizeMode(process.env.RAYA_MODE ?? config.mode);
const memoryStatus = "Disabled";
const mcpStatus = "Disconnected";
const searchMaxResults = Number(
	process.env.RAYA_SEARCH_MAX_RESULTS ?? config.search.maxResults,
);
const pageContentLimit = Number(
	process.env.RAYA_SEARCH_PAGE_CHARS ?? config.search.pageChars,
);
const searchFetchTimeoutMs = Number(
	process.env.RAYA_SEARCH_FETCH_TIMEOUT_MS ?? config.search.fetchTimeoutMs,
);
const imageMaxDimension = Number(
	process.env.RAYA_IMAGE_MAX_DIMENSION ?? config.images.maxDimension,
);
const imageJpegQuality = Number(
	process.env.RAYA_IMAGE_JPEG_QUALITY ?? config.images.jpegQuality,
);
const maxRetryAttempts = Number(
	process.env.RAYA_RETRY_ATTEMPTS ?? config.retries.maxAttempts,
);
const initialRetryDelayMs = Number(
	process.env.RAYA_RETRY_INITIAL_DELAY_MS ?? config.retries.initialDelayMs,
);
const commandSuggestions = [
	{
		name: "/read <path>",
		description: "Read a workspace file into chat context",
	},
	{
		name: "/write <path>",
		description: "Overwrite a workspace file with multiline input",
	},
	{
		name: "/append <path>",
		description: "Append multiline input to a workspace file",
	},
	{
		name: "/bash <command>",
		description: "Run a shell command in the workspace",
	},
	{
		name: "/search <query>",
		description: "Search web, read pages, answer with sources",
	},
	{ name: "/model", description: "Switch OpenRouter model" },
	{ name: "/exit", description: "Quit Raya" },
];
const shellCommandTimeoutMs = 30_000;
const toolContextCharLimit = 60_000;
const workspaceRoot = resolve(process.cwd());

if (!apiKey) {
	console.error(color("Missing OPENROUTER_API_KEY.", theme.red));
	console.error("Create one of these files and add your key:");
	console.error(`- ${join(process.cwd(), ".env")}`);
	console.error(`- ${join(homedir(), ".raya", ".env")}`);
	process.exit(1);
}

const client = new OpenAI({
	apiKey,
	baseURL: config.openrouter.baseURL,
	defaultHeaders: {
		"HTTP-Referer": config.openrouter.referer,
		"X-Title": config.openrouter.title,
	},
});

const messages: ChatMessage[] = [
	{
		role: "system",
		content:
			"You are Raya, a calm, precise, minimal terminal assistant. Answer clearly and practically. Keep responses concise unless the user asks for depth. When web search context is provided, use it for current information and cite source URLs briefly.",
	},
];

const rl = readline.createInterface({ input, output });
const nonInteractiveLines = !input.isTTY
	? rl[Symbol.asyncIterator]()
	: undefined;

function printHeader(): void {
	console.clear();
	console.log(
		color("╭─────────────────────────────────────────────╮", theme.blue),
	);
	console.log(
		color("│", theme.blue) +
			color("  RAYA                                       ", theme.white) +
			color("│", theme.blue),
	);
	console.log(
		color("│", theme.blue) +
			color("  Personal AI Operating System               ", theme.muted) +
			color("│", theme.blue),
	);
	console.log(
		color("╰─────────────────────────────────────────────╯", theme.blue),
	);
	console.log();
	console.log(
		`${color("Model", theme.muted)}     : ${color(currentModel, theme.white)}`,
	);
	console.log(
		`${color("Mode", theme.muted)}      : ${color(currentMode, theme.white)}`,
	);
	console.log(
		`${color("Workspace", theme.muted)} : ${color(formatPath(process.cwd()), theme.white)}`,
	);
	console.log(
		`${color("Memory", theme.muted)}    : ${color(memoryStatus, theme.white)}`,
	);
	console.log(
		`${color("MCP", theme.muted)}       : ${color(mcpStatus, theme.white)}`,
	);
	console.log(
		`${color("Config", theme.muted)}    : ${color(configPaths.map(formatPath).join(", ") || "No config loaded", theme.white)}`,
	);
	console.log(
		`${color("Env", theme.muted)}       : ${color(envPaths.map(formatPath).join(", ") || "No .env loaded", theme.white)}`,
	);
	console.log();
	console.log(color("Ready.", theme.cyan));
}

function printError(message: string): void {
	console.error(
		`${color("error", theme.red)} ${color("›", theme.muted)} ${message}`,
	);
	console.error();
}

function errorStatus(error: unknown): number | undefined {
	if (!isRecord(error)) {
		return undefined;
	}

	const status = error.status ?? error.statusCode;
	return typeof status === "number" ? status : undefined;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function formatModelError(error: unknown): string {
	const status = errorStatus(error);
	const message = errorMessage(error);

	if (status === 429 || message.includes("429")) {
		return "OpenRouter/provider rate limit or overload (429). Raya compressed the image and retried, but the free provider still refused it. Try again in a minute or switch model/provider.";
	}

	if (message.toLowerCase().includes("image")) {
		return `${message}. Check that the selected OpenRouter model supports image input.`;
	}

	return message;
}

function isRetryableError(error: unknown): boolean {
	const status = errorStatus(error);
	const message = errorMessage(error).toLowerCase();

	return (
		status === 429 ||
		status === 500 ||
		status === 502 ||
		status === 503 ||
		status === 504 ||
		message.includes("provider returned error")
	);
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
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

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (
					isRecord(part) &&
					part.type === "text" &&
					typeof part.text === "string"
				) {
					return part.text;
				}

				if (isRecord(part) && part.type === "image_url") {
					return "[Image]";
				}

				return "";
			})
			.filter(Boolean)
			.join(" ");
	}

	return JSON.stringify(content);
}

function estimateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

function estimateMessagesTokens(items: ChatMessage[]): number {
	return items.reduce(
		(total, item) =>
			total + estimateTokens(`${item.role}: ${contentToText(item.content)}`),
		0,
	);
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
	const contextPercent = Math.min(
		100,
		(contextTokens / contextWindowTokens) * 100,
	);
	const tokensPerSecond =
		response.seconds > 0 ? response.outputTokens / response.seconds : 0;

	console.log(
		`${color("stats", theme.muted)} ${color("›", theme.muted)} ` +
			`${tokensPerSecond.toFixed(1)} tok/s · ` +
			`context ${formatNumber(contextTokens)}/${formatNumber(contextWindowTokens)} (${contextPercent.toFixed(1)}%) · ` +
			`answer ${formatNumber(response.outputTokens)} tokens`,
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
			.replace(/<[^>]+>/g, " "),
	);
}

async function fetchWithTimeout(
	url: string,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Raya/0.1 (+https://github.com/haos/raya-agent)",
				Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
			},
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchPage(result: SearchResult): Promise<WebPage> {
	try {
		const response = await fetchWithTimeout(result.url, searchFetchTimeoutMs);

		if (!response.ok) {
			return {
				...result,
				text: "",
				fetched: false,
				error: `${response.status} ${response.statusText}`,
			};
		}

		const contentType = response.headers.get("content-type") ?? "";

		if (
			!contentType.includes("text/html") &&
			!contentType.includes("text/plain")
		) {
			return {
				...result,
				text: "",
				fetched: false,
				error: `Unsupported content type: ${contentType || "unknown"}`,
			};
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
	let url: URL;

	try {
		url = new URL("https://html.duckduckgo.com/html/");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid search URL: ${message}`);
	}

	url.searchParams.set("q", query);

	const response = await fetch(url, {
		headers: {
			"User-Agent": "Raya/0.1 (+https://github.com/haos/raya-agent)",
			Accept: "text/html",
		},
	});

	if (!response.ok) {
		throw new Error(`Search failed: ${response.status} ${response.statusText}`);
	}

	const html = await response.text();
	const resultBlocks =
		html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g) ?? [];

	return resultBlocks
		.map((block): SearchResult | undefined => {
			const linkMatch = block.match(
				/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
			);
			const snippetMatch = block.match(
				/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/,
			);

			if (!linkMatch) {
				return undefined;
			}

			return {
				title: decodeHtml(linkMatch[2] ?? ""),
				url: unwrapDuckDuckGoUrl(linkMatch[1] ?? ""),
				snippet: decodeHtml(snippetMatch?.[1] ?? snippetMatch?.[2] ?? ""),
			};
		})
		.filter((result): result is SearchResult =>
			Boolean(result?.title && result.url),
		)
		.slice(0, searchMaxResults);
}

async function clipboardImageToDataUrl(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "raya-clipboard-"));
	const pngPath = join(directory, "clipboard.png");
	const jpegPath = join(directory, "clipboard.jpg");
	const script = `
ObjC.import('AppKit');
const imagePath = ${JSON.stringify(pngPath)};
const pasteboard = $.NSPasteboard.generalPasteboard;
const image = $.NSImage.alloc.initWithPasteboard(pasteboard);
if (!image) {
  throw new Error('Clipboard does not contain an image.');
}
const tiffData = image.TIFFRepresentation;
if (!tiffData) {
  throw new Error('Could not read clipboard image data.');
}
const bitmap = $.NSBitmapImageRep.imageRepWithData(tiffData);
if (!bitmap) {
  throw new Error('Could not convert clipboard image data.');
}
const pngData = bitmap.representationUsingTypeProperties(4, $());
if (!pngData || !pngData.writeToFileAtomically(imagePath, true)) {
  throw new Error('Could not save clipboard image as PNG.');
}
`;

	try {
		await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], {
			timeout: 10000,
		});
		await execFileAsync(
			"sips",
			[
				"-Z",
				String(imageMaxDimension),
				"-s",
				"format",
				"jpeg",
				"-s",
				"formatOptions",
				String(imageJpegQuality),
				pngPath,
				"--out",
				jpegPath,
			],
			{ timeout: 10000 },
		);
		const image = await readFile(jpegPath);
		return `data:image/jpeg;base64,${image.toString("base64")}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Clipboard image failed: ${message}`);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function clipboardText(): Promise<string> {
	try {
		const { stdout } = await execFileAsync("pbpaste", [], { timeout: 3000 });
		return stdout;
	} catch {
		return "";
	}
}

function createUserMessage(inputValue: TurnInput): ChatMessage {
	if (inputValue.attachments.length === 0) {
		return { role: "user", content: inputValue.text };
	}

	return {
		role: "user",
		content: [
			{ type: "text", text: inputValue.text || "Analyze the attached image." },
			...inputValue.attachments.map((attachment) => ({
				type: "image_url" as const,
				image_url: { url: attachment.dataUrl },
			})),
		],
	};
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
	console.log(
		color("web", theme.orange) +
			color(" ›", theme.muted) +
			` ${pages.length} results · ${fetchedCount} pages loaded into context`,
	);

	for (const [index, page] of pages.entries()) {
		const status = page.fetched
			? color("loaded", theme.cyan)
			: color("snippet only", theme.orange);
		console.log(
			`${color(`${index + 1}.`, theme.muted)} ${color(page.title, theme.white)} ${status}`,
		);
		console.log(`   ${color(page.url, theme.blue)}`);
	}

	console.log();
}

function shouldAutoSearch(text: string): boolean {
	const normalized = text.toLowerCase();

	if (normalized.startsWith("/")) {
		return false;
	}

	const patterns = [
		/\b(latest|current|today|recent|news|price|weather|release date|version|changelog)\b/i,
		/\b(search|find|look up|google|web|internet)\b/i,
		/\b202[5-9]\b/,
		/(актуальн|сейчас|сегодня|новост|последн|свеж|курс|цена|погода|релиз|верси|обновл)/i,
		/(найди|поищи|загугли|посмотри в интернете|в сети|вебе|интернет)/i,
		/(что известно|дай информацию|проверь|сравни цены|какая сейчас|какой сейчас)/i,
	];

	return patterns.some((pattern) => pattern.test(normalized));
}

async function addWebContext(
	query: string,
	automatic: boolean,
): Promise<boolean> {
	console.log();
	console.log(
		`${color("web", theme.orange)} ${color("›", theme.muted)} ${automatic ? "auto-search" : "searching"} ${color(query, theme.white)}`,
	);
	const results = await searchWeb(query);

	if (results.length === 0) {
		printError("No search results found.");
		return false;
	}

	console.log(
		`${color("web", theme.orange)} ${color("›", theme.muted)} loading pages into context`,
	);
	const pages = await fetchPages(results);
	printSearchResults(pages);
	messages.push({ role: "system", content: formatSearchContext(query, pages) });

	return true;
}

async function selectModel(argument?: string): Promise<void> {
	const directModel = argument?.trim();

	if (directModel) {
		currentModel = directModel;
		console.log(
			`${color("model", theme.orange)} ${color("›", theme.muted)} ${color(currentModel, theme.white)}`,
		);
		console.log();
		return;
	}

	const models = Array.from(new Set([currentModel, ...config.models]));
	console.log();
	console.log(color("models", theme.orange));

	for (const [index, candidate] of models.entries()) {
		const marker = candidate === currentModel ? color("*", theme.cyan) : " ";
		console.log(
			`  ${marker} ${color(String(index + 1).padStart(2), theme.muted)} ${color(candidate, theme.white)}`,
		);
	}

	console.log(`  ${color("c", theme.muted)}  custom model id`);
	const choice = (await readPlainLine("select model › "))?.trim() ?? "";

	if (!choice) {
		console.log();
		return;
	}

	if (choice.toLowerCase() === "c") {
		const customModel = (await readPlainLine("model id › "))?.trim() ?? "";

		if (customModel) {
			currentModel = customModel;
		}
	} else {
		const selectedIndex = Number(choice) - 1;
		const selectedModel = models[selectedIndex];

		if (selectedModel) {
			currentModel = selectedModel;
		} else {
			printError("Invalid model selection.");
			return;
		}
	}

	console.log(
		`${color("model", theme.orange)} ${color("›", theme.muted)} ${color(currentModel, theme.white)}`,
	);
	console.log();
}

function printCommandSuggestions(): void {
	console.log();
	console.log(color("commands", theme.orange));

	for (const command of commandSuggestions) {
		console.log(
			`  ${color(command.name.padEnd(18), theme.white)} ${color(command.description, theme.muted)}`,
		);
	}

	console.log();
}

function truncateForToolContext(value: string): string {
	if (value.length <= toolContextCharLimit) {
		return value;
	}

	return `${value.slice(0, toolContextCharLimit)}\n\n[truncated ${value.length - toolContextCharLimit} chars]`;
}

function resolveWorkspacePath(target: string): string {
	const trimmed = target.trim();

	if (!trimmed) {
		throw new Error("Path is required.");
	}

	const resolvedPath = resolve(workspaceRoot, trimmed);

	if (
		resolvedPath !== workspaceRoot &&
		!resolvedPath.startsWith(`${workspaceRoot}${sep}`)
	) {
		throw new Error("Path must stay inside the current workspace.");
	}

	return resolvedPath;
}

function printToolBlock(label: string, value: string): void {
	console.log();
	console.log(`${color(label, theme.orange)} ${color("›", theme.muted)}`);
	console.log(value.length > 0 ? value : color("[empty]", theme.muted));
	console.log();
}

function addToolContext(title: string, body: string): void {
	messages.push({
		role: "system",
		content: `${title}\n\n${truncateForToolContext(body)}`,
	});
}

async function readMultilineContent(
	targetPath: string,
): Promise<string | undefined> {
	console.log(
		color(
			`Enter content for ${formatPath(targetPath)}. Finish with .end, cancel with .cancel.`,
			theme.muted,
		),
	);
	const lines: string[] = [];

	while (true) {
		const line = await readPlainLine("│ ");

		if (line === undefined || line === ".cancel") {
			return undefined;
		}

		if (line === ".end") {
			return `${lines.join("\n")}\n`;
		}

		lines.push(line);
	}
}

async function handleReadCommand(argument: string): Promise<void> {
	const filePath = resolveWorkspacePath(argument);
	const content = readFileSync(filePath, "utf8");
	const relativePath = relative(workspaceRoot, filePath);

	printToolBlock(`read ${relativePath}`, truncateForToolContext(content));
	addToolContext(`The user read workspace file: ${relativePath}`, content);
}

async function handleWriteCommand(
	argument: string,
	append: boolean,
): Promise<void> {
	const filePath = resolveWorkspacePath(argument);
	const content = await readMultilineContent(filePath);

	if (content === undefined) {
		printError("File write cancelled.");
		return;
	}

	mkdirSync(dirname(filePath), { recursive: true });

	if (append) {
		appendFileSync(filePath, content, "utf8");
	} else {
		writeFileSync(filePath, content, "utf8");
	}

	const relativePath = relative(workspaceRoot, filePath);
	const action = append ? "appended" : "wrote";
	printToolBlock(action, `${relativePath} (${content.length} chars)`);
	addToolContext(`The user ${action} workspace file: ${relativePath}`, content);
}

function errorOutput(error: unknown, field: "stdout" | "stderr"): string {
	if (!isRecord(error)) {
		return "";
	}

	const value = error[field];
	return typeof value === "string" ? value : "";
}

function errorExitCode(error: unknown): string {
	if (!isRecord(error)) {
		return "unknown";
	}

	const code = error.code;
	return typeof code === "number" || typeof code === "string"
		? String(code)
		: "unknown";
}

async function runWorkspaceCommand(command: string): Promise<string> {
	const trimmed = command.trim();

	if (!trimmed) {
		throw new Error("Command is required.");
	}

	try {
		const { stdout, stderr } = await execFileAsync("bash", ["-lc", trimmed], {
			cwd: workspaceRoot,
			timeout: shellCommandTimeoutMs,
			maxBuffer: 1024 * 1024,
		});

		return `exit: 0\nstdout:\n${stdout || "[empty]"}\nstderr:\n${stderr || "[empty]"}`;
	} catch (error) {
		return `exit: ${errorExitCode(error)}\nstdout:\n${errorOutput(error, "stdout") || "[empty]"}\nstderr:\n${errorOutput(error, "stderr") || errorMessage(error)}`;
	}
}

async function handleBashCommand(command: string): Promise<void> {
	const trimmed = command.trim();

	if (!trimmed) {
		printError("Usage: /bash command");
		return;
	}

	const result = await runWorkspaceCommand(trimmed);
	printToolBlock(`bash ${trimmed}`, truncateForToolContext(result));
	addToolContext(`The user ran a workspace bash command: ${trimmed}`, result);
}

const agentTools = [
	{
		type: "function",
		function: {
			name: "read_file",
			description: "Read a UTF-8 text file inside the current workspace.",
			parameters: {
				type: "object",
				properties: { path: { type: "string" } },
				required: ["path"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "write_file",
			description:
				"Create or overwrite a UTF-8 text file inside the workspace. Build mode only.",
			parameters: {
				type: "object",
				properties: { path: { type: "string" }, content: { type: "string" } },
				required: ["path", "content"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "edit_file",
			description:
				"Replace exact text in a UTF-8 workspace file. Fails if oldText is not found exactly once. Build mode only.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string" },
					oldText: { type: "string" },
					newText: { type: "string" },
				},
				required: ["path", "oldText", "newText"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "bash",
			description:
				"Run a bash command in the current workspace. In Plan mode use only inspection/validation commands; Build mode may run build/editing commands.",
			parameters: {
				type: "object",
				properties: { command: { type: "string" } },
				required: ["command"],
				additionalProperties: false,
			},
		},
	},
] satisfies OpenAI.Chat.Completions.ChatCompletionTool[];

function agentToolsForMode(
	modeValue: RayaMode,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
	if (modeValue === "Plan") {
		return agentTools.filter(
			(tool) =>
				tool.function.name === "read_file" || tool.function.name === "bash",
		);
	}

	if (modeValue === "Build") {
		return agentTools;
	}

	return [];
}

function buildAgentModeInstruction(modeValue: RayaMode): string {
	if (modeValue === "Plan") {
		return "Raya is in PLAN mode. You may inspect the workspace with read_file and safe bash commands. Do not modify files. Produce a concrete implementation plan, risks, and validation commands. If you need file context, call tools instead of guessing.";
	}

	return "Raya is in BUILD mode. You may inspect files, edit files with exact replacements, write files, and run bash commands inside the workspace. Prefer read_file before edit_file. Keep changes focused, validate with bash when useful, then summarize changed files and validation results.";
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(rawArguments) as unknown;
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function stringArg(args: Record<string, unknown>, name: string): string {
	const value = args[name];

	if (typeof value !== "string") {
		throw new Error(`Missing string argument: ${name}`);
	}

	return value;
}

function isPlanSafeCommand(command: string): boolean {
	const normalized = command.toLowerCase();
	const blocked = [
		/(^|[;&|]\s*)(rm|mv|cp|mkdir|rmdir|touch|chmod|chown|ln)\b/,
		/(^|[;&|]\s*)git\s+(commit|push|reset|checkout|switch|merge|rebase|clean|apply)\b/,
		/(^|[;&|]\s*)npm\s+(install|i|update|uninstall|run\s+build)\b/,
		/>|>>/,
	];

	return !blocked.some((pattern) => pattern.test(normalized));
}

async function executeAgentTool(
	name: string,
	args: Record<string, unknown>,
	modeValue: RayaMode,
): Promise<string> {
	try {
		if (name === "read_file") {
			const filePath = resolveWorkspacePath(stringArg(args, "path"));
			const content = readFileSync(filePath, "utf8");
			const relativePath = relative(workspaceRoot, filePath);
			return `read_file ${relativePath}\n\n${truncateForToolContext(content)}`;
		}

		if (name === "write_file") {
			if (modeValue !== "Build") {
				throw new Error("write_file is only allowed in Build mode.");
			}

			const filePath = resolveWorkspacePath(stringArg(args, "path"));
			const content = stringArg(args, "content");
			mkdirSync(dirname(filePath), { recursive: true });
			writeFileSync(filePath, content, "utf8");
			return `write_file ${relative(workspaceRoot, filePath)} (${content.length} chars written)`;
		}

		if (name === "edit_file") {
			if (modeValue !== "Build") {
				throw new Error("edit_file is only allowed in Build mode.");
			}

			const filePath = resolveWorkspacePath(stringArg(args, "path"));
			const oldText = stringArg(args, "oldText");
			const newText = stringArg(args, "newText");
			const content = readFileSync(filePath, "utf8");
			const matches = content.split(oldText).length - 1;

			if (matches !== 1) {
				throw new Error(
					`oldText must match exactly once; matched ${matches} times.`,
				);
			}

			writeFileSync(filePath, content.replace(oldText, newText), "utf8");
			return `edit_file ${relative(workspaceRoot, filePath)} (${oldText.length} chars replaced with ${newText.length} chars)`;
		}

		if (name === "bash") {
			const command = stringArg(args, "command");

			if (modeValue === "Plan" && !isPlanSafeCommand(command)) {
				throw new Error(
					"This bash command looks mutating and is not allowed in Plan mode. Switch to Build mode if you want to modify the workspace.",
				);
			}

			return `bash ${command}\n\n${truncateForToolContext(await runWorkspaceCommand(command))}`;
		}

		throw new Error(`Unknown tool: ${name}`);
	} catch (error) {
		return `tool_error ${name}: ${errorMessage(error)}`;
	}
}

function nextMode(modeValue: RayaMode): RayaMode {
	if (modeValue === "Chat") {
		return "Plan";
	}

	if (modeValue === "Plan") {
		return "Build";
	}

	return "Chat";
}

function modeColor(modeValue: RayaMode): string {
	if (modeValue === "Build") {
		return theme.orange;
	}

	if (modeValue === "Plan") {
		return theme.cyan;
	}

	return theme.white;
}

function renderPrompt(buffer: string): void {
	cursorTo(output, 0);
	clearLine(output, 0);
	const highlighted = buffer.replace(/\[Image \d+\]/g, (placeholder) =>
		color(placeholder, theme.orange),
	);
	output.write(
		color(`[${currentMode}]`, modeColor(currentMode)) +
			color(" > ", theme.white) +
			highlighted,
	);
}

async function readPlainLine(prompt: string): Promise<string | undefined> {
	if (nonInteractiveLines) {
		output.write(color(prompt, theme.white));
		const next = await nonInteractiveLines.next();

		if (next.done) {
			return undefined;
		}

		output.write(`${next.value}\n`);
		return next.value;
	}

	return rl.question(color(prompt, theme.white));
}

async function readUserInput(): Promise<TurnInput | undefined> {
	if (input.isTTY && output.isTTY) {
		return readInteractiveInput();
	}

	const text = await readPlainLine("> ");
	return text === undefined ? undefined : { text, attachments: [] };
}

async function readInteractiveInput(): Promise<TurnInput | undefined> {
	return new Promise((resolve) => {
		let buffer = "";
		const attachments: ImageAttachment[] = [];
		let suggestionsVisible = false;

		const cleanup = (): void => {
			input.off("keypress", onKeypress);
			input.setRawMode(false);
		};

		const redraw = (): void => {
			renderPrompt(buffer);
		};

		const appendText = (text: string): void => {
			buffer += text;
			redraw();
		};

		const appendImage = async (): Promise<boolean> => {
			try {
				const dataUrl = await clipboardImageToDataUrl();
				const id = attachments.length + 1;
				const placeholder = `[Image ${id}]`;
				attachments.push({ id, placeholder, dataUrl });
				buffer +=
					buffer.length > 0 && !buffer.endsWith(" ")
						? ` ${placeholder}`
						: placeholder;
				redraw();
				return true;
			} catch {
				return false;
			}
		};

		const pasteClipboard = async (): Promise<void> => {
			if (await appendImage()) {
				return;
			}

			const text = await clipboardText();

			if (text.length > 0) {
				appendText(text);
			}
		};

		const showSuggestions = (): void => {
			if (suggestionsVisible) {
				return;
			}

			suggestionsVisible = true;
			printCommandSuggestions();
			redraw();
		};

		const onKeypress = (
			character: string | undefined,
			key: { name?: string; ctrl?: boolean; sequence?: string },
		): void => {
			if (key.ctrl && key.name === "c") {
				cleanup();
				console.log(color("\nBye, Bye.", theme.blue));
				process.exit(0);
			}

			if (key.name === "tab") {
				currentMode = nextMode(currentMode);
				redraw();
				return;
			}

			if (key.name === "return") {
				cleanup();
				console.log();
				resolve({
					text: buffer,
					attachments: attachments.filter((attachment) =>
						buffer.includes(attachment.placeholder),
					),
				});
				return;
			}

			if (key.name === "backspace") {
				buffer = buffer.slice(0, -1);
				redraw();
				return;
			}

			if (key.name === "escape") {
				buffer = "";
				attachments.splice(0);
				redraw();
				return;
			}

			if ((key.ctrl && key.name === "v") || key.sequence === "\u0016") {
				void pasteClipboard();
				return;
			}

			if (character && character >= " " && !key.ctrl) {
				appendText(character);

				if (buffer === "/") {
					showSuggestions();
					return;
				}
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
		console.log(
			`${color("thinking", theme.orange)} ${color("...", theme.blue)}`,
		);

		return () => (Date.now() - startedAt) / 1000;
	}

	const render = (): void => {
		const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
		cursorTo(output, 0);
		clearLine(output, 0);
		output.write(
			`${color("thinking", theme.orange)} ${color(`${elapsed}s`, theme.blue)}`,
		);
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
		let stream:
			| AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
			| undefined;

		for (let attempt = 1; attempt <= maxRetryAttempts; attempt += 1) {
			try {
				stream = (await client.chat.completions.create({
					model: currentModel,
					messages,
					temperature: 0.7,
					stream: true,
				})) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
				break;
			} catch (error) {
				if (attempt >= maxRetryAttempts || !isRetryableError(error)) {
					throw error;
				}

				await delay(initialRetryDelayMs * attempt);
			}
		}

		if (!stream) {
			throw new Error("Model stream was not created.");
		}

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content ?? "";

			if (!content) {
				continue;
			}

			if (!startedStreaming) {
				const elapsed = stopThinkingTimer();
				console.log(
					`${color("thinking", theme.orange)} ${color(`${elapsed.toFixed(1)}s`, theme.blue)}`,
				);
				output.write(
					`${color("raya", theme.cyan)} ${color("›", theme.muted)} `,
				);
				startedStreaming = true;
			}

			output.write(content);
			answer += content;
		}

		if (!startedStreaming) {
			const elapsed = stopThinkingTimer();
			console.log(
				`${color("thinking", theme.orange)} ${color(`${elapsed.toFixed(1)}s`, theme.blue)}`,
			);
		}

		const trimmedAnswer = answer.trim();
		const seconds = (Date.now() - requestStartedAt) / 1000;

		console.log("\n");

		return {
			answer: trimmedAnswer,
			inputTokens,
			outputTokens: estimateTokens(trimmedAnswer),
			seconds,
		};
	} catch (error) {
		if (!startedStreaming) {
			stopThinkingTimer();
		}

		throw error;
	}
}

async function askRayaWithTools(): Promise<RayaResponse> {
	const requestStartedAt = Date.now();
	const tools = agentToolsForMode(currentMode);
	const modeInstruction: ChatMessage = {
		role: "system",
		content: buildAgentModeInstruction(currentMode),
	};
	let finalAnswer = "";

	for (let step = 1; step <= 10; step += 1) {
		const requestMessages = [modeInstruction, ...messages];
		const response = await client.chat.completions.create({
			model: currentModel,
			messages: requestMessages,
			temperature: currentMode === "Plan" ? 0.3 : 0.2,
			tools,
			tool_choice: "auto",
		});
		const assistantMessage = response.choices[0]?.message;

		if (!assistantMessage) {
			throw new Error("Model returned no message.");
		}

		messages.push(assistantMessage as ChatMessage);

		if (
			!assistantMessage.tool_calls ||
			assistantMessage.tool_calls.length === 0
		) {
			finalAnswer = assistantMessage.content ?? "";
			break;
		}

		for (const toolCall of assistantMessage.tool_calls) {
			const toolName = toolCall.function.name;
			const args = parseToolArguments(toolCall.function.arguments);
			const result = await executeAgentTool(toolName, args, currentMode);

			printToolBlock(`tool ${toolName}`, truncateForToolContext(result));
			messages.push({
				role: "tool",
				tool_call_id: toolCall.id,
				content: result,
			} as ChatMessage);
		}
	}

	if (!finalAnswer) {
		finalAnswer =
			"Stopped after the tool-step limit. Ask me to continue if needed.";
	}

	console.log(
		`${color("raya", theme.cyan)} ${color("›", theme.muted)} ${finalAnswer}`,
	);
	console.log();

	const seconds = (Date.now() - requestStartedAt) / 1000;

	return {
		answer: finalAnswer,
		inputTokens: estimateMessagesTokens(messages),
		outputTokens: estimateTokens(finalAnswer),
		seconds,
	};
}

async function main(): Promise<void> {
	printHeader();

	while (true) {
		const rawUserInput = await readUserInput();

		if (rawUserInput === undefined) {
			break;
		}

		const userInput = rawUserInput.text.trim();

		if (!userInput && rawUserInput.attachments.length === 0) {
			continue;
		}

		if (userInput.toLowerCase() === "/exit") {
			break;
		}

		const messagesBeforeTurn = messages.length;
		const readCommand = userInput.match(/^\/read\s+(.+)/i);
		const writeCommand = userInput.match(/^\/write\s+(.+)/i);
		const appendCommand = userInput.match(/^\/append\s+(.+)/i);
		const bashCommand = userInput.match(/^\/bash\s+([\s\S]+)/i);
		const searchCommand = userInput.match(/^\/search\s+(.+)/i);
		const modelCommand = userInput.match(/^\/model(?:\s+(.+))?$/i);

		if (modelCommand) {
			await selectModel(modelCommand[1]);
			continue;
		}

		if (readCommand) {
			try {
				await handleReadCommand(readCommand[1] ?? "");
			} catch (error) {
				printError(errorMessage(error));
			}
			continue;
		}

		if (writeCommand) {
			try {
				await handleWriteCommand(writeCommand[1] ?? "", false);
			} catch (error) {
				printError(errorMessage(error));
			}
			continue;
		}

		if (appendCommand) {
			try {
				await handleWriteCommand(appendCommand[1] ?? "", true);
			} catch (error) {
				printError(errorMessage(error));
			}
			continue;
		}

		if (bashCommand) {
			await handleBashCommand(bashCommand[1] ?? "");
			continue;
		}

		if (searchCommand) {
			const query = searchCommand[1]?.trim() ?? "";

			if (!query) {
				printError("Usage: /search your query");
				continue;
			}

			try {
				if (!(await addWebContext(query, false))) {
					continue;
				}
				messages.push({
					role: "user",
					content: `Using the fetched web page context above, answer this current question: ${query}`,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				printError(message);
				continue;
			}
		} else {
			if (
				rawUserInput.attachments.length === 0 &&
				shouldAutoSearch(userInput)
			) {
				try {
					await addWebContext(userInput, true);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					printError(`Auto-search failed: ${message}`);
				}
			}

			messages.push(
				createUserMessage({
					text: rawUserInput.text.trim(),
					attachments: rawUserInput.attachments,
				}),
			);
		}

		console.log();

		try {
			const response =
				currentMode === "Chat" ? await askRaya() : await askRayaWithTools();
			if (currentMode === "Chat") {
				messages.push({ role: "assistant", content: response.answer });
			}
			printStats(response);
		} catch (error) {
			messages.splice(messagesBeforeTurn);

			printError(formatModelError(error));
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
