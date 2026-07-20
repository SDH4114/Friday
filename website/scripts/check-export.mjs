import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const outputRoot = join(process.cwd(), "out");
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const failures = [];
let htmlCount = 0;
let internalLinkCount = 0;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function targetFor(url) {
  const clean = url.split(/[?#]/)[0];
  if (!clean || clean.startsWith("mailto:") || clean.startsWith("tel:") || clean.startsWith("http:") || clean.startsWith("https:")) return null;
  let path = clean;
  if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length) || "/";
  if (!path.startsWith("/")) return null;
  const relativePath = decodeURIComponent(path.replace(/^\//, ""));
  if (!relativePath) return join(outputRoot, "index.html");
  if (extname(relativePath)) return join(outputRoot, relativePath);
  return join(outputRoot, relativePath, "index.html");
}

for (const file of walk(outputRoot).filter((path) => path.endsWith(".html"))) {
  htmlCount += 1;
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = match[1];
    if (url.startsWith("#") || url.startsWith("data:")) continue;
    const target = targetFor(url);
    if (!target) continue;
    internalLinkCount += 1;
    if (!existsSync(target)) failures.push(`${relative(outputRoot, file)} -> ${url}`);
  }
}

if (failures.length) {
  console.error(`Broken static links (${failures.length}):\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(`Static export verified: ${htmlCount} HTML files, ${internalLinkCount} local links/assets.`);
