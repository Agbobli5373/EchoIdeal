import { useState, useEffect } from "react";
import { Button, SettingsRow } from "@/components";
import { Textarea } from "@/components/ui/textarea";
import {
  getScreenshotAnalyzePrompt,
  setScreenshotAnalyzePrompt,
} from "@/lib/storage/screenshot-analyze.storage";
import { SCREENSHOT_ANALYZE_PRESETS } from "@/config/constants";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/screen-capture", {
  "cap-prompt": {
    title: "What to ask about a capture",
    group: "Screen Capture prompt",
    keywords: "analyze analyse prompt screenshot preset solve code",
  },
});

export const AnalyzePromptConfig = () => {
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrompt(getScreenshotAnalyzePrompt());
  }, []);

  const handleSave = () => {
    setScreenshotAnalyzePrompt(prompt.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePreset = (presetPrompt: string) => {
    setPrompt(presetPrompt);
    setScreenshotAnalyzePrompt(presetPrompt);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SettingsRow
      {...SETTINGS["cap-prompt"]}
      desc="Used by Screenshot & Analyze, the scan button or Ctrl+Shift+E. Pick a preset or write your own."

      stacked
    >
      <div className="space-y-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Presets"
        >
          {SCREENSHOT_ANALYZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={prompt === preset.prompt}
              onClick={() => handlePreset(preset.prompt)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                prompt === preset.prompt
                  ? "border-transparent bg-accent text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setSaved(false);
          }}
          placeholder="Enter your custom prompt for screenshot analysis..."
          aria-label="Screen Capture prompt"
          className="min-h-[100px] text-sm"
          rows={4}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saved}
            className="gap-1.5"
          >
            {saved ? (
              <>
                <CheckIcon className="size-3" />
                Saved
              </>
            ) : (
              "Save prompt"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
            onClick={() => handlePreset(SCREENSHOT_ANALYZE_PRESETS[0].prompt)}
          >
            <RotateCcwIcon className="size-3" />
            Reset to default
          </Button>
        </div>
      </div>
    </SettingsRow>
  );
};
