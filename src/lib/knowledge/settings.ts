import { STORAGE_KEYS } from "@/config";
import { safeLocalStorage } from "@/lib/storage";
import type { GlobalKnowledgeMode, KnowledgeGlobalSettings } from "./types";

const DEFAULT_SETTINGS: KnowledgeGlobalSettings = {
  defaultKnowledgeMode: "off",
};

export function getKnowledgeGlobalSettings(): KnowledgeGlobalSettings {
  const raw = safeLocalStorage.getItem(STORAGE_KEYS.KNOWLEDGE_SETTINGS);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<KnowledgeGlobalSettings>;
    return {
      defaultKnowledgeMode:
        parsed.defaultKnowledgeMode ?? DEFAULT_SETTINGS.defaultKnowledgeMode,
      tavilyApiKey:
        typeof parsed.tavilyApiKey === "string"
          ? parsed.tavilyApiKey
          : undefined,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setKnowledgeGlobalSettings(
  partial: Partial<KnowledgeGlobalSettings>
): void {
  const cur = getKnowledgeGlobalSettings();
  const next: KnowledgeGlobalSettings = {
    defaultKnowledgeMode:
      partial.defaultKnowledgeMode ?? cur.defaultKnowledgeMode,
    tavilyApiKey: partial.tavilyApiKey ?? cur.tavilyApiKey,
  };
  safeLocalStorage.setItem(
    STORAGE_KEYS.KNOWLEDGE_SETTINGS,
    JSON.stringify(next)
  );
}

export function resolveEffectiveKnowledgeMode(
  conversationMode: GlobalKnowledgeMode | "inherit" | undefined,
  globalDefault: GlobalKnowledgeMode
): GlobalKnowledgeMode | "off" {
  if (!conversationMode || conversationMode === "inherit") {
    return globalDefault;
  }
  return conversationMode;
}
