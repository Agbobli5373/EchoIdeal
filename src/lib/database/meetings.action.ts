import { getDatabase } from "./config";
import { base64ToVector, vectorToBase64 } from "../knowledge/embeddings";

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
  // Running summary of the Meeting Memory condensed out of the Memory Budget, covering
  // everything up to memorySummaryUntilMs (time into the Meeting).
  memorySummary: string | null;
  memorySummaryUntilMs: number | null;
  // Display names chosen in the review view, keyed by the stored speaker ("You" / "Them").
  speakerNames: Record<string, string> | null;
  // The Knowledge Document this Meeting's Recap was saved as, if it still exists.
  recapDocumentId: number | null;
  createdAt: number;
  updatedAt: number;
}

export type MeetingEntryKind =
  | "suggested_answer"
  | "private_request"
  | "screen_capture";

// Entries are read without their images (base64, ~1 MB each); see getMeetingEntryImages.
export interface MeetingEntry {
  id: string;
  meetingId: string;
  kind: MeetingEntryKind;
  prompt: string;
  content: string;
  hasImages: boolean;
  // Screen Captures only: what was on screen, transcribed by the call that answered it.
  screenText: string | null;
  segmentId: string | null;
  timeMs: number;
  createdAt: number;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  speaker: string;
  // For the other side's lines: which Voice said it, when told apart.
  voice: number | null;
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
  memory_summary: string | null;
  memory_summary_until_ms: number | null;
  speaker_names: string | null;
  recap_document_id: number | null;
  created_at: number;
  updated_at: number;
}

interface DbSegment {
  id: string;
  meeting_id: string;
  speaker: string;
  voice: number | null;
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
  has_images: number;
  screen_text: string | null;
  segment_id: string | null;
  time_ms: number;
  created_at: number;
}

function mapDbEntry(row: DbMeetingEntry): MeetingEntry {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    kind: row.kind as MeetingEntryKind,
    prompt: row.prompt,
    content: row.content,
    hasImages: row.has_images === 1,
    screenText: row.screen_text,
    segmentId: row.segment_id,
    timeMs: row.time_ms,
    createdAt: row.created_at,
  };
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
    memorySummary: row.memory_summary,
    memorySummaryUntilMs: row.memory_summary_until_ms,
    speakerNames: row.speaker_names ? JSON.parse(row.speaker_names) : null,
    recapDocumentId: row.recap_document_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbSegment(row: DbSegment): TranscriptSegment {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    speaker: row.speaker,
    voice: row.voice ?? null,
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
    memorySummary: null,
    memorySummaryUntilMs: null,
    speakerNames: null,
    recapDocumentId: null,
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

export async function updateMeetingSpeakerNames(
  id: string,
  speakerNames: Record<string, string>
): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE meetings SET speaker_names = ? WHERE id = ?", [
    JSON.stringify(speakerNames),
    id,
  ]);
}

export async function updateMeetingMemorySummary(
  id: string,
  summary: string,
  untilMs: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE meetings SET memory_summary = ?, memory_summary_until_ms = ? WHERE id = ?",
    [summary, untilMs, id]
  );
}

export async function setMeetingRecapDocument(
  id: string,
  documentId: number | null
): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE meetings SET recap_document_id = ? WHERE id = ?", [
    documentId,
    id,
  ]);
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
  segment: Omit<TranscriptSegment, "createdAt" | "voice"> & { voice?: number | null }
): Promise<TranscriptSegment> {
  const db = await getDatabase();
  const now = Date.now();
  const voice = segment.voice ?? null;

  await db.execute(
    "INSERT INTO transcript_segments (id, meeting_id, speaker, voice, content, start_time_ms, end_time_ms, confidence, is_final, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      segment.id,
      segment.meetingId,
      segment.speaker,
      voice,
      segment.content,
      segment.startTimeMs,
      segment.endTimeMs,
      segment.confidence,
      segment.isFinal ? 1 : 0,
      now,
    ]
  );

  return { ...segment, voice, createdAt: now };
}

export async function setSegmentVoice(id: string, voice: number | null): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE transcript_segments SET voice = ? WHERE id = ?", [voice, id]);
}

export interface MeetingVoice {
  voice: number;
  // Sum of the fingerprints of its lines; its direction is the Voice's profile.
  fingerprint: Float32Array;
  lines: number;
}

export async function getMeetingVoices(meetingId: string): Promise<MeetingVoice[]> {
  const db = await getDatabase();
  const rows = await db.select<{ voice: number; fingerprint: string; lines: number }[]>(
    "SELECT voice, fingerprint, lines FROM meeting_voices WHERE meeting_id = ? ORDER BY voice",
    [meetingId]
  );
  return rows.map((row) => ({
    voice: row.voice,
    fingerprint: base64ToVector(row.fingerprint),
    lines: row.lines,
  }));
}

export async function saveMeetingVoice(meetingId: string, voice: MeetingVoice): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "INSERT INTO meeting_voices (meeting_id, voice, fingerprint, lines) VALUES (?, ?, ?, ?) ON CONFLICT(meeting_id, voice) DO UPDATE SET fingerprint = excluded.fingerprint, lines = excluded.lines",
    [meetingId, voice.voice, vectorToBase64(voice.fingerprint), voice.lines]
  );
}

// Folds Voice `from` into `into`: its lines, and what they sound like.
export async function mergeMeetingVoices(
  meetingId: string,
  from: number,
  into: number
): Promise<void> {
  const db = await getDatabase();
  const voices = await getMeetingVoices(meetingId);
  const source = voices.find((v) => v.voice === from);
  const target = voices.find((v) => v.voice === into);
  await db.execute(
    "UPDATE transcript_segments SET voice = ? WHERE meeting_id = ? AND voice = ?",
    [into, meetingId, from]
  );
  if (source) {
    const fingerprint = target
      ? target.fingerprint.map((x, i) => x + source.fingerprint[i])
      : source.fingerprint;
    await saveMeetingVoice(meetingId, {
      voice: into,
      fingerprint,
      lines: (target?.lines ?? 0) + source.lines,
    });
    await db.execute("DELETE FROM meeting_voices WHERE meeting_id = ? AND voice = ?", [
      meetingId,
      from,
    ]);
  }
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
  await db.execute("DELETE FROM meeting_voices");
  await db.execute("DELETE FROM transcript_segments");
  await db.execute("DELETE FROM meetings");
}

export async function addMeetingEntry(
  entry: Omit<MeetingEntry, "id" | "createdAt" | "screenText" | "hasImages"> & {
    images: string[];
    screenText?: string | null;
  }
): Promise<MeetingEntry> {
  const db = await getDatabase();
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 11)}`;
  const screenText = entry.screenText ?? null;
  await db.execute(
    "INSERT INTO meeting_entries (id, meeting_id, kind, prompt, content, images, screen_text, segment_id, time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      entry.meetingId,
      entry.kind,
      entry.prompt,
      entry.content,
      entry.images.length > 0 ? JSON.stringify(entry.images) : null,
      screenText,
      entry.segmentId,
      entry.timeMs,
      now,
    ]
  );
  await db.execute("UPDATE meetings SET updated_at = ? WHERE id = ?", [
    now,
    entry.meetingId,
  ]);
  const { images, ...rest } = entry;
  return { ...rest, hasImages: images.length > 0, screenText, id, createdAt: now };
}

export async function getMeetingEntries(
  meetingId: string
): Promise<MeetingEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<DbMeetingEntry[]>(
    "SELECT id, meeting_id, kind, prompt, content, images IS NOT NULL AS has_images, screen_text, segment_id, time_ms, created_at FROM meeting_entries WHERE meeting_id = ? ORDER BY time_ms ASC, created_at ASC",
    [meetingId]
  );
  return rows.map(mapDbEntry);
}

export async function getMeetingEntryImages(entryId: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ images: string | null }[]>(
    "SELECT images FROM meeting_entries WHERE id = ?",
    [entryId]
  );
  return rows[0]?.images ? JSON.parse(rows[0].images) : [];
}

export async function getLatestScreenCaptureImages(
  meetingId: string
): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ images: string }[]>(
    "SELECT images FROM meeting_entries WHERE meeting_id = ? AND kind = 'screen_capture' AND images IS NOT NULL ORDER BY time_ms DESC, created_at DESC LIMIT 1",
    [meetingId]
  );
  return rows.length > 0 ? JSON.parse(rows[0].images) : [];
}
