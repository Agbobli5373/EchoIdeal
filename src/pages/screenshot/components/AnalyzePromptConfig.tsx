import { useState, useEffect } from "react";
import { Header, Button } from "@/components";
import { Textarea } from "@/components/ui/textarea";
import {
  getScreenshotAnalyzePrompt,
  setScreenshotAnalyzePrompt,
} from "@/lib/storage/screenshot-analyze.storage";
import {
  SCREENSHOT_ANALYZE_PRESETS,
} from "@/config/constants";
import { CheckIcon, RotateCcwIcon } from "lucide-react";

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
    <div className="space-y-3">
      <Header
        title="Screenshot & Analyze Prompt"
        description="Customize the default prompt used when you click the analyze button or press Ctrl+Shift+E. This controls what the AI does with your screenshot."
        isMainTitle
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Quick Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {SCREENSHOT_ANALYZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePreset(preset.prompt)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-200 ${
                prompt === preset.prompt
                  ? "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "border-border/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/20"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Custom Prompt</p>
        <Textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setSaved(false);
          }}
          placeholder="Enter your custom prompt for screenshot analysis..."
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
              "Save Prompt"
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

      <p className="text-[10px] text-muted-foreground/60">
        Tip: Use "Solve Questions" for exams/homework, "Code Helper" for programming,
        or write your own prompt for specific use cases.
      </p>
    </div>
  );
};
