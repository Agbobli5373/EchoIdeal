import { getDatabase } from "./config";

export type MeetingType = "interview" | "assessment" | "general";

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  rememberAnswers: boolean;
  startedAt: number;
  endedAt: number | null;
  status: "active" | "ended" | "archived";
  summary: string | null;
  createdAt: number;
  updatedAt: number;
}

export type MeetingEntryKind =
  | "suggested_answer"
  | "private_request"
  | "screen_capture";

export interface MeetingEntry {
  id: string;
  meetingId: string;
  kind: MeetingEntryKind;
  prompt: string;
  content: string;
  images: string[];
  segmentId: string | null;
  timeMs: number;
  createdAt: number;
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
  type: string;
  remember_answers: number;
  started_at: number;
  ended_at: number | null;
  status: string;
  summary: string | null;
  created_at: number;
  updated_at: number;
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

interface DbMeetingEntry {
  id: string;
  meeting_id: string;
  kind: string;
  prompt: string;
  content: string;
  images: string | null;
  segment_id: string | null;
  time_ms: number;
  created_at: number;
}

function mapDbMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
    title: row.title,
    type: row.type as MeetingType,
    rememberAnswers: row.remember_answers === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status as Meeting["status"],
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  type?: MeetingType;
  rememberAnswers?: boolean;
}): Promise<Meeting> {
  const db = await getDatabase();
  const now = Date.now();
  const title = meeting.title || "Untitled Meeting";
  const type = meeting.type ?? "general";
  const rememberAnswers = meeting.rememberAnswers ?? true;

  await db.execute(
    "INSERT INTO meetings (id, title, type, remember_answers, started_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    [meeting.id, title, type, rememberAnswers ? 1 : 0, now, now, now]
  );

  return {
    id: meeting.id,
    title,
    type,
    rememberAnswers,
    startedAt: now,
    endedAt: null,
    status: "active",
    summary: null,
    createdAt: now,
    updatedAt: now,
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
  await db.execute("DELETE FROM meeting_entries");
  await db.execute("DELETE FROM transcript_segments");
  await db.execute("DELETE FROM meetings");
}

export async function addMeetingEntry(
  entry: Omit<MeetingEntry, "id" | "createdAt">
): Promise<MeetingEntry> {
  const db = await getDatabase();
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 11)}`;
  await db.execute(
    "INSERT INTO meeting_entries (id, meeting_id, kind, prompt, content, images, segment_id, time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      entry.meetingId,
      entry.kind,
      entry.prompt,
      entry.content,
      entry.images.length > 0 ? JSON.stringify(entry.images) : null,
      entry.segmentId,
      entry.timeMs,
      now,
    ]
  );
  await db.execute("UPDATE meetings SET updated_at = ? WHERE id = ?", [
    now,
    entry.meetingId,
  ]);
  return { ...entry, id, createdAt: now };
}

export async function getMeetingEntries(
  meetingId: string
): Promise<MeetingEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<DbMeetingEntry[]>(
    "SELECT * FROM meeting_entries WHERE meeting_id = ? ORDER BY time_ms ASC, created_at ASC",
    [meetingId]
  );
  return rows.map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    kind: row.kind as MeetingEntryKind,
    prompt: row.prompt,
    content: row.content,
    images: row.images ? JSON.parse(row.images) : [],
    segmentId: row.segment_id,
    timeMs: row.time_ms,
    createdAt: row.created_at,
  }));
}
