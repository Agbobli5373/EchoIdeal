import { TranscriptSegment } from "@/lib/database/meetings.action";

const SPEAKER_COLORS: Record<string, string> = {
  You: "text-primary",
  Them: "text-emerald-500",
  Unknown: "text-muted-foreground",
};

function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker] || "text-amber-500";
}

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const TranscriptSegmentItem = ({
  segment,
}: {
  segment: TranscriptSegment;
}) => {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${getSpeakerColor(segment.speaker)}`}>
          {segment.speaker}
        </span>
        <span className="text-[10px] text-muted-foreground/50">
          {formatTimestamp(segment.startTimeMs)}
        </span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">
        {segment.content}
      </p>
    </div>
  );
};
