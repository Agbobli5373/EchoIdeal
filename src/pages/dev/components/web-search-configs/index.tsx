import { useEffect, useState } from "react";
import { Loader2Icon, TrashIcon } from "lucide-react";
import {
  Button,
  Input,
  SettingsGroup,
  SettingsRow,
  Switch,
} from "@/components";
import { STORAGE_KEYS } from "@/config";
import {
  getWebSearchConfig,
  hasWebSearchKey,
  saveWebSearchConfig,
  searchWeb,
  WebSearchConfig,
} from "@/lib/web-search";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/ai-and-speech", {
  "web-search-enabled": {
    title: "Search the web in Assessments",
    group: "Web search",
    keywords: "internet online google browse tavily assessment research",
  },
  "web-search-key": {
    title: "Tavily API key",
    group: "Web search",
    keywords: "internet web search key token secret",
  },
  "web-search-test": {
    title: "Test web search",
    group: "Web search",
    keywords: "internet tavily check connection",
  },
});

export const WebSearchSettings = () => {
  const [config, setConfig] = useState<WebSearchConfig>(getWebSearchConfig);
  const [test, setTest] = useState<
    { state: "running" } | { state: "done"; ok: boolean; text: string } | null
  >(null);
  const hasKey = hasWebSearchKey(config);

  useEffect(() => {
    // The overlay's switch changes `enabled` during an Assessment.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.WEB_SEARCH) setConfig(getWebSearchConfig());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const update = (changes: Partial<WebSearchConfig>) => {
    const next = { ...config, ...changes };
    setConfig(next);
    saveWebSearchConfig(next);
    setTest(null);
  };

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      const results = await searchWeb("Tavily search API", config.apiKey);
      setTest({
        state: "done",
        ok: true,
        text: `Works. It found ${results.length} ${results.length === 1 ? "result" : "results"}.`,
      });
    } catch (error) {
      setTest({
        state: "done",
        ok: false,
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <SettingsGroup title="Web search" meta="Assessments">
      <SettingsRow
        {...SETTINGS["web-search-enabled"]}
        desc="Before each Suggested Answer in an Assessment, the AI writes a search query from the screen and Tavily searches the web, so answers can use documentation and facts alongside your Knowledge. You can also switch it in the overlay during an Assessment."
        control={
          <Switch
            checked={hasKey && config.enabled}
            disabled={!hasKey}
            onCheckedChange={(checked) => update({ enabled: checked })}
            aria-label="Search the web in Assessments"
          />
        }
      />

      <SettingsRow
        {...SETTINGS["web-search-key"]}
        desc="From tavily.com; the free plan covers about 1,000 searches a month. Each search query is sent to Tavily. The key is stored on this device and never shared."
        control={
          <>
            <Input
              type="password"
              className="h-8 w-60"
              placeholder="tvly-…"
              aria-label="Tavily API key"
              value={config.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
            />
            {hasKey && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => update({ apiKey: "" })}
                title="Remove API key"
                aria-label="Remove Tavily API key"
              >
                <TrashIcon className="size-3.5" />
              </Button>
            )}
          </>
        }
      />

      {hasKey && (
        <SettingsRow
          {...SETTINGS["web-search-test"]}
          title="Test"
          desc={
            test?.state === "done" ? (
              <span className={test.ok ? "text-ok" : "text-destructive"}>
                {test.text}
              </span>
            ) : (
              "Runs one search to check the key works. It counts toward your Tavily plan."
            )
          }
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={test?.state === "running"}
              onClick={runTest}
            >
              {test?.state === "running" && (
                <Loader2Icon className="size-3.5 animate-spin" />
              )}
              Test
            </Button>
          }
        />
      )}
    </SettingsGroup>
  );
};
