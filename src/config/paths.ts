import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const RAYA_HOME = process.env.RAYA_HOME ?? join(homedir(), ".raya");
export const RAYA_AUTH_PATH = join(RAYA_HOME, "auth.json");
export const RAYA_ENV_PATH = join(RAYA_HOME, ".env");
export const RAYA_CONFIG_PATH = join(RAYA_HOME, "config.json");
export const RAYA_COMMANDS_PATH = join(RAYA_HOME, "commands.json");
export const RAYA_NEOVIM_CONFIG_PATH = join(RAYA_HOME, "neovim.json");
export const RAYA_LEGACY_VIM_CONFIG_PATH = join(RAYA_HOME, "vim.json");
export const RAYA_SESSIONS_PATH = join(RAYA_HOME, "sessions.json");
export const RAYA_MEMORY_DIR = join(RAYA_HOME, "memory");
export const RAYA_USER_MEMORY_PATH = join(RAYA_HOME, "USER.md");
export const RAYA_MEMORY_PATH = join(RAYA_HOME, "MEMORY.md");
export const RAYA_SCHEDULE_PATH = join(RAYA_HOME, "scheduled.json");
export const RAYA_WEB_PATH = join(RAYA_HOME, "web.json");
export const RAYA_PLUGINS_DIR = join(RAYA_HOME, "plugins");
export const RAYA_SKILLS_DIR = join(RAYA_HOME, "skills");

export function ensureRayaHome(): void {
  if (!existsSync(RAYA_HOME)) {
    mkdirSync(RAYA_HOME, { recursive: true, mode: 0o700 });
  }
}
