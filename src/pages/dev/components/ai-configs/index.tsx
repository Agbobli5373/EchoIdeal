import { SettingsGroup } from "@/components";
import { UseSettingsReturn } from "@/types";
import { CustomProviders } from "./CustomProvider";
import { ProviderRows } from "../ProviderRows";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
defineSettings("/ai-and-speech", {
  "ai-provider": {
    title: "AI provider",
    keywords: "ai model llm openai anthropic claude gpt gemini groq",
  },
  "ai-key": {
    title: "API key",
    group: "AI provider",
    keywords: "api key token secret",
  },
  "ai-model": { title: "Model", group: "AI provider", keywords: "llm version" },
  "ai-curl": {
    title: "Add a custom provider",
    group: "Custom AI providers",
    keywords: "curl custom endpoint api",
  },
});

export const AIProviders = (settings: UseSettingsReturn) => {
  return (
    <SettingsGroup
      title="AI provider"
      more={{
        id: "ai-more",
        label: "Custom providers",
        children: <CustomProviders {...settings} />,
      }}
    >
      <ProviderRows
        idPrefix="ai"
        providerDesc="Writes Suggested Answers, summaries and Recaps."
        providers={settings.allAiProviders}
        selected={settings.selectedAIProvider}
        onSelect={settings.onSetSelectedAIProvider}
        variables={settings.variables}
      />
    </SettingsGroup>
  );
};
