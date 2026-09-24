import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";
import { getAllKnowledgeDocuments } from "@/lib/database";
import { extractVariables } from "@/lib/functions/common.function";
import {
  activeKnowledgeTokens,
  embeddingModelKey,
  getEmbeddingsConfig,
  getKnowledgeBudget,
} from "@/lib/knowledge";
import type { KnowledgeDocument } from "@/types";

export type ReadinessCheckId = "ai" | "stt" | "audio" | "knowledge";

/** One thing a Meeting depends on, whether it's ready, and where to fix it. */
export type ReadinessCheck = {
  id: ReadinessCheckId;
  label: string;
  ok: boolean;
  value: string;
  /** The settings row that fixes it (an anchor). */
  fix: { label: string; to: string };
  /** 0–1, for the Knowledge Budget meter. */
  meter?: number;
};

type Device = { id: string; name: string; is_default: boolean };

type ReadinessState = {
  checks: ReadinessCheck[];
  readyCount: number;
  needsAttention: number;
  documents: KnowledgeDocument[];
  budget: number;
  refresh: () => Promise<void>;
};

const ReadinessContext = createContext<ReadinessState | null>(null);

const hasEmbeddings = () => embeddingModelKey(getEmbeddingsConfig()) !== null;

/**
 * Whether the dashboard is ready for the next Meeting: an AI provider, a
 * speech provider, audio devices and Active Knowledge. It only advises;
 * nothing is ever blocked on it. Rechecked on every page change and when the
 * window regains focus.
 */
export const ReadinessProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const {
    allAiProviders,
    selectedAIProvider,
    selectedSttProvider,
    selectedAudioDevices,
  } = useApp();
  const { pathname } = useLocation();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [budget, setBudget] = useState(getKnowledgeBudget);
  const [embeddingsOn, setEmbeddingsOn] = useState(hasEmbeddings);
  const [devices, setDevices] = useState<{
    input: Device[];
    output: Device[];
  } | null>(null);

  const refresh = useCallback(async () => {
    const [docs, input, output] = await Promise.all([
      getAllKnowledgeDocuments().catch(() => [] as KnowledgeDocument[]),
      invoke<Device[]>("get_input_devices").catch(() => [] as Device[]),
      invoke<Device[]>("get_output_devices").catch(() => [] as Device[]),
    ]);
    setDocuments(docs);
    setDevices({ input, output });
    setBudget(getKnowledgeBudget());
    setEmbeddingsOn(hasEmbeddings());
  }, []);

  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const checks = useMemo<ReadinessCheck[]>(() => {
    // AI provider: chosen, with every value its request needs filled in.
    const aiProvider = allAiProviders.find(
      (p) => p.id === selectedAIProvider?.provider
    );
    const missing = aiProvider
      ? extractVariables(aiProvider.curl).filter(
          (v) => !selectedAIProvider.variables?.[v.key]?.trim()
        )
      : [];
    const aiName = aiProvider?.isCustom ? "Custom provider" : aiProvider?.id;
    const model = selectedAIProvider?.variables?.model?.trim();
    const ai: ReadinessCheck = !aiProvider
      ? {
          id: "ai",
          label: "AI provider",
          ok: false,
          value: "Not set up. It writes your Suggested Answers.",
          fix: { label: "Set up", to: "/ai-and-speech#ai-provider" },
        }
      : missing.length > 0
        ? {
            id: "ai",
            label: "AI provider",
            ok: false,
            value: `${aiName} needs ${missing
              .map((v) =>
                v.key === "api_key"
                  ? "an API key"
                  : `a ${v.key.replace(/_/g, " ")}`
              )
              .join(" and ")}.`,
            fix: {
              label: "Finish setup",
              to: `/ai-and-speech#ai-${
                missing[0].key === "api_key"
                  ? "key"
                  : missing[0].key.replace(/_/g, "-")
              }`,
            },
          }
        : {
            id: "ai",
            label: "AI provider",
            ok: true,
            value: model ? `${aiName} · ${model}` : `${aiName}`,
            fix: { label: "Change", to: "/ai-and-speech#ai-provider" },
          };

    // Speech provider: chosen. Needed to hear the Interviewer, not for an Assessment.
    const stt: ReadinessCheck = selectedSttProvider?.provider
      ? {
          id: "stt",
          label: "Speech provider",
          ok: true,
          value: selectedSttProvider.provider,
          fix: { label: "Change", to: "/ai-and-speech#stt-provider" },
        }
      : {
          id: "stt",
          label: "Speech provider",
          ok: false,
          value:
            "Not set up. It’s needed to hear the Interviewer, but not for an Assessment.",
          fix: { label: "Set up", to: "/ai-and-speech#stt-provider" },
        };

    // Audio devices: a microphone and a system audio output to listen to.
    const hasInput = (devices?.input.length ?? 1) > 0;
    const hasOutput = (devices?.output.length ?? 1) > 0;
    const deviceName = (
      picked: { id: string; name: string },
      list: Device[] | undefined
    ) =>
      picked?.name ||
      list?.find((d) => d.is_default)?.name ||
      list?.[0]?.name ||
      "System default";
    const audio: ReadinessCheck =
      hasInput && hasOutput
        ? {
            id: "audio",
            label: "Audio devices",
            ok: true,
            value: `${deviceName(selectedAudioDevices.input, devices?.input)} · ${deviceName(
              selectedAudioDevices.output,
              devices?.output
            )}`,
            fix: { label: "Change", to: "/audio#mic" },
          }
        : {
            id: "audio",
            label: "Audio devices",
            ok: false,
            value: !hasInput
              ? "No microphone found."
              : "No speakers or headphones found to listen to.",
            fix: {
              label: "Check",
              to: hasInput ? "/audio#sysaudio" : "/audio#mic",
            },
          };

    // Active Knowledge: something switched on, within the Knowledge Budget, and
    // embeddings set up when a document is searched.
    const active = documents.filter((doc) => doc.is_active);
    const tokens = activeKnowledgeTokens(active);
    const searchedWithoutEmbeddings =
      !embeddingsOn && active.some((doc) => doc.is_searched);
    const usage = `${active.length} ${
      active.length === 1 ? "document" : "documents"
    } · ${tokens.toLocaleString()} of ${budget.toLocaleString()} tokens`;
    const knowledge: ReadinessCheck =
      active.length === 0
        ? {
            id: "knowledge",
            label: "Active Knowledge",
            ok: false,
            value:
              "Nothing switched on, so answers won’t know your background.",
            fix: { label: "Add", to: "/knowledge" },
            meter: 0,
          }
        : tokens > budget
          ? {
              id: "knowledge",
              label: "Active Knowledge",
              ok: false,
              value: `${usage}, over your Knowledge Budget.`,
              fix: { label: "Review", to: "/knowledge#budget" },
              meter: 1,
            }
          : searchedWithoutEmbeddings
            ? {
                id: "knowledge",
                label: "Active Knowledge",
                ok: false,
                value: `${usage}. Searched documents aren’t used while embeddings are off.`,
                fix: {
                  label: "Set up",
                  to: "/ai-and-speech#embeddings-provider",
                },
                meter: tokens / budget,
              }
            : {
                id: "knowledge",
                label: "Active Knowledge",
                ok: true,
                value: usage,
                fix: { label: "Manage", to: "/knowledge#budget" },
                meter: tokens / budget,
              };

    return [ai, stt, audio, knowledge];
  }, [
    allAiProviders,
    selectedAIProvider,
    selectedSttProvider,
    selectedAudioDevices,
    devices,
    documents,
    budget,
    embeddingsOn,
  ]);

  const readyCount = checks.filter((check) => check.ok).length;

  return (
    <ReadinessContext.Provider
      value={{
        checks,
        readyCount,
        needsAttention: checks.length - readyCount,
        documents,
        budget,
        refresh,
      }}
    >
      {children}
    </ReadinessContext.Provider>
  );
};

export const useReadiness = (): ReadinessState => {
  const state = useContext(ReadinessContext);
  if (!state) throw new Error("useReadiness is used outside ReadinessProvider");
  return state;
};
