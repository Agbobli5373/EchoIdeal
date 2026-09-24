import { getDatabase } from "./config";
import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "../storage/helper";
import {
  activeKnowledgeTokens,
  getKnowledgeBudget,
  KnowledgeBudgetError,
} from "../knowledge/budget";
import type {
  KnowledgeDocument,
  KnowledgeDocumentInput,
  UpdateKnowledgeDocumentInput,
} from "@/types";

type KnowledgeRow = Omit<KnowledgeDocument, "is_active" | "is_searched"> & {
  is_active: number;
  is_searched: number;
};

const toDocument = (row: KnowledgeRow): KnowledgeDocument => ({
  ...row,
  is_active: row.is_active === 1,
  is_searched: row.is_searched === 1,
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

// Throws when Active Knowledge, with document `id` switched on with `content`, would
// exceed the Knowledge Budget. `searched` checks it as a Searched Document instead.
async function assertWithinBudget(
  id: number,
  content: string,
  searched = false
): Promise<void> {
  const others = (await getActiveKnowledgeDocuments()).filter(
    (doc) => doc.id !== id
  );
  const cost = (asSearched: boolean) =>
    activeKnowledgeTokens([...others, { content, is_searched: asSearched }]);
  const required = cost(searched);
  const budget = getKnowledgeBudget();
  if (required > budget) {
    throw new KnowledgeBudgetError(
      required,
      budget,
      !searched && cost(true) <= budget
    );
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
    // A Searched Document's size doesn't count; only its passage room does.
    if (existing.is_active && !existing.is_searched) {
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
  // Passages of the old text would match questions with things it no longer says.
  if (
    input.content !== undefined &&
    input.content.trim() !== existing.content
  ) {
    await db.execute("DELETE FROM knowledge_passages WHERE document_id = ?", [
      id,
    ]);
  }
  return getDocumentOrThrow(id);
}

export async function setKnowledgeDocumentActive(
  id: number,
  isActive: boolean
): Promise<KnowledgeDocument> {
  const existing = await getDocumentOrThrow(id);
  if (isActive === existing.is_active) return existing;
  if (isActive) {
    await assertWithinBudget(id, existing.content);
  }

  // Switching on sends the document in full; switching off also ends searching it.
  const db = await getDatabase();
  await db.execute(
    "UPDATE knowledge_documents SET is_active = ?, is_searched = 0 WHERE id = ?",
    [isActive ? 1 : 0, id]
  );
  await publishActiveCount();
  return getDocumentOrThrow(id);
}

/** Throws a KnowledgeBudgetError unless document `id` fits as a Searched Document. */
export async function assertSearchFits(id: number): Promise<void> {
  const existing = await getDocumentOrThrow(id);
  await assertWithinBudget(id, existing.content, true);
}

/** Switches document `id` on as a Searched Document. Its passages must already be stored. */
export async function setKnowledgeDocumentSearched(
  id: number
): Promise<KnowledgeDocument> {
  await assertSearchFits(id);
  const db = await getDatabase();
  await db.execute(
    "UPDATE knowledge_documents SET is_active = 1, is_searched = 1 WHERE id = ?",
    [id]
  );
  await publishActiveCount();
  return getDocumentOrThrow(id);
}

export type StoredPassage = {
  position: number;
  content: string;
  /** base64 float32, see vectorToBase64. */
  embedding: string;
};

/** Replaces document `documentId`'s passages with ones embedded by `model`. */
export async function replaceKnowledgePassages(
  documentId: number,
  model: string,
  passages: StoredPassage[]
): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM knowledge_passages WHERE document_id = ?", [
    documentId,
  ]);
  const ROWS_PER_INSERT = 50;
  for (let start = 0; start < passages.length; start += ROWS_PER_INSERT) {
    const rows = passages.slice(start, start + ROWS_PER_INSERT);
    await db.execute(
      `INSERT INTO knowledge_passages (document_id, position, content, embedding, embedding_model) VALUES ${rows
        .map(() => "(?, ?, ?, ?, ?)")
        .join(", ")}`,
      rows.flatMap((p) => [
        documentId,
        p.position,
        p.content,
        p.embedding,
        model,
      ])
    );
  }
}

export type KnowledgeIndex = {
  document_id: number;
  embedding_model: string;
  count: number;
  last_id: number;
};

/** Every document's stored passages, per embedding model. */
export async function getKnowledgeIndexes(): Promise<KnowledgeIndex[]> {
  const db = await getDatabase();
  return db.select<KnowledgeIndex[]>(
    "SELECT document_id, embedding_model, COUNT(*) AS count, MAX(id) AS last_id FROM knowledge_passages GROUP BY document_id, embedding_model"
  );
}

export async function getKnowledgePassages(
  documentId: number,
  model: string
): Promise<StoredPassage[]> {
  const db = await getDatabase();
  return db.select<StoredPassage[]>(
    "SELECT position, content, embedding FROM knowledge_passages WHERE document_id = ? AND embedding_model = ? ORDER BY position",
    [documentId, model]
  );
}

export async function deleteKnowledgeDocument(id: number): Promise<void> {
  const db = await getDatabase();
  // A Meeting whose Recap this was no longer has one, and the passages go. The
  // foreign keys do this too, but only while SQLite enforces them.
  await db.execute(
    "UPDATE meetings SET recap_document_id = NULL WHERE recap_document_id = ?",
    [id]
  );
  await db.execute("DELETE FROM knowledge_passages WHERE document_id = ?", [
    id,
  ]);
  const result = await db.execute(
    "DELETE FROM knowledge_documents WHERE id = ?",
    [id]
  );
  if (result.rowsAffected === 0) {
    throw new Error("Knowledge document not found");
  }
  await publishActiveCount();
}
