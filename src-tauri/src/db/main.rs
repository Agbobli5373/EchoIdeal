use tauri_plugin_sql::{Migration, MigrationKind};

// tauri-plugin-sql checksums the exact SQL text, and Git may check .sql files out with CRLF
// (core.autocrlf), which makes an applied migration look "modified" and panics at startup.
// Migrations from v4 on go through this so they are identical on every platform. v1–v3 must
// stay untouched: they are already applied with each platform's checkout line endings.
fn lf(sql: &'static str) -> &'static str {
    if sql.contains('\r') {
        Box::leak(sql.replace("\r\n", "\n").into_boxed_str())
    } else {
        sql
    }
}

/// Returns all database migrations
pub fn migrations() -> Vec<Migration> {
    vec![
        // Migration 1: Create system_prompts table with indexes and triggers
        Migration {
            version: 1,
            description: "create_system_prompts_table",
            sql: include_str!("migrations/system-prompts.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 2: Create chat history tables (conversations and messages)
        Migration {
            version: 2,
            description: "create_chat_history_tables",
            sql: include_str!("migrations/chat-history.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 3: Create meetings and transcript segments tables
        Migration {
            version: 3,
            description: "create_meetings_tables",
            sql: include_str!("migrations/meetings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_knowledge_documents_table",
            sql: lf(include_str!("migrations/knowledge.sql")),
            kind: MigrationKind::Up,
        },
    ]
}
