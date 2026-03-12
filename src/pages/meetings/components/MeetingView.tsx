import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ScrollArea, Button } from "@/components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Meeting,
  TranscriptSegment,
  getMeetingById,
  getSegmentsByMeetingId,
  endMeeting,
} from "@/lib/database/meetings.action";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import {
  ArrowLeftIcon,
  ClockIcon,
  FileTextIcon,
  MessageSquareIcon,
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  SquareIcon,
  RadioIcon,
} from "lucide-react";

function formatDuration(startMs: number, endMs: number | null): string {
  const end = endMs || Date.now();
  const seconds = Math.floor((end - startMs) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimer(startMs: number): string {
  const seconds = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const MeetingView = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timer, setTimer] = useState("00:00");
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const {
    isTranscribing,
    lastSegment,
    error: transcriptionError,
    startTranscription,
    stopTranscription,
  } = useLiveTranscription();

  useEffect(() => {
    if (!meetingId) return;
    const load = async () => {
      setIsLoading(true);
      const m = await getMeetingById(meetingId);
      setMeeting(m);
      if (m) {
        const segs = await getSegmentsByMeetingId(meetingId);
        setSegments(segs);
      }
      setIsLoading(false);
    };
    load();
  }, [meetingId]);

  useEffect(() => {
    if (!meeting || meeting.status !== "active") return;
    const interval = setInterval(() => {
      setTimer(formatTimer(meeting.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [meeting]);

  useEffect(() => {
    if (lastSegment && meetingId) {
      const newSeg: TranscriptSegment = {
        id: lastSegment.id,
        meetingId,
        speaker: lastSegment.speaker,
        content: lastSegment.content,
        startTimeMs: lastSegment.startTimeMs,
        endTimeMs: lastSegment.endTimeMs,
        confidence: null,
        isFinal: true,
        createdAt: Date.now(),
      };
      setSegments((prev) => [...prev, newSeg]);
    }
  }, [lastSegment, meetingId]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [segments]);

  const handleStartTranscription = useCallback(async () => {
    if (meetingId) {
      await startTranscription(meetingId);
    }
  }, [meetingId, startTranscription]);

  const handleStopTranscription = useCallback(async () => {
    await stopTranscription();
  }, [stopTranscription]);

  const handleEndMeeting = useCallback(async () => {
    if (!meetingId) return;
    await stopTranscription();
    await endMeeting(meetingId);
    const updated = await getMeetingById(meetingId);
    setMeeting(updated);
  }, [meetingId, stopTranscription]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Meeting not found.</p>
        <Button variant="outline" onClick={() => navigate("/meetings")}>
          Back to Meetings
        </Button>
      </div>
    );
  }

  const isActive = meeting.status === "active";

  return (
    <div className="flex flex-1 flex-col">
      <header className="pt-8">
        <div className="flex items-center gap-3 mb-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/meetings")}
            className="size-8"
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{formatDate(meeting.startedAt)}</span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" />
                {isActive ? timer : formatDuration(meeting.startedAt, meeting.endedAt)}
              </span>
              {isActive && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 text-[10px] font-medium">
                  <RadioIcon className="size-2.5 animate-pulse" />
                  Live
                </span>
              )}
              {isTranscribing && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-medium">
                  <MicIcon className="size-2.5" />
                  Transcribing
                </span>
              )}
              {segments.length > 0 && (
                <span className="text-muted-foreground/50">
                  {segments.length} segment{segments.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {isActive && (
            <div className="flex items-center gap-2 shrink-0">
              {isTranscribing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStopTranscription}
                  className="gap-1.5"
                >
                  <MicOffIcon className="size-3" />
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStartTranscription}
                  className="gap-1.5"
                >
                  <MicIcon className="size-3" />
                  Transcribe
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={handleEndMeeting}
                className="gap-1.5"
              >
                <SquareIcon className="size-3" />
                End
              </Button>
            </div>
          )}
        </div>

        {transcriptionError && (
          <div className="mx-11 mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
            {transcriptionError}
          </div>
        )}

        <div className="border-b border-input/50 mt-3" />
      </header>

      <Tabs defaultValue="transcript" className="flex-1 flex flex-col mt-2">
        <TabsList className="w-fit">
          <TabsTrigger value="transcript" className="gap-1.5 text-xs">
            <FileTextIcon className="size-3" />
            Transcript
            {segments.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({segments.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5 text-xs">
            <MessageSquareIcon className="size-3" />
            Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="flex-1 mt-0">
          <div
            ref={scrollRef}
            className="h-[calc(100vh-14rem)] overflow-y-auto pr-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              autoScrollRef.current = atBottom;
            }}
          >
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                  <FileTextIcon className="size-6 opacity-40" />
                </div>
                <p className="text-sm font-medium">No transcript segments yet</p>
                <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
                  {isActive
                    ? "Click \"Transcribe\" above to start capturing and transcribing audio in real time."
                    : "This meeting has no recorded transcript."}
                </p>
                {isActive && !isTranscribing && (
                  <Button
                    size="sm"
                    onClick={handleStartTranscription}
                    className="mt-2 gap-1.5"
                  >
                    <MicIcon className="size-3.5" />
                    Start Transcription
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/30 py-2">
                {segments.map((seg) => (
                  <TranscriptSegmentItem key={seg.id} segment={seg} />
                ))}
                {isTranscribing && (
                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground/60">
                    <div className="flex gap-0.5">
                      <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="size-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="size-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
                    </div>
                    Listening for speech...
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="summary" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-14rem)] pr-4">
            {meeting.summary ? (
              <div className="py-4">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {meeting.summary}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <MessageSquareIcon className="size-8 opacity-30" />
                <p className="text-sm">No summary available yet.</p>
                <p className="text-xs text-muted-foreground/60">
                  {isActive
                    ? "A summary will be generated when the meeting ends."
                    : "No summary was generated for this meeting."}
                </p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MeetingView;
