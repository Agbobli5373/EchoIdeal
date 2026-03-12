-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Meeting',
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended', 'archived')),
    summary TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Create transcript segments table
CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    speaker TEXT NOT NULL DEFAULT 'Unknown',
    content TEXT NOT NULL,
    start_time_ms INTEGER NOT NULL,
    end_time_ms INTEGER,
    confidence REAL,
    is_final INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_updated_at ON meetings(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_segments_time ON transcript_segments(meeting_id, start_time_ms ASC);
CREATE INDEX IF NOT EXISTS idx_segments_speaker ON transcript_segments(meeting_id, speaker);

-- Trigger to update meetings.updated_at when segments are added
CREATE TRIGGER IF NOT EXISTS update_meeting_timestamp_on_segment_insert
AFTER INSERT ON transcript_segments
FOR EACH ROW
BEGIN
    UPDATE meetings
    SET updated_at = NEW.created_at
    WHERE id = NEW.meeting_id;
END;
