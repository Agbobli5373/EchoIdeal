-- Speaker display names chosen in the review view, as JSON keyed by the stored speaker.
ALTER TABLE meetings ADD COLUMN speaker_names TEXT;
