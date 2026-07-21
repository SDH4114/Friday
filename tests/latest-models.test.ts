import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConfig } from "../src/config/config.js";
import { providerModelSuggestions } from "../src/providers/model-picker.js";
import { createProviderRuntime, getModelThinkingLevels } from "../src/providers/runtime.js";
import { commandSuggestions } from "../src/tui/app.js";

test("the current pi catalog includes GPT-5.6 for OpenAI API, Codex OAuth, and Kimi K3", () => {
  const runtime = createProviderRuntime(normalizeConfig({}));

  const openai = runtime.models.getModels("openai");
  for (const id of ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    assert.ok(openai.some((model) => model.id === id), `missing OpenAI model ${id}`);
  }

  const codex = runtime.models.getModels("openai-codex");
  for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    assert.ok(codex.some((model) => model.id === id), `missing OpenAI Codex model ${id}`);
  }

  const codexSol = runtime.models.getModel("openai-codex", "gpt-5.6-sol");
  assert.equal(codexSol?.api, "openai-codex-responses");
  assert.deepEqual(codexSol?.input, ["text", "image"]);

  const kimi = runtime.models.getModel("moonshotai", "kimi-k3");
  assert.ok(kimi);
  assert.equal(kimi.reasoning, true);
  assert.deepEqual(kimi.input, ["text", "image"]);
  assert.equal(kimi.compat?.supportsReasoningEffort, true);
});

test("model selection asks for the levels reported by the selected provider model", () => {
  const runtime = createProviderRuntime(normalizeConfig({}));
  const kimi = runtime.models.getModel("moonshotai", "kimi-k3");
  assert.ok(kimi);
  assert.deepEqual(getModelThinkingLevels(kimi), ["low", "high", "max"]);

  const suggestions = providerModelSuggestions(runtime.models, "select moonshotai kimi-k3", {
    activeProvider: "openai-codex",
    activeModel: "gpt-5.4",
    connectedProviders: new Set(["openai-codex"])
  });
  assert.equal(suggestions[0]?.selectable, false);
  assert.deepEqual(suggestions.slice(1).map((item) => item.value), [
    "/models select moonshotai kimi-k3 --thinking low",
    "/models select moonshotai kimi-k3 --thinking high",
    "/models select moonshotai kimi-k3 --thinking max"
  ]);

  const prompt = "/models select moonshotai kimi-k3 ";
  const visibleMenu = commandSuggestions(
    prompt,
    prompt.length,
    undefined,
    undefined,
    undefined,
    (query) => providerModelSuggestions(runtime.models, query, {
      activeProvider: "openai-codex",
      activeModel: "gpt-5.4",
      connectedProviders: new Set(["openai-codex"])
    })
  );
  assert.deepEqual(visibleMenu.slice(1).map((item) => item.label), ["Low", "High", "Max"]);
});

test("the config accepts the provider-level max reasoning setting", () => {
  assert.equal(normalizeConfig({ thinkingLevel: "max" }).thinkingLevel, "max");
});
