import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { ensureRayaHome, RAYA_CONFIG_PATH } from "./paths.js";
import { writePrivateFileAtomic } from "../storage/atomic-file.js";

const LocalModelSchema = z.object({
  provider: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
  contextWindow: z.number().int().positive().default(32_768),
  maxTokens: z.number().int().positive().default(8_192)
});

const ConfigSchema = z.object({
  provider: z.string().default("openai-codex"),
  model: z.string().default("gpt-5.4"),
  mode: z.enum(["plan", "build"]).default("plan"),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).default("minimal"),
  autoApproveCommands: z.array(z.string().min(1)).default([]),
  blockedCommands: z.array(z.string().min(1)).default(["rm"]),
  securityMode: z.enum(["standard", "full"]).default("standard"),
  headerStyle: z.enum(["small", "large"]).default("small"),
  theme: z.enum(["ocean", "sunset"]).default("ocean"),
  neovim_mode: z.boolean().default(false),
  localModels: z.array(LocalModelSchema).default([]),
  piPackages: z.array(z.string().min(1)).default([]),
  shellTimeoutMs: z.number().int().positive().default(120_000),
  webTimeoutMs: z.number().int().positive().default(15_000),
  webMaxChars: z.number().int().positive().default(12_000)
});

export type RayaConfig = z.infer<typeof ConfigSchema>;

const defaultConfig: RayaConfig = ConfigSchema.parse({});

export function normalizeConfig(value: unknown): RayaConfig {
  const raw = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {};
  // Migrate pre-0.2 settings without making users edit JSON by hand.
  if (raw.mode === "edit") raw.mode = "build";
  if (raw.neovim_mode === undefined && typeof raw.vim_mode === "boolean") raw.neovim_mode = raw.vim_mode;
  delete raw.vim_mode;
  return ConfigSchema.parse(raw);
}

export function loadConfig(): RayaConfig {
  ensureRayaHome();

  if (!existsSync(RAYA_CONFIG_PATH)) {
    return ConfigSchema.parse(defaultConfig);
  }

  return normalizeConfig(JSON.parse(readFileSync(RAYA_CONFIG_PATH, "utf8")));
}

export function saveConfig(config: RayaConfig): void {
  updateConfig(config);
}

/** Merge only requested settings into config.json and preserve unknown user keys. */
export function updateConfig(patch: Partial<RayaConfig>): RayaConfig {
  ensureRayaHome();
  const raw = existsSync(RAYA_CONFIG_PATH)
    ? JSON.parse(readFileSync(RAYA_CONFIG_PATH, "utf8")) as unknown
    : {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Raya config must contain a JSON object: ${RAYA_CONFIG_PATH}`);
  }
  const next = normalizeConfig({ ...raw as Record<string, unknown>, ...patch });
  writePrivateFileAtomic(RAYA_CONFIG_PATH, `${JSON.stringify({ ...raw as Record<string, unknown>, ...next }, null, 2)}\n`);
  return next;
}
