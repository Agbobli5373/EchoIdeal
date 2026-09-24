import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Empty, SettingsGroup, SettingsRow } from "@/components";
import { CheckIcon, Sparkles, BotIcon, ClockIcon } from "lucide-react";
import { useApp } from "@/contexts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";
import moment from "moment";

interface EchoIdealPrompt {
  title: string;
  prompt: string;
  modelId: string;
  modelName: string;
}

interface EchoIdealPromptsResponse {
  prompts: EchoIdealPrompt[];
  total: number;
  last_updated?: string;
}

interface Model {
  provider: string;
  name: string;
  id: string;
  model: string;
  description: string;
  modality: string;
  isAvailable: boolean;
}

const SELECTED_ECHOIDEAL_MODEL_STORAGE_KEY = "selected_echoideal_model";
const SELECTED_ECHOIDEAL_PROMPT_STORAGE_KEY = "selected_echoideal_prompt";

export const EchoIdealPrompts = () => {
  const { setSystemPrompt, setSupportsImages, echoidealApiEnabled } =
    useApp();
  const [prompts, setPrompts] = useState<EchoIdealPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedEchoIdealPrompt, setSelectedEchoIdealPrompt] =
    useState<EchoIdealPrompt | null>(() => {
      // Load selected prompt from local storage on initial render
      const stored = safeLocalStorage.getItem(
        SELECTED_ECHOIDEAL_PROMPT_STORAGE_KEY
      );
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
      return null;
    });
  const [models, setModels] = useState<Model[]>([]);
  const fetchInitiated = useRef(false);

  useEffect(() => {
    if (!fetchInitiated.current) {
      fetchInitiated.current = true;
      fetchEchoIdealPrompts();
      fetchModels();
    }
  }, []);

  // Watch for changes in user's selected prompt and clear EchoIdeal selection if needed
  useEffect(() => {
    const checkUserPromptSelection = () => {
      const userSelectedPromptId = safeLocalStorage.getItem(
        STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID
      );
      // If user has selected one of their own prompts, clear EchoIdeal prompt selection
      if (userSelectedPromptId) {
        setSelectedEchoIdealPrompt(null);
      }
    };

    // Check on mount
    checkUserPromptSelection();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID) {
        checkUserPromptSelection();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const fetchEchoIdealPrompts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await invoke<EchoIdealPromptsResponse>("fetch_prompts");
      setPrompts(response.prompts);
      if (response.last_updated) {
        setLastUpdated(response.last_updated);
      }
    } catch (err) {
      console.error("Failed to fetch EchoIdeal prompts:", err);
      setError(
        typeof err === "string" ? err : "Failed to fetch EchoIdeal prompts"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const fetchedModels = await invoke<Model[]>("fetch_models");
      setModels(fetchedModels);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  };

  const handleSelectEchoIdealPrompt = async (prompt: EchoIdealPrompt) => {
    try {
      // Set the system prompt
      setSystemPrompt(prompt.prompt);
      setSelectedEchoIdealPrompt(prompt);

      // Clear the user's selected prompt ID from local storage
      // This ensures the user prompt cards don't show as selected
      safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);

      // Save the system prompt to local storage
      safeLocalStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, prompt.prompt);

      // Save the selected EchoIdeal prompt to local storage for persistence
      safeLocalStorage.setItem(
        SELECTED_ECHOIDEAL_PROMPT_STORAGE_KEY,
        JSON.stringify(prompt)
      );

      // Find the model by modelId and select it
      const matchingModel = models.find(
        (model) => model.model === prompt.modelId || model.id === prompt.modelId
      );

      if (matchingModel) {
        // Update supportsImages based on model modality
        if (echoidealApiEnabled) {
          const hasImageSupport =
            matchingModel.modality?.includes("image") ?? false;
          setSupportsImages(hasImageSupport);
        }

        await invoke("secure_storage_save", {
          items: [
            {
              key: SELECTED_ECHOIDEAL_MODEL_STORAGE_KEY,
              value: JSON.stringify(matchingModel),
            },
          ],
        });
      }
    } catch (error) {
      console.error("Failed to select EchoIdeal prompt:", error);
    }
  };

  const handleCardClick = (prompt: EchoIdealPrompt) => {
    handleSelectEchoIdealPrompt(prompt);
  };

  const isPromptSelected = (prompt: EchoIdealPrompt) => {
    return (
      selectedEchoIdealPrompt?.title === prompt.title &&
      selectedEchoIdealPrompt?.modelId === prompt.modelId
    );
  };

  const updated = lastUpdated ? (
    <span className="inline-flex items-center gap-1">
      <ClockIcon className="size-3" />
      Updated {moment(lastUpdated).fromNow()}
    </span>
  ) : undefined;

  if (isLoading) {
    return (
      <SettingsGroup title="EchoIdeal default prompts">
        <Empty
          isLoading={true}
          icon={Sparkles}
          title="Loading prompts..."
          description="Fetching EchoIdeal default prompts"
        />
      </SettingsGroup>
    );
  }

  if (error) {
    return (
      <SettingsGroup title="EchoIdeal default prompts">
        <SettingsRow id="default-prompts-error" title="Couldn’t load the default prompts" desc={error} />
      </SettingsGroup>
    );
  }

  if (prompts.length === 0) {
    return null;
  }

  return (
    <SettingsGroup title="EchoIdeal default prompts" meta={updated}>
      {prompts.map((prompt, index) => {
        const isSelected = isPromptSelected(prompt);
        return (
          <SettingsRow
            key={`${prompt.title}-${index}`}
            id={`default-prompt-${index}`}
            title={prompt.title}
            desc={
              <>
                <span className="line-clamp-2">{prompt.prompt}</span>
                <span className="mt-1 inline-flex items-center gap-1">
                  <BotIcon className="size-3" />
                  {prompt.modelName}
                </span>
              </>
            }
            control={
              isSelected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-foreground">
                  <CheckIcon className="size-3" />
                  In use
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCardClick(prompt)}
                >
                  Use
                </Button>
              )
            }
          />
        );
      })}
    </SettingsGroup>
  );
};
