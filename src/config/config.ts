import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { ensureRayaHome, RAYA_CONFIG_PATH } from "./paths.js";

const ConfigSchema = z.object({
  provider: z.string().default("openai-codex"),
  model: z.string().default("gpt-5.4"),
  mode: z.enum(["plan", "build"]).default("plan"),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).default("minimal"),
  autoApproveCommands: z.array(z.string().min(1)).default([]),
  blockedCommands: z.array(z.string().min(1)).default(["rm"]),
  securityMode: z.enum(["standard", "full"]).default("standard"),
  piPackages: z.array(z.string().min(1)).default([]),
  shellTimeoutMs: z.number().int().positive().default(120_000),
  webTimeoutMs: z.number().int().positive().default(15_000),
  webMaxChars: z.number().int().positive().default(12_000)
});

export type RayaConfig = z.infer<typeof ConfigSchema>;

const defaultConfig: RayaConfig = ConfigSchema.parse({});

export function loadConfig(): RayaConfig {
  ensureRayaHome();

  if (!existsSync(RAYA_CONFIG_PATH)) {
    return defaultConfig;
  }

  const raw = JSON.parse(readFileSync(RAYA_CONFIG_PATH, "utf8")) as Record<string, unknown>;
  // Migrate pre-0.2 configs without making users edit JSON by hand.
  if (raw.mode === "edit") raw.mode = "build";
  return ConfigSchema.parse(raw);
}

export function saveConfig(config: RayaConfig): void {
  ensureRayaHome();
  writeFileSync(RAYA_CONFIG_PATH, `${JSON.stringify(ConfigSchema.parse(config), null, 2)}\n`, {
    mode: 0o600
  });
}
