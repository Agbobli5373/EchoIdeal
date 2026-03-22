import { getDatabase } from "./config";

export type TriggerMatchType = "keyword" | "regex";

export interface CopilotTrigger {
  id: string;
  meetingId: string | null;
  name: string;
  matchType: TriggerMatchType;
  pattern: string;
  cooldownSec: number;
  promptTemplate: string;
  enabled: boolean;
  createdAt: number;
}

interface DbTrigger {
  id: string;
  meeting_id: string | null;
  name: string;
  match_type: string;
  pattern: string;
  cooldown_sec: number;
  prompt_template: string;
  enabled: number;
  created_at: number;
}

function mapRow(row: DbTrigger): CopilotTrigger {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    name: row.name,
    matchType: row.match_type === "regex" ? "regex" : "keyword",
    pattern: row.pattern,
    cooldownSec: row.cooldown_sec,
    promptTemplate: row.prompt_template,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

export async function listTriggersForMeeting(
  meetingId: string
): Promise<CopilotTrigger[]> {
  const db = await getDatabase();
  const rows = await db.select<DbTrigger[]>(
    `SELECT * FROM copilot_triggers WHERE meeting_id IS NULL OR meeting_id = ? ORDER BY created_at ASC`,
    [meetingId]
  );
  return rows.map(mapRow);
}

export async function createCopilotTrigger(row: {
  id: string;
  meetingId: string | null;
  name: string;
  matchType: TriggerMatchType;
  pattern: string;
  cooldownSec: number;
  promptTemplate: string;
  enabled?: boolean;
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO copilot_triggers (id, meeting_id, name, match_type, pattern, cooldown_sec, prompt_template, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.meetingId,
      row.name,
      row.matchType,
      row.pattern,
      row.cooldownSec,
      row.promptTemplate,
      row.enabled === false ? 0 : 1,
      now,
    ]
  );
}

export async function updateCopilotTrigger(
  id: string,
  patch: Partial<
    Pick<
      CopilotTrigger,
      | "name"
      | "matchType"
      | "pattern"
      | "cooldownSec"
      | "promptTemplate"
      | "enabled"
    >
  >
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    fields.push("name = ?");
    values.push(patch.name);
  }
  if (patch.matchType !== undefined) {
    fields.push("match_type = ?");
    values.push(patch.matchType);
  }
  if (patch.pattern !== undefined) {
    fields.push("pattern = ?");
    values.push(patch.pattern);
  }
  if (patch.cooldownSec !== undefined) {
    fields.push("cooldown_sec = ?");
    values.push(patch.cooldownSec);
  }
  if (patch.promptTemplate !== undefined) {
    fields.push("prompt_template = ?");
    values.push(patch.promptTemplate);
  }
  if (patch.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(patch.enabled ? 1 : 0);
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE copilot_triggers SET ${fields.join(", ")} WHERE id = ?`,
    values as (string | number)[]
  );
}

export async function deleteCopilotTrigger(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM copilot_triggers WHERE id = ?", [id]);
}
