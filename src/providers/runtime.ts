import {
  type ApiKeyCredential,
  type Credential,
  type Model,
  type Models,
  type MutableModels,
  type OAuthCredential,
  type Provider,
  clampThinkingLevel,
  createProvider,
  getSupportedThinkingLevels
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { nodeAuthContext } from "./auth-context.js";
import { FileCredentialStore } from "./file-credential-store.js";
import { loadConfig, type RayaConfig } from "../config/config.js";

export type RayaProviderRuntime = {
  models: Models;
  credentials: FileCredentialStore;
};

function appendModels(models: MutableModels, providerId: string, additions: Model<any>[]): void {
  const provider = models.getProvider(providerId);
  if (!provider) return;

  const existing = provider.getModels();
  const missing = additions.filter((candidate) => !existing.some((model) => model.id === candidate.id));
  if (missing.length === 0) return;

  models.setProvider({ ...provider, getModels: () => [...existing, ...missing] });
}

export function createProviderRuntime(config: RayaConfig = loadConfig()): RayaProviderRuntime {
  const credentials = new FileCredentialStore();
  const models = builtinModels({ credentials, authContext: nodeAuthContext });
  const gpt56Sol = models.getModel("openai", "gpt-5.6-sol");
  if (gpt56Sol) {
    appendModels(models, "openai", [{ ...gpt56Sol, id: "gpt-5.6", name: "GPT-5.6 (Sol)" }]);
  }
  const grouped = new Map<string, RayaConfig["localModels"]>();
  for (const item of config.localModels) {
    grouped.set(item.provider, [...(grouped.get(item.provider) ?? []), item]);
  }
  for (const [providerId, localModels] of grouped) {
    const baseUrl = localModels[0]!.baseUrl;
    models.setProvider(createProvider({
      id: providerId,
      name: providerId === "ollama" ? "Ollama (local)" : providerId === "lmstudio" ? "LM Studio (local)" : `${providerId} (local)`,
      baseUrl,
      auth: { apiKey: { name: `${providerId} local server`, resolve: async () => ({ auth: {} }) } },
      models: localModels.map((item): Model<"openai-completions"> => ({
        id: item.id,
        name: item.name,
        api: "openai-completions",
        provider: item.provider,
        baseUrl: item.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: item.contextWindow,
        maxTokens: item.maxTokens,
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false }
      })),
      api: openAICompletionsApi()
    }));
  }
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

export function getModelThinkingLevels(model: Model<any>): RayaConfig["thinkingLevel"][] {
  return getSupportedThinkingLevels(model) as RayaConfig["thinkingLevel"][];
}

export function clampModelThinkingLevel(
  model: Model<any>,
  level: RayaConfig["thinkingLevel"]
): RayaConfig["thinkingLevel"] {
  return clampThinkingLevel(model, level) as RayaConfig["thinkingLevel"];
}

async function promptCredential(provider: Provider): Promise<Credential> {
  const rl = readline.createInterface({ input, output });

  try {
    if (provider.auth.apiKey?.login) {
      const credential = await provider.auth.apiKey.login({
        notify(event) { if (event.type === "progress") console.log(event.message); },
        async prompt(prompt) {
          if (prompt.type === "select") {
            console.log(prompt.message);
            prompt.options.forEach((option, index) => console.log(`${index + 1}. ${option.label}`));
            const answer = await rl.question("> ");
            const index = Number(answer.trim());
            return Number.isInteger(index) && prompt.options[index - 1] ? prompt.options[index - 1]!.id : answer.trim();
          }
          return rl.question(`${prompt.message}\n> `);
        }
      });
      return { ...(credential as ApiKeyCredential), type: "api_key" };
    }
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

  throw new Error(`Provider "${provider.id}" does not expose an interactive API key or OAuth login.`);
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
