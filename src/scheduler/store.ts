import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureRayaHome, RAYA_SCHEDULE_PATH } from "../config/paths.js";
import { writePrivateFileAtomic } from "../storage/atomic-file.js";

const ScheduledTaskSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
  nextRun: z.string().datetime({ offset: true }),
  repeat: z.enum(["none", "daily"]),
  enabled: z.boolean()
});

export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

export function listScheduled(): ScheduledTask[] {
  ensureRayaHome();
  if (!existsSync(RAYA_SCHEDULE_PATH)) return [];
  return z.array(ScheduledTaskSchema).parse(JSON.parse(readFileSync(RAYA_SCHEDULE_PATH, "utf8")));
}

function save(tasks: ScheduledTask[]): void {
  ensureRayaHome();
  writePrivateFileAtomic(RAYA_SCHEDULE_PATH, `${JSON.stringify(z.array(ScheduledTaskSchema).parse(tasks), null, 2)}\n`);
}

export function createScheduled(message: string, nextRun: string, repeat: "none" | "daily"): ScheduledTask {
  const date = new Date(nextRun);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid scheduled date: ${nextRun}`);
  const task = ScheduledTaskSchema.parse({
    id: randomUUID().slice(0, 8),
    message: message.trim(),
    nextRun: date.toISOString(),
    repeat,
    enabled: true
  });
  const tasks = listScheduled();
  tasks.push(task);
  save(tasks);
  return task;
}

export function cancelScheduled(id: string): void {
  const tasks = listScheduled();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("Scheduled task not found");
  task.enabled = false;
  save(tasks);
}

function markDelivered(id: string, expectedRun: string, now: number): void {
  const tasks = listScheduled();
  const task = tasks.find((item) => item.id === id);
  if (!task?.enabled || task.nextRun !== expectedRun) return;
  const due = Date.parse(task.nextRun);
  if (task.repeat === "daily") {
    let next = due;
    while (next <= now) next += 86_400_000;
    task.nextRun = new Date(next).toISOString();
  } else {
    task.enabled = false;
  }
  save(tasks);
}

export function startScheduler(
  onDue: (task: ScheduledTask) => Promise<void> | void,
  onError?: (error: Error) => void
): () => void {
  let stopped = false;
  let ticking = false;
  const tick = async (): Promise<void> => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const tasks = listScheduled();
      const now = Date.now();
      for (const task of tasks) {
        const due = Date.parse(task.nextRun);
        if (!task.enabled || !Number.isFinite(due) || due > now) continue;
        try {
          await onDue(task);
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error(String(error)));
          continue;
        }
        markDelivered(task.id, task.nextRun, now);
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      ticking = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 30_000);
  return () => { stopped = true; clearInterval(timer); };
}
