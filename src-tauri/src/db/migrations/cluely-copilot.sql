-- Meeting playbook cache + post-call artifact
ALTER TABLE meetings ADD COLUMN last_playbook_json TEXT;
ALTER TABLE meetings ADD COLUMN playbook_updated_at INTEGER;
ALTER TABLE meetings ADD COLUMN summary_artifact_md TEXT;

-- Per-chat strict KB-only answers
ALTER TABLE conversations ADD COLUMN strict_kb INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS copilot_profiles (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    system_prompt TEXT NOT NULL DEFAULT '',
    knowledge_mode TEXT,
    response_settings_json TEXT,
    quick_actions_json TEXT NOT NULL DEFAULT '[]',
    strict_kb INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS copilot_triggers (
    id TEXT PRIMARY KEY,
    meeting_id TEXT,
    name TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('keyword', 'regex')),
    pattern TEXT NOT NULL,
    cooldown_sec INTEGER NOT NULL DEFAULT 60,
    prompt_template TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_copilot_triggers_meeting ON copilot_triggers(meeting_id);

CREATE TABLE IF NOT EXISTS assistant_message_audit (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    message_id TEXT,
    meeting_id TEXT,
    model_id TEXT,
    mode TEXT,
    sources_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_conv ON assistant_message_audit(conversation_id);
