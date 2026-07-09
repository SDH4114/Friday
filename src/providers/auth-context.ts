import type { AuthContext } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export const nodeAuthContext: AuthContext = {
  async env(name: string) {
    return process.env[name];
  },
  async fileExists(path: string) {
    return existsSync(expandHome(path));
  }
};
