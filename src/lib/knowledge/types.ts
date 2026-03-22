import type { ConversationKnowledgeMode } from "@/types/completion";

/** App-wide default (no "inherit") */
export type GlobalKnowledgeMode = "off" | "local" | "web" | "local_web";

export interface KnowledgeGlobalSettings {
  defaultKnowledgeMode: GlobalKnowledgeMode;
  tavilyApiKey?: string;
}

export type { ConversationKnowledgeMode };

export interface KbIndexedFile {
  relative_path: string;
  chunks: string[];
}

export interface KbRootRow {
  id: number;
  path: string;
  label: string | null;
  indexed_at: number | null;
}

export interface KbSearchHit {
  file_path: string;
  text: string;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
}
