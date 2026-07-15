import { color, theme } from "./theme.js";

type Style = keyof typeof theme;

const inlineStyles: Record<string, string> = {
  red: theme.red,
  green: theme.green,
  yellow: theme.yellow,
  blue: theme.blue,
  cyan: theme.cyan,
  magenta: theme.magenta,
  gray: theme.gray,
  white: theme.white,
  dim: theme.dim
};

function style(value: string, code: string): string {
  return `${code}${value}${theme.reset}`;
}

/** Render the Markdown subset commonly produced by coding agents for a terminal. */
export function renderMarkdown(markdown: string): string {
  const normalized = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  const rendered: string[] = [];
  let inFence = false;
  let fenceLanguage = "";
  let codeLines: string[] = [];

  const flushCode = (): void => {
    if (!codeLines.length) return;
    rendered.push(style(`  ${codeLines.join("\n  ")}`, theme.yellow));
    codeLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = line.match(/^\s*(```+|~~~+)\s*([^ ]*)\s*$/);
    if (fence) {
      if (inFence) {
        flushCode();
        rendered.push(style(`  └─ ${fenceLanguage || "code"}`, theme.gray));
        inFence = false;
        fenceLanguage = "";
      } else {
        inFence = true;
        fenceLanguage = fence[2] || "code";
        rendered.push(style(`  ┌─ ${fenceLanguage}`, theme.gray));
      }
      continue;
    }
    if (inFence) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      rendered.push(style(`${"  ".repeat(Math.min(heading[1].length, 3))}${inline(heading[2])}`, theme.cyan));
      continue;
    }
    if (/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      rendered.push(style("  ─────────────────────────", theme.gray));
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      rendered.push(`${style("│", theme.green)} ${style(inline(quote[1]), theme.gray)}`);
      continue;
    }
    const list = line.match(/^(\s*)([-+*]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (list) {
      const marker = list[3] ? (list[3].toLowerCase() === "x" ? "☑" : "☐") : list[2];
      const markerColor = list[3] ? theme.green : theme.blue;
      rendered.push(`${list[1]}${style(marker, markerColor)} ${inline(list[4])}`);
      continue;
    }
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)) {
      rendered.push(style("  ├────────────────────────────────", theme.gray));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => inline(cell.trim()));
      rendered.push(`${style("│", theme.gray)} ${cells.join(` ${style("│", theme.gray)} `)}`);
      continue;
    }
    rendered.push(inline(line));
  }
  if (inFence) flushCode();
  return rendered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function inline(value: string): string {
  const protectedTokens: string[] = [];
  const protect = (text: string): string => {
    protectedTokens.push(text);
    return `\u0000${protectedTokens.length - 1}\u0000`;
  };

  let result = value.replace(/(`+)(.+?)\1/g, (_match, _ticks, code) => protect(style(code, theme.yellow)));
  result = result.replace(/!?\[([^\]]+)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g, (_match, label, url) =>
    protect(`${inline(label)} ${style(`<${url}>`, theme.blue)}`));
  result = result.replace(/\{(red|green|yellow|blue|cyan|magenta|gray|white|dim)\}([\s\S]*?)\{\/\1\}/gi,
    (_match, name, text) => style(text, inlineStyles[String(name).toLowerCase()] ?? theme.reset));
  result = result.replace(/<span\s+style=["']color:\s*(red|green|yellow|blue|cyan|magenta|gray|white)["']>([\s\S]*?)<\/span>/gi,
    (_match, name, text) => style(text, inlineStyles[String(name).toLowerCase()] ?? theme.reset));
  result = result.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_match, boldA, boldB) => style(boldA ?? boldB, theme.bold));
  result = result.replace(/~~(.+?)~~/g, (_match, text) => style(text, theme.dim));
  result = result.replace(/(?<!\*)\*([^*\n]+)\*|(?<!_)_([^_\n]+)_/g, (_match, italicA, italicB) => style(italicA ?? italicB, "\x1b[3m"));
  result = result.replace(/\u0000(\d+)\u0000/g, (_match, index) => protectedTokens[Number(index)] ?? "");
  return result;
}

export function markdownStyleKeys(): Style[] {
  return Object.keys(inlineStyles) as Style[];
}
