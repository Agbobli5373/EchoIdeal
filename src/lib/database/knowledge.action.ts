import { getDatabase } from "./config";
import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "../storage/helper";
import {
  estimateTokens,
  getKnowledgeBudget,
  KnowledgeBudgetError,
} from "../knowledge/budget";
import type {
  KnowledgeDocument,
  KnowledgeDocumentInput,
  UpdateKnowledgeDocumentInput,
} from "@/types";

type KnowledgeRow = Omit<KnowledgeDocument, "is_active"> & {
  is_active: number;
};

const toDocument = (row: KnowledgeRow): KnowledgeDocument => ({
  ...row,
  is_active: row.is_active === 1,
});

// The overlay window reads this through `storage` events to show its "N active" indicator.
async function publishActiveCount(): Promise<void> {
  const active = await getActiveKnowledgeDocuments();
  safeLocalStorage.setItem(
    STORAGE_KEYS.KNOWLEDGE_ACTIVE_COUNT,
    String(active.length)
  );
}

async function getDocumentOrThrow(id: number): Promise<KnowledgeDocument> {
  const db = await getDatabase();
  const rows = await db.select<KnowledgeRow[]>(
    "SELECT * FROM knowledge_documents WHERE id = ?",
    [id]
  );
  if (!rows[0]) {
    throw new Error("Knowledge document not found");
  }
  return toDocument(rows[0]);
}

async function assertWithinBudget(
  excludeId: number,
  additionalContent: string
): Promise<void> {
  const others = (await getActiveKnowledgeDocuments()).filter(
    (doc) => doc.id !== excludeId
  );
  const required =
    others.reduce((sum, doc) => sum + estimateTokens(doc.content), 0) +
    estimateTokens(additionalContent);
  const budget = getKnowledgeBudget();
  if (required > budget) {
    throw new KnowledgeBudgetError(required, budget);
  }
}

export async function getAllKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const db = await getDatabase();
  const rows = await db.select<KnowledgeRow[]>(
    "SELECT * FROM knowledge_documents ORDER BY created_at DESC, id DESC"
  );
  return rows.map(toDocument);
}

export async function getActiveKnowledgeDocuments(): Promise<
  KnowledgeDocument[]
> {
  const db = await getDatabase();
  const rows = await db.select<KnowledgeRow[]>(
    "SELECT * FROM knowledge_documents WHERE is_active = 1 ORDER BY created_at ASC, id ASC"
  );
  return rows.map(toDocument);
}

export async function createKnowledgeDocument(
  input: KnowledgeDocumentInput
): Promise<KnowledgeDocument> {
  const name = input.name.trim();
  const content = input.content.trim();
  if (!name) throw new Error("Document name cannot be empty");
  if (!content) throw new Error("Document text cannot be empty");

  const db = await getDatabase();
  const result = await db.execute(
    "INSERT INTO knowledge_documents (name, source_type, content, is_active) VALUES (?, ?, ?, 0)",
    [name, input.source_type, content]
  );
  if (result.lastInsertId === undefined) {
    throw new Error("Failed to create knowledge document");
  }
  return getDocumentOrThrow(result.lastInsertId);
}

export async function updateKnowledgeDocument(
  id: number,
  input: UpdateKnowledgeDocumentInput
): Promise<KnowledgeDocument> {
  const existing = await getDocumentOrThrow(id);
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Document name cannot be empty");
    updates.push("name = ?");
    values.push(name);
  }

  if (input.content !== undefined) {
    const content = input.content.trim();
    if (!content) throw new Error("Document text cannot be empty");
    if (existing.is_active) {
      await assertWithinBudget(id, content);
    }
    updates.push("content = ?");
    values.push(content);
  }

  if (input.source_type !== undefined) {
    updates.push("source_type = ?");
    values.push(input.source_type);
  }

  if (updates.length === 0) return existing;

  const db = await getDatabase();
  values.push(id);
  await db.execute(
    `UPDATE knowledge_documents SET ${updates.join(", ")} WHERE id = ?`,
    values
  );
  return getDocumentOrThrow(id);
}

export async function setKnowledgeDocumentActive(
  id: number,
  isActive: boolean
): Promise<KnowledgeDocument> {
  const existing = await getDocumentOrThrow(id);
  if (isActive && !existing.is_active) {
    await assertWithinBudget(id, existing.content);
  }

  const db = await getDatabase();
  await db.execute(
    "UPDATE knowledge_documents SET is_active = ? WHERE id = ?",
    [isActive ? 1 : 0, id]
  );
  await publishActiveCount();
  return getDocumentOrThrow(id);
}

export async function deleteKnowledgeDocument(id: number): Promise<void> {
  const db = await getDatabase();
  const result = await db.execute(
    "DELETE FROM knowledge_documents WHERE id = ?",
    [id]
  );
  if (result.rowsAffected === 0) {
    throw new Error("Knowledge document not found");
  }
  await publishActiveCount();
}
