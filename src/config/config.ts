import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { ensureRayaHome, RAYA_CONFIG_PATH } from "./paths.js";

const ConfigSchema = z.object({
  provider: z.string().default("openai-codex"),
  model: z.string().default("gpt-5.4"),
  mode: z.enum(["plan", "edit"]).default("plan"),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).default("minimal"),
  shellTimeoutMs: z.number().int().positive().default(120_000),
  webTimeoutMs: z.number().int().positive().default(15_000),
  webMaxChars: z.number().int().positive().default(12_000)
});

export type RayaConfig = z.infer<typeof ConfigSchema>;

const defaultConfig: RayaConfig = ConfigSchema.parse({});

export function loadConfig(): RayaConfig {
  ensureRayaHome();

  if (!existsSync(RAYA_CONFIG_PATH)) {
    writeFileSync(RAYA_CONFIG_PATH, `${JSON.stringify(defaultConfig, null, 2)}\n`, { mode: 0o600 });
    return defaultConfig;
  }

  const raw = JSON.parse(readFileSync(RAYA_CONFIG_PATH, "utf8")) as unknown;
  return ConfigSchema.parse(raw);
}

export function saveConfig(config: RayaConfig): void {
  ensureRayaHome();
  writeFileSync(RAYA_CONFIG_PATH, `${JSON.stringify(ConfigSchema.parse(config), null, 2)}\n`, {
    mode: 0o600
  });
}
