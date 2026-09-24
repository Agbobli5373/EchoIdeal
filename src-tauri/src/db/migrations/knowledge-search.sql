-- A Searched Document is Active Knowledge too large for the Knowledge Budget: only the
-- passages that match each question are sent. Its passages and their embeddings live here.
ALTER TABLE knowledge_documents ADD COLUMN is_searched INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS knowledge_passages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    content TEXT NOT NULL,
    -- Unit-length float32 vector, little-endian, base64-encoded.
    embedding TEXT NOT NULL,
    -- "<provider>:<model>"; passages embedded with another model can't be compared.
    embedding_model TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_passages_document ON knowledge_passages(document_id, position);
