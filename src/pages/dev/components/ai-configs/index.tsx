import { SettingsGroup } from "@/components";
import { UseSettingsReturn } from "@/types";
import { CustomProviders } from "./CustomProvider";
import { ProviderRows } from "../ProviderRows";

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
        providerKeywords="ai model llm openai anthropic claude gpt gemini groq"
        providers={settings.allAiProviders}
        selected={settings.selectedAIProvider}
        onSelect={settings.onSetSelectedAIProvider}
        variables={settings.variables}
      />
    </SettingsGroup>
  );
};
