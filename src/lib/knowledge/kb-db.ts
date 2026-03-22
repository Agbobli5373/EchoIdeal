import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/lib/database/config";
import type { KbIndexedFile, KbRootRow, KbSearchHit } from "./types";

export async function indexKbFolder(
  path: string,
  label?: string
): Promise<number> {
  const indexed = await invoke<KbIndexedFile[]>("kb_scan_folder", { root: path });
  const db = await getDatabase();
  const now = Date.now();
  const lbl = label?.trim() || null;

  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM kb_roots WHERE path = ?",
    [path]
  );

  let rootId: number;
  if (existing.length > 0) {
    rootId = existing[0].id;
    await db.execute("DELETE FROM kb_chunks WHERE root_id = ?", [rootId]);
    await db.execute(
      "UPDATE kb_roots SET label = ?, indexed_at = ? WHERE id = ?",
      [lbl, now, rootId]
    );
  } else {
    await db.execute(
      "INSERT INTO kb_roots (path, label, indexed_at) VALUES (?, ?, ?)",
      [path, lbl, now]
    );
    const row = await db.select<{ id: number }[]>(
      "SELECT id FROM kb_roots WHERE path = ?",
      [path]
    );
    rootId = row[0]?.id ?? 0;
    if (!rootId) throw new Error("Failed to create knowledge root");
  }

  for (const file of indexed) {
    for (let i = 0; i < file.chunks.length; i++) {
      await db.execute(
        "INSERT INTO kb_chunks (root_id, file_path, chunk_index, text) VALUES (?, ?, ?, ?)",
        [rootId, file.relative_path, i, file.chunks[i]]
      );
    }
  }

  await db.execute("UPDATE kb_roots SET indexed_at = ? WHERE id = ?", [
    now,
    rootId,
  ]);
  return rootId;
}

export async function listKbRoots(): Promise<KbRootRow[]> {
  const db = await getDatabase();
  return db.select(
    "SELECT id, path, label, indexed_at FROM kb_roots ORDER BY id ASC"
  );
}

export async function removeKbRoot(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM kb_roots WHERE id = ?", [id]);
}

function ftsQueryFromUser(q: string): string | null {
  const parts = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2)
    .map((w) => `"${w.replace(/"/g, "")}"`);
  if (parts.length === 0) return null;
  return parts.join(" AND ");
}

export async function searchKb(
  query: string,
  limit = 12
): Promise<KbSearchHit[]> {
  const fts = ftsQueryFromUser(query);
  if (!fts) return [];
  const db = await getDatabase();
  const lim = Math.min(Math.max(limit, 1), 32);
  try {
    return await db.select<KbSearchHit[]>(
      `SELECT c.file_path AS file_path, c.text AS text
       FROM kb_chunks_fts AS fts
       JOIN kb_chunks AS c ON c.id = fts.rowid
       WHERE fts MATCH ?
       LIMIT ?`,
      [fts, lim]
    );
  } catch {
    return [];
  }
}
