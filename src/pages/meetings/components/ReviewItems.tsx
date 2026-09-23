import { useState } from "react";
import { Markdown } from "@/components";
import {
  CameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeOffIcon,
  ImageIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import {
  MeetingEntry,
  getMeetingEntryImages,
} from "@/lib/database/meetings.action";
import { parseAnswer } from "@/lib/meeting/answer";
import { formatElapsed } from "./TranscriptSegmentItem";

// The Suggested Answer that was shown for an Interviewer line.
export const SuggestedAnswerCard = ({ entry }: { entry: MeetingEntry }) => (
  <div className="ml-10 mb-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
    <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <SparklesIcon className="size-3" />
      Suggested Answer
    </p>
    <div className="prose prose-sm max-w-none text-[13px] dark:prose-invert">
      <Markdown>{entry.content}</Markdown>
    </div>
  </div>
);

export const ScreenCaptureCard = ({ entry }: { entry: MeetingEntry }) => {
  const [images, setImages] = useState<string[] | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [showScreenText, setShowScreenText] = useState(false);

  const loadImages = async () => {
    setIsLoadingImage(true);
    try {
      setImages(await getMeetingEntryImages(entry.id));
    } finally {
      setIsLoadingImage(false);
    }
  };

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <CameraIcon className="size-3.5 text-muted-foreground" />
        <span className="font-semibold">Screen Capture</span>
        <span className="text-[10px] text-muted-foreground/60">
          {formatElapsed(entry.timeMs)}
        </span>
      </div>

      {entry.hasImages &&
        (images ? (
          <div className="flex flex-wrap gap-2">
            {images.map((image, index) => (
              <img
                key={index}
                src={`data:image/png;base64,${image}`}
                alt={`Screen Capture at ${formatElapsed(entry.timeMs)}`}
                className="max-h-72 rounded-md border border-border/50"
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={loadImages}
            disabled={isLoadingImage}
            className="flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {isLoadingImage ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <ImageIcon className="size-3" />
            )}
            Show screenshot
          </button>
        ))}

      {entry.screenText && (
        <div>
          <button
            type="button"
            onClick={() => setShowScreenText((open) => !open)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showScreenText ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
            What was on screen
          </button>
          {showScreenText && (
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] text-foreground/80">
              {entry.screenText}
            </pre>
          )}
        </div>
      )}

      <div className="prose prose-sm max-w-none text-[13px] dark:prose-invert">
        <Markdown>{entry.content}</Markdown>
      </div>
    </div>
  );
};

// Every Discrepancy flagged during the Meeting, at the top of the review.
export const DiscrepancyList = ({ entries }: { entries: MeetingEntry[] }) => {
  const notes = entries.flatMap((entry) =>
    parseAnswer(entry.content).discrepancies.map((note) => ({
      note,
      timeMs: entry.timeMs,
    }))
  );
  const unique = notes.filter(
    (item, index) => notes.findIndex((other) => other.note === item.note) === index
  );
  if (unique.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-200">
        <EyeOffIcon className="size-3.5" />
        Discrepancies ({unique.length})
      </p>
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        Where what you said differs from your knowledge. Only you see these.
      </p>
      <ul className="space-y-0.5">
        {unique.map(({ note, timeMs }) => (
          <li key={note} className="flex gap-2 text-[12px]">
            <span className="shrink-0 text-muted-foreground/60">{formatElapsed(timeMs)}</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
