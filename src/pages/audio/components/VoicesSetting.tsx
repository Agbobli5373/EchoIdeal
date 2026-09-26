import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button, SettingsRow } from "@/components";
import { Switch } from "@/components/ui/switch";
import { defineSettings } from "@/lib/settings-index";
import {
  getVoiceModelStatus,
  setTellVoicesApart,
  tellsVoicesApart,
  type VoiceModelStatus,
} from "@/lib/meeting/voices";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/audio", {
  voices: {
    title: "Tell voices apart",
    keywords: "speakers diarization several interviewers panel who said voice fingerprint",
  },
});

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export const VoicesSetting = () => {
  const [on, setOn] = useState(tellsVoicesApart);
  const [status, setStatus] = useState<VoiceModelStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = () => getVoiceModelStatus().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    refresh();
    const unlistenProgress = listen<{ received: number; total: number }>(
      "voice-model-progress",
      (event) => setProgress(event.payload.received / event.payload.total)
    );
    const unlistenChanged = listen("voice-model-changed", () => {
      setProgress(null);
      refresh();
    });
    return () => {
      unlistenProgress.then((stop) => stop());
      unlistenChanged.then((stop) => stop());
    };
  }, []);

  const download = async () => {
    setError("");
    setProgress(0);
    try {
      await invoke("download_voice_model");
    } catch (err) {
      setError(String(err));
    } finally {
      setProgress(null);
      refresh();
    }
  };

  const toggle = (checked: boolean) => {
    setOn(checked);
    setTellVoicesApart(checked);
  };

  const downloading = progress !== null || status?.downloading;
  const model = !status
    ? null
    : status.ready
      ? "The voice model is on this computer."
      : downloading
        ? `Downloading the voice model… ${progress !== null ? `${Math.round(progress * 100)}%` : ""}`
        : `It downloads the voice model (${megabytes(status.sizeBytes)}) the first time it’s needed.`;

  return (
    <SettingsRow
      {...SETTINGS["voices"]}
      desc={
        <>
          When several people speak on the other side, each gets their own label
          (Interviewer 1, 2…), which you can rename, move lines between, or merge.
          Voices are told apart on this computer; no audio is sent anywhere for it, and
          they aren’t remembered after the Meeting. {model}
          {error && <span className="block text-warn">{error}</span>}
          <span className="block text-muted-foreground/70">
            Voice model: WeSpeaker ResNet34 trained on VoxCeleb, CC BY 4.0.
          </span>
        </>
      }
      control={
        <div className="flex items-center gap-2">
          {on && status && !status.ready && !downloading && (
            <Button size="sm" variant="outline" onClick={download}>
              Download now
            </Button>
          )}
          <Switch checked={on} onCheckedChange={toggle} aria-label="Tell voices apart" />
        </div>
      }
    />
  );
};
