import { AudioSelection } from "./components";
import { PageLayout } from "@/layouts";
import { SettingsGroup, SettingsRow } from "@/components";
import { getPlatform } from "@/lib";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/audio", {
  "audio-defaults": {
    title: "Check your system’s default devices",
    group: "Devices not working?",
    keywords: "permission troubleshooting not working default device",
  },
  "audio-check": {
    title: "See which microphone is in use",
    group: "Devices not working?",
    keywords: "verify active device",
  },
});

const getOsInstructions = () => {
  const platform = getPlatform();

  switch (platform) {
    case "macos":
      return {
        mic: "System Preferences → Sound → Input",
        audio: "System Preferences → Sound → Output",
      };
    case "windows":
      return {
        mic: "Settings → System → Sound → Input",
        audio: "Settings → System → Sound → Output",
      };
    case "linux":
      return {
        mic: "Sound Settings → Input Devices",
        audio: "Sound Settings → Output Devices",
      };
    default:
      return {
        mic: "your system's sound settings",
        audio: "your system's sound settings",
      };
  }
};

const Audio = () => {
  const osInstructions = getOsInstructions();

  return (
    <PageLayout
      title="Audio"
      subtitle="What EchoIdeal listens to during a Meeting."
    >
      <SettingsGroup
        more={{
          id: "audio-more",
          label: "Devices not working?",
          children: (
            <>
              <SettingsRow
                {...SETTINGS["audio-defaults"]}
                desc={
                  <>
                    Microphone: {osInstructions.mic}. Speakers and headphones:{" "}
                    {osInstructions.audio}. If a device you pick here fails or
                    goes away, EchoIdeal falls back to the system default.
                  </>
                }
              />
              <SettingsRow
                {...SETTINGS["audio-check"]}
                desc="Hover over the microphone button in the overlay; it shows the device it’s listening to."
              />
            </>
          ),
        }}
      >
        <AudioSelection />
      </SettingsGroup>
    </PageLayout>
  );
};

export default Audio;
