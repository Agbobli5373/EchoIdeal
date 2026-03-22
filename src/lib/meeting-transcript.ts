import type { TranscriptSegment } from "@/lib/database/meetings.action";

export function buildTranscriptContext(
  segments: TranscriptSegment[],
  maxSegments = 30
): string {
  const recent = segments.slice(-maxSegments);
  if (recent.length === 0) return "(No transcript yet)";
  return recent.map((s) => `[${s.speaker}]: ${s.content}`).join("\n");
}
