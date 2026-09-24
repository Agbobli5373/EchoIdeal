import { useState } from "react";
import { Loader2Icon, TrashIcon } from "lucide-react";
import {
  Button,
  Input,
  Selection,
  SettingsGroup,
  SettingsRow,
} from "@/components";
import {
  EMBEDDINGS_PROVIDERS,
  EmbeddingsConfig,
  embeddingsConfigProblem,
  embedTexts,
  getEmbeddingsConfig,
  getEmbeddingsProviderInfo,
  saveEmbeddingsConfig,
} from "@/lib/knowledge";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/ai-and-speech", {
  "embeddings-provider": {
    title: "Embeddings provider",
    group: "Embeddings",
    keywords:
      "vector search retrieval rag large documents knowledge searched openai gemini mistral cohere openrouter ollama",
  },
  "embeddings-model": {
    title: "Embeddings model",
    group: "Embeddings",
    keywords: "vector model",
  },
  "embeddings-url": {
    title: "Server address",
    group: "Embeddings",
    keywords: "ollama url endpoint base",
  },
  "embeddings-key": {
    title: "Embeddings API key",
    group: "Embeddings",
    keywords: "api key token secret",
  },
  "embeddings-test": {
    title: "Test embeddings",
    group: "Embeddings",
    keywords: "check connection",
  },
});

const OFF = "off";

export const EmbeddingsProvider = () => {
  const [config, setConfig] = useState<EmbeddingsConfig>(getEmbeddingsConfig);
  const [test, setTest] = useState<
    { state: "running" } | { state: "done"; ok: boolean; text: string } | null
  >(null);
  const info = getEmbeddingsProviderInfo(config.provider);

  const update = (changes: Partial<EmbeddingsConfig>) => {
    const next = { ...config, ...changes };
    setConfig(next);
    saveEmbeddingsConfig(next);
    setTest(null);
  };

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      const [vector] = await embedTexts(
        config,
        ["How did you lead the migration?"],
        "question"
      );
      setTest({
        state: "done",
        ok: true,
        text: `Works. It returned a vector of ${vector.length.toLocaleString()} numbers.`,
      });
    } catch (error) {
      setTest({
        state: "done",
        ok: false,
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const problem = info ? embeddingsConfigProblem(config) : null;

  return (
    <SettingsGroup title="Embeddings" meta="Optional">
      <SettingsRow
        {...SETTINGS["embeddings-provider"]}
        title="Provider"
        desc="Lets the AI search Knowledge Documents too large for your Knowledge Budget: each question sends only the passages that match it. The documents you search, and each question, are sent to this provider."
        control={
          <Selection
            selected={config.provider || OFF}
            options={[
              { label: "Off", value: OFF },
              ...EMBEDDINGS_PROVIDERS.map((p) => ({
                label: p.label,
                value: p.id,
              })),
            ]}
            onChange={(value) =>
              update({
                provider: value === OFF ? "" : value,
                model: "",
                baseUrl: "",
              })
            }
            size="sm"
            className="w-60"
          />
        }
      />

      {info && (
        <>
          <SettingsRow
            {...SETTINGS["embeddings-model"]}
            title="Model"
            desc={
              info.defaultModel
                ? `Leave empty for ${info.defaultModel}. Changing it means searched documents are indexed again.`
                : "The embeddings model your server runs. Changing it means searched documents are indexed again."
            }
            control={
              <Input
                className="h-8 w-60"
                placeholder={info.defaultModel || "Enter the model"}
                aria-label="Embeddings model"
                value={config.model}
                onChange={(e) => update({ model: e.target.value })}
              />
            }
          />

          {info.defaultBaseUrl !== undefined && (
            <SettingsRow
              {...SETTINGS["embeddings-url"]}
              desc={
                info.id === "ollama"
                  ? "Where Ollama runs. Leave empty for this device."
                  : "The API's base address; /embeddings is added to it."
              }
              control={
                <Input
                  className="h-8 w-60"
                  placeholder={info.defaultBaseUrl || "https://…/v1"}
                  aria-label="Server address"
                  value={config.baseUrl}
                  onChange={(e) => update({ baseUrl: e.target.value })}
                />
              }
            />
          )}

          {(info.needsKey || info.id === "openai-compatible") && (
            <SettingsRow
              {...SETTINGS["embeddings-key"]}
              title="API key"
              desc={`Your ${info.label} key${info.needsKey ? "" : ", if the server needs one"}. It’s stored on this device and never shared.`}
              control={
                <>
                  <Input
                    type="password"
                    className="h-8 w-60"
                    placeholder="Paste your API key"
                    aria-label="Embeddings API key"
                    value={config.apiKey}
                    onChange={(e) => update({ apiKey: e.target.value })}
                  />
                  {config.apiKey.trim() && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => update({ apiKey: "" })}
                      title="Remove API key"
                      aria-label="Remove API key"
                    >
                      <TrashIcon className="size-3.5" />
                    </Button>
                  )}
                </>
              }
            />
          )}

          <SettingsRow
            {...SETTINGS["embeddings-test"]}
            desc={
              problem ? (
                problem
              ) : test?.state === "done" ? (
                <span className={test.ok ? "text-ok" : "text-destructive"}>
                  {test.text}
                </span>
              ) : (
                "Embeds one sample question to check the provider answers."
              )
            }
            control={
              <Button
                size="sm"
                variant="outline"
                disabled={!!problem || test?.state === "running"}
                onClick={runTest}
              >
                {test?.state === "running" && (
                  <Loader2Icon className="size-3.5 animate-spin" />
                )}
                Test
              </Button>
            }
          />
        </>
      )}
    </SettingsGroup>
  );
};
