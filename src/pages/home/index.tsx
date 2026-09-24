import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  NotebookPenIcon,
  RadioIcon,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SettingsGroup,
  SettingsRow,
} from "@/components";
import { useReadiness } from "@/hooks";
import type { ReadinessCheck } from "@/hooks/useReadiness";
import { PageLayout } from "@/layouts";
import {
  getAllMeetings,
  type Meeting,
  type MeetingType,
} from "@/lib/database/meetings.action";
import { setKnowledgeDocumentActive } from "@/lib/database";
import { estimateTokens } from "@/lib/knowledge";
import { canSaveRecap, MEETING_TYPE_LABELS } from "@/lib/meeting";
import { cn } from "@/lib/utils";

// How many ended Meetings "To review" lists, and how many Recaps "Carry forward" offers.
const RECENT_LIMIT = 5;

const START_OPTIONS: { type: MeetingType; label: string }[] = [
  { type: "interview", label: "Start Interview" },
  { type: "assessment", label: "Start Assessment" },
  { type: "general", label: "Start Meeting" },
];

const startFromOverlay = (type: MeetingType) =>
  invoke("open_meeting_start", { meetingType: type }).catch((err) =>
    console.error("Failed to open the start form:", err)
  );

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatWhen(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

function formatDuration(meeting: Meeting): string {
  const minutes = Math.round(
    ((meeting.endedAt ?? Date.now()) - meeting.startedAt) / 60000
  );
  return minutes < 1 ? "under a minute" : `${minutes} min`;
}

const Pill = ({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "ok";
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-xs",
      tone === "ok" ? "text-ok" : "text-muted-foreground"
    )}
  >
    {children}
  </span>
);

/** Start Interview, with Assessment and Meeting in its menu. Opens the overlay's start form. */
const StartButton = () => (
  <div className="flex">
    <Button
      className="rounded-r-none"
      onClick={() => startFromOverlay("interview")}
    >
      Start Interview
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="rounded-l-none border-l border-primary-foreground/25 px-2"
          aria-label="More ways to start"
        >
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {START_OPTIONS.slice(1).map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => startFromOverlay(option.type)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

/** Shown instead of Start while a Meeting is open: its type, title and time, Open overlay, End. */
const OpenMeetingBanner = ({ meeting }: { meeting: Meeting }) => {
  const [now, setNow] = useState(Date.now());
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const end = async () => {
    setIsEnding(true);
    // The overlay ends it, so capture stops and the summary is written there too.
    await emitTo("main", "end-meeting", { id: meeting.id }).catch((err) => {
      console.error("Failed to end the meeting:", err);
      setIsEnding(false);
    });
  };

  return (
    <SettingsGroup>
      <div className="flex items-center gap-4 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10">
          <RadioIcon className="size-4 animate-pulse text-destructive" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Pill>{MEETING_TYPE_LABELS[meeting.type]}</Pill>
            <span className="truncate text-foreground">{meeting.title}</span>
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            In progress · {formatElapsed(now - meeting.startedAt)}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => invoke("show_overlay_window").catch(console.error)}
        >
          Open overlay
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={end}
          disabled={isEnding}
        >
          {isEnding ? "Ending…" : "End"}
        </Button>
      </div>
    </SettingsGroup>
  );
};

const ReadinessRow = ({ check }: { check: ReadinessCheck }) => {
  const navigate = useNavigate();
  return (
    <div
      id={`ready-${check.id}`}
      className="settings-row flex items-center gap-4 px-4 py-3"
    >
      {check.ok ? (
        <CheckCircle2Icon
          className="size-5 shrink-0 text-ok"
          aria-label="Ready"
        />
      ) : (
        <CircleAlertIcon
          className="size-5 shrink-0 text-warn"
          aria-label="Needs attention"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-foreground">{check.label}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {check.value}
        </div>
        {check.meter !== undefined && check.meter > 0 && (
          <div className="mt-1.5 h-1 w-48 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, check.meter * 100)}%` }}
            />
          </div>
        )}
      </div>
      <Button
        variant={check.ok ? "ghost" : "outline"}
        size="sm"
        className={check.ok ? "text-muted-foreground" : undefined}
        onClick={() => navigate(check.fix.to)}
      >
        {check.fix.label}
      </Button>
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { checks, readyCount, documents, refresh } = useReadiness();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [switchingOn, setSwitchingOn] = useState<number | null>(null);
  const [carryError, setCarryError] = useState<{
    id: number;
    text: string;
  } | null>(null);

  const loadMeetings = useCallback(async () => {
    try {
      setMeetings(await getAllMeetings());
    } catch (err) {
      console.error("Failed to load meetings:", err);
    }
  }, []);

  // The overlay announces Meetings starting and ending; focus catches anything else.
  useEffect(() => {
    loadMeetings();
    const unlisten = listen("meetings-changed", () => {
      loadMeetings();
      refresh();
    });
    const onFocus = () => loadMeetings();
    window.addEventListener("focus", onFocus);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("focus", onFocus);
    };
  }, [loadMeetings, refresh]);

  const openMeeting = meetings.find((m) => m.status === "active") ?? null;
  const ended = useMemo(
    () =>
      meetings
        .filter((m) => m.status === "ended")
        .sort((a, b) => b.startedAt - a.startedAt),
    [meetings]
  );
  const toReview = ended.slice(0, RECENT_LIMIT);

  // A Recap still exists only if its document does.
  const documentIds = new Set(documents.map((doc) => doc.id));
  const hasRecap = (m: Meeting) =>
    m.recapDocumentId !== null && documentIds.has(m.recapDocumentId);

  const recaps = ended
    .filter(hasRecap)
    .map((m) => documents.find((doc) => doc.id === m.recapDocumentId)!)
    .slice(0, RECENT_LIMIT);

  const switchOn = async (id: number) => {
    setSwitchingOn(id);
    setCarryError(null);
    try {
      await setKnowledgeDocumentActive(id, true);
      await refresh();
    } catch (err) {
      setCarryError({
        id,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSwitchingOn(null);
    }
  };

  return (
    <PageLayout
      title="Home"
      subtitle="Get ready for your next Meeting."
      actions={openMeeting ? undefined : <StartButton />}
    >
      {openMeeting && <OpenMeetingBanner meeting={openMeeting} />}

      <SettingsGroup
        title="Ready for your next Meeting"
        meta={`${readyCount} of ${checks.length} ready`}
      >
        {checks.map((check) => (
          <ReadinessRow key={check.id} check={check} />
        ))}
      </SettingsGroup>

      {recaps.length > 0 && (
        <SettingsGroup title="Carry forward" meta="Recaps from earlier rounds">
          {recaps.map((doc) => (
            <SettingsRow
              key={doc.id}
              id={`carry-${doc.id}`}
              title={
                <span className="flex items-center gap-2">
                  <NotebookPenIcon className="size-4 shrink-0 text-muted-foreground" />
                  {doc.name}
                </span>
              }
              desc={
                carryError?.id === doc.id
                  ? carryError.text
                  : `${doc.is_active ? "Switched on" : "Switched off"} · about ${estimateTokens(
                      doc.content
                    ).toLocaleString()} tokens`
              }
              control={
                doc.is_active ? (
                  <Pill tone="ok">
                    <CheckCircle2Icon className="size-3" />
                    On
                  </Pill>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => switchOn(doc.id)}
                    disabled={switchingOn === doc.id}
                  >
                    Switch on
                  </Button>
                )
              }
            />
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup
        title="To review"
        meta={
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => navigate("/meetings")}
          >
            All Meetings
          </Button>
        }
      >
        {toReview.length === 0 ? (
          <SettingsRow
            id="review-empty"
            title="No Meetings yet"
            desc="Ended Meetings show up here, ready to review or write a Recap."
          />
        ) : (
          toReview.map((meeting) => (
            <SettingsRow
              key={meeting.id}
              id={`review-${meeting.id}`}
              title={
                <span className="flex items-center gap-2">
                  <Pill>{MEETING_TYPE_LABELS[meeting.type]}</Pill>
                  <button
                    type="button"
                    className="truncate text-left hover:underline"
                    onClick={() => navigate(`/meetings/${meeting.id}`)}
                  >
                    {meeting.title}
                  </button>
                </span>
              }
              desc={`${formatWhen(meeting.startedAt)} · ${formatDuration(meeting)}`}
              control={
                !canSaveRecap(meeting) ? undefined : hasRecap(meeting) ? (
                  <Pill tone="ok">
                    <CheckCircle2Icon className="size-3" />
                    Recap saved
                  </Pill>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/meetings/${meeting.id}?recap=1`)}
                  >
                    Write Recap
                  </Button>
                )
              }
            />
          ))
        )}
      </SettingsGroup>
    </PageLayout>
  );
};

export default Home;
