import { useEffect, useState } from "react";
import { GlobeIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { DASHBOARD_NAVIGATE_EVENT, STORAGE_KEYS } from "@/config";
import {
  getWebSearchConfig,
  hasWebSearchKey,
  saveWebSearchConfig,
} from "@/lib/web-search";

/**
 * Turns Web Search on or off during an Assessment. Without a Tavily key it
 * opens the dashboard where the key goes instead.
 */
export const WebSearchToggle = () => {
  const [config, setConfig] = useState(getWebSearchConfig);

  useEffect(() => {
    // The dashboard window saves the key and default through localStorage.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.WEB_SEARCH) setConfig(getWebSearchConfig());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const hasKey = hasWebSearchKey(config);
  const on = hasKey && config.enabled;

  const handleClick = async () => {
    if (!hasKey) {
      try {
        await invoke("open_dashboard");
        await emitTo(
          "dashboard",
          DASHBOARD_NAVIGATE_EVENT,
          "/ai-and-speech#web-search-key"
        );
      } catch (error) {
        console.error("Failed to open web search settings:", error);
      }
      return;
    }
    const next = { ...config, enabled: !config.enabled };
    saveWebSearchConfig(next);
    setConfig(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Search the web for answers"
      onClick={handleClick}
      title={
        !hasKey
          ? "Web search is off: add a Tavily key in AI and Speech"
          : on
            ? "Web search on: each answer searches the web first. Click to turn it off."
            : "Web search off. Click to search the web for each answer."
      }
      className={`flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${
        on
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60"
      }`}
    >
      <GlobeIcon className="size-3" />
      {on ? "Web" : "Web off"}
    </button>
  );
};
