import type { ImageContent } from "@earendil-works/pi-ai/compat";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_CLIPBOARD_BYTES = 25 * 1024 * 1024;

export type ClipboardPayload =
  | { kind: "text"; text: string }
  | { kind: "image"; image: ImageContent };

export type ClipboardImageInsertion = {
  value: string;
  cursor: number;
  marker: string;
};

const MACOS_CLIPBOARD_SCRIPT = String.raw`
ObjC.import("AppKit");
const pasteboard = $.NSPasteboard.generalPasteboard;

function unwrap(value) {
  return value ? ObjC.unwrap(value) : null;
}

function encoded(type) {
  const data = pasteboard.dataForType(type);
  return data ? unwrap(data.base64EncodedStringWithOptions(0)) : null;
}

let data = encoded("public.png");
let mimeType = "image/png";
if (!data) {
  data = encoded("public.jpeg");
  mimeType = "image/jpeg";
}
if (!data) {
  const tiff = pasteboard.dataForType("public.tiff");
  if (tiff) {
    const bitmap = $.NSBitmapImageRep.imageRepWithData(tiff);
    const png = bitmap && bitmap.representationUsingTypeProperties(4, $({}));
    if (png) {
      data = unwrap(png.base64EncodedStringWithOptions(0));
      mimeType = "image/png";
    }
  }
}

let result;
if (data) {
  result = { kind: "image", data, mimeType };
} else {
  const text = unwrap(pasteboard.stringForType("public.utf8-plain-text"));
  result = { kind: "text", text: text || "" };
}
JSON.stringify(result);
`;

export function normalizePastedText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").replace(/\0/gu, "");
}

export function insertClipboardText(value: string, cursor: number, text: string): { value: string; cursor: number } {
  const pasted = normalizePastedText(text);
  return {
    value: `${value.slice(0, cursor)}${pasted}${value.slice(cursor)}`,
    cursor: cursor + pasted.length
  };
}

export function insertClipboardImage(value: string, cursor: number, imageNumber: number): ClipboardImageInsertion {
  const marker = `[Image ${imageNumber}]`;
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const prefix = before && !/\s$/u.test(before) ? " " : "";
  const suffix = after && !/^\s/u.test(after) ? " " : "";
  const insertion = `${prefix}${marker}${suffix}`;
  return {
    value: `${before}${insertion}${after}`,
    cursor: cursor + insertion.length,
    marker
  };
}

export function parseMacClipboardOutput(stdout: string): ClipboardPayload | undefined {
  const parsed = JSON.parse(stdout.trim()) as { kind?: string; text?: string; data?: string; mimeType?: string };
  if (parsed.kind === "image" && parsed.data && parsed.mimeType?.startsWith("image/")) {
    if (Buffer.byteLength(parsed.data, "base64") > MAX_CLIPBOARD_BYTES) {
      throw new Error("Clipboard image is larger than 25 MB.");
    }
    return { kind: "image", image: { type: "image", data: parsed.data, mimeType: parsed.mimeType } };
  }
  if (parsed.kind === "text" && parsed.text) return { kind: "text", text: normalizePastedText(parsed.text) };
  return undefined;
}

export async function readClipboard(): Promise<ClipboardPayload | undefined> {
  if (process.platform !== "darwin") return undefined;
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", MACOS_CLIPBOARD_SCRIPT], {
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024
  });
  return parseMacClipboardOutput(stdout);
}
