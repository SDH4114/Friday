type ToolActivity = {
  id: string;
  summary: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
};

let activities: ToolActivity[] = [];
let detailsVisible = false;

export function beginToolActivity(id: string, summary: string, args: unknown): void {
  activities.push({ id, summary, args });
  activities = activities.slice(-12);
  detailsVisible = false;
}

export function finishToolActivity(id: string, result: unknown, isError: boolean): void {
  const activity = activities.find((item) => item.id === id);
  if (!activity) return;
  activity.result = result;
  activity.isError = isError;
}

export function collapseToolActivities(): void {
  detailsVisible = false;
}

export function toggleToolActivityDetails(): void {
  if (activities.length) detailsVisible = !detailsVisible;
}

export function toolActivityDetailLines(): string[] {
  if (!detailsVisible) return [];
  return activities.flatMap((activity) => {
    const state = activity.result === undefined ? "running" : activity.isError ? "error" : "done";
    const args = JSON.stringify(activity.args).slice(0, 500);
    const result = activity.result === undefined ? "" : ` -> ${JSON.stringify(activity.result).slice(0, 500)}`;
    return [`${activity.summary} [${state}]`, `  ${args}${result}`];
  });
}
