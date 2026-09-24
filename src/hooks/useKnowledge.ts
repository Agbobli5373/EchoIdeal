import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assertSearchFits,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getAllKnowledgeDocuments,
  getKnowledgeIndexes,
  KnowledgeIndex,
  setKnowledgeDocumentActive,
  setKnowledgeDocumentSearched,
  updateKnowledgeDocument,
} from "@/lib/database";
import {
  activeKnowledgeTokens,
  embeddingModelKey,
  extractKnowledgeText,
  getEmbeddingsConfig,
  getKnowledgeBudget,
  indexKnowledgeDocument,
  KnowledgeBudgetError,
  MIN_KNOWLEDGE_BUDGET_TOKENS,
  saveKnowledgeBudget,
  transcribeImageWithProvider,
} from "@/lib/knowledge";
import { shouldUseEchoIdealAPI } from "@/lib/functions/echoideal.api";
import { useApp } from "@/contexts";
import type { KnowledgeDocument } from "@/types";

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export const useKnowledge = () => {
  const { allAiProviders, selectedAIProvider, supportsImages } = useApp();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudgetState] = useState<number>(getKnowledgeBudget);
  const [indexes, setIndexes] = useState<KnowledgeIndex[]>([]);
  // The embeddings model in use, or null when embeddings are off.
  const [embeddingsModel, setEmbeddingsModel] = useState(() =>
    embeddingModelKey(getEmbeddingsConfig())
  );
  // A document too large to send in full, offered to be searched instead.
  const [searchOffer, setSearchOffer] = useState<KnowledgeDocument | null>(
    null
  );
  const [indexing, setIndexing] = useState<{
    documentId: number;
    done: number;
    total: number;
  } | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const [docs, idx] = await Promise.all([
        getAllKnowledgeDocuments(),
        getKnowledgeIndexes(),
      ]);
      setDocuments(docs);
      setIndexes(idx);
      setEmbeddingsModel(embeddingModelKey(getEmbeddingsConfig()));
    } catch (err) {
      setError(errorMessage(err, "Failed to load knowledge documents"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const activeTokens = useMemo(
    () => activeKnowledgeTokens(documents.filter((doc) => doc.is_active)),
    [documents]
  );

  /** How many passages document `id` has for the current embeddings model. */
  const passageCount = useCallback(
    (id: number) =>
      indexes.find(
        (i) => i.document_id === id && i.embedding_model === embeddingsModel
      )?.count ?? 0,
    [indexes, embeddingsModel]
  );

  const index = useCallback(async (document: KnowledgeDocument) => {
    setIndexing({ documentId: document.id, done: 0, total: 0 });
    try {
      await indexKnowledgeDocument(
        document,
        getEmbeddingsConfig(),
        (done, total) => setIndexing({ documentId: document.id, done, total })
      );
    } finally {
      setIndexing(null);
    }
  }, []);

  // A Searched Document's passages come from its text, so new text is indexed again.
  const reindexIfSearched = useCallback(
    async (id: number) => {
      const doc = (await getAllKnowledgeDocuments()).find((d) => d.id === id);
      if (!doc?.is_searched || !embeddingModelKey(getEmbeddingsConfig())) {
        return;
      }
      try {
        await index(doc);
      } catch (err) {
        throw new Error(
          `Saved, but it couldn't be indexed again, so it isn't searched until it is: ${errorMessage(err, "unknown error")}`
        );
      }
    },
    [index]
  );

  const run = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      try {
        setIsProcessing(true);
        setError(null);
        await action();
        await fetchDocuments();
        return true;
      } catch (err) {
        setError(errorMessage(err, fallback));
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [fetchDocuments]
  );

  const transcribeImage = useCallback(
    async (base64: string) => {
      const useEchoIdealAPI = await shouldUseEchoIdealAPI();
      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (!useEchoIdealAPI) {
        if (!provider) {
          throw new Error(
            "Select an AI provider in Dev Space to read images, or paste the text instead."
          );
        }
        if (!supportsImages || !provider.curl.includes("{{IMAGE}}")) {
          throw new Error(
            "Your selected AI provider can't read images. Paste the text instead, or switch to a provider that supports images."
          );
        }
      }
      return transcribeImageWithProvider({
        provider: useEchoIdealAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        base64,
      });
    },
    [allAiProviders, selectedAIProvider, supportsImages]
  );

  const addFromFile = useCallback(
    (file: File) =>
      run(async () => {
        const { sourceType, content } = await extractKnowledgeText(
          file,
          transcribeImage
        );
        await createKnowledgeDocument({
          name: file.name,
          source_type: sourceType,
          content,
        });
      }, "Failed to add document"),
    [run, transcribeImage]
  );

  const addFromText = useCallback(
    (name: string, content: string) =>
      run(
        () => createKnowledgeDocument({ name, source_type: "paste", content }),
        "Failed to add document"
      ),
    [run]
  );

  const replaceFromFile = useCallback(
    (id: number, file: File) =>
      run(async () => {
        const { sourceType, content } = await extractKnowledgeText(
          file,
          transcribeImage
        );
        await updateKnowledgeDocument(id, {
          content,
          source_type: sourceType,
        });
        await reindexIfSearched(id);
      }, "Failed to replace document"),
    [run, transcribeImage, reindexIfSearched]
  );

  const updateDocument = useCallback(
    (id: number, input: { name: string; content: string }) =>
      run(async () => {
        await updateKnowledgeDocument(id, input);
        await reindexIfSearched(id);
      }, "Failed to save document"),
    [run, reindexIfSearched]
  );

  // Switching on a document too large for the budget offers to search it instead.
  const setActive = useCallback(
    async (id: number, isActive: boolean) => {
      let offer = false;
      const ok = await run(async () => {
        try {
          await setKnowledgeDocumentActive(id, isActive);
        } catch (err) {
          if (!(err instanceof KnowledgeBudgetError && err.searchable)) {
            throw err;
          }
          offer = true;
        }
      }, "Failed to update document");
      if (offer) {
        setSearchOffer(documents.find((doc) => doc.id === id) ?? null);
      }
      return ok && !offer;
    },
    [run, documents]
  );

  /** Indexes document `id` if needed and switches it on as a Searched Document. */
  const searchDocument = useCallback(
    (id: number) =>
      run(async () => {
        await assertSearchFits(id);
        const doc = documents.find((d) => d.id === id);
        if (!doc) throw new Error("Knowledge document not found");
        if (passageCount(id) === 0) await index(doc);
        await setKnowledgeDocumentSearched(id);
      }, "Failed to search document"),
    [run, documents, passageCount, index]
  );

  const reindexDocument = useCallback(
    (id: number) =>
      run(async () => {
        const doc = documents.find((d) => d.id === id);
        if (!doc) throw new Error("Knowledge document not found");
        await index(doc);
      }, "Failed to index document"),
    [run, documents, index]
  );

  const deleteDocument = useCallback(
    (id: number) =>
      run(() => deleteKnowledgeDocument(id), "Failed to delete document"),
    [run]
  );

  const setBudget = useCallback(
    (tokens: number) => {
      if (!Number.isFinite(tokens) || tokens < MIN_KNOWLEDGE_BUDGET_TOKENS) {
        setError(
          `The Knowledge Budget must be at least ${MIN_KNOWLEDGE_BUDGET_TOKENS.toLocaleString()} tokens.`
        );
        return false;
      }
      if (tokens < activeTokens) {
        setError(
          `Your Active Knowledge already uses about ${activeTokens.toLocaleString()} tokens. Switch documents off before lowering the budget below that.`
        );
        return false;
      }
      saveKnowledgeBudget(tokens);
      setBudgetState(Math.round(tokens));
      setError(null);
      return true;
    },
    [activeTokens]
  );

  return {
    documents,
    isLoading,
    isProcessing,
    error,
    clearError: () => setError(null),
    budget,
    activeTokens,
    setBudget,
    embeddingsModel,
    passageCount,
    indexing,
    searchOffer,
    closeSearchOffer: () => setSearchOffer(null),
    searchDocument,
    reindexDocument,
    addFromFile,
    addFromText,
    replaceFromFile,
    updateDocument,
    setActive,
    deleteDocument,
  };
};
