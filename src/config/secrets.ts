import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { RAYA_ENV_PATH, ensureRayaHome } from "./paths.js";

function readEnv(): Record<string, string> {
  ensureRayaHome();
  if (!existsSync(RAYA_ENV_PATH)) return {};
  return Object.fromEntries(readFileSync(RAYA_ENV_PATH, "utf8").split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1]!, match[2]! ]));
}

function writeEnv(values: Record<string, string>): void {
  ensureRayaHome();
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  const temporary = `${RAYA_ENV_PATH}.${process.pid}.tmp`;
  writeFileSync(temporary, `${body}\n`, { mode: 0o600 });
  renameSync(temporary, RAYA_ENV_PATH);
}

export function readSecret(name: string): string | undefined {
  return readEnv()[name];
}

export function writeSecret(name: string, value: string | undefined): void {
  const values = readEnv();
  if (value) values[name] = value;
  else delete values[name];
  writeEnv(values);
}
