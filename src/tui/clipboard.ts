import type { ImageContent } from "@earendil-works/pi-ai/compat";
import { execFile, spawn } from "node:child_process";
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

export type ImageMarkerRemoval = {
  value: string;
  cursor: number;
  imageIndex: number;
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

const WINDOWS_CLIPBOARD_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$image = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -ne $image) {
  $stream = New-Object System.IO.MemoryStream
  try {
    $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    @{ kind = "image"; data = [Convert]::ToBase64String($stream.ToArray()); mimeType = "image/png" } | ConvertTo-Json -Compress
  } finally {
    $stream.Dispose()
    $image.Dispose()
  }
} else {
  @{ kind = "text"; text = [System.Windows.Forms.Clipboard]::GetText() } | ConvertTo-Json -Compress
}
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

export function removeImageMarker(
  value: string,
  cursor: number,
  direction: "backward" | "forward"
): ImageMarkerRemoval | undefined {
  const target = direction === "backward" ? cursor - 1 : cursor;
  if (target < 0 || target >= value.length) return undefined;
  const markers = [...value.matchAll(/\[Image (\d+)\]/gu)];
  const marker = markers.find((match) => {
    const start = match.index;
    return target >= start && target < start + match[0].length;
  });
  if (!marker) return undefined;

  let start = marker.index;
  let end = start + marker[0].length;
  if (/\s/u.test(value[start - 1] ?? "") && /\s/u.test(value[end] ?? "")) end += 1;
  else if (end === value.length && /\s/u.test(value[start - 1] ?? "")) start -= 1;
  else if (start === 0 && /\s/u.test(value[end] ?? "")) end += 1;

  const imageNumber = Number(marker[1]);
  const withoutMarker = `${value.slice(0, start)}${value.slice(end)}`;
  const renumbered = withoutMarker.replace(/\[Image (\d+)\]/gu, (block, rawNumber: string) => {
    const number = Number(rawNumber);
    return number > imageNumber ? `[Image ${number - 1}]` : block;
  });
  return {
    value: renumbered,
    cursor: Math.min(start, renumbered.length),
    imageIndex: imageNumber - 1
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
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", MACOS_CLIPBOARD_SCRIPT], {
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024
    });
    return parseMacClipboardOutput(stdout);
  }
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", WINDOWS_CLIPBOARD_SCRIPT], {
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024
    });
    return parseMacClipboardOutput(stdout);
  }
  return undefined;
}

export async function writeClipboardText(text: string): Promise<void> {
  const command = process.platform === "darwin"
    ? { executable: "pbcopy", args: [] }
    : process.platform === "win32"
      ? { executable: "clip.exe", args: [] }
      : process.env.WAYLAND_DISPLAY
        ? { executable: "wl-copy", args: [] }
        : { executable: "xclip", args: ["-selection", "clipboard"] };
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.executable, command.args, { stdio: ["pipe", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `${command.executable} exited ${code}`)));
    child.stdin.end(text);
  });
}
