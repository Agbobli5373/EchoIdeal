-- What was on screen in a Screen Capture, transcribed by the same call that answered it.
ALTER TABLE meeting_entries ADD COLUMN screen_text TEXT;

-- Meeting Memory beyond the Memory Budget, condensed into a running summary that covers
-- everything up to memory_summary_until_ms (time into the Meeting).
ALTER TABLE meetings ADD COLUMN memory_summary TEXT;
ALTER TABLE meetings ADD COLUMN memory_summary_until_ms INTEGER;
