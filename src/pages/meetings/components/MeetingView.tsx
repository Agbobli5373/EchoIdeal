import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ScrollArea, Button, Input, Markdown, PageHeader, WebSearchNote } from "@/components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Meeting,
  MeetingEntry,
  TranscriptSegment,
  getMeetingById,
  getSegmentsByMeetingId,
  getMeetingEntries,
  addMeetingEntry,
  endMeeting,
  updateMeetingTitle,
  updateMeetingSpeakerNames,
  addTranscriptSegment,
  setMeetingRecapDocument,
  getMeetingVoices,
  mergeMeetingVoices,
  saveMeetingVoice,
  setSegmentVoice,
} from "@/lib/database/meetings.action";
import { createKnowledgeDocument } from "@/lib/database/knowledge.action";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import {
  DiscrepancyList,
  ScreenCaptureCard,
  SuggestedAnswerCard,
} from "./ReviewItems";
import { MicTranscriber } from "./MicTranscriber";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import {
  fetchAIResponse,
  isAIErrorText,
} from "@/lib/functions/ai-response.function";
import { shouldUseEchoIdealAPI } from "@/lib/functions/echoideal.api";
import {
  MEETING_TYPE_LABELS,
  MemoryAI,
  canSaveRecap,
  generateMeetingSummary,
  generateRecap,
  prepareMeetingRequest,
  hasSeveralVoices,
  nameKey,
  nextVoice,
  speakerKey,
  speakerLabel,
  speakerName,
  voicesChanged,
} from "@/lib/meeting";
import { DocumentEditorDialog } from "@/pages/knowledge/dialogs";
import {
  lastUserQuestion,
  webSearchSection,
  WebSearchStatus,
} from "@/lib/web-search";
import { useApp } from "@/contexts";
import {
  BookPlusIcon,
  ClockIcon,
  FileTextIcon,
  MessageSquareIcon,
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  SquareIcon,
  UsersIcon,
  SendIcon,
  ZapIcon,
  ChevronDownIcon,
  PencilIcon,
  CheckIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
} from "lucide-react";

function formatDuration(startMs: number, endMs: number | null): string {
  const end = endMs || Date.now();
  const seconds = Math.floor((end - startMs) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Both speakers are transcribed independently, so a later-spoken line can finish first.
function insertInSpokenOrder(
  segments: TranscriptSegment[],
  segment: TranscriptSegment
): TranscriptSegment[] {
  return [...segments, segment].sort((a, b) => a.startTimeMs - b.startTimeMs);
}

const MEETING_SYSTEM_PROMPT = `You are a real-time meeting assistant. You have access to the live transcript of an ongoing meeting. Your role is to:
1. Answer questions about what was discussed
2. Suggest responses when the user seems stuck
3. Provide counter-arguments when objections are raised
4. Track action items and commitments mentioned in the conversation
5. Summarize key points when asked

Be concise and actionable. Reference specific parts of the transcript when relevant.

Format replies in Markdown when helpful (headings, bullets, code blocks).`;

const REVIEW_SYSTEM_PROMPT = `You help the user review a meeting that has ended, using its Meeting Memory below. Answer questions about what was said, shown and suggested, point out what went well or could be improved, and help prepare for what comes next.

Be concise and specific, and quote the Meeting when relevant. Format replies in Markdown when helpful (headings, bullets, code blocks).`;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// This page's chat is the Meeting's Private Requests (typed here or in the overlay).
function chatFromEntries(entries: MeetingEntry[]): ChatMessage[] {
  return entries
    .filter((entry) => entry.kind === "private_request")
    .flatMap((entry) => [
      { id: `u-${entry.id}`, role: "user" as const, content: entry.prompt },
      { id: `a-${entry.id}`, role: "assistant" as const, content: entry.content },
    ]);
}

type TimelineItem =
  | { kind: "segment"; timeMs: number; segment: TranscriptSegment; answer?: MeetingEntry }
  | { kind: "capture"; timeMs: number; entry: MeetingEntry };

// The transcript with each Suggested Answer under the line it answered, and Screen Captures
// where they were taken.
function buildTimeline(segments: TranscriptSegment[], entries: MeetingEntry[]): TimelineItem[] {
  const answers = new Map(
    entries
      .filter((entry) => entry.kind === "suggested_answer" && entry.segmentId)
      .map((entry) => [entry.segmentId as string, entry])
  );
  const items: TimelineItem[] = [
    ...segments.map((segment) => ({
      kind: "segment" as const,
      timeMs: segment.startTimeMs,
      segment,
      answer: answers.get(segment.id),
    })),
    ...entries
      .filter((entry) => entry.kind === "screen_capture")
      .map((entry) => ({ kind: "capture" as const, timeMs: entry.timeMs, entry })),
  ];
  return items.sort((a, b) => a.timeMs - b.timeMs);
}

const QUICK_ACTIONS = [
  { icon: ListChecksIcon, label: "Action items", prompt: "What action items and commitments have been mentioned so far? List each with the responsible person if mentioned." },
  { icon: ZapIcon, label: "Summarize", prompt: "Give me a brief summary of this meeting so far. What are the key topics discussed and any decisions made?" },
  { icon: MessageCircleQuestionIcon, label: "What should I say?", prompt: "Based on the conversation so far, what would be a good thing for me to say next? Suggest 2-3 options." },
  { icon: ZapIcon, label: "Key moments", prompt: "What are the most important moments in this meeting so far? Highlight any critical decisions, concerns, or breakthroughs." },
];

const MeetingView = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const { allAiProviders, selectedAIProvider } = useApp();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [entries, setEntries] = useState<MeetingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timer, setTimer] = useState("00:00");
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({
    You: "You",
    Them: "Them",
  });
  const [showSpeakerEdit, setShowSpeakerEdit] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // The latest Private Request's Web Search, shown under its reply.
  const [chatWebSearch, setChatWebSearch] = useState<{
    messageId: string;
    status: WebSearchStatus;
  } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Recap ("Save as knowledge")
  const [isWritingRecap, setIsWritingRecap] = useState(false);
  const [recapDraft, setRecapDraft] = useState<{ name: string; content: string } | null>(null);
  const [recapMessage, setRecapMessage] = useState<{ saved: boolean; text: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const speakerNamesLoadedRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const meetingStartRef = useRef(0);

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
        meetingStartRef.current = m.startedAt;
        setEditTitle(m.title);
        speakerNamesLoadedRef.current = false;
        setSpeakerNames({
          You: speakerLabel("You", m.type),
          Them: speakerLabel("Them", m.type),
          ...(m.speakerNames ?? {}),
        });
        const [segs, meetingEntries] = await Promise.all([
          getSegmentsByMeetingId(meetingId),
          getMeetingEntries(meetingId),
        ]);
        setSegments(segs);
        setEntries(meetingEntries);
        setChatMessages(chatFromEntries(meetingEntries));
      }
      setIsLoading(false);
    };
    load();
  }, [meetingId]);

  // Speaker renames are saved with the Meeting (after the initial load sets them).
  useEffect(() => {
    if (!meetingId || isLoading) return;
    if (!speakerNamesLoadedRef.current) {
      speakerNamesLoadedRef.current = true;
      return;
    }
    const timeout = setTimeout(() => {
      updateMeetingSpeakerNames(meetingId, speakerNames).catch((err) =>
        console.error("Failed to save speaker names:", err)
      );
    }, 400);
    return () => clearTimeout(timeout);
  }, [meetingId, isLoading, speakerNames]);

  const resolveAI = useCallback(async (): Promise<MemoryAI | null> => {
    if (await shouldUseEchoIdealAPI()) {
      return { provider: undefined, selectedProvider: selectedAIProvider };
    }
    const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
    return provider ? { provider, selectedProvider: selectedAIProvider } : null;
  }, [allAiProviders, selectedAIProvider]);

  const handleMicTranscription = useCallback(
    async (text: string, spokenAt: number) => {
      if (!meetingId) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const startTimeMs = spokenAt - meetingStartRef.current;
      const segment: TranscriptSegment = {
        id, meetingId, speaker: "You", voice: null, content: text,
        startTimeMs, endTimeMs: Date.now() - meetingStartRef.current,
        confidence: null, isFinal: true, createdAt: Date.now(),
      };
      await addTranscriptSegment({
        id: segment.id, meetingId: segment.meetingId, speaker: segment.speaker,
        content: segment.content, startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs, confidence: null, isFinal: true,
      });
      setSegments((prev) => insertInSpokenOrder(prev, segment));
    },
    [meetingId]
  );

  const refreshSegments = useCallback(async () => {
    if (meetingId) setSegments(await getSegmentsByMeetingId(meetingId));
  }, [meetingId]);

  // Fixes for when voices are told apart wrongly: move one line, or merge two Voices.
  const moveLine = useCallback(
    async (segment: TranscriptSegment, to: number | "new") => {
      if (!meetingId) return;
      let voice = to;
      if (voice === "new") {
        const known = await getMeetingVoices(meetingId);
        const used = segments.filter((s) => s.voice !== null).map((s) => ({ voice: s.voice! }));
        voice = nextVoice([...known, ...used]);
        // It has no profile yet, so new lines aren't matched to it; it keeps its number.
        await saveMeetingVoice(meetingId, { voice, fingerprint: new Float32Array(256), lines: 0 });
      }
      await setSegmentVoice(segment.id, voice);
      await voicesChanged(meetingId);
      await refreshSegments();
    },
    [meetingId, segments, refreshSegments]
  );

  const mergeVoice = useCallback(
    async (from: number, into: number) => {
      if (!meetingId) return;
      await mergeMeetingVoices(meetingId, from, into);
      setSpeakerNames((prev) => {
        const { [`Them ${from}`]: fromName, ...rest } = prev;
        const intoKey = `Them ${into}`;
        return rest[intoKey] || !fromName ? rest : { ...rest, [intoKey]: fromName };
      });
      await voicesChanged(meetingId);
      await refreshSegments();
    },
    [meetingId, refreshSegments]
  );

  useEffect(() => {
    if (!meeting || meeting.status !== "active") return;
    const interval = setInterval(() => setTimer(formatTimer(meeting.startedAt)), 1000);
    return () => clearInterval(interval);
  }, [meeting]);

  useEffect(() => {
    if (lastSegment && meetingId) {
      setSegments((prev) => insertInSpokenOrder(prev, {
        id: lastSegment.id, meetingId, speaker: lastSegment.speaker, voice: lastSegment.voice,
        content: lastSegment.content, startTimeMs: lastSegment.startTimeMs,
        endTimeMs: lastSegment.endTimeMs, confidence: null, isFinal: true,
        createdAt: Date.now(),
      }));
    }
  }, [lastSegment, meetingId]);

  // A live transcript follows the latest line; a review starts at the top.
  useEffect(() => {
    if (meeting?.status === "active" && autoScrollRef.current && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [segments, meeting?.status]);

  useEffect(() => {
    if (chatScrollRef.current) {
      const el = chatScrollRef.current;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [chatMessages]);

  const handleStartTranscription = useCallback(async () => {
    if (meetingId && meeting) await startTranscription(meetingId, meeting.startedAt);
  }, [meetingId, meeting, startTranscription]);

  const handleEndMeeting = useCallback(async () => {
    if (!meetingId) return;
    await stopTranscription();
    await endMeeting(meetingId);
    setSegments(await getSegmentsByMeetingId(meetingId));
    setEntries(await getMeetingEntries(meetingId));
    const ai = await resolveAI();
    if (ai && meeting) {
      await generateMeetingSummary({
        meeting,
        provider: ai.provider,
        selectedProvider: ai.selectedProvider,
      }).catch((err) => console.error("Failed to generate summary:", err));
    }
    const updated = await getMeetingById(meetingId);
    setMeeting(updated);
  }, [meetingId, meeting, stopTranscription, resolveAI]);

  const handleSaveTitle = useCallback(async () => {
    if (!meetingId || !editTitle.trim()) return;
    await updateMeetingTitle(meetingId, editTitle.trim());
    setMeeting((prev) => prev ? { ...prev, title: editTitle.trim() } : null);
    setIsEditingTitle(false);
  }, [meetingId, editTitle]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      autoScrollRef.current = true;
    }
  }, []);

  // A Private Request: it gets Active Knowledge and Meeting Memory, is saved with the Meeting,
  // and is never added to Meeting Memory.
  const sendChatMessage = useCallback(async (message: string) => {
    const text = message.trim();
    if (!text || isAiLoading || !meeting) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsAiLoading(true);

    const ai = await resolveAI();
    if (!ai) {
      setChatMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Please configure an AI provider in Dev Space to use meeting chat." }]);
      setIsAiLoading(false);
      return;
    }

    const assistantId = `a-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const isLive = meeting.status === "active";
      const request = await prepareMeetingRequest({
        meeting,
        systemPrompt: isLive ? MEETING_SYSTEM_PROMPT : REVIEW_SYSTEM_PROMPT,
        images: [],
        ai,
        withTypeInstruction: isLive,
      });
      const webResults = await webSearchSection({
        ai,
        images: request.imagesBase64,
        question: text,
        previousQuestion: lastUserQuestion(chatMessages),
        onStatus: (status) => setChatWebSearch({ messageId: assistantId, status }),
      });
      // Memory carries the Meeting; only the last few chat turns go along as history.
      const history = chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      let fullResponse = "";
      for await (const chunk of fetchAIResponse({
        provider: ai.provider,
        selectedProvider: ai.selectedProvider,
        systemPrompt: request.systemPrompt,
        meetingContext: request.meetingContext,
        webResults: webResults ?? undefined,
        history,
        userMessage: text,
        imagesBase64: request.imagesBase64,
      })) {
        fullResponse += chunk;
        setChatMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m
        ));
      }
      if (fullResponse && !isAIErrorText(fullResponse)) {
        const saved = await addMeetingEntry({
          meetingId: meeting.id,
          kind: "private_request",
          prompt: text,
          content: fullResponse,
          images: [],
          segmentId: null,
          timeMs: Date.now() - meeting.startedAt,
        });
        setEntries((prev) => [...prev, saved]);
      }
    } catch (err) {
      setChatMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}` } : m
      ));
    } finally {
      setIsAiLoading(false);
    }
  }, [isAiLoading, meeting, resolveAI, chatMessages]);

  const handleWriteRecap = useCallback(async () => {
    if (!meeting || isWritingRecap) return;
    setRecapMessage(null);
    const ai = await resolveAI();
    if (!ai) {
      setRecapMessage({ saved: false, text: "Configure an AI provider in Dev Space to write a Recap." });
      return;
    }
    setIsWritingRecap(true);
    try {
      setRecapDraft(await generateRecap(meeting, ai));
    } catch (err) {
      setRecapMessage({ saved: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsWritingRecap(false);
    }
  }, [meeting, isWritingRecap, resolveAI]);

  // Home's "Write Recap" opens this page with ?recap=1: start writing once the Meeting has loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("recap") !== "1" || !meeting || !canSaveRecap(meeting)) return;
    setSearchParams({}, { replace: true });
    handleWriteRecap();
  }, [searchParams, meeting, handleWriteRecap, setSearchParams]);

  // Recaps are saved switched off, like any new Knowledge Document, and linked to their Meeting
  // so Home and the Meetings list can show "Recap saved" and offer them under Carry forward.
  const handleSaveRecap = useCallback(async (name: string, content: string) => {
    try {
      const doc = await createKnowledgeDocument({ name, source_type: "markdown", content });
      if (meeting) {
        await setMeetingRecapDocument(meeting.id, doc.id);
        setMeeting((prev) => (prev ? { ...prev, recapDocumentId: doc.id } : prev));
      }
      setRecapMessage({ saved: true, text: `Saved “${doc.name}” to Knowledge, switched off.` });
      return true;
    } catch (err) {
      setRecapMessage({ saved: false, text: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, [meeting]);

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
        <Button variant="outline" onClick={() => navigate("/meetings")}>Back to Meetings</Button>
      </div>
    );
  }

  const isActive = meeting.status === "active";
  const several = hasSeveralVoices(segments);
  const voices = [
    ...new Set(segments.filter((s) => s.speaker === "Them" && s.voice !== null).map((s) => s.voice!)),
  ].sort((a, b) => a - b);
  // Each speaker's default label ("Interviewer 2"), and the name shown for it.
  const labelOf = (s: Pick<TranscriptSegment, "speaker" | "voice">) =>
    speakerLabel(speakerKey(s, several), meeting.type);
  const shownAs = (s: Pick<TranscriptSegment, "speaker" | "voice">) =>
    speakerName(nameKey(s), speakerNames, meeting.type) ?? labelOf(s);
  const voiceLine = (voice: number) => ({ speaker: "Them", voice });
  const speakerRows: Pick<TranscriptSegment, "speaker" | "voice">[] = [
    { speaker: "You", voice: null },
    ...(voices.length > 0 ? voices.map(voiceLine) : [{ speaker: "Them", voice: null }]),
  ];
  const uniqueSpeakers = [
    ...new Set(
      segments.map((s) => shownAs(s))
    ),
  ];
  const timeline = buildTimeline(segments, entries);

  return (
    <div className="flex flex-1 flex-col">
      <header>
        <PageHeader
          title={meeting.title}
          titleEditor={
            isEditingTitle ? (
              <div className="flex items-center gap-2 pb-1">
                <Input
                  value={editTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSaveTitle()}
                  className="h-9 text-lg font-semibold"
                  aria-label="Meeting title"
                  autoFocus
                />
                <Button variant="ghost" size="icon" className="size-8" onClick={handleSaveTitle} title="Save title">
                  <CheckIcon className="size-4" />
                </Button>
              </div>
            ) : undefined
          }
          subtitle={
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span>{formatDate(meeting.startedAt)}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" />
                {isActive ? timer : formatDuration(meeting.startedAt, meeting.endedAt)}
              </span>
              {uniqueSpeakers.length > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex items-center gap-1">
                    <UsersIcon className="size-3" />
                    {uniqueSpeakers.join(", ")}
                  </span>
                </>
              )}
              {isActive && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[10px] font-semibold">
                  <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live
                </span>
              )}
              {isTranscribing && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                  <MicIcon className="size-2.5" />
                  Transcribing
                </span>
              )}
            </div>
          }
          actions={
            <>
              {isActive && !isEditingTitle && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditTitle(meeting.title); setIsEditingTitle(true); }}
                  className="gap-1.5"
                  title="Rename this Meeting"
                >
                  <PencilIcon className="size-3" />Rename
                </Button>
              )}
              {isActive && (
                <>
                  {isTranscribing ? (
                    <Button size="sm" variant="outline" onClick={stopTranscription} className="gap-1.5">
                      <MicOffIcon className="size-3" />Pause
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleStartTranscription} className="gap-1.5">
                      <MicIcon className="size-3" />Transcribe
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={handleEndMeeting} className="gap-1.5">
                    <SquareIcon className="size-3" />End
                  </Button>
                </>
              )}
              {canSaveRecap(meeting) && (
                <Button
                  size="sm"
                  onClick={handleWriteRecap}
                  disabled={isWritingRecap}
                  className="gap-1.5"
                  title={`Write a Recap of this ${MEETING_TYPE_LABELS[meeting.type].toLowerCase()} to use in your next round`}
                >
                  {isWritingRecap ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <BookPlusIcon className="size-3" />
                  )}
                  {isWritingRecap ? "Writing Recap…" : "Save as knowledge"}
                </Button>
              )}
            </>
          }
        />

        {recapMessage && (
          <div
            className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              recapMessage.saved ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"
            }`}
            role="status"
          >
            <span className="flex-1">{recapMessage.text}</span>
            {recapMessage.saved && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => navigate("/knowledge")}>
                Open Knowledge
              </Button>
            )}
          </div>
        )}

        {transcriptionError && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">{transcriptionError}</div>
        )}

        {showSpeakerEdit && (
          <div className="mt-2 p-3 rounded-lg border border-border/50 bg-card/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><UsersIcon className="size-3" />Rename Speakers</span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowSpeakerEdit(false)}>Done</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {speakerRows.map((row) => {
                const key = nameKey(row);
                const label = labelOf(row);
                const others = row.voice !== null && several ? voices.filter((v) => v !== row.voice) : [];
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0 truncate">{label}:</span>
                    <Input
                      value={speakerName(key, speakerNames, meeting.type) ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeakerNames((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="h-7 text-xs"
                      placeholder={label}
                    />
                    {others.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] shrink-0">Merge</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel className="text-xs">Same person as…</DropdownMenuLabel>
                          {others.map((v) => (
                            <DropdownMenuItem key={v} className="text-xs" onSelect={() => mergeVoice(row.voice!, v)}>
                              {shownAs(voiceLine(v))}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!showSpeakerEdit && segments.length > 0 && (
          <div className="-mx-2 mt-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1" onClick={() => setShowSpeakerEdit(true)}>
              <UsersIcon className="size-3" />Rename speakers
            </Button>
          </div>
        )}

        <div className="border-b border-input/50 mt-2" />
      </header>

      <MicTranscriber isActive={isTranscribing} onTranscription={handleMicTranscription} />

      <Tabs defaultValue="transcript" className="flex-1 flex flex-col mt-1">
        <TabsList className="w-fit">
          <TabsTrigger value="transcript" className="gap-1.5 text-xs">
            <FileTextIcon className="size-3" />Transcript
            {segments.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({segments.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 text-xs">
            <ZapIcon className="size-3" />AI Chat
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5 text-xs">
            <MessageSquareIcon className="size-3" />Summary
          </TabsTrigger>
        </TabsList>

        {/* TRANSCRIPT TAB */}
        <TabsContent value="transcript" className="flex-1 mt-0 relative">
          <div
            ref={scrollRef}
            className="h-[calc(100vh-14rem-var(--chrome-h,0px))] overflow-y-auto pr-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              autoScrollRef.current = atBottom;
              setShowScrollButton(!atBottom && segments.length > 5);
            }}
          >
            {timeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                  <FileTextIcon className="size-6 opacity-40" />
                </div>
                <p className="text-sm font-medium">No transcript segments yet</p>
                <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
                  {isActive ? "Click \"Transcribe\" to start capturing audio in real time." : "This meeting has no recorded transcript."}
                </p>
                {isActive && !isTranscribing && (
                  <Button size="sm" onClick={handleStartTranscription} className="mt-2 gap-1.5">
                    <MicIcon className="size-3.5" />Start Transcription
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col py-2">
                <DiscrepancyList entries={entries} />
                {timeline.map((item, i) => {
                  const prev = i > 0 ? timeline[i - 1] : null;
                  const showTimeDivider = !prev || (item.timeMs - prev.timeMs > 60000);
                  const elapsedMin = Math.floor(item.timeMs / 60000);
                  return (
                    <div key={item.kind === "segment" ? item.segment.id : item.entry.id}>
                      {showTimeDivider && (
                        <div className="flex items-center gap-3 py-2 mt-1">
                          <div className="flex-1 h-px bg-border/30" />
                          <span className="text-[10px] text-muted-foreground/40 font-medium">{elapsedMin}m into meeting</span>
                          <div className="flex-1 h-px bg-border/30" />
                        </div>
                      )}
                      {item.kind === "segment" ? (
                        <>
                          <TranscriptSegmentItem
                            segment={item.segment}
                            label={shownAs(item.segment)}
                            styleKey={nameKey(item.segment)}
                            moveTo={
                              item.segment.speaker === "Them" && voices.length > 0
                                ? [
                                    ...voices
                                      .filter((v) => v !== item.segment.voice)
                                      .map((v) => ({
                                        label: shownAs(voiceLine(v)),
                                        onSelect: () => moveLine(item.segment, v),
                                      })),
                                    { label: "New speaker", onSelect: () => moveLine(item.segment, "new") },
                                  ]
                                : undefined
                            }
                          />
                          {item.answer && <SuggestedAnswerCard entry={item.answer} />}
                        </>
                      ) : (
                        <ScreenCaptureCard entry={item.entry} />
                      )}
                    </div>
                  );
                })}
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
          {showScrollButton && (
            <button onClick={scrollToBottom} className="absolute bottom-4 right-8 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs shadow-lg hover:bg-primary/90 transition-all">
              <ChevronDownIcon className="size-3" />Latest
            </button>
          )}
        </TabsContent>

        {/* AI CHAT TAB */}
        <TabsContent value="chat" className="flex-1 mt-0 flex flex-col">
          <div ref={chatScrollRef} className="flex-1 h-[calc(100vh-20rem-var(--chrome-h,0px))] overflow-y-auto pr-4 py-2">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <ZapIcon className="size-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Meeting AI Assistant</p>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                    Ask questions about your meeting, get suggestions, extract action items, or request a summary.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => sendChatMessage(action.prompt)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-all duration-200"
                    >
                      <action.icon className="size-3" />{action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/50 text-foreground rounded-bl-md"
                    }`}>
                      {msg.content ? (
                        msg.role === "assistant" ? (
                          <>
                            <Markdown>{msg.content}</Markdown>
                            {chatWebSearch?.messageId === msg.id && (
                              <WebSearchNote status={chatWebSearch.status} />
                            )}
                          </>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2Icon className="size-3 animate-spin" />
                          {chatWebSearch?.messageId === msg.id &&
                          chatWebSearch.status.state === "searching"
                            ? "Searching the web..."
                            : "Thinking..."}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {chatMessages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1 py-2 border-t border-border/30">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendChatMessage(action.prompt)}
                  disabled={isAiLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                >
                  <action.icon className="size-2.5" />{action.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 pb-2">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
              placeholder="Ask about your meeting..."
              className="min-h-[40px] max-h-[80px] resize-none text-sm"
              rows={1}
            />
            <Button
              size="icon"
              onClick={() => sendChatMessage(chatInput)}
              disabled={!chatInput.trim() || isAiLoading}
              className="shrink-0 size-9"
            >
              {isAiLoading ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
            </Button>
          </div>
        </TabsContent>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-14rem-var(--chrome-h,0px))] pr-4">
            {meeting.summary ? (
              <div className="py-4 text-sm text-foreground/90 leading-relaxed">
                <Markdown>{meeting.summary}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <MessageSquareIcon className="size-8 opacity-30" />
                <p className="text-sm">No summary available yet.</p>
                <p className="text-xs text-muted-foreground/60">
                  {isActive ? "A summary will be auto-generated when the meeting ends." : "No summary was generated for this meeting."}
                </p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <DocumentEditorDialog
        isOpen={!!recapDraft}
        onOpenChange={(open) => !open && setRecapDraft(null)}
        mode="recap"
        initialName={recapDraft?.name ?? ""}
        initialContent={recapDraft?.content ?? ""}
        onSave={handleSaveRecap}
      />
    </div>
  );
};

export default MeetingView;
