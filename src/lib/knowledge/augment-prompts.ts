import type { ConversationKnowledgeMode } from "@/types/completion";
import { searchKb } from "./kb-db";
import { searchTavily } from "./tavily-search";
import {
  getKnowledgeGlobalSettings,
  resolveEffectiveKnowledgeMode,
} from "./settings";

const CONTEXT_INSTRUCTION = `The following sections contain retrieved information (local files and/or web search). Use them when they help answer the question; mention sources briefly (file path or page title). If they are irrelevant or empty, answer from general knowledge and say that no matching documents or web results were found.`;

const MAX_CONTEXT_CHARS = 8000;

function truncateBlock(s: string, budget: number): string {
  if (s.length <= budget) return s;
  return `${s.slice(0, budget)}\n… (truncated)`;
}

function formatLocalHits(
  hits: { file_path: string; text: string }[],
  budget: number
): { text: string; sources: string[] } {
  const sources: string[] = [];
  let out = "### Local knowledge\n\n";
  let used = out.length;
  for (const h of hits) {
    if (!sources.includes(h.file_path)) sources.push(h.file_path);
    const piece = `#### ${h.file_path}\n${h.text}\n\n`;
    if (used + piece.length > budget) break;
    out += piece;
    used += piece.length;
  }
  return { text: out, sources };
}

function formatWebResults(
  results: { title: string; url: string; content: string }[],
  budget: number
): { text: string; sources: string[] } {
  const sources: string[] = [];
  let out = "### Web results\n\n";
  let used = out.length;
  for (const r of results) {
    const label = r.url ? `[${r.title}](${r.url})` : r.title;
    if (r.url && !sources.includes(r.url)) sources.push(r.url);
    const piece = `- ${label}: ${r.content}\n\n`;
    if (used + piece.length > budget) break;
    out += piece;
    used += piece.length;
  }
  return { text: out, sources };
}

export interface AugmentPromptsResult {
  systemPrompt?: string;
  userMessage: string;
  sources: string[];
}

export async function augmentPromptsForChat(params: {
  systemPrompt?: string;
  userMessage: string;
  conversationKnowledgeMode?: ConversationKnowledgeMode;
}): Promise<AugmentPromptsResult> {
  const { systemPrompt, userMessage, conversationKnowledgeMode } = params;
  const global = getKnowledgeGlobalSettings();
  const effective = resolveEffectiveKnowledgeMode(
    conversationKnowledgeMode,
    global.defaultKnowledgeMode
  );

  if (effective === "off") {
    return { systemPrompt, userMessage, sources: [] };
  }

  const sources: string[] = [];
  const blocks: string[] = [];
  let budget = MAX_CONTEXT_CHARS;

  if (effective === "local" || effective === "local_web") {
    const hits = await searchKb(userMessage, 12);
    if (hits.length > 0) {
      const { text, sources: locSrc } = formatLocalHits(hits, budget);
      blocks.push(truncateBlock(text, budget));
      budget -= Math.min(blocks[blocks.length - 1].length, budget);
      sources.push(...locSrc);
    }
  }

  if (effective === "web" || effective === "local_web") {
    const key = global.tavilyApiKey?.trim();
    if (key) {
      try {
        const web = await searchTavily(userMessage, key, 5);
        if (web.length > 0) {
          const { text, sources: webSrc } = formatWebResults(web, budget);
          blocks.push(truncateBlock(text, Math.max(budget, 2000)));
          sources.push(...webSrc);
        }
      } catch {
        blocks.push(
          "### Web results\n\n(Web search failed; continuing without web context.)\n"
        );
      }
    }
  }

  if (blocks.length === 0) {
    const hint =
      effective === "local"
        ? "No matching local document chunks were found for this query."
        : effective === "web"
          ? "Web search is off or no API key configured, or no results returned."
          : "No local matches and no web context was added (check API key or index).";
    blocks.push(`### Retrieved context\n\n${hint}\n`);
  }

  const contextBody = blocks.join("\n");
  const mergedSystem = [systemPrompt?.trim(), CONTEXT_INSTRUCTION, contextBody]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: mergedSystem,
    userMessage,
    sources: [...new Set(sources)],
  };
}
