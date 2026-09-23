import { useState } from "react";
import { Button, Input, Switch } from "@/components";
import { HeadphonesIcon, LoaderIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeLocalStorage } from "@/lib";
import { MEETING_TYPE_LABELS } from "@/lib/meeting";
import type {
  Meeting,
  MeetingType,
} from "@/lib/database/meetings.action";
import type { StartMeetingOptions } from "@/hooks/useSystemAudio";

const TYPE_HINTS: Record<MeetingType, string> = {
  interview: "Answers you can say to the Interviewer",
  assessment: "Screen-only test — no audio, solutions to submit",
  general: "Any other conversation",
};

const TITLE_PLACEHOLDERS: Record<MeetingType, string> = {
  interview: "e.g., Acme – round 2",
  assessment: "e.g., Acme coding test",
  general: "e.g., Weekly sync",
};

export const StartMeetingForm = ({
  defaultType,
  onStart,
  onCancel,
}: {
  defaultType: MeetingType;
  onStart: (options: StartMeetingOptions) => Promise<void>;
  onCancel: () => void;
}) => {
  const [type, setType] = useState<MeetingType>(defaultType);
  const [title, setTitle] = useState("");
  const [rememberAnswers, setRememberAnswers] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async () => {
    setIsStarting(true);
    await onStart({ type, title, rememberAnswers });
    setIsStarting(false);
  };

  return (
    <div className="space-y-3 p-1">
      <div>
        <h3 className="text-sm font-semibold">Start a meeting</h3>
        <p className="text-[11px] text-muted-foreground">
          Everything is kept together until you end it.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(MEETING_TYPE_LABELS) as MeetingType[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            className={cn(
              "rounded-lg border px-2 py-2 text-left transition-colors",
              type === option
                ? "border-primary bg-primary/10"
                : "border-border/60 hover:bg-accent/50"
            )}
          >
            <p className="text-xs font-medium">{MEETING_TYPE_LABELS[option]}</p>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {TYPE_HINTS[option]}
            </p>
          </button>
        ))}
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !isStarting && handleStart()}
        placeholder={`Title (optional) — ${TITLE_PLACEHOLDERS[type]}`}
        className="h-8 text-xs"
        aria-label="Meeting title"
        autoFocus
      />

      {type === "assessment" ? (
        <p className="text-[11px] text-muted-foreground">
          No audio is captured. Use Screenshot for each question.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium">Remember my answers</p>
            <p className="text-[10px] text-muted-foreground">
              Transcribes your microphone so follow-ups match what you said.
            </p>
          </div>
          <Switch
            checked={rememberAnswers}
            onCheckedChange={setRememberAnswers}
            aria-label="Remember my answers"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isStarting}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleStart} disabled={isStarting}>
          {isStarting && <LoaderIcon className="size-3 animate-spin" />}
          Start {MEETING_TYPE_LABELS[type].toLowerCase()}
        </Button>
      </div>
    </div>
  );
};

export const ResumeMeetingPrompt = ({
  meeting,
  onResume,
  onEnd,
  onDismiss,
  isEnding,
}: {
  meeting: Meeting;
  onResume: () => void;
  onEnd: () => void;
  onDismiss: () => void;
  isEnding: boolean;
}) => (
  <div className="space-y-3 p-1">
    <div>
      <h3 className="text-sm font-semibold">
        Resume {MEETING_TYPE_LABELS[meeting.type].toLowerCase()} with “
        {meeting.title}”?
      </h3>
      <p className="text-[11px] text-muted-foreground">
        It started at{" "}
        {new Date(meeting.startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        and was never ended.
      </p>
    </div>
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={onDismiss} disabled={isEnding}>
        Not now
      </Button>
      <Button size="sm" variant="outline" onClick={onEnd} disabled={isEnding}>
        {isEnding && <LoaderIcon className="size-3 animate-spin" />}
        End it
      </Button>
      <Button size="sm" onClick={onResume} disabled={isEnding}>
        Resume
      </Button>
    </div>
  </div>
);

const HEADPHONES_TIP_KEY = "headphones_tip_dismissed";

export const HeadphonesTip = () => {
  const [dismissed, setDismissed] = useState(
    () => safeLocalStorage.getItem(HEADPHONES_TIP_KEY) === "true"
  );
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
      <HeadphonesIcon className="size-3.5 shrink-0 text-primary mt-0.5" />
      <p className="flex-1 text-[11px]">
        Use headphones so EchoIdeal doesn't record the other person's voice as
        yours.
      </p>
      <button
        type="button"
        aria-label="Dismiss headphones tip"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          safeLocalStorage.setItem(HEADPHONES_TIP_KEY, "true");
          setDismissed(true);
        }}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
};
