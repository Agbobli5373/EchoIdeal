import type { KnowledgeDocument, KnowledgeExcerpt } from "@/types";
import {
  getKnowledgeIndexes,
  getKnowledgePassages,
  replaceKnowledgePassages,
} from "../database/knowledge.action";
import { estimateTokens, SEARCHED_PASSAGES_TOKENS } from "./budget";
import {
  base64ToVector,
  embeddingModelKey,
  embedTexts,
  EmbeddingsConfig,
  getEmbeddingsConfig,
  vectorToBase64,
} from "./embeddings";
import { splitIntoPassages } from "./passages";

// A question waits at most this long for its passages; after that it's answered without them.
const QUESTION_TIMEOUT_MS = 8000;
// The question's own words plus a little of what came before, for follow-ups like "and the second one?".
const QUERY_CHARACTERS = 2000;

/** Splits document `document` into passages, embeds them and stores them. */
export async function indexKnowledgeDocument(
  document: Pick<KnowledgeDocument, "id" | "content">,
  config: EmbeddingsConfig,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const model = embeddingModelKey(config);
  if (!model) throw new Error("Set up embeddings in AI and Speech first.");

  const passages = splitIntoPassages(document.content);
  onProgress?.(0, passages.length);
  const vectors = await embedTexts(config, passages, "passage", {
    onProgress,
  });
  await replaceKnowledgePassages(
    document.id,
    model,
    passages.map((content, position) => ({
      position,
      content,
      embedding: vectorToBase64(vectors[position]),
    }))
  );
  return passages.length;
}

type LoadedPassage = {
  position: number;
  content: string;
  vector: Float32Array;
};

// Decoded passages per document, so each question doesn't reload them from SQLite.
const cache = new Map<number, { key: string; passages: LoadedPassage[] }>();

async function loadPassages(
  documents: KnowledgeDocument[],
  model: string
): Promise<Map<number, LoadedPassage[]>> {
  const indexes = await getKnowledgeIndexes();
  const loaded = new Map<number, LoadedPassage[]>();
  for (const doc of documents) {
    const index = indexes.find(
      (i) => i.document_id === doc.id && i.embedding_model === model
    );
    if (!index) continue;
    const key = `${model}:${index.count}:${index.last_id}`;
    let entry = cache.get(doc.id);
    if (entry?.key !== key) {
      const rows = await getKnowledgePassages(doc.id, model);
      entry = {
        key,
        passages: rows.map((row) => ({
          position: row.position,
          content: row.content,
          vector: base64ToVector(row.embedding),
        })),
      };
      cache.set(doc.id, entry);
    }
    loaded.set(doc.id, entry.passages);
  }
  return loaded;
}

function dot(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * The passages of `documents` (Searched Documents) that best match `query`, up to
 * the passage room, grouped by document in document order. Returns nothing when
 * embeddings are off or no document is indexed for the current model; throws when
 * the provider can't embed the question in time.
 */
export async function findKnowledgeExcerpts(
  documents: KnowledgeDocument[],
  query: string,
  signal?: AbortSignal
): Promise<KnowledgeExcerpt[]> {
  const config = getEmbeddingsConfig();
  const model = embeddingModelKey(config);
  if (!model || documents.length === 0 || !query.trim()) return [];

  const passagesByDocument = await loadPassages(documents, model);
  if (passagesByDocument.size === 0) return [];

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), QUESTION_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);
  let question: Float32Array;
  try {
    [question] = await embedTexts(
      config,
      [query.slice(-QUERY_CHARACTERS)],
      "question",
      { signal: timeout.signal }
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const scored = documents.flatMap((doc) =>
    (passagesByDocument.get(doc.id) ?? []).map((passage) => ({
      doc,
      passage,
      score: dot(question, passage.vector),
    }))
  );
  scored.sort((a, b) => b.score - a.score);

  // Best first, while they fit the room; always at least one.
  const chosen: typeof scored = [];
  let tokens = 0;
  for (const item of scored) {
    const cost = estimateTokens(item.passage.content);
    if (chosen.length > 0 && tokens + cost > SEARCHED_PASSAGES_TOKENS) continue;
    chosen.push(item);
    tokens += cost;
    if (tokens >= SEARCHED_PASSAGES_TOKENS) break;
  }

  return documents
    .map((doc) => ({
      name: doc.name,
      passages: chosen
        .filter((item) => item.doc.id === doc.id)
        .sort((a, b) => a.passage.position - b.passage.position)
        .map((item) => item.passage.content),
    }))
    .filter((excerpt) => excerpt.passages.length > 0);
}
