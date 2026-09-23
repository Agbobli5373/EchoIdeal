import { useSyncExternalStore } from "react";
import type { Meeting, MeetingType, TranscriptSegment } from "../database/meetings.action";
import {
  getSegmentsByMeetingId,
  updateMeetingSummary,
} from "../database/meetings.action";
import { fetchAIResponse } from "../functions/ai-response.function";
import type { TYPE_PROVIDER } from "@/types";

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

// The Meeting the overlay window is running (started or resumed there). Paused Meetings stay active.
let activeMeeting: Meeting | null = null;
const listeners = new Set<() => void>();

export const activeMeetingStore = {
  get: () => activeMeeting,
  set: (meeting: Meeting | null) => {
    activeMeeting = meeting;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useActiveMeeting(): Meeting | null {
  return useSyncExternalStore(activeMeetingStore.subscribe, activeMeetingStore.get);
}

export function buildTranscriptContext(
  segments: TranscriptSegment[],
  type: MeetingType = "general",
  maxSegments = 30
): string {
  const recent = segments.slice(-maxSegments);
  if (recent.length === 0) return "(No transcript yet)";
  return recent
    .map((s) => `[${speakerLabel(s.speaker, type)}]: ${s.content}`)
    .join("\n");
}

const SUMMARY_PROMPT =
  "You are a meeting summarizer. Return Markdown with the following sections as headings:\n\n## Overview\n## Key Topics\n## Decisions Made\n## Action Items\n## Follow-up Questions\n\nUse bullet lists where appropriate. Be concise and specific.";

export async function generateMeetingSummary(params: {
  meeting: Pick<Meeting, "id" | "type">;
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: { provider: string; variables: Record<string, string> };
}): Promise<string | null> {
  const segments = await getSegmentsByMeetingId(params.meeting.id);
  if (segments.length === 0) return null;

  const transcript = buildTranscriptContext(segments, params.meeting.type, 100);
  let summary = "";
  for await (const chunk of fetchAIResponse({
    provider: params.provider,
    selectedProvider: params.selectedProvider,
    systemPrompt: SUMMARY_PROMPT,
    userMessage: `Summarize this meeting transcript:\n\n${transcript}`,
    knowledgeMode: "background",
  })) {
    summary += chunk;
  }
  if (summary) await updateMeetingSummary(params.meeting.id, summary);
  return summary || null;
}
