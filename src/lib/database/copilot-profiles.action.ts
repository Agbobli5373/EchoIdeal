import { getDatabase } from "./config";
import type { ConversationKnowledgeMode } from "@/types/completion";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";

export interface CopilotProfile {
  id: string;
  label: string;
  systemPrompt: string;
  /** null = inherit app default knowledge mode */
  knowledgeMode: ConversationKnowledgeMode | null;
  responseSettingsJson: string | null;
  quickActionsJson: string;
  strictKb: boolean;
  sortOrder: number;
  createdAt: number;
}

interface DbProfile {
  id: string;
  label: string;
  system_prompt: string;
  knowledge_mode: string | null;
  response_settings_json: string | null;
  quick_actions_json: string;
  strict_kb: number;
  sort_order: number;
  created_at: number;
}

function rowKnowledgeMode(
  raw: string | null | undefined
): ConversationKnowledgeMode | null {
  if (raw == null || raw === "") return null;
  if (
    raw === "inherit" ||
    raw === "off" ||
    raw === "local" ||
    raw === "web" ||
    raw === "local_web"
  ) {
    return raw;
  }
  return null;
}

function mapRow(row: DbProfile): CopilotProfile {
  return {
    id: row.id,
    label: row.label,
    systemPrompt: row.system_prompt ?? "",
    knowledgeMode: rowKnowledgeMode(row.knowledge_mode),
    responseSettingsJson: row.response_settings_json,
    quickActionsJson: row.quick_actions_json || "[]",
    strictKb: row.strict_kb === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

const DEFAULT_PROFILE_SEED: Omit<CopilotProfile, "createdAt">[] = [
  {
    id: "copilot-profile-interview",
    label: "Interview",
    systemPrompt:
      "You are helping the user in a job interview. Be concise, professional, and suggest clear talking points.",
    knowledgeMode: null,
    responseSettingsJson: null,
    quickActionsJson: JSON.stringify([
      { label: "STAR answer", prompt: "Draft a short STAR-style answer for the last question implied in the transcript." },
      { label: "Clarify", prompt: "Suggest one clarifying question the candidate could ask." },
    ]),
    strictKb: false,
    sortOrder: 0,
  },
  {
    id: "copilot-profile-sales",
    label: "Sales",
    systemPrompt:
      "You are a sales copilot. Focus on discovery questions, objection handling, and next-step suggestions.",
    knowledgeMode: null,
    responseSettingsJson: null,
    quickActionsJson: JSON.stringify([
      { label: "Objection", prompt: "Suggest how to handle the objection implied in the last exchange." },
    ]),
    strictKb: false,
    sortOrder: 1,
  },
  {
    id: "copilot-profile-debug",
    label: "Debug",
    systemPrompt:
      "You are a technical debugging assistant. Prefer precise terminology and reproducible steps.",
    knowledgeMode: "local",
    responseSettingsJson: null,
    quickActionsJson: JSON.stringify([
      { label: "Hypothesis", prompt: "List 2–3 likely root causes from the transcript context." },
    ]),
    strictKb: false,
    sortOrder: 2,
  },
];

export async function ensureDefaultCopilotProfiles(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM copilot_profiles"
  );
  const count = rows[0]?.c ?? 0;
  if (count > 0) return;

  const now = Date.now();
  for (const p of DEFAULT_PROFILE_SEED) {
    await db.execute(
      `INSERT INTO copilot_profiles (id, label, system_prompt, knowledge_mode, response_settings_json, quick_actions_json, strict_kb, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.label,
        p.systemPrompt,
        p.knowledgeMode,
        p.responseSettingsJson,
        p.quickActionsJson,
        p.strictKb ? 1 : 0,
        p.sortOrder,
        now,
      ]
    );
  }
}

export async function listCopilotProfiles(): Promise<CopilotProfile[]> {
  await ensureDefaultCopilotProfiles();
  const db = await getDatabase();
  const rows = await db.select<DbProfile[]>(
    "SELECT * FROM copilot_profiles ORDER BY sort_order ASC, label ASC"
  );
  return rows.map(mapRow);
}

export function getActiveCopilotProfileId(): string | null {
  return safeLocalStorage.getItem(STORAGE_KEYS.ACTIVE_COPILOT_PROFILE_ID);
}

export function setActiveCopilotProfileId(id: string | null): void {
  if (id) {
    safeLocalStorage.setItem(STORAGE_KEYS.ACTIVE_COPILOT_PROFILE_ID, id);
  } else {
    safeLocalStorage.removeItem(STORAGE_KEYS.ACTIVE_COPILOT_PROFILE_ID);
  }
}
