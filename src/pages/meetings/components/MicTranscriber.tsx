import { useEffect, useRef } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import { fetchSTT } from "@/lib/functions/stt.function";
import { useApp } from "@/contexts";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { floatArrayToWav } from "@/lib/utils";

interface MicTranscriberProps {
  isActive: boolean;
  onTranscription: (text: string, spokenAt: number) => void;
}

const MicTranscriberInternal = ({
  isActive,
  onTranscription,
}: MicTranscriberProps) => {
  const {
    allSttProviders,
    selectedSttProvider,
    selectedAudioDevices,
  } = useApp();
  // Utterances are transcribed one at a time, in the order they were spoken.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const audioConstraints: MediaTrackConstraints =
    selectedAudioDevices?.input?.id && selectedAudioDevices.input.id !== "default"
      ? { deviceId: { exact: selectedAudioDevices.input.id } }
      : {};

  const getSttProvider = () => {
    if (!selectedSttProvider?.provider) return null;
    const allProviders = [...SPEECH_TO_TEXT_PROVIDERS, ...allSttProviders];
    return allProviders.find((p) => p.id === selectedSttProvider.provider) || null;
  };

  const transcribe = async (audio: Float32Array, spokenAt: number) => {
    try {
      const audioBlob = floatArrayToWav(audio, 16000, "wav");
      const provider = getSttProvider();
      if (!provider) return;

      const transcription = await Promise.race([
        fetchSTT({
          provider,
          selectedProvider: selectedSttProvider,
          audio: audioBlob,
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 30000)
        ),
      ]);

      if (
        transcription &&
        !transcription.includes("Error") &&
        !transcription.includes("No transcription")
      ) {
        onTranscription(transcription.trim(), spokenAt);
      }
    } catch (err) {
      console.error("Mic transcription error:", err);
    }
  };

  const vad = useMicVAD({
    userSpeakingThreshold: 0.6,
    startOnLoad: isActive,
    additionalAudioConstraints: audioConstraints,
    onSpeechEnd: (audio) => {
      if (!isActive) return;
      const spokenAt = Date.now();
      queueRef.current = queueRef.current.then(() =>
        transcribe(audio, spokenAt)
      );
    },
  });

  useEffect(() => {
    if (isActive && !vad.listening) {
      vad.start();
    } else if (!isActive && vad.listening) {
      vad.pause();
    }
  }, [isActive]);

  return null;
};

export const MicTranscriber = (props: MicTranscriberProps) => {
  if (!props.isActive) return null;
  return <MicTranscriberInternal key="mic-transcriber" {...props} />;
};
