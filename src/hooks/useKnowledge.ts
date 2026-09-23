import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getAllKnowledgeDocuments,
  setKnowledgeDocumentActive,
  updateKnowledgeDocument,
} from "@/lib/database";
import {
  estimateTokens,
  extractKnowledgeText,
  getKnowledgeBudget,
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

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setDocuments(await getAllKnowledgeDocuments());
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
    () =>
      documents
        .filter((doc) => doc.is_active)
        .reduce((sum, doc) => sum + estimateTokens(doc.content), 0),
    [documents]
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
      }, "Failed to replace document"),
    [run, transcribeImage]
  );

  const updateDocument = useCallback(
    (id: number, input: { name: string; content: string }) =>
      run(() => updateKnowledgeDocument(id, input), "Failed to save document"),
    [run]
  );

  const setActive = useCallback(
    (id: number, isActive: boolean) =>
      run(
        () => setKnowledgeDocumentActive(id, isActive),
        "Failed to update document"
      ),
    [run]
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
    addFromFile,
    addFromText,
    replaceFromFile,
    updateDocument,
    setActive,
    deleteDocument,
  };
};
