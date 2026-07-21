import type { Models } from "@earendil-works/pi-ai";
import { getModelThinkingLevels } from "./runtime.js";

export type ModelPickerSuggestion = {
  value: string;
  label?: string;
  description: string;
  needsArgument?: boolean;
  selectable?: boolean;
};

type ModelPickerState = {
  activeProvider: string;
  activeModel: string;
  connectedProviders: ReadonlySet<string>;
};

const THINKING_LABELS: Record<string, string> = {
  off: "Off",
  minimal: "Light",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Ultra",
  max: "Max"
};

export function providerModelSuggestions(
  models: Models,
  query: string,
  state: ModelPickerState
): ModelPickerSuggestion[] {
  const selected = query.trim().match(/^select\s+(\S+)\s+(\S+)$/i);
  if (selected) {
    const selectedModel = models.getModel(selected[1]!, selected[2]!);
    if (selectedModel) {
      return [
        {
          value: `Thinking for ${selectedModel.name}:`,
          description: "Choose a level reported by this model",
          selectable: false
        },
        ...getModelThinkingLevels(selectedModel).map((level) => ({
          value: `/models select ${selectedModel.provider} ${selectedModel.id} --thinking ${level}`,
          label: THINKING_LABELS[level] ?? level,
          description: level
        }))
      ];
    }
  }

  const normalized = query.toLowerCase().trim();
  return models.getProviders()
    .flatMap((provider) => models.getModels(provider.id).map((item) => ({ provider, item })))
    .filter(({ provider, item }) => (
      !normalized || `${provider.id} ${provider.name} ${item.id} ${item.name}`.toLowerCase().includes(normalized)
    ))
    .sort((a, b) => {
      const aRank = a.provider.id === state.activeProvider ? 2 : state.connectedProviders.has(a.provider.id) ? 1 : 0;
      const bRank = b.provider.id === state.activeProvider ? 2 : state.connectedProviders.has(b.provider.id) ? 1 : 0;
      return bRank - aRank
        || a.provider.name.localeCompare(b.provider.name)
        || a.item.name.localeCompare(b.item.name);
    })
    .map(({ provider, item }) => ({
      value: `/models select ${provider.id} ${item.id}`,
      description: `${provider.name} · ${item.name}${provider.id === state.activeProvider && item.id === state.activeModel ? " · active" : ""}`,
      needsArgument: true
    }));
}
