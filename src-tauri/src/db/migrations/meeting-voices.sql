-- A Voice is one person on the other side of a Meeting, told apart by how they sound.
-- Each of the other side's lines records which Voice said it (NULL when not told apart).
ALTER TABLE transcript_segments ADD COLUMN voice INTEGER;

CREATE TABLE IF NOT EXISTS meeting_voices (
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    voice INTEGER NOT NULL,
    -- Sum of the unit-length fingerprints of the lines matched to it: float32,
    -- little-endian, base64-encoded. Its direction is the Voice's profile.
    fingerprint TEXT NOT NULL,
    lines INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (meeting_id, voice)
);
