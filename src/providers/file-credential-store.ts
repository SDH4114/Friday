import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureRayaHome, RAYA_AUTH_PATH } from "../config/paths.js";

type AuthFile = Record<string, Credential>;

function readAuthFile(path = RAYA_AUTH_PATH): AuthFile {
  ensureRayaHome();

  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, "utf8")) as AuthFile;
}

function writeAuthFile(auth: AuthFile, path = RAYA_AUTH_PATH): void {
  ensureRayaHome();
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, path);
}

export class FileCredentialStore implements CredentialStore {
  private readonly locks = new Map<string, Promise<Credential | undefined>>();

  constructor(private readonly path = RAYA_AUTH_PATH) {
    ensureRayaHome();
    void dirname(this.path);
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return readAuthFile(this.path)[providerId];
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    const previous = this.locks.get(providerId) ?? Promise.resolve(undefined);

    const next = previous.catch(() => undefined).then(async () => {
      const auth = readAuthFile(this.path);
      const updated = await fn(auth[providerId]);

      if (updated !== undefined) {
        auth[providerId] = updated;
        writeAuthFile(auth, this.path);
      }

      return auth[providerId];
    });

    this.locks.set(providerId, next);

    try {
      return await next;
    } finally {
      if (this.locks.get(providerId) === next) {
        this.locks.delete(providerId);
      }
    }
  }

  async delete(providerId: string): Promise<void> {
    const auth = readAuthFile(this.path);
    delete auth[providerId];
    writeAuthFile(auth, this.path);
  }
}
