import { TranscriptSegment } from "@/lib/database/meetings.action";

interface SpeakerStyle {
  textColor: string;
  bgColor: string;
  initial: string;
}

const SPEAKER_STYLES: Record<string, SpeakerStyle> = {
  You: {
    textColor: "text-primary",
    bgColor: "bg-primary/15",
    initial: "Y",
  },
  Them: {
    textColor: "text-emerald-500",
    bgColor: "bg-emerald-500/15",
    initial: "T",
  },
  Unknown: {
    textColor: "text-muted-foreground",
    bgColor: "bg-muted",
    initial: "?",
  },
};

function getSpeakerStyle(speaker: string): SpeakerStyle {
  if (SPEAKER_STYLES[speaker]) return SPEAKER_STYLES[speaker];
  const colors = [
    { textColor: "text-amber-500", bgColor: "bg-amber-500/15" },
    { textColor: "text-rose-500", bgColor: "bg-rose-500/15" },
    { textColor: "text-cyan-500", bgColor: "bg-cyan-500/15" },
    { textColor: "text-violet-500", bgColor: "bg-violet-500/15" },
  ];
  const idx = speaker.charCodeAt(0) % colors.length;
  return {
    ...colors[idx],
    initial: speaker.charAt(0).toUpperCase(),
  };
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
  const style = getSpeakerStyle(segment.speaker);

  return (
    <div className="flex gap-3 py-2.5 group">
      <div
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${style.bgColor} ${style.textColor}`}
      >
        {style.initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${style.textColor}`}>
            {segment.speaker}
          </span>
          <span className="text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTimestamp(segment.startTimeMs)}
          </span>
        </div>
        <p className="text-[13px] text-foreground/85 leading-relaxed mt-0.5">
          {segment.content}
        </p>
      </div>
    </div>
  );
};
