import type { Meeting, TranscriptSegment } from "@/lib/database/meetings.action";

function formatElapsedFromStart(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function buildTranscriptMarkdown(params: {
  meeting: Meeting;
  segments: TranscriptSegment[];
  speakerLabels: Record<string, string>;
}): string {
  const { meeting, segments, speakerLabels } = params;
  const sorted = [...segments].sort((a, b) => a.startTimeMs - b.startTimeMs);

  const lines: string[] = [];
  lines.push(`# ${meeting.title.replace(/\n/g, " ")}`);
  lines.push("");
  lines.push(`- **Started:** ${formatAbsolute(meeting.startedAt)}`);
  lines.push(
    `- **Ended:** ${meeting.endedAt != null ? formatAbsolute(meeting.endedAt) : "—"}`
  );
  lines.push(`- **Status:** ${meeting.status}`);
  lines.push(`- **Segments:** ${sorted.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Transcript");
  lines.push("");

  for (const seg of sorted) {
    const label = speakerLabels[seg.speaker]?.trim() || seg.speaker;
    const t = formatElapsedFromStart(seg.startTimeMs);
    lines.push(`### [${t}] ${label}`);
    lines.push("");
    lines.push(seg.content.trim() || "_(empty)_");
    lines.push("");
  }

  return lines.join("\n");
}
