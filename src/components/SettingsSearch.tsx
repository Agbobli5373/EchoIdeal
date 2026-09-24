import { useEffect, useMemo, useRef } from "react";
import { CornerDownLeftIcon } from "lucide-react";
import type { MenuSection } from "@/hooks/useMenuItems";
import { allSettings, matchScore } from "@/lib/settings-index";
import { cn } from "@/lib/utils";

// Enough to scan at a glance; typing more narrows it down.
const MAX_RESULTS = 12;

export type SearchResult = {
  key: string;
  title: string;
  /** The page, and the group on it, e.g. "AI and Speech › AI provider". */
  where: string;
  to: string;
};

/** Sidebar pages and registered settings matching `query`, best first. */
export function searchSettings(
  query: string,
  sections: MenuSection[]
): SearchResult[] {
  if (!query.trim()) return [];

  const pageLabel = new Map(
    sections.flatMap((section) =>
      section.items.map((item) => [item.href, item.label] as const)
    )
  );

  const scored: { score: number; result: SearchResult }[] = [];

  for (const section of sections) {
    for (const item of section.items) {
      const score = matchScore(query, { title: item.label }, section.label);
      if (score > 0) {
        scored.push({
          // A page that matches as well as a setting comes first.
          score: score + 0.5,
          result: {
            key: `page:${item.href}`,
            title: item.label,
            where: section.label ? `${section.label} page` : "Page",
            to: item.href,
          },
        });
      }
    }
  }

  for (const entry of allSettings()) {
    const page = pageLabel.get(entry.page) ?? entry.page;
    const score = matchScore(query, entry, page);
    if (score > 0) {
      scored.push({
        score,
        result: {
          key: `${entry.page}#${entry.id}`,
          title: entry.title,
          where: entry.group ? `${page} › ${entry.group}` : page,
          to: `${entry.page}#${entry.id}`,
        },
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
}

export const SETTINGS_SEARCH_LIST_ID = "settings-search-results";
export const searchResultId = (index: number) =>
  `settings-search-result-${index}`;

/** The results that replace the sidebar list while the search box has text. */
export const SettingsSearchResults = ({
  query,
  results,
  activeIndex,
  onHover,
  onChoose,
}: {
  query: string;
  results: SearchResult[];
  activeIndex: number;
  onHover: (index: number) => void;
  onChoose: (result: SearchResult) => void;
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the result chosen with the arrow keys in view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#${searchResultId(activeIndex)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const summary = useMemo(
    () =>
      results.length === 0
        ? `No settings match “${query.trim()}”.`
        : `${results.length} ${results.length === 1 ? "result" : "results"}`,
    [results.length, query]
  );

  return (
    <div className="px-3 pb-4">
      <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground" role="status">
        {summary}
      </p>
      <div
        ref={listRef}
        id={SETTINGS_SEARCH_LIST_ID}
        role="listbox"
        aria-label="Settings search results"
      >
        {results.map((result, index) => {
          const active = index === activeIndex;
          return (
            <div
              key={result.key}
              id={searchResultId(index)}
              role="option"
              aria-selected={active}
              // Keep focus in the search box, so typing and arrow keys carry on.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => onChoose(result)}
              className={cn(
                "mb-0.5 flex cursor-pointer items-center gap-2 rounded px-3 py-1.5",
                active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-foreground">{result.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {result.where}
                </div>
              </div>
              {active && (
                <CornerDownLeftIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
