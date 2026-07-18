import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { readSecret, writeSecret } from "../config/secrets.js";
import { RAYA_AUTH_PATH } from "../config/paths.js";

type AuthFile = Record<string, Credential>;
let credentialQueue: Promise<unknown> = Promise.resolve();

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
  // Credentials for every provider share one file, so per-provider locks can
  // overwrite each other's read-modify-write updates. Serialize the file.
  constructor() {}

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = credentialQueue.catch(() => undefined).then(operation);
    credentialQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.enqueue(() => readAuthFile()[providerId]);
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    return this.enqueue(async () => {
      const auth = readAuthFile();
      const updated = await fn(auth[providerId]);

      if (updated !== undefined) {
        auth[providerId] = updated;
        writeAuthFile(auth);
      }

      return auth[providerId];
    });
  }

  async delete(providerId: string): Promise<void> {
    await this.enqueue(() => {
      const auth = readAuthFile();
      delete auth[providerId];
      writeAuthFile(auth);
    });
  }
}
