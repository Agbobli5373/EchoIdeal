import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Textarea,
} from "@/components";
import { ZapIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";
import { shouldUseEchoIdealAPI } from "@/lib/functions/echoideal.api";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";

interface GenerateSystemPromptProps {
  onGenerate: (prompt: string, promptName: string) => void;
}

interface SystemPromptResponse {
  prompt_name: string;
  system_prompt: string;
}

function formatInvokeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Failed to generate prompt";
  }
}

const GENERATOR_SYSTEM_PROMPT = `You generate system prompts for an AI assistant. Respond with ONLY valid JSON (no markdown fences, no other text) with keys "prompt_name" (short string, 2-5 words) and "system_prompt" (string: concise instructions for the assistant personality and behavior).`;

function parseGeneratedPrompt(raw: string): { name: string; body: string } | null {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const name = String(parsed.prompt_name ?? parsed.promptName ?? "").trim();
    const body = String(
      parsed.system_prompt ?? parsed.systemPrompt ?? ""
    ).trim();
    if (name && body) return { name, body };
  } catch {
    /* use raw text below */
  }
  if (trimmed.length > 0) {
    return { name: "Custom Prompt", body: trimmed };
  }
  return null;
}

function looksLikeProviderErrorOutput(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("EchoIdeal API Error:") ||
    t.startsWith("API request failed:") ||
    t.startsWith("Network error during API request:") ||
    t.startsWith("Failed to parse non-streaming response:") ||
    t.startsWith("Streaming not supported") ||
    t.startsWith("Error reading stream:")
  );
}

export const GenerateSystemPrompt = ({
  onGenerate,
}: GenerateSystemPromptProps) => {
  const { echoidealApiEnabled, allAiProviders, selectedAIProvider } = useApp();
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const byoReady = useMemo(
    () =>
      !!selectedAIProvider?.provider &&
      allAiProviders.some((p) => p.id === selectedAIProvider.provider),
    [allAiProviders, selectedAIProvider.provider]
  );

  const canTryGenerate = byoReady || echoidealApiEnabled;

  const handleGenerate = async () => {
    if (!userPrompt.trim()) {
      setError("Please describe what you want");
      return;
    }

    const generateWithByo = async (): Promise<{ name: string; body: string }> => {
      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (!provider) {
        throw new Error("Select an AI provider in App settings.");
      }
      let full = "";
      for await (const chunk of fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: GENERATOR_SYSTEM_PROMPT,
        userMessage: userPrompt.trim(),
        history: [],
        imagesBase64: [],
      })) {
        full += chunk;
      }
      if (looksLikeProviderErrorOutput(full)) {
        throw new Error(full.trim() || "AI provider returned an error.");
      }
      const parsed = parseGeneratedPrompt(full);
      if (!parsed) {
        throw new Error(
          "Could not read the model response. Try again or write your own prompt."
        );
      }
      return parsed;
    };

    try {
      setIsGenerating(true);
      setError(null);

      const useCloud = await shouldUseEchoIdealAPI();
      let name: string | undefined;
      let body: string | undefined;

      if (useCloud) {
        try {
          const response = await invoke<SystemPromptResponse>(
            "create_system_prompt",
            {
              userPrompt: userPrompt.trim(),
            }
          );
          name = response.prompt_name?.trim();
          body = response.system_prompt?.trim();
        } catch (cloudErr) {
          if (!byoReady) {
            setError(formatInvokeError(cloudErr));
            return;
          }
          try {
            const local = await generateWithByo();
            name = local.name;
            body = local.body;
          } catch {
            setError(formatInvokeError(cloudErr));
            return;
          }
        }
      } else {
        const local = await generateWithByo();
        name = local.name;
        body = local.body;
      }

      if (name && body) {
        onGenerate(body, name);
        setIsOpen(false);
        setUserPrompt("");
      } else {
        setError(
          "The server returned an empty prompt. Try again or write your own."
        );
      }
    } catch (err) {
      setError(formatInvokeError(err));
      console.error("Error generating system prompt:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Generate with AI"
          size="sm"
          variant="outline"
          className="w-fit"
        >
          <ZapIcon className="h-4 w-4" /> Generate with AI
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-96 p-4 border shadow-lg"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">Generate a system prompt</p>
            <p className="text-xs text-muted-foreground">
              Describe the AI behavior you want, and we'll generate a prompt for
              you.
            </p>
          </div>

          <Textarea
            placeholder="e.g., I want an AI that helps me with code reviews and focuses on best practices..."
            className="min-h-[100px] resize-none border-1 border-input/50 focus:border-primary/50 transition-colors"
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              setError(null);
            }}
            disabled={isGenerating}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          {canTryGenerate ? (
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={!userPrompt.trim() || isGenerating}
            >
              {isGenerating ? (
                <>
                  <ZapIcon className="h-4 w-4 animate-pulse" />
                  Generating...
                </>
              ) : (
                <>
                  <ZapIcon className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configure an AI provider in App settings, or enable EchoIdeal cloud
              on the Dashboard (with a license) to use this feature.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
