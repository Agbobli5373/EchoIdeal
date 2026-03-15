import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/layouts";
import { Button } from "@/components";
import {
  Meeting,
  getAllMeetings,
  deleteMeeting,
} from "@/lib/database/meetings.action";
import { useMeeting } from "@/hooks/useMeeting";
import {
  PlusIcon,
  TrashIcon,
  ClockIcon,
  RadioIcon,
  MicIcon,
  SquareIcon,
  FileTextIcon,
} from "lucide-react";

function formatDate(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday =
    new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startMs: number, endMs: number | null): string {
  const end = endMs || Date.now();
  const seconds = Math.floor((end - startMs) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const Meetings = () => {
  const navigate = useNavigate();
  const {
    activeMeeting,
    formattedElapsed,
    startMeeting,
    endCurrentMeeting,
  } = useMeeting();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    const all = await getAllMeetings();
    setMeetings(all);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, [activeMeeting]);

  const handleStart = async () => {
    const meeting = await startMeeting();
    navigate(`/meetings/${meeting.id}`);
  };

  const handleEnd = async () => {
    await endCurrentMeeting();
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteMeeting(id);
    load();
  };

  const groupedMeetings = meetings.reduce<Record<string, Meeting[]>>(
    (groups, meeting) => {
      const key = formatDate(meeting.startedAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(meeting);
      return groups;
    },
    {}
  );

  return (
    <PageLayout
      title="Meetings"
      description="Record and transcribe your meetings in real time"
      rightSlot={
        activeMeeting ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
              <RadioIcon className="size-3 animate-pulse" />
              {formattedElapsed}
            </span>
            <Button size="sm" variant="destructive" onClick={handleEnd}>
              <SquareIcon className="size-3" />
              End
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleStart}>
            <PlusIcon className="size-3.5" />
            New Meeting
          </Button>
        )
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <MicIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No meetings yet</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Start a new meeting to begin recording and transcribing in real time.
          </p>
          <Button size="sm" onClick={handleStart} className="mt-2">
            <PlusIcon className="size-3.5" />
            Start your first meeting
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(groupedMeetings).map(([date, dateMeetings]) => (
            <div key={date}>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {date}
              </p>
              <div className="flex flex-col gap-1.5">
                {dateMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => navigate(`/meetings/${meeting.id}`)}
                    className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 text-left transition-all duration-200 hover:bg-accent/50 hover:border-primary/20 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          meeting.status === "active"
                            ? "bg-red-500/15"
                            : "bg-muted"
                        }`}
                      >
                        {meeting.status === "active" ? (
                          <RadioIcon className="size-4 text-red-500 animate-pulse" />
                        ) : (
                          <FileTextIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {meeting.title}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{formatTime(meeting.startedAt)}</span>
                          <span className="flex items-center gap-0.5">
                            <ClockIcon className="size-2.5" />
                            {formatDuration(meeting.startedAt, meeting.endedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(meeting.id);
                      }}
                    >
                      <TrashIcon className="size-3 text-muted-foreground" />
                    </Button>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
};

export default Meetings;
