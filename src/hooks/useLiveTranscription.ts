import { useState, useCallback, useRef, useEffect } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { fetchSTT } from "@/lib/functions/stt.function";
import { useApp } from "@/contexts";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { addTranscriptSegment } from "@/lib/database/meetings.action";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface TranscriptionSegment {
  id: string;
  speaker: string;
  content: string;
  startTimeMs: number;
  endTimeMs: number | null;
}

export const useLiveTranscription = () => {
  const {
    allSttProviders,
    selectedSttProvider,
    selectedAudioDevices,
  } = useApp();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastSegment, setLastSegment] = useState<TranscriptionSegment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);

  const meetingIdRef = useRef<string | null>(null);
  const meetingStartRef = useRef<number>(0);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const isProcessingRef = useRef(false);

  const getSttProvider = useCallback(() => {
    if (!selectedSttProvider?.provider) return null;
    const allProviders = [...SPEECH_TO_TEXT_PROVIDERS, ...allSttProviders];
    return allProviders.find((p) => p.id === selectedSttProvider.provider) || null;
  }, [selectedSttProvider, allSttProviders]);

  const processAudioChunk = useCallback(
    async (audioBase64: string, speaker: string) => {
      if (isProcessingRef.current) return;
      if (!meetingIdRef.current) return;

      isProcessingRef.current = true;
      const segmentStartMs = Date.now() - meetingStartRef.current;

      try {
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: "audio/wav" });

        const provider = getSttProvider();
        if (!provider) {
          setError("No STT provider configured. Set one in Dev Space.");
          return;
        }

        const transcription = await Promise.race([
          fetchSTT({
            provider,
            selectedProvider: selectedSttProvider,
            audio: audioBlob,
          }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("STT timeout")), 30000)
          ),
        ]);

        if (!transcription || transcription.includes("Error") || transcription.includes("No transcription")) {
          return;
        }

        const segment: TranscriptionSegment = {
          id: generateId(),
          speaker,
          content: transcription.trim(),
          startTimeMs: segmentStartMs,
          endTimeMs: Date.now() - meetingStartRef.current,
        };

        await addTranscriptSegment({
          id: segment.id,
          meetingId: meetingIdRef.current!,
          speaker: segment.speaker,
          content: segment.content,
          startTimeMs: segment.startTimeMs,
          endTimeMs: segment.endTimeMs,
          confidence: null,
          isFinal: true,
        });

        setLastSegment(segment);
        setSegmentCount((prev) => prev + 1);
      } catch (err) {
        console.error("Transcription error:", err);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [getSttProvider, selectedSttProvider]
  );

  const startTranscription = useCallback(
    async (meetingId: string) => {
      if (isTranscribing) return;

      setError(null);
      setSegmentCount(0);
      setLastSegment(null);
      meetingIdRef.current = meetingId;
      meetingStartRef.current = Date.now();

      try {
        const unlistenSpeech = await listen<string>(
          "speech-detected",
          (event) => {
            processAudioChunk(event.payload, "Them");
          }
        );
        unlistenRefs.current.push(unlistenSpeech);

        const outputDevice = selectedAudioDevices?.output?.id || "";
        await invoke("start_system_audio_capture", {
          deviceId: outputDevice,
          vadConfig: {
            enabled: true,
            hop_size: 1024,
            sensitivity_rms: 0.010,
            peak_threshold: 0.030,
            silence_chunks: 35,
            min_speech_chunks: 5,
            pre_speech_chunks: 15,
            noise_gate_threshold: 0.002,
            max_recording_duration_secs: 300,
          },
        });

        setIsTranscribing(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to start transcription: ${msg}`);
        cleanup();
      }
    },
    [isTranscribing, processAudioChunk, selectedAudioDevices]
  );

  const stopTranscription = useCallback(async () => {
    try {
      await invoke("stop_system_audio_capture");
    } catch (err) {
      console.error("Failed to stop capture:", err);
    }
    cleanup();
  }, []);

  const cleanup = useCallback(() => {
    for (const unlisten of unlistenRefs.current) {
      unlisten();
    }
    unlistenRefs.current = [];
    meetingIdRef.current = null;
    setIsTranscribing(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isTranscribing,
    lastSegment,
    error,
    segmentCount,
    startTranscription,
    stopTranscription,
  };
};
