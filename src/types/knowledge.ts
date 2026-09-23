export type KnowledgeSourceType = "markdown" | "text" | "pdf" | "image" | "paste";

export interface KnowledgeDocument {
  id: number;
  name: string;
  source_type: KnowledgeSourceType;
  content: string;
  is_active: boolean;
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
