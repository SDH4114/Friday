type ToolActivity = {
  id: string;
  summary: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
};

let activities: ToolActivity[] = [];
let changedActivityId: string | undefined;

export function startToolActivityRun(): void {
  activities = [];
  changedActivityId = undefined;
}

export function beginToolActivity(id: string, summary: string, args: unknown): void {
  activities.push({ id, summary, args });
  activities = activities.slice(-12);
  changedActivityId = id;
}

export function finishToolActivity(id: string, result: unknown, isError: boolean): void {
  const activity = activities.find((item) => item.id === id);
  if (!activity) return;
  activity.result = result;
  activity.isError = isError;
  changedActivityId = id;
}

export function collapseToolActivities(): void {
  // Completed activity and file diffs remain visible until the next run.
}

type PaintKind = "normal" | "success" | "error" | "accent" | "addition" | "deletion";

export function renderToolActivityPanel(
  output: { write(value: string): void },
  paint: (value: string, kind: PaintKind) => string
): void {
  const activity = activities.find((item) => item.id === changedActivityId);
  if (!activity) return;
  // Append only the activity that changed. Rewriting a diff taller than the
  // terminal viewport duplicates it in scrollback because cursor-up is capped.
  const lines = activityLines(activity);
  for (const line of lines) {
    const trimmed = line.trimStart();
    const diffText = trimmed.startsWith("│ ") ? trimmed.slice(2) : trimmed;
    const kind: PaintKind = diffText.startsWith("+") && !diffText.startsWith("+++")
      ? "addition"
      : diffText.startsWith("-") && !diffText.startsWith("---")
        ? "deletion"
        : diffText.startsWith("@@") || trimmed.startsWith("╭")
          ? "accent"
          : trimmed.includes("[error]")
            ? "error"
            : trimmed.includes("[done]")
              ? "success"
              : "normal";
    output.write(`${paint(line, kind)}\n`);
  }
  changedActivityId = undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function resultDetails(result: unknown): Record<string, unknown> | undefined {
  return record(record(result)?.details);
}

function compact(value: unknown, limit = 800): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function activityLines(activity: ToolActivity): string[] {
  const state = activity.result === undefined ? "running" : activity.isError ? "error" : "done";
  const args = record(activity.args);
  const details = resultDetails(activity.result);
  if (typeof details?.diff === "string") {
    const path = String(details.path ?? args?.path ?? "file");
    const verb = details.created ? "Created" : "Edited";
    return [
      `╭─ ${verb} ${path}  +${details.additions ?? 0} -${details.deletions ?? 0} [${state}]`,
      ...details.diff.split("\n").map((line) => `│ ${line}`),
      "╰─"
    ];
  }
  if (typeof details?.command === "string") {
    const lines = [`╭─ $ ${details.command} [${state}]`];
    if (details.stdout) lines.push(...String(details.stdout).trimEnd().split("\n").slice(0, 20).map((line) => `│ ${line}`));
    if (details.stderr) lines.push(...String(details.stderr).trimEnd().split("\n").slice(0, 20).map((line) => `│ ${line}`));
    lines.push(`╰─ exit ${details.exitCode ?? "?"}`);
    return lines;
  }
  const safeArgs = args && "content" in args ? { ...args, content: `[${String(args.content).length} chars]` } : activity.args;
  const result = activity.result === undefined ? "" : ` → ${compact(details ?? activity.result)}`;
  return [`${activity.summary} [${state}]`, `  ${compact(safeArgs, 500)}${result}`];
}

export function toolActivityDetailLines(): string[] {
  return activities.flatMap((activity, index) => {
    const block = activityLines(activity);
    return index === activities.length - 1 ? block : [...block, ""];
  });
}
