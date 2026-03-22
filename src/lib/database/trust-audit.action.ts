import { getDatabase } from "./config";

export async function insertAssistantMessageAudit(row: {
  id: string;
  conversationId?: string | null;
  messageId?: string | null;
  meetingId?: string | null;
  modelId?: string | null;
  mode?: string | null;
  sources: string[];
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO assistant_message_audit (id, conversation_id, message_id, meeting_id, model_id, mode, sources_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.conversationId ?? null,
      row.messageId ?? null,
      row.meetingId ?? null,
      row.modelId ?? null,
      row.mode ?? null,
      JSON.stringify(row.sources),
      now,
    ]
  );
}
