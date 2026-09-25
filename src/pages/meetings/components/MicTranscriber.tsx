import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMicVAD } from "@ricky0123/vad-react";
import { fetchSTT } from "@/lib/functions/stt.function";
import { useApp } from "@/contexts";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { floatArrayToWav } from "@/lib/utils";
import { isEcho, watchSystemSpeech } from "@/lib/meeting/echo";

interface MicTranscriberProps {
  isActive: boolean;
  onTranscription: (text: string, spokenAt: number) => void;
}

type MicrophoneSpeech = { audio: string; endedAt: number; durationMs: number };

// Transcribes what the microphone heard, one utterance at a time in spoken order,
// dropping any that are an Echo of the other side.
const useMicTranscription = (
  onTranscription: MicTranscriberProps["onTranscription"]
) => {
  const { allSttProviders, selectedSttProvider } = useApp();
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const getSttProvider = () => {
    if (!selectedSttProvider?.provider) return null;
    const allProviders = [...SPEECH_TO_TEXT_PROVIDERS, ...allSttProviders];
    return allProviders.find((p) => p.id === selectedSttProvider.provider) || null;
  };

  const transcribe = async (audio: Blob, start: number, end: number) => {
    try {
      const provider = getSttProvider();
      if (!provider) return;

      const transcription = await Promise.race([
        fetchSTT({
          provider,
          selectedProvider: selectedSttProvider,
          audio,
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 30000)
        ),
      ]);

      if (
        !transcription ||
        transcription.includes("Error") ||
        transcription.includes("No transcription")
      ) {
        return;
      }
      const text = transcription.trim();
      if (await isEcho(text, start, end)) {
        console.info("Dropped an echo of the other side from the microphone:", text);
        return;
      }
      onTranscription(text, end);
    } catch (err) {
      console.error("Mic transcription error:", err);
    }
  };

  return (audio: Blob, start: number, end: number) => {
    queueRef.current = queueRef.current.then(() => transcribe(audio, start, end));
  };
};

const base64ToWav = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "audio/wav" });
};

// The app captures the microphone itself and cancels Echo before detecting speech
// (Windows). Reports `onUnavailable` when it can't, so the WebView records instead.
const NativeMicTranscriber = ({
  onTranscription,
  onUnavailable,
}: Pick<MicTranscriberProps, "onTranscription"> & { onUnavailable: () => void }) => {
  const { selectedAudioDevices } = useApp();
  const queue = useMicTranscription(onTranscription);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const deviceId = selectedAudioDevices?.input?.id;

  useEffect(() => {
    let session: number | null = null;
    let stopped = false;
    const unlisten = listen<MicrophoneSpeech>("microphone-speech-detected", (event) => {
      const { audio, endedAt, durationMs } = event.payload;
      queueRef.current(base64ToWav(audio), endedAt - durationMs, endedAt);
    });

    invoke<{ session: number; sampleRate: number }>("start_microphone_capture", {
      deviceId: deviceId && deviceId !== "default" ? deviceId : null,
    })
      .then((capture) => {
        session = capture.session;
        if (stopped) invoke("stop_microphone_capture", { session }).catch(() => {});
      })
      .catch((err) => {
        if (stopped) return;
        console.info("Recording the microphone without echo cancelling:", err);
        onUnavailable();
      });

    return () => {
      stopped = true;
      unlisten.then((stop) => stop());
      if (session !== null) {
        invoke("stop_microphone_capture", { session }).catch(() => {});
      }
    };
  }, [deviceId]);

  return null;
};

// The WebView records the microphone. Its own echo cancelling can't remove the other
// side, whose audio another app plays, so only the Echo filter on the text applies.
const WebMicTranscriber = ({
  onTranscription,
}: Pick<MicTranscriberProps, "onTranscription">) => {
  const { selectedAudioDevices } = useApp();
  const queue = useMicTranscription(onTranscription);

  const audioConstraints: MediaTrackConstraints =
    selectedAudioDevices?.input?.id && selectedAudioDevices.input.id !== "default"
      ? { deviceId: { exact: selectedAudioDevices.input.id } }
      : {};

  useMicVAD({
    userSpeakingThreshold: 0.6,
    startOnLoad: true,
    additionalAudioConstraints: audioConstraints,
    onSpeechEnd: (audio) => {
      const end = Date.now();
      queue(floatArrayToWav(audio, 16000, "wav"), end - (audio.length / 16000) * 1000, end);
    },
  });

  return null;
};

const MicTranscriberInternal = ({
  onTranscription,
}: Pick<MicTranscriberProps, "onTranscription">) => {
  const [native, setNative] = useState(true);

  useEffect(() => {
    void watchSystemSpeech();
  }, []);

  return native ? (
    <NativeMicTranscriber
      onTranscription={onTranscription}
      onUnavailable={() => setNative(false)}
    />
  ) : (
    <WebMicTranscriber onTranscription={onTranscription} />
  );
};

export const MicTranscriber = (props: MicTranscriberProps) => {
  if (!props.isActive) return null;
  return (
    <MicTranscriberInternal
      key="mic-transcriber"
      onTranscription={props.onTranscription}
    />
  );
};
