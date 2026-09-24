import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "../storage/helper";

/**
 * The optional Embeddings Provider: turns passages of Searched Documents and each
 * question into vectors so the passages that match a question can be found. It's
 * separate from the AI provider because most chat providers have no embeddings API.
 */

export type EmbeddingsProviderId =
  | "openai"
  | "gemini"
  | "mistral"
  | "cohere"
  | "openrouter"
  | "ollama"
  | "openai-compatible";

type ProviderInfo = {
  id: EmbeddingsProviderId;
  label: string;
  defaultModel: string;
  needsKey: boolean;
  /** Shown and required when the provider has no fixed address. */
  defaultBaseUrl?: string;
  /** Texts per request. */
  batchSize: number;
};

export const EMBEDDINGS_PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "text-embedding-3-small",
    needsKey: true,
    batchSize: 64,
  },
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-embedding-001",
    needsKey: true,
    batchSize: 64,
  },
  {
    id: "mistral",
    label: "Mistral",
    defaultModel: "mistral-embed",
    needsKey: true,
    batchSize: 64,
  },
  {
    id: "cohere",
    label: "Cohere",
    defaultModel: "embed-v4.0",
    needsKey: true,
    batchSize: 64,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/text-embedding-3-small",
    needsKey: true,
    batchSize: 64,
  },
  {
    id: "ollama",
    label: "Ollama (on this device)",
    defaultModel: "nomic-embed-text",
    needsKey: false,
    defaultBaseUrl: "http://localhost:11434",
    batchSize: 32,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    defaultModel: "",
    needsKey: false,
    defaultBaseUrl: "",
    batchSize: 32,
  },
];

export type EmbeddingsConfig = {
  /** "" when embeddings are off. */
  provider: EmbeddingsProviderId | "";
  apiKey: string;
  /** "" means the provider's default model. */
  model: string;
  /** Only for Ollama and OpenAI-compatible providers. */
  baseUrl: string;
};

const EMPTY_CONFIG: EmbeddingsConfig = {
  provider: "",
  apiKey: "",
  model: "",
  baseUrl: "",
};

export function getEmbeddingsProviderInfo(
  id: EmbeddingsConfig["provider"]
): ProviderInfo | undefined {
  return EMBEDDINGS_PROVIDERS.find((p) => p.id === id);
}

export function getEmbeddingsConfig(): EmbeddingsConfig {
  try {
    const stored = JSON.parse(
      safeLocalStorage.getItem(STORAGE_KEYS.EMBEDDINGS_PROVIDER) || "{}"
    );
    const config = { ...EMPTY_CONFIG, ...stored };
    return getEmbeddingsProviderInfo(config.provider)
      ? config
      : { ...config, provider: "" };
  } catch {
    return EMPTY_CONFIG;
  }
}

export function saveEmbeddingsConfig(config: EmbeddingsConfig): void {
  safeLocalStorage.setItem(
    STORAGE_KEYS.EMBEDDINGS_PROVIDER,
    JSON.stringify(config)
  );
}

function resolved(config: EmbeddingsConfig) {
  const info = getEmbeddingsProviderInfo(config.provider);
  if (!info) return null;
  return {
    info,
    model: config.model.trim() || info.defaultModel,
    apiKey: config.apiKey.trim(),
    baseUrl: (config.baseUrl.trim() || info.defaultBaseUrl || "").replace(
      /\/+$/,
      ""
    ),
  };
}

/** Why the configuration can't be used yet, or null when it can. */
export function embeddingsConfigProblem(
  config: EmbeddingsConfig
): string | null {
  const r = resolved(config);
  if (!r) return "Embeddings are off.";
  if (!r.model) return `Enter the model to use with ${r.info.label}.`;
  if (r.info.needsKey && !r.apiKey)
    return `Enter your ${r.info.label} API key.`;
  if (r.info.defaultBaseUrl !== undefined && !/^https?:\/\//.test(r.baseUrl)) {
    return `Enter the address of your ${r.info.label} server, starting with http:// or https://.`;
  }
  return null;
}

/** Identifies the vectors a configuration makes; passages from another model can't be compared. */
export function embeddingModelKey(config: EmbeddingsConfig): string | null {
  const r = resolved(config);
  return r && !embeddingsConfigProblem(config)
    ? `${r.info.id}:${r.model}`
    : null;
}

export function describeEmbeddingModel(modelKey: string): string {
  const [id, ...model] = modelKey.split(":");
  const label = getEmbeddingsProviderInfo(id as EmbeddingsProviderId)?.label;
  return `${label ?? id} ${model.join(":")}`;
}

type Request = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  read: (json: any) => number[][];
};

function buildRequest(
  config: EmbeddingsConfig,
  texts: string[],
  kind: "passage" | "question"
): Request {
  const r = resolved(config)!;
  const bearer: Record<string, string> = r.apiKey
    ? { Authorization: `Bearer ${r.apiKey}` }
    : {};
  const openAIShape = (url: string): Request => ({
    url,
    headers: bearer,
    body: { model: r.model, input: texts },
    read: (json) =>
      [...(json?.data ?? [])]
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((item) => item.embedding),
  });

  switch (r.info.id) {
    case "openai":
      return openAIShape("https://api.openai.com/v1/embeddings");
    case "gemini":
      return openAIShape(
        "https://generativelanguage.googleapis.com/v1beta/openai/embeddings"
      );
    case "mistral":
      return openAIShape("https://api.mistral.ai/v1/embeddings");
    case "openrouter":
      return openAIShape("https://openrouter.ai/api/v1/embeddings");
    case "openai-compatible":
      return openAIShape(`${r.baseUrl}/embeddings`);
    case "cohere":
      return {
        url: "https://api.cohere.com/v2/embed",
        headers: bearer,
        body: {
          model: r.model,
          texts,
          input_type: kind === "passage" ? "search_document" : "search_query",
          embedding_types: ["float"],
        },
        read: (json) => json?.embeddings?.float ?? [],
      };
    case "ollama":
      return {
        url: `${r.baseUrl}/api/embed`,
        headers: {},
        body: { model: r.model, input: texts },
        read: (json) => json?.embeddings ?? [],
      };
  }
}

function normalise(vector: number[]): Float32Array {
  const out = Float32Array.from(vector);
  let length = 0;
  for (const value of out) length += value * value;
  length = Math.sqrt(length) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= length;
  return out;
}

async function embedBatch(
  config: EmbeddingsConfig,
  texts: string[],
  kind: "passage" | "question",
  signal?: AbortSignal
): Promise<Float32Array[]> {
  const request = buildRequest(config, texts, kind);
  const label = resolved(config)!.info.label;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await tauriFetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...request.headers },
        body: JSON.stringify(request.body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(
        `Couldn't reach ${label} for embeddings: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // One retry for rate limits and server errors.
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(
        `${label} embeddings failed: ${response.status}${detail ? ` - ${detail}` : ""}`
      );
    }

    const vectors = request.read(await response.json());
    if (
      vectors.length !== texts.length ||
      vectors.some((v) => !Array.isArray(v) || v.length === 0)
    ) {
      throw new Error(
        `${label} returned ${vectors.length} embeddings for ${texts.length} texts.`
      );
    }
    return vectors.map(normalise);
  }
}

/**
 * Embeds `texts` as unit-length vectors, in order. Passages go in batches;
 * `onProgress` reports how many are done.
 */
export async function embedTexts(
  config: EmbeddingsConfig,
  texts: string[],
  kind: "passage" | "question",
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<Float32Array[]> {
  const problem = embeddingsConfigProblem(config);
  if (problem) throw new Error(problem);

  const { batchSize } = resolved(config)!.info;
  const vectors: Float32Array[] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    vectors.push(
      ...(await embedBatch(
        config,
        texts.slice(start, start + batchSize),
        kind,
        options.signal
      ))
    );
    options.onProgress?.(vectors.length, texts.length);
  }
  return vectors;
}

export function vectorToBase64(vector: Float32Array): string {
  const bytes = new Uint8Array(
    vector.buffer,
    vector.byteOffset,
    vector.byteLength
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToVector(encoded: string): Float32Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
