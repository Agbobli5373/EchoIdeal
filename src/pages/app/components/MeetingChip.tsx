import { LoaderIcon, SquareIcon } from "lucide-react";
import { MEETING_TYPE_LABELS } from "@/lib/meeting";
import type { Meeting } from "@/lib/database/meetings.action";

export const MeetingChip = ({
  meeting,
  onEnd,
  isEnding,
}: {
  meeting: Meeting;
  onEnd: () => void;
  isEnding: boolean;
}) => {
  const state = meeting.type === "assessment" ? "Assessment" : "Paused";
  return (
    <div
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/40 pl-2 pr-1 text-[11px]"
      title={`${MEETING_TYPE_LABELS[meeting.type]} “${meeting.title}” — ${
        meeting.type === "assessment" ? "in progress" : "paused"
      }`}
    >
      <span className="size-1.5 rounded-full bg-amber-500" />
      <span className="font-medium">{state}</span>
      <button
        type="button"
        onClick={onEnd}
        disabled={isEnding}
        className="ml-0.5 flex size-5 items-center justify-center rounded-full text-red-600 hover:bg-red-500/10"
        aria-label={`End ${MEETING_TYPE_LABELS[meeting.type].toLowerCase()}`}
        title="End the meeting and write its summary"
      >
        {isEnding ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <SquareIcon className="size-3" />
        )}
      </button>
    </div>
  );
};
