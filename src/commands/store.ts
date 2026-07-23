import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { z } from "zod";
import { ensureRayaHome, RAYA_COMMANDS_PATH } from "../config/paths.js";
import { commandInvocation } from "../platform.js";
import { writePrivateFileAtomic } from "../storage/atomic-file.js";

const CommandNameSchema = z.string()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9-]*$/, "Command names must start with a letter and contain only lowercase letters, numbers, and hyphens.");

const CustomCommandSchema = z.object({
  name: CommandNameSchema,
  executable: z.string().trim().min(1).max(1_000),
  args: z.array(z.string().max(10_000)).default([]),
  description: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value), "Command descriptions must fit on one line.").optional(),
  cwd: z.string().trim().min(1).max(4_000).optional()
});

const CustomCommandsSchema = z.array(CustomCommandSchema).max(500);

export type CustomCommand = z.infer<typeof CustomCommandSchema>;

export function validateCommandName(name: string): string {
  return CommandNameSchema.parse(name.trim());
}

export function listCustomCommands(): CustomCommand[] {
  ensureRayaHome();
  if (!existsSync(RAYA_COMMANDS_PATH)) return [];
  const commands = CustomCommandsSchema.parse(JSON.parse(readFileSync(RAYA_COMMANDS_PATH, "utf8")));
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function saveCustomCommands(commands: CustomCommand[]): void {
  ensureRayaHome();
  const normalized = CustomCommandsSchema.parse(commands).sort((a, b) => a.name.localeCompare(b.name));
  writePrivateFileAtomic(RAYA_COMMANDS_PATH, `${JSON.stringify(normalized, null, 2)}\n`);
}

export function addCustomCommand(
  command: CustomCommand,
  options: { overwrite?: boolean; reservedNames?: ReadonlySet<string> } = {}
): CustomCommand {
  const normalized = CustomCommandSchema.parse(command);
  if (options.reservedNames?.has(normalized.name)) {
    throw new Error(`Cannot replace built-in Raya command: ${normalized.name}`);
  }
  const commands = listCustomCommands();
  const existing = commands.findIndex((item) => item.name === normalized.name);
  if (existing >= 0 && !options.overwrite) {
    throw new Error(`Command already exists: ${normalized.name}. Use --force to replace it.`);
  }
  if (existing >= 0) commands[existing] = normalized;
  else commands.push(normalized);
  saveCustomCommands(commands);
  return normalized;
}

export function removeCustomCommand(name: string): CustomCommand {
  const normalizedName = validateCommandName(name);
  const commands = listCustomCommands();
  const command = commands.find((item) => item.name === normalizedName);
  if (!command) throw new Error(`Unknown custom command: ${normalizedName}`);
  saveCustomCommands(commands.filter((item) => item.name !== normalizedName));
  return command;
}

export function formatCustomCommand(command: CustomCommand): string {
  return [command.executable, ...command.args].map((part) => JSON.stringify(part)).join(" ");
}

export async function runCustomCommand(command: CustomCommand, extraArgs: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const invocation = commandInvocation(command.executable, [...command.args, ...extraArgs]);
    const child = spawn(invocation.command, invocation.args, {
      cwd: command.cwd ?? process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`Command ${command.name} stopped by signal ${signal}.`));
      else if (code === 0) resolve();
      else reject(new Error(`Command ${command.name} exited with code ${code ?? "unknown"}.`));
    });
  });
}
