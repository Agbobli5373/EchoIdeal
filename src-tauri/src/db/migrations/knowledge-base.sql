-- Per-conversation knowledge retrieval mode (inherit = use global default from app settings)
ALTER TABLE conversations ADD COLUMN knowledge_mode TEXT NOT NULL DEFAULT 'inherit';

-- Optional: sources used for last assistant reply (JSON array of strings)
ALTER TABLE messages ADD COLUMN knowledge_sources TEXT;

-- Local knowledge roots (folder paths chosen by user)
CREATE TABLE IF NOT EXISTS kb_roots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    label TEXT,
    indexed_at INTEGER
);

-- Chunked document text for FTS
CREATE TABLE IF NOT EXISTS kb_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (root_id) REFERENCES kb_roots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_root ON kb_chunks(root_id);

CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
    text,
    content='kb_chunks',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS kb_chunks_ai AFTER INSERT ON kb_chunks BEGIN
    INSERT INTO kb_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS kb_chunks_ad AFTER DELETE ON kb_chunks BEGIN
    INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS kb_chunks_au AFTER UPDATE ON kb_chunks BEGIN
    INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO kb_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
