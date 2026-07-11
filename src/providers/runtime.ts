import {
  type Model,
  type Models,
  type OAuthCredential,
  type Provider,
  createModels
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { nodeAuthContext } from "./auth-context.js";
import { FileCredentialStore } from "./file-credential-store.js";

export type RayaProviderRuntime = {
  models: Models;
  credentials: FileCredentialStore;
};

export function createProviderRuntime(): RayaProviderRuntime {
  const credentials = new FileCredentialStore();
  const models = createModels({ credentials, authContext: nodeAuthContext });
  models.setProvider(openaiCodexProvider());
  return { models, credentials };
}

export function getProvider(runtime: RayaProviderRuntime, providerId: string): Provider {
  const provider = runtime.models.getProvider(providerId);

  if (!provider) {
    const providers = runtime.models
      .getProviders()
      .map((item) => item.id)
      .sort()
      .join(", ");
    throw new Error(`Unknown provider "${providerId}". Available providers: ${providers}`);
  }

  return provider;
}

export function getConfiguredModel(runtime: RayaProviderRuntime, providerId: string, modelId: string): Model<any> {
  const model = runtime.models.getModel(providerId, modelId);

  if (!model) {
    const available = runtime.models
      .getModels(providerId)
      .map((item) => item.id)
      .slice(0, 30)
      .join(", ");
    throw new Error(`Unknown model "${modelId}" for provider "${providerId}". Available models: ${available}`);
  }

  return model;
}

async function promptCredential(provider: Provider): Promise<OAuthCredential> {
  const rl = readline.createInterface({ input, output });

  try {
    if (provider.auth.oauth) {
      const credential = await provider.auth.oauth.login({
        notify(event) {
          if (event.type === "auth_url") {
            console.log("\nOpen this URL to authorize Raya:\n");
            console.log(event.url);
            if (event.instructions) {
              console.log(`\n${event.instructions}`);
            }
            return;
          }

          if (event.type === "device_code") {
            console.log(`\nOpen ${event.verificationUri} and enter code: ${event.userCode}`);
            return;
          }

          console.log(event.message);
        },
        async prompt(prompt) {
          if (prompt.type === "select") {
            console.log(prompt.message);
            prompt.options.forEach((option, index) => {
              console.log(`${index + 1}. ${option.label}${option.description ? ` - ${option.description}` : ""}`);
            });
            const answer = await rl.question("> ");
            const numeric = Number(answer.trim());
            return Number.isInteger(numeric) && prompt.options[numeric - 1]
              ? prompt.options[numeric - 1]!.id
              : answer.trim();
          }

          return rl.question(`${prompt.message}\n> `);
        }
      });

      return { ...(credential as OAuthCredential), type: "oauth" };
    }
  } finally {
    rl.close();
  }

  throw new Error(`Provider "${provider.id}" does not expose OpenAI Codex OAuth.`);
}

export async function loginProvider(runtime: RayaProviderRuntime, providerId: string): Promise<void> {
  const provider = getProvider(runtime, providerId);
  const credential = await promptCredential(provider);
  await runtime.credentials.modify(provider.id, async () => credential);
}

export async function logoutProvider(runtime: RayaProviderRuntime, providerId: string): Promise<void> {
  getProvider(runtime, providerId);
  await runtime.credentials.delete(providerId);
}

export async function isProviderConfigured(
  runtime: RayaProviderRuntime,
  providerId: string,
  modelId?: string
): Promise<boolean> {
  const stored = await runtime.credentials.read(providerId);
  if (stored) {
    return true;
  }

  const model = modelId ? runtime.models.getModel(providerId, modelId) : runtime.models.getModels(providerId)[0];
  if (!model) {
    return false;
  }

  try {
    return Boolean(await runtime.models.getAuth(model));
  } catch {
    return false;
  }
}
