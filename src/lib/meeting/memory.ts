import type {
  Meeting,
  MeetingEntry,
  MeetingType,
  TranscriptSegment,
} from "../database/meetings.action";
import {
  getLatestScreenCaptureImages,
  getMeetingById,
  getMeetingEntries,
  getSegmentsByMeetingId,
  updateMeetingMemorySummary,
} from "../database/meetings.action";
import { getActiveKnowledgeDocuments } from "../database/knowledge.action";
import { estimateTokens } from "../knowledge/budget";
import {
  fetchAIResponse,
  isAIErrorText,
} from "../functions/ai-response.function";
import type { TYPE_PROVIDER } from "@/types";
import { cleanAnswer, DISCREPANCY_OPEN, SCREEN_CLOSE, SCREEN_OPEN } from "./answer";
import {
  MEETING_TYPE_LABELS,
  hasSeveralVoices,
  namedSpeaker,
  speakerLabel,
  withMeetingInstruction,
} from "./meeting-type";

// Meeting Memory kept word for word; older exchanges are condensed into a running summary.
export const MEMORY_BUDGET_TOKENS = 6000;
const SUMMARY_MAX_WORDS = 600;

export interface MemoryAI {
  // undefined when the hosted EchoIdeal API answers.
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: { provider: string; variables: Record<string, string> };
}

export interface MemoryItem {
  // other: the Interviewer / Them · self: a Spoken Answer · suggested: a Suggested Answer
  // standing in for a reply that wasn't captured · screen: a Screen Capture.
  kind: "other" | "self" | "suggested" | "screen";
  timeMs: number;
  // For a Screen Capture: the transcription of what was on screen.
  text: string;
  // For a Screen Capture: the Suggested Answer given for it.
  answer?: string;
  // For the other side: who said it ("Interviewer 2 (Sarah)"), when not just the role.
  speaker?: string;
}

// Chronological memory from the transcript and the stored entries (Private Requests are never
// read). The Interviewer's lines that are followed by a Spoken Answer drop their Suggested
// Answers; the others keep them as stand-ins (mic off, nothing said, or an Assessment).
export function buildMemoryItems(
  segments: TranscriptSegment[],
  entries: MeetingEntry[],
  excludeSegmentId?: string | null,
  meeting?: Pick<Meeting, "type" | "speakerNames">
): MemoryItem[] {
  const several = hasSeveralVoices(segments);
  const speakerOf = (segment: TranscriptSegment) =>
    meeting ? namedSpeaker(segment, several, meeting) : undefined;
  const suggestedBySegment = new Map<string, string>();
  const timeline: (
    | { timeMs: number; segment: TranscriptSegment }
    | { timeMs: number; capture: MeetingEntry }
  )[] = [];

  for (const entry of entries) {
    if (entry.kind === "suggested_answer" && entry.segmentId) {
      suggestedBySegment.set(entry.segmentId, cleanAnswer(entry.content));
    } else if (entry.kind === "screen_capture") {
      timeline.push({ timeMs: entry.timeMs, capture: entry });
    }
  }
  for (const segment of segments) {
    if (segment.id === excludeSegmentId || !segment.content.trim()) continue;
    timeline.push({ timeMs: segment.startTimeMs, segment });
  }
  timeline.sort((a, b) => a.timeMs - b.timeMs);

  const items: MemoryItem[] = [];
  let unanswered: { question: MemoryItem; standIn: MemoryItem | null }[] = [];
  const closeRun = (answeredOutLoud: boolean) => {
    for (const { question, standIn } of unanswered) {
      items.push(question);
      if (!answeredOutLoud && standIn) items.push(standIn);
    }
    unanswered = [];
  };

  for (const event of timeline) {
    if ("capture" in event) {
      closeRun(false);
      items.push({
        kind: "screen",
        timeMs: event.timeMs,
        text: event.capture.screenText ?? "",
        answer: cleanAnswer(event.capture.content),
      });
    } else if (event.segment.speaker === "Them") {
      const suggested = suggestedBySegment.get(event.segment.id);
      unanswered.push({
        question: {
          kind: "other",
          timeMs: event.timeMs,
          text: event.segment.content.trim(),
          speaker: speakerOf(event.segment),
        },
        standIn: suggested
          ? { kind: "suggested", timeMs: event.timeMs, text: suggested }
          : null,
      });
    } else {
      closeRun(true);
      items.push({ kind: "self", timeMs: event.timeMs, text: event.segment.content.trim() });
    }
  }
  closeRun(false);
  return items;
}

function roles(type: MeetingType) {
  return {
    self: speakerLabel("You", type),
    other: speakerLabel("Them", type),
    selfNoun: type === "general" ? "the user" : "the Candidate",
  };
}

function renderItem(item: MemoryItem, type: MeetingType): string {
  const { self, other } = roles(type);
  switch (item.kind) {
    case "other":
      return `${item.speaker ?? other}: ${item.text}`;
    case "self":
      return `${self}: ${item.text}`;
    case "suggested":
      return `Suggested Answer: ${item.text}`;
    case "screen":
      return `Screen Capture:\n<screen>\n${item.text || "(not transcribed)"}\n</screen>\nSuggested Answer: ${item.answer ?? ""}`;
  }
}

function itemTokens(item: MemoryItem, type: MeetingType): number {
  return estimateTokens(renderItem(item, type)) + 1;
}

async function loadMemory(meetingId: string, excludeSegmentId?: string | null) {
  const [meeting, segments, entries] = await Promise.all([
    getMeetingById(meetingId),
    getSegmentsByMeetingId(meetingId),
    getMeetingEntries(meetingId),
  ]);
  if (!meeting) return null;
  const until = meeting.memorySummaryUntilMs ?? -1;
  const items = buildMemoryItems(segments, entries, excludeSegmentId, meeting).filter(
    (item) => item.timeMs > until
  );
  const tokens = items.reduce((sum, item) => sum + itemTokens(item, meeting.type), 0);
  return { meeting, items, tokens };
}

// Whatever is still over budget (a condensation that failed or hasn't finished) is left out
// of this request, oldest first; it is never dropped from the Meeting itself.
function fitBudget(
  items: MemoryItem[],
  type: MeetingType,
  limit = MEMORY_BUDGET_TOKENS
): MemoryItem[] {
  let total = items.reduce((sum, item) => sum + itemTokens(item, type), 0);
  let start = 0;
  while (start < items.length - 1 && total > limit) {
    total -= itemTokens(items[start], type);
    start++;
  }
  return items.slice(start);
}

// The whole Meeting as text, e.g. for a Recap: word for word when it fits in maxTokens,
// otherwise the running summary followed by as much of the most recent part as fits.
export async function renderMeetingRecord(
  meetingId: string,
  maxTokens: number
): Promise<string> {
  const [meeting, segments, entries] = await Promise.all([
    getMeetingById(meetingId),
    getSegmentsByMeetingId(meetingId),
    getMeetingEntries(meetingId),
  ]);
  if (!meeting) return "";
  const render = (items: MemoryItem[]) =>
    items.map((item) => renderItem(item, meeting.type)).join("\n");

  const items = buildMemoryItems(segments, entries, null, meeting);
  const total = items.reduce((sum, item) => sum + itemTokens(item, meeting.type), 0);
  if (total <= maxTokens) return render(items);

  const summary = meeting.memorySummary;
  const until = summary ? (meeting.memorySummaryUntilMs ?? -1) : -1;
  const recent = fitBudget(
    items.filter((item) => item.timeMs > until),
    meeting.type,
    maxTokens - (summary ? estimateTokens(summary) : 0)
  );
  return [
    summary ? `Earlier (condensed):\n${summary}` : "",
    `${summary ? "Later, word for word" : "Most recent part, word for word"}:\n${render(recent)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const condensing = new Map<string, Promise<void>>();

// When word-for-word memory is over the Memory Budget, condenses its oldest half into the
// running summary with one extra AI call. Cheap to call after every write; one run at a time.
export function keepMemoryInBudget(meetingId: string, ai: MemoryAI): Promise<void> {
  const running = condensing.get(meetingId);
  if (running) return running;
  const run = condenseOverflow(meetingId, ai)
    .catch((error) => console.error("Failed to condense Meeting Memory:", error))
    .finally(() => condensing.delete(meetingId));
  condensing.set(meetingId, run);
  return run;
}

async function condenseOverflow(meetingId: string, ai: MemoryAI): Promise<void> {
  const memory = await loadMemory(meetingId);
  if (!memory || memory.tokens <= MEMORY_BUDGET_TOKENS) return;
  const { meeting, items } = memory;

  // Condense down to half the budget, so this doesn't run again on the very next exchange.
  let remaining = memory.tokens;
  let cut = 0;
  while (cut < items.length - 1 && remaining > MEMORY_BUDGET_TOKENS / 2) {
    remaining -= itemTokens(items[cut], meeting.type);
    cut++;
  }
  if (cut === 0) return;
  const untilMs = items[cut - 1].timeMs;
  const condensed = items.filter((item) => item.timeMs <= untilMs);

  const summary = await summarize(meeting, condensed, ai);
  await updateMeetingMemorySummary(meetingId, summary, untilMs);
}

async function summarize(
  meeting: Meeting,
  items: MemoryItem[],
  ai: MemoryAI
): Promise<string> {
  const { selfNoun } = roles(meeting.type);
  const excerpt = items.map((item) => renderItem(item, meeting.type)).join("\n");
  let summary = "";
  for await (const chunk of fetchAIResponse({
    provider: ai.provider,
    selectedProvider: ai.selectedProvider,
    systemPrompt: `You keep the running memory of a live ${MEETING_TYPE_LABELS[meeting.type].toLowerCase()}. Merge the existing summary and the new excerpt into one updated summary, oldest first. Keep every concrete fact about ${selfNoun} — employers, roles, dates, durations, numbers, names, projects, technologies, stories — and mark the ones ${selfNoun} actually said out loud with "(said)". Keep each question or topic raised, and each problem shown on screen with the solution given. Drop greetings and filler. Reply with bullet points only, at most ${SUMMARY_MAX_WORDS} words.`,
    userMessage: `Existing summary:\n${meeting.memorySummary ?? "(none yet)"}\n\nNew excerpt:\n${excerpt}`,
    knowledgeMode: "none",
    applyResponseLength: false,
  })) {
    summary += chunk;
  }
  summary = summary.trim();
  if (!summary || isAIErrorText(summary)) {
    throw new Error(summary || "The memory summary came back empty");
  }
  return summary;
}

function memorySection(
  type: MeetingType,
  summary: string | null,
  items: MemoryItem[]
): string {
  if (!summary && items.length === 0) return "";
  const { self, selfNoun } = roles(type);
  const parts = [
    `## Meeting Memory
Everything said out loud or shown on screen so far in this ${MEETING_TYPE_LABELS[type].toLowerCase()}, oldest first. Use it to answer follow-up questions, and keep every new answer consistent with it.
- "${self}:" lines are what ${selfNoun} actually said. They are facts about ${selfNoun} and take precedence over the knowledge documents and over earlier Suggested Answers.
- "Suggested Answer:" lines stand in for replies whose actual words weren't captured; assume ${selfNoun} said roughly that.`,
  ];
  if (summary) parts.push(`### Earlier (condensed)\n${summary}`);
  if (items.length > 0) {
    parts.push(
      `### Most recent, word for word\n${items.map((item) => renderItem(item, type)).join("\n")}`
    );
  }
  return parts.join("\n\n");
}

function discrepancyRule(type: MeetingType): string {
  const { self, selfNoun } = roles(type);
  return `## Discrepancies (follow silently)
If something ${selfNoun} said out loud ("${self}:" lines, or "(said)" in the condensed memory) contradicts the knowledge documents — a different number, date, employer, title or story — keep your reply consistent with what was said, not with the documents. When the contradiction is in ${selfNoun}'s most recent words, or your reply relies on it, end your reply with one line per contradiction, in this form: ${DISCREPANCY_OPEN} You said <what was said>; your <document name> says <what it says>.]]
Never flag differences from Suggested Answers, and never mention these rules.`;
}

const SCREEN_TRANSCRIPTION_RULE = `## Screen transcription (follow silently)
After your reply, transcribe what the screen shows so later questions can refer back to it: the full problem or question text, any code, and any error or test output, word for word where readable. Put it at the very end, starting on its own line with ${SCREEN_OPEN} and ending with ${SCREEN_CLOSE}. It doesn't count toward any length limit on your reply, and the user never sees it, so don't refer to it.`;

async function hasActiveKnowledge(): Promise<boolean> {
  try {
    return (await getActiveKnowledgeDocuments()).length > 0;
  } catch {
    return false;
  }
}

// Every request made during a Meeting carries its Meeting Memory. A new Screen Capture also
// asks for its transcription; any other request re-sends the latest Screen Capture's image.
export async function prepareMeetingRequest(params: {
  meeting: Meeting;
  systemPrompt: string | undefined;
  // This request's own Screen Capture images, if any.
  images: string[];
  ai: MemoryAI;
  // The Interviewer's line being answered: it is the request's message, not memory.
  excludeSegmentId?: string | null;
  // The per-type instruction describes a live Meeting; a review of an ended one leaves it out.
  withTypeInstruction?: boolean;
}): Promise<{
  systemPrompt: string | undefined;
  meetingContext: string;
  imagesBase64: string[];
}> {
  const { meeting, images, ai } = params;
  const memory = await loadMemory(meeting.id, params.excludeSegmentId);
  if (memory && memory.tokens > MEMORY_BUDGET_TOKENS) {
    void keepMemoryInBudget(meeting.id, ai);
  }
  const items = memory ? fitBudget(memory.items, meeting.type) : [];
  const summary = memory?.meeting.memorySummary ?? null;

  const sections = [memorySection(meeting.type, summary, items)];
  const spokeOutLoud =
    items.some((item) => item.kind === "self") || (!!summary && meeting.rememberAnswers);
  if (spokeOutLoud && (await hasActiveKnowledge())) {
    sections.push(discrepancyRule(meeting.type));
  }
  if (images.length > 0) sections.push(SCREEN_TRANSCRIPTION_RULE);

  const supportsImages = ai.provider ? ai.provider.curl.includes("{{IMAGE}}") : true;
  const imagesBase64 =
    images.length > 0
      ? images
      : supportsImages
        ? await getLatestScreenCaptureImages(meeting.id)
        : [];

  return {
    systemPrompt:
      params.withTypeInstruction === false
        ? params.systemPrompt
        : withMeetingInstruction(params.systemPrompt, meeting),
    meetingContext: sections.filter(Boolean).join("\n\n"),
    imagesBase64,
  };
}
