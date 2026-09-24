import { openUrl } from "@tauri-apps/plugin-opener";
import { GlobeIcon } from "lucide-react";
import type { WebSearchStatus } from "@/lib/web-search";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// "2026-09-12" → "12 Sep 2026"
const formatDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Under an answer: what the web was searched for and the sources, or why it wasn't. */
export const WebSearchNote = ({
  status,
}: {
  status: WebSearchStatus | null;
}) => {
  if (!status || status.state === "searching") return null;

  if (status.state === "not-needed") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <GlobeIcon className="size-3" />
        No web search needed for this.
      </p>
    );
  }

  if (status.state === "failed") {
    return (
      <p className="mt-3 flex items-start gap-1.5 text-xs text-warn">
        <GlobeIcon className="mt-0.5 size-3 shrink-0" />
        Web search failed, so this was answered without it: {status.error}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5">
        <GlobeIcon className="size-3" />
        {status.results.length > 0
          ? `Searched the web for “${status.query}”`
          : `Nothing found on the web for “${status.query}”`}
      </p>
      {status.results.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-8">
          {status.results.map((result) => (
            <li key={result.url}>
              <button
                type="button"
                className="text-left hover:text-foreground hover:underline"
                title={result.url}
                onClick={() => openUrl(result.url).catch(console.error)}
              >
                {result.title}
                <span className="text-muted-foreground/70">
                  {" "}
                  · {hostOf(result.url)}
                  {result.published && ` · ${formatDay(result.published)}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
