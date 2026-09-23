ALTER TABLE meetings ADD COLUMN type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('interview', 'assessment', 'general'));
ALTER TABLE meetings ADD COLUMN remember_answers INTEGER NOT NULL DEFAULT 1;

-- Suggested Answers, Private Requests and Screen Captures made during a Meeting.
CREATE TABLE IF NOT EXISTS meeting_entries (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('suggested_answer', 'private_request', 'screen_capture')),
    prompt TEXT NOT NULL,
    content TEXT NOT NULL,
    images TEXT,
    segment_id TEXT,
    time_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_entries_meeting ON meeting_entries(meeting_id, time_ms ASC);
