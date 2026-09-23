import type { Meeting } from "../database/meetings.action";
import { getMeetingEntries } from "../database/meetings.action";
import {
  fetchAIResponse,
  isAIErrorText,
} from "../functions/ai-response.function";
import { cleanAnswer, parseAnswer } from "./answer";
import { speakerLabel } from "./meeting-type";
import { MemoryAI, renderMeetingRecord } from "./memory";

// How much of the Meeting a Recap is written from, word for word, before falling back to the
// running summary plus the most recent part.
const RECAP_INPUT_TOKENS = 24000;

const INTERVIEW_RECAP_PROMPT = `You write a Recap of a job interview for the Candidate to use in later rounds with the same company. Use only the record you are given; never add facts from anywhere else. Write in the first person as the Candidate, in Markdown, with these sections:
## What I told them
Every fact I committed to: employers, roles, dates, durations, numbers, projects, technologies. Mark anything that comes only from a Suggested Answer (not heard in my own words) with "(suggested)".
## Stories I told
One bullet per story or example, with its key details.
## What the Interviewer probed
The topics and questions they asked about, and anything they seemed to care about.
## Follow-ups
Open questions, promises I made, and next steps mentioned.
Leave out any section that would be empty. Be concise and specific.`;

const ASSESSMENT_RECAP_PROMPT = `You write a Recap of a screen-based assessment for the Candidate to use in later rounds (for example "walk me through your solution"). Use only the record you are given. In Markdown, for each problem in order:
### Problem N: <short title>
The problem statement, condensed but complete (inputs, outputs, constraints).
**Solution submitted:** the final solution given (code in a fenced block), then one or two lines on the approach.
When a later Screen Capture changed or extended an earlier problem (for example "now handle duplicates"), keep both parts and say what changed.`;

// Only Interviews and Assessments get a Recap; General Meetings keep their summary.
export function canSaveRecap(meeting: Pick<Meeting, "type" | "status">): boolean {
  return meeting.status === "ended" && meeting.type !== "general";
}

function recapName(meeting: Meeting): string {
  const date = new Date(meeting.startedAt).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
  return `Recap: ${meeting.title} (${date})`;
}

// Names the Candidate gave the speakers in the review view, when they differ from the roles.
function participants(meeting: Meeting): string | null {
  const names = Object.entries(meeting.speakerNames ?? {})
    .filter(([speaker, name]) => name.trim() && name !== speakerLabel(speaker, meeting.type))
    .map(([speaker, name]) => `${speakerLabel(speaker, meeting.type)}: ${name.trim()}`);
  return names.length > 0 ? `Participants — ${names.join(", ")}` : null;
}

export async function generateRecap(
  meeting: Meeting,
  ai: MemoryAI
): Promise<{ name: string; content: string }> {
  const [record, entries] = await Promise.all([
    renderMeetingRecord(meeting.id, RECAP_INPUT_TOKENS),
    getMeetingEntries(meeting.id),
  ]);
  if (!record.trim()) throw new Error("Nothing was said or shown in this meeting, so there's nothing to recap.");

  const parts = [`Title: ${meeting.title}`];
  const who = participants(meeting);
  if (who) parts.push(who);
  const discrepancies = [
    ...new Set(entries.flatMap((entry) => parseAnswer(entry.content).discrepancies)),
  ];
  if (meeting.type === "interview" && discrepancies.length > 0) {
    parts.push(
      `Discrepancies noted during the interview (what I said vs my documents):\n${discrepancies
        .map((note) => `- ${note}`)
        .join("\n")}\nAdd a final section "## Where I differed from my documents" listing each one with what I actually said.`
    );
  }
  parts.push(`Record, oldest first:\n${record}`);

  let content = "";
  for await (const chunk of fetchAIResponse({
    provider: ai.provider,
    selectedProvider: ai.selectedProvider,
    systemPrompt:
      meeting.type === "assessment" ? ASSESSMENT_RECAP_PROMPT : INTERVIEW_RECAP_PROMPT,
    userMessage: parts.join("\n\n"),
    knowledgeMode: "none",
    applyResponseLength: false,
  })) {
    content += chunk;
  }
  content = cleanAnswer(content).trim();
  if (!content || isAIErrorText(content)) {
    throw new Error(content || "The Recap came back empty. Try again.");
  }
  return { name: recapName(meeting), content };
}
