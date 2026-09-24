import { useEffect, useState } from "react";
import { GlobeIcon } from "lucide-react";
import { STORAGE_KEYS } from "@/config";
import {
  getWebSearchConfig,
  hasWebSearchKey,
  saveWebSearchConfig,
} from "@/lib/web-search";

/** The settings row that takes the Tavily key. */
export const WEB_SEARCH_SETUP_PATH = "/ai-and-speech#web-search-key";

/**
 * Turns Web Search on or off. Without a Tavily key it calls `onSetUp`, which
 * opens the settings row that takes the key.
 */
export const WebSearchToggle = ({ onSetUp }: { onSetUp: () => void }) => {
  const [config, setConfig] = useState(getWebSearchConfig);

  useEffect(() => {
    // Another window (the overlay or the dashboard) may change it.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.WEB_SEARCH) setConfig(getWebSearchConfig());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const hasKey = hasWebSearchKey(config);
  const on = hasKey && config.enabled;

  const handleClick = () => {
    if (!hasKey) {
      onSetUp();
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
            ? "Web search on: questions and screens search the web first. Click to turn it off."
            : "Web search off. Click to search the web before answering."
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

/** Whether a Tavily key is set, kept up to date across windows. */
export const useHasWebSearchKey = () => {
  const [hasKey, setHasKey] = useState(() =>
    hasWebSearchKey(getWebSearchConfig())
  );
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.WEB_SEARCH) {
        setHasKey(hasWebSearchKey(getWebSearchConfig()));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  return hasKey;
};
