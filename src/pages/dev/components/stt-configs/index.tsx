import { SettingsGroup } from "@/components";
import { UseSettingsReturn } from "@/types";
import { CustomProviders } from "./CustomProvider";
import { ProviderRows } from "../ProviderRows";

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
        providerKeywords="speech stt transcription whisper deepgram elevenlabs"
        providers={settings.allSttProviders}
        selected={settings.selectedSttProvider}
        onSelect={settings.onSetSelectedSttProvider}
        variables={settings.sttVariables}
      />
    </SettingsGroup>
  );
};
