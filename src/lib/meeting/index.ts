import { useSyncExternalStore } from "react";
import type { Meeting, MeetingType, TranscriptSegment } from "../database/meetings.action";
import {
  getSegmentsByMeetingId,
  updateMeetingSummary,
} from "../database/meetings.action";
import { fetchAIResponse } from "../functions/ai-response.function";
import type { TYPE_PROVIDER } from "@/types";
import { speakerLabel } from "./meeting-type";

export * from "./meeting-type";
export * from "./answer";
export * from "./memory";
export * from "./recap";
export * from "./echo";

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
    applyResponseLength: false,
  })) {
    summary += chunk;
  }
  if (summary) await updateMeetingSummary(params.meeting.id, summary);
  return summary || null;
}
