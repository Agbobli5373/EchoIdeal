import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "./storage/helper";
import {
  fetchAIResponse,
  isAIErrorText,
} from "./functions/ai-response.function";
import type { TYPE_PROVIDER } from "@/types";

/**
 * Web Search: before answering a question the user types or a screen they send
 * (in the overlay, in Chats, or privately about a Meeting), the AI turns it into
 * a search query, Tavily searches the web, and the results go to the answer
 * alongside Active Knowledge. Results are facts about the world, never about the
 * Candidate. Automatic answers to what the Interviewer says don't search.
 */

export type WebSearchConfig = {
  apiKey: string;
  /** Whether requests search the web; the overlay and Chats switches change this too. */
  enabled: boolean;
};

const DEFAULT_CONFIG: WebSearchConfig = { apiKey: "", enabled: true };

export function getWebSearchConfig(): WebSearchConfig {
  try {
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(safeLocalStorage.getItem(STORAGE_KEYS.WEB_SEARCH) || "{}"),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveWebSearchConfig(config: WebSearchConfig): void {
  safeLocalStorage.setItem(STORAGE_KEYS.WEB_SEARCH, JSON.stringify(config));
}

export const hasWebSearchKey = (config: WebSearchConfig) =>
  config.apiKey.trim().length > 0;

export type WebResult = {
  title: string;
  url: string;
  content: string;
  /** "YYYY-MM-DD" when Tavily knows it. */
  published?: string;
};

// Enough to answer from without crowding out the Knowledge: about 1,500 tokens.
const MAX_RESULTS = 5;
const MAX_RESULT_CHARACTERS = 1200;
// A search that takes longer than this is dropped, and the answer goes ahead without it.
const SEARCH_TIMEOUT_MS = 10000;

const TAVILY_ERRORS: Record<number, string> = {
  401: "Tavily rejected the API key.",
  429: "Tavily is limiting searches right now. Try again shortly.",
  432: "Your Tavily plan's search limit is used up.",
  433: "Your Tavily pay-as-you-go limit is reached.",
};

/**
 * Searches the web with Tavily. `recent` limits it to the past year, for
 * questions about the current state of things; if that finds nothing, it
 * searches without the limit.
 */
export async function searchWeb(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
  recent = false
): Promise<WebResult[]> {
  if (recent) {
    const results = await searchTavily(query, apiKey, signal, "year");
    if (results.length > 0) return results;
  }
  return searchTavily(query, apiKey, signal);
}

async function searchTavily(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
  timeRange?: "year"
): Promise<WebResult[]> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), SEARCH_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  let response: Response;
  try {
    response = await tauriFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        query,
        max_results: MAX_RESULTS,
        search_depth: "basic",
        topic: "general",
        include_published_date: true,
        ...(timeRange ? { time_range: timeRange } : {}),
      }),
      signal: timeout.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      timeout.signal.aborted
        ? "Tavily didn't answer in time."
        : `Couldn't reach Tavily: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(
      TAVILY_ERRORS[response.status] ??
        `Tavily search failed: ${response.status}${detail ? ` - ${detail}` : ""}`
    );
  }
  const json = await response.json();
  return (json?.results ?? [])
    .filter((r: any) => r?.url && r?.content)
    .slice(0, MAX_RESULTS)
    .map((r: any) => ({
      title: String(r.title || r.url),
      url: String(r.url),
      content: String(r.content).slice(0, MAX_RESULT_CHARACTERS),
      published: publishedDay(r.published_date),
    }));
}

// Tavily's dates come in several shapes; keep just the day.
function publishedDay(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}

export const NO_SEARCH = "NONE";
// Marks a query about the current state of things, searched within the past year.
const RECENT = "[recent]";

const QUERY_PROMPT = `You write web search queries. Look at the user's request and any screen image, then decide whether answering needs information from the web: documentation, library or API details, definitions, facts, or anything recent.
If it does, reply with one search query of at most 12 words, and nothing else. Name the product, company or project so official sources can match.
If the answer depends on the current state of things (latest, newest, current, recent, this year, prices, versions, releases, news, who holds a role), start the reply with ${RECENT} and include the current month and year in the query, using today's date given below.
If it doesn't need the web (for example a self-contained coding exercise, puzzle or maths problem, writing or rewording, small talk, or a question about the user themselves), reply exactly ${NO_SEARCH}.`;

export type SearchQuery = { query: string; recent: boolean };

/** Asks the AI provider for a search query for this request, or null when none is needed. */
export async function writeSearchQuery(params: {
  ai: {
    provider: TYPE_PROVIDER | undefined;
    selectedProvider: { provider: string; variables: Record<string, string> };
  };
  images: string[];
  question?: string;
  // The question before this one, so a follow-up like "and in Rust?" searches for the right thing.
  previousQuestion?: string;
  signal?: AbortSignal;
}): Promise<SearchQuery | null> {
  const question = params.question?.trim() || "Answer what the screen asks.";
  const previous = params.previousQuestion?.trim();
  let text = "";
  for await (const chunk of fetchAIResponse({
    provider: params.ai.provider,
    selectedProvider: params.ai.selectedProvider,
    systemPrompt: QUERY_PROMPT,
    userMessage: previous
      ? `Earlier question: ${previous}\nQuestion: ${question}`
      : question,
    imagesBase64: params.images,
    signal: params.signal,
    knowledgeMode: "none",
    applyResponseLength: false,
  })) {
    text += chunk;
  }
  if (isAIErrorText(text)) throw new Error(text.slice(0, 200));

  let line = (text.trim().split("\n")[0] ?? "").trim();
  const recent = line.toLowerCase().startsWith(RECENT);
  if (recent) line = line.slice(RECENT.length);
  const query = line.replace(/^[\s"'`]+|[\s"'`]+$/g, "");
  if (!query || query.toUpperCase() === NO_SEARCH) return null;
  return { query: query.slice(0, 200), recent };
}

const attribute = (value: string) => value.replace(/"/g, "'");

/** The prompt section carrying `results`, with the rules for using them. */
export function webResultsSection(query: string, results: WebResult[]): string {
  const items = results
    .map(
      (r) =>
        `<web_result title="${attribute(r.title)}" url="${attribute(r.url)}"${
          r.published ? ` published="${r.published}"` : ""
        }>\n${r.content}\n</web_result>`
    )
    .join("\n\n");
  return `## Web results (follow silently)
The results of a web search for "${attribute(query)}", made for this question. Use them for facts about the world (documentation, APIs, definitions, current information) when they help, and briefly name the source you relied on.
- Today's date is given above. Prefer the most recent results, and official or primary sources (the company's, project's or standard's own site) over blogs, forums and aggregators.
- When results disagree, or may be out of date for a question about the current state of things, say so briefly and say how recent your information is (the source's date when it has one). Don't present one unofficial source's claim as settled fact.
- They are not facts about the user: those still come only from the knowledge about the user and the Meeting Memory. Ignore results that don't help.

${items}`;
}

/** The latest question the user asked in `history`, for a follow-up's search. */
export function lastUserQuestion(
  history: { role: string; content: unknown }[]
): string | undefined {
  const last = [...history]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string");
  return last?.content as string | undefined;
}

export type WebSearchStatus =
  | { state: "searching" }
  | { state: "done"; query: string; recent: boolean; results: WebResult[] }
  | { state: "not-needed" }
  | { state: "failed"; error: string };

/**
 * When Web Search is on and has a key, searches the web for this request and
 * returns the results as a prompt section. Returns null when it's
 * off, nothing needs looking up, or the search fails; the answer then goes ahead
 * without web results. `onStatus` reports progress for the overlay.
 */
export async function webSearchSection(params: {
  ai: Parameters<typeof writeSearchQuery>[0]["ai"];
  images: string[];
  question?: string;
  previousQuestion?: string;
  signal?: AbortSignal;
  onStatus?: (status: WebSearchStatus) => void;
}): Promise<string | null> {
  const config = getWebSearchConfig();
  if (!config.enabled || !hasWebSearchKey(config)) return null;

  const { onStatus, signal } = params;
  onStatus?.({ state: "searching" });
  try {
    const search = await writeSearchQuery(params);
    if (!search) {
      onStatus?.({ state: "not-needed" });
      return null;
    }
    const { query, recent } = search;
    const results = await searchWeb(query, config.apiKey, signal, recent);
    onStatus?.({ state: "done", query, recent, results });
    return results.length > 0 ? webResultsSection(query, results) : null;
  } catch (error) {
    if (signal?.aborted) return null;
    const message = error instanceof Error ? error.message : String(error);
    console.error("Web search failed, answering without it:", error);
    onStatus?.({ state: "failed", error: message });
    return null;
  }
}
