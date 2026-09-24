import { SettingsGroup } from "@/components";
import { UseSettingsReturn } from "@/types";
import { CustomProviders } from "./CustomProvider";
import { ProviderRows } from "../ProviderRows";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
defineSettings("/ai-and-speech", {
  "stt-provider": {
    title: "Speech provider",
    keywords: "speech stt transcription whisper deepgram elevenlabs",
  },
  "stt-key": {
    title: "API key",
    group: "Speech provider",
    keywords: "api key token secret",
  },
  "stt-curl": {
    title: "Add a custom provider",
    group: "Custom speech providers",
    keywords: "curl custom endpoint api",
  },
});

export const STTProviders = (settings: UseSettingsReturn) => {
  return (
    <SettingsGroup
      title="Speech provider"
      more={{
        id: "stt-more",
        label: "Custom providers",
        children: <CustomProviders {...settings} />,
      }}
    >
      <ProviderRows
        idPrefix="stt"
        providerDesc="Transcribes the Interviewer and your Spoken Answers."
        providers={settings.allSttProviders}
        selected={settings.selectedSttProvider}
        onSelect={settings.onSetSelectedSttProvider}
        variables={settings.sttVariables}
      />
    </SettingsGroup>
  );
};
