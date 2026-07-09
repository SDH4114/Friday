import {
  createModels,
  type Model,
  type Models,
  type OAuthCredential,
  type Provider
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { nodeAuthContext } from "./auth-context.js";
import { FileCredentialStore } from "./file-credential-store.js";

export type RayaProviderRuntime = {
  models: Models;
  provider: Provider;
  credentials: FileCredentialStore;
};

export function createOpenAICodexRuntime(): RayaProviderRuntime {
  const credentials = new FileCredentialStore();
  const models = createModels({ credentials, authContext: nodeAuthContext });
  const provider = openaiCodexProvider();
  models.setProvider(provider);
  return { models, provider, credentials };
}

export function getConfiguredModel(runtime: RayaProviderRuntime, modelId: string): Model<any> {
  const model = runtime.models.getModel(runtime.provider.id, modelId);

  if (!model) {
    const available = runtime.models
      .getModels(runtime.provider.id)
      .map((item) => item.id)
      .join(", ");
    throw new Error(`Unknown model "${modelId}". Available models: ${available}`);
  }

  return model;
}

export async function loginOpenAICodex(runtime: RayaProviderRuntime): Promise<void> {
  const oauth = runtime.provider.auth.oauth;

  if (!oauth) {
    throw new Error("OpenAI Codex provider does not expose OAuth auth.");
  }

  const rl = readline.createInterface({ input, output });

  try {
    const credential = await oauth.login({
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

    await runtime.credentials.modify(runtime.provider.id, async () => ({
      ...(credential as OAuthCredential),
      type: "oauth"
    }));
  } finally {
    rl.close();
  }
}

export async function logoutOpenAICodex(runtime: RayaProviderRuntime): Promise<void> {
  await runtime.credentials.delete(runtime.provider.id);
}

export async function isOpenAICodexLoggedIn(runtime: RayaProviderRuntime): Promise<boolean> {
  return (await runtime.credentials.read(runtime.provider.id))?.type === "oauth";
}
