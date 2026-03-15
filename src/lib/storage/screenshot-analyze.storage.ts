import {
  SCREENSHOT_ANALYZE_PROMPT_KEY,
  DEFAULT_SCREENSHOT_ANALYZE_PROMPT,
} from "@/config/constants";

export function getScreenshotAnalyzePrompt(): string {
  try {
    const stored = localStorage.getItem(SCREENSHOT_ANALYZE_PROMPT_KEY);
    return stored || DEFAULT_SCREENSHOT_ANALYZE_PROMPT;
  } catch {
    return DEFAULT_SCREENSHOT_ANALYZE_PROMPT;
  }
}

export function setScreenshotAnalyzePrompt(prompt: string): void {
  try {
    localStorage.setItem(SCREENSHOT_ANALYZE_PROMPT_KEY, prompt);
  } catch (error) {
    console.error("Failed to save screenshot analyze prompt:", error);
  }
}
