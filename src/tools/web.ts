import { Type } from "@earendil-works/pi-ai";
import type { RayaConfig } from "../config/config.js";
import type { RayaTool } from "../types/tool.js";

const WebParameters = Type.Object({
  query: Type.Optional(Type.String({ description: "Search query. Use either query or url." })),
  url: Type.Optional(Type.String({ description: "URL to fetch. Use either query or url." }))
});

type WebResult = {
  title?: string;
  url: string;
  snippet?: string;
  content?: string;
};

type WebDetails = {
  mode: "search" | "fetch";
  results: WebResult[];
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckDuckGoUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : raw;
  } catch {
    return raw;
  }
}

function parseSearchResults(html: string): WebResult[] {
  const results: WebResult[] = [];
  const linkRegex = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
    const url = decodeDuckDuckGoUrl(match[1] ?? "");
    const title = stripHtml(match[2] ?? "");
    if (url && title) {
      results.push({ title, url });
    }
  }

  return results;
}

async function fetchText(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Raya/0.1 (+https://github.com/SDH4114/Friday)"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function createWebTool(config: RayaConfig): RayaTool<typeof WebParameters, WebDetails> {
  return {
    name: "web",
    label: "Web",
    description:
      "Search the web with a query or fetch a URL. Returns short text excerpts and source URLs.",
    parameters: WebParameters,
    async execute(_toolCallId, params, signal) {
      if (!params.query && !params.url) {
        throw new Error("Provide either query or url.");
      }

      if (params.url) {
        const html = await fetchText(params.url, config.webTimeoutMs, signal);
        const content = stripHtml(html).slice(0, config.webMaxChars);
        const details: WebDetails = {
          mode: "fetch",
          results: [{ url: params.url, content }]
        };

        return {
          content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
          details
        };
      }

      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(params.query ?? "")}`;
      const html = await fetchText(searchUrl, config.webTimeoutMs, signal);
      const results = parseSearchResults(html);
      const enriched: WebResult[] = [];

      for (const result of results) {
        try {
          const pageHtml = await fetchText(result.url, config.webTimeoutMs, signal);
          enriched.push({
            ...result,
            content: stripHtml(pageHtml).slice(0, Math.floor(config.webMaxChars / Math.max(results.length, 1)))
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          enriched.push({ ...result, snippet: `Fetch failed: ${message}` });
        }
      }

      const details: WebDetails = {
        mode: "search",
        results: enriched
      };

      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details
      };
    }
  };
}
