export type KnowledgeSourceType = "markdown" | "text" | "pdf" | "image" | "paste";

export interface KnowledgeDocument {
  id: number;
  name: string;
  source_type: KnowledgeSourceType;
  content: string;
  is_active: boolean;
  // A Searched Document: active, but too large for the Knowledge Budget, so only the
  // passages matching each question are sent.
  is_searched: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocumentInput {
  name: string;
  source_type: KnowledgeSourceType;
  content: string;
}

export interface UpdateKnowledgeDocumentInput {
  name?: string;
  content?: string;
  source_type?: KnowledgeSourceType;
}

export type KnowledgeMode = "answer" | "background" | "none";

/** Passages sent from a Searched Document for one question, in document order. */
export interface KnowledgeExcerpt {
  name: string;
  passages: string[];
}
