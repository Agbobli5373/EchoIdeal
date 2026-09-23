import type { Meeting, MeetingType } from "../database/meetings.action";

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  interview: "Interview",
  assessment: "Assessment",
  general: "Meeting",
};

// Transcript rows store the neutral speakers "You" / "Them"; Interviews show them as roles.
export function speakerLabel(speaker: string, type: MeetingType): string {
  if (type !== "interview") return speaker;
  if (speaker === "You") return "Candidate";
  if (speaker === "Them") return "Interviewer";
  return speaker;
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
