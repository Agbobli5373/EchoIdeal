import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "../storage/helper";

export const DEFAULT_KNOWLEDGE_BUDGET_TOKENS = 12000;
export const MIN_KNOWLEDGE_BUDGET_TOKENS = 1000;

// Rough heuristic (~4 characters per token) — good enough for a budget meter
// across providers whose tokenizers we don't have.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
  constructor(requiredTokens: number, budgetTokens: number) {
    super(
      `Active Knowledge would use about ${requiredTokens.toLocaleString()} tokens, over your Knowledge Budget of ${budgetTokens.toLocaleString()}. Switch another document off, shorten this one, or raise the budget.`
    );
    this.name = "KnowledgeBudgetError";
  }
}
