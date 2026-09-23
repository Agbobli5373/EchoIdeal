CREATE TABLE IF NOT EXISTS knowledge_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('markdown', 'text', 'pdf', 'image', 'paste')),
    content TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_active ON knowledge_documents(is_active);

CREATE TRIGGER IF NOT EXISTS update_knowledge_documents_timestamp
AFTER UPDATE ON knowledge_documents
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE knowledge_documents
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
END;
