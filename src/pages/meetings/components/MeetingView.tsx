import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ScrollArea, Button } from "@/components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Meeting,
  TranscriptSegment,
  getMeetingById,
  getSegmentsByMeetingId,
} from "@/lib/database/meetings.action";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import {
  ArrowLeftIcon,
  ClockIcon,
  FileTextIcon,
  MessageSquareIcon,
  Loader2Icon,
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

const MeetingView = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{formatDate(meeting.startedAt)}</span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" />
                {formatDuration(meeting.startedAt, meeting.endedAt)}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  meeting.status === "active"
                    ? "bg-red-500/15 text-red-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {meeting.status === "active" ? "● Live" : "Ended"}
              </span>
            </div>
          </div>
        </div>
        <div className="border-b border-input/50 mt-3" />
      </header>

      <Tabs defaultValue="transcript" className="flex-1 flex flex-col mt-2">
        <TabsList className="w-fit">
          <TabsTrigger value="transcript" className="gap-1.5 text-xs">
            <FileTextIcon className="size-3" />
            Transcript
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5 text-xs">
            <MessageSquareIcon className="size-3" />
            Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-12rem)] pr-4">
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileTextIcon className="size-8 opacity-30" />
                <p className="text-sm">No transcript segments yet.</p>
                <p className="text-xs text-muted-foreground/60">
                  Segments will appear here as speech is detected during the meeting.
                </p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/30 py-2">
                {segments.map((seg) => (
                  <TranscriptSegmentItem key={seg.id} segment={seg} />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="summary" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-12rem)] pr-4">
            {meeting.summary ? (
              <div className="prose prose-sm dark:prose-invert py-4">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {meeting.summary}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <MessageSquareIcon className="size-8 opacity-30" />
                <p className="text-sm">No summary available yet.</p>
                <p className="text-xs text-muted-foreground/60">
                  A summary will be generated when the meeting ends.
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
