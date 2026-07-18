export type FileDiff = {
  text: string;
  additions: number;
  deletions: number;
};

const MAX_DIFF_LINES = 120;

/** A compact unified-style diff suited to a terminal activity panel. */
export function createFileDiff(before: string | undefined, after: string, path: string): FileDiff {
  const oldLines = before?.split("\n") ?? [];
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const lines = [
    `--- ${before === undefined ? "/dev/null" : `a/${path}`}`,
    `+++ b/${path}`,
    `@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`)
  ];
  const omitted = Math.max(lines.length - MAX_DIFF_LINES, 0);
  const visible = lines.slice(0, MAX_DIFF_LINES);
  if (omitted) visible.push(`… ${omitted} diff lines omitted`);
  return { text: visible.join("\n"), additions: added.length, deletions: removed.length };
}
