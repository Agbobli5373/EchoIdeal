import type { Meeting, MeetingType, TranscriptSegment } from "../database/meetings.action";

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  interview: "Interview",
  assessment: "Assessment",
  general: "Meeting",
};

// Transcript rows store the neutral speakers "You" / "Them" ("Them 2" for a Voice);
// Interviews show them as roles.
export function speakerLabel(speaker: string, type: MeetingType): string {
  if (type !== "interview") return speaker;
  if (speaker === "You") return "Candidate";
  if (speaker === "Them") return "Interviewer";
  const voice = speaker.match(/^Them (\d+)$/);
  if (voice) return `Interviewer ${voice[1]}`;
  return speaker;
}

type Line = Pick<TranscriptSegment, "speaker" | "voice">;

// Whether more than one Voice has spoken on the other side.
export function hasSeveralVoices(segments: Line[]): boolean {
  const voices = new Set(
    segments.filter((s) => s.speaker === "Them" && s.voice !== null).map((s) => s.voice)
  );
  return voices.size > 1;
}

// Who a line is shown as: "Them 2" once the other side has more than one Voice.
export function speakerKey(segment: Line, severalVoices: boolean): string {
  return segment.speaker === "Them" && segment.voice !== null && severalVoices
    ? `Them ${segment.voice}`
    : segment.speaker;
}

// What a line's speaker is renamed under: each Voice has its own name ("Them 1"), even
// while it's the only one, so the name stays with that person when another speaks.
export function nameKey(segment: Line): string {
  return segment.speaker === "Them" && segment.voice !== null
    ? `Them ${segment.voice}`
    : segment.speaker;
}

// The name the Candidate gave a speaker, if any.
export function speakerName(
  key: string,
  names: Record<string, string> | null | undefined,
  type: MeetingType
): string | null {
  const name = names?.[key]?.trim();
  return name && name !== key && name !== speakerLabel(key, type) ? name : null;
}

// The other side's speaker as the AI sees them: the role, and any name the Candidate gave.
export function namedSpeaker(
  segment: Line,
  severalVoices: boolean,
  meeting: Pick<Meeting, "type" | "speakerNames">
): string {
  const role = speakerLabel(speakerKey(segment, severalVoices), meeting.type);
  const name = speakerName(nameKey(segment), meeting.speakerNames, meeting.type);
  return name ? `${role} (${name})` : role;
}

export function meetingInstruction(type: MeetingType): string {
  if (type === "interview") {
    return "Context: the user is the Candidate in a live job interview and the other speaker is the Interviewer. Write each Suggested Answer as what the Candidate could say out loud, in the first person, concise and natural.";
  }
  if (type === "assessment") {
    return "Context: the user is taking a screen-based assessment (for example a coding test). Give a solution they can submit: working code or a direct answer, with only a brief explanation.";
  }
  return "";
}

export function withMeetingInstruction(
  systemPrompt: string | undefined,
  meeting: Pick<Meeting, "type"> | null
): string | undefined {
  const instruction = meeting ? meetingInstruction(meeting.type) : "";
  if (!instruction) return systemPrompt;
  return systemPrompt ? `${systemPrompt}\n\n${instruction}` : instruction;
}
