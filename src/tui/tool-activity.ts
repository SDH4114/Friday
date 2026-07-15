type ToolActivity = {
  id: string;
  summary: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
};

let activities: ToolActivity[] = [];
let renderedPanelLines = 0;

export function startToolActivityRun(): void {
  activities = [];
  renderedPanelLines = 0;
}

export function beginToolActivity(id: string, summary: string, args: unknown): void {
  activities.push({ id, summary, args });
  activities = activities.slice(-12);
}

export function finishToolActivity(id: string, result: unknown, isError: boolean): void {
  const activity = activities.find((item) => item.id === id);
  if (!activity) return;
  activity.result = result;
  activity.isError = isError;
}

export function collapseToolActivities(): void {
  // Activity details stay visible; the next agent run replaces this panel.
}

export function renderToolActivityPanel(output: { write(value: string): void }, paint: (value: string) => string): void {
  if (renderedPanelLines > 0) {
    output.write(`\x1b[${renderedPanelLines}A\r\x1b[J`);
  }
  const lines = toolActivityDetailLines();
  for (const line of lines) output.write(`${paint(line)}\n`);
  renderedPanelLines = lines.length;
}

export function toolActivityDetailLines(): string[] {
  return activities.flatMap((activity, index) => {
    const state = activity.result === undefined ? "running" : activity.isError ? "error" : "done";
    const args = JSON.stringify(activity.args).slice(0, 500);
    const result = activity.result === undefined ? "" : ` -> ${JSON.stringify(activity.result).slice(0, 500)}`;
    const block = [`${activity.summary} [${state}]`, `  ${args}${result}`];
    return index === activities.length - 1 ? block : [...block, ""];
  });
}
