import { getDatabase } from "./config";

export interface Meeting {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  status: "active" | "ended" | "archived";
  summary: string | null;
  createdAt: number;
  updatedAt: number;
  lastPlaybookJson: string | null;
  playbookUpdatedAt: number | null;
  summaryArtifactMd: string | null;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  speaker: string;
  content: string;
  startTimeMs: number;
  endTimeMs: number | null;
  confidence: number | null;
  isFinal: boolean;
  createdAt: number;
}

interface DbMeeting {
  id: string;
  title: string;
  started_at: number;
  ended_at: number | null;
  status: string;
  summary: string | null;
  created_at: number;
  updated_at: number;
  last_playbook_json?: string | null;
  playbook_updated_at?: number | null;
  summary_artifact_md?: string | null;
}

interface DbSegment {
  id: string;
  meeting_id: string;
  speaker: string;
  content: string;
  start_time_ms: number;
  end_time_ms: number | null;
  confidence: number | null;
  is_final: number;
  created_at: number;
}

function mapDbMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status as Meeting["status"],
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastPlaybookJson: row.last_playbook_json ?? null,
    playbookUpdatedAt: row.playbook_updated_at ?? null,
    summaryArtifactMd: row.summary_artifact_md ?? null,
  };
}

function mapDbSegment(row: DbSegment): TranscriptSegment {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    speaker: row.speaker,
    content: row.content,
    startTimeMs: row.start_time_ms,
    endTimeMs: row.end_time_ms,
    confidence: row.confidence,
    isFinal: row.is_final === 1,
    createdAt: row.created_at,
  };
}

export async function createMeeting(meeting: {
  id: string;
  title?: string;
}): Promise<Meeting> {
  const db = await getDatabase();
  const now = Date.now();
  const title = meeting.title || "Untitled Meeting";

  await db.execute(
    "INSERT INTO meetings (id, title, started_at, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
    [meeting.id, title, now, now, now]
  );

  return {
    id: meeting.id,
    title,
    startedAt: now,
    endedAt: null,
    status: "active",
    summary: null,
    createdAt: now,
    updatedAt: now,
    lastPlaybookJson: null,
    playbookUpdatedAt: null,
    summaryArtifactMd: null,
  };
}

export async function endMeeting(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    "UPDATE meetings SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id]
  );
}

export async function updateMeetingTitle(
  id: string,
  title: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE meetings SET title = ?, updated_at = ? WHERE id = ?",
    [title, Date.now(), id]
  );
}

export async function updateMeetingSummary(
  id: string,
  summary: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE meetings SET summary = ?, updated_at = ? WHERE id = ?",
    [summary, Date.now(), id]
  );
}

export async function updateMeetingPlaybook(
  id: string,
  playbookJson: string
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    "UPDATE meetings SET last_playbook_json = ?, playbook_updated_at = ?, updated_at = ? WHERE id = ?",
    [playbookJson, now, now, id]
  );
}

export async function updateMeetingSummaryArtifact(
  id: string,
  markdown: string
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    "UPDATE meetings SET summary_artifact_md = ?, updated_at = ? WHERE id = ?",
    [markdown, now, id]
  );
}

export async function getAllMeetings(): Promise<Meeting[]> {
  const db = await getDatabase();
  const rows = await db.select<DbMeeting[]>(
    "SELECT * FROM meetings ORDER BY updated_at DESC"
  );
  return rows.map(mapDbMeeting);
}

export async function getMeetingById(id: string): Promise<Meeting | null> {
  const db = await getDatabase();
  const rows = await db.select<DbMeeting[]>(
    "SELECT * FROM meetings WHERE id = ?",
    [id]
  );
  return rows.length > 0 ? mapDbMeeting(rows[0]) : null;
}

export async function getActiveMeeting(): Promise<Meeting | null> {
  const db = await getDatabase();
  const rows = await db.select<DbMeeting[]>(
    "SELECT * FROM meetings WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
  );
  return rows.length > 0 ? mapDbMeeting(rows[0]) : null;
}

export async function deleteMeeting(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute("DELETE FROM meetings WHERE id = ?", [id]);
  return result.rowsAffected > 0;
}

export async function addTranscriptSegment(
  segment: Omit<TranscriptSegment, "createdAt">
): Promise<TranscriptSegment> {
  const db = await getDatabase();
  const now = Date.now();

  await db.execute(
    "INSERT INTO transcript_segments (id, meeting_id, speaker, content, start_time_ms, end_time_ms, confidence, is_final, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      segment.id,
      segment.meetingId,
      segment.speaker,
      segment.content,
      segment.startTimeMs,
      segment.endTimeMs,
      segment.confidence,
      segment.isFinal ? 1 : 0,
      now,
    ]
  );

  return { ...segment, createdAt: now };
}

export async function getSegmentsByMeetingId(
  meetingId: string
): Promise<TranscriptSegment[]> {
  const db = await getDatabase();
  const rows = await db.select<DbSegment[]>(
    "SELECT * FROM transcript_segments WHERE meeting_id = ? ORDER BY start_time_ms ASC",
    [meetingId]
  );
  return rows.map(mapDbSegment);
}

export async function updateSegmentContent(
  id: string,
  content: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE transcript_segments SET content = ?, is_final = 1 WHERE id = ?",
    [content, id]
  );
}

export async function deleteAllMeetings(): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM transcript_segments");
  await db.execute("DELETE FROM meetings");
}
