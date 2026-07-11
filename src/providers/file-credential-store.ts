import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { readSecret, writeSecret } from "../config/secrets.js";
import { RAYA_AUTH_PATH } from "../config/paths.js";

type AuthFile = Record<string, Credential>;

function readAuthFile(): AuthFile {
  const encoded = readSecret("RAYA_CREDENTIALS");
  if (encoded) return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AuthFile;
  if (!existsSync(RAYA_AUTH_PATH)) return {};

  // One-time migration from the original plaintext JSON credential file.
  const legacy = JSON.parse(readFileSync(RAYA_AUTH_PATH, "utf8")) as AuthFile;
  writeAuthFile(legacy);
  unlinkSync(RAYA_AUTH_PATH);
  return legacy;
}

function writeAuthFile(auth: AuthFile): void {
  writeSecret("RAYA_CREDENTIALS", Buffer.from(JSON.stringify(auth), "utf8").toString("base64url"));
}

export class FileCredentialStore implements CredentialStore {
  private readonly locks = new Map<string, Promise<Credential | undefined>>();

  constructor() {}

  async read(providerId: string): Promise<Credential | undefined> {
    return readAuthFile()[providerId];
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    const previous = this.locks.get(providerId) ?? Promise.resolve(undefined);

    const next = previous.catch(() => undefined).then(async () => {
      const auth = readAuthFile();
      const updated = await fn(auth[providerId]);

      if (updated !== undefined) {
        auth[providerId] = updated;
        writeAuthFile(auth);
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
    const auth = readAuthFile();
    delete auth[providerId];
    writeAuthFile(auth);
  }
}
