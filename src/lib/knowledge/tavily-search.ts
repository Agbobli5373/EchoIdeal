import type { TavilySearchResult } from "./types";

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

export async function searchTavily(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<TavilySearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: query.trim(),
      search_depth: "basic",
      max_results: Math.min(maxResults, 10),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Tavily search failed (${res.status})`);
  }
  const json = (await res.json()) as TavilyResponse;
  const rows = json.results ?? [];
  return rows.map((r) => ({
    title: r.title ?? "Result",
    url: r.url ?? "",
    content: (r.content ?? "").slice(0, 1200),
  }));
}
