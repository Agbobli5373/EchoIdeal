import { STORAGE_KEYS } from "@/config/constants";
import type { KnowledgeDocument } from "@/types";
import { safeLocalStorage } from "../storage/helper";

export const DEFAULT_KNOWLEDGE_BUDGET_TOKENS = 12000;
export const MIN_KNOWLEDGE_BUDGET_TOKENS = 1000;

// Room kept in every request for passages from Searched Documents, shared between them.
export const SEARCHED_PASSAGES_TOKENS = 2000;

// Rough heuristic (~4 characters per token) — good enough for a budget meter
// across providers whose tokenizers we don't have.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * What the given Active Knowledge costs in each request: documents sent in full,
 * plus the passage room once any document is searched.
 */
export function activeKnowledgeTokens(
  documents: Pick<KnowledgeDocument, "content" | "is_searched">[]
): number {
  const full = documents
    .filter((doc) => !doc.is_searched)
    .reduce((sum, doc) => sum + estimateTokens(doc.content), 0);
  return documents.some((doc) => doc.is_searched)
    ? full + SEARCHED_PASSAGES_TOKENS
    : full;
}

export function getKnowledgeBudget(): number {
  const stored = Number(
    safeLocalStorage.getItem(STORAGE_KEYS.KNOWLEDGE_BUDGET_TOKENS)
  );
  return Number.isFinite(stored) && stored >= MIN_KNOWLEDGE_BUDGET_TOKENS
    ? stored
    : DEFAULT_KNOWLEDGE_BUDGET_TOKENS;
}

export function saveKnowledgeBudget(tokens: number): void {
  safeLocalStorage.setItem(
    STORAGE_KEYS.KNOWLEDGE_BUDGET_TOKENS,
    String(Math.round(tokens))
  );
}

export class KnowledgeBudgetError extends Error {
  /** The document would fit if it were searched instead of sent in full. */
  readonly searchable: boolean;

  constructor(
    requiredTokens: number,
    budgetTokens: number,
    searchable = false
  ) {
    super(
      `Active Knowledge would use about ${requiredTokens.toLocaleString()} tokens, over your Knowledge Budget of ${budgetTokens.toLocaleString()}. Switch another document off, shorten this one, or raise the budget.${
        searchable
          ? " Or search it instead from the Knowledge page, so only the passages matching each question are sent."
          : ""
      }`
    );
    this.name = "KnowledgeBudgetError";
    this.searchable = searchable;
  }
}
