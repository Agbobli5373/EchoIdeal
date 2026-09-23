import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ScrollArea, Button, Input, Markdown } from "@/components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Meeting,
  TranscriptSegment,
  getMeetingById,
  getSegmentsByMeetingId,
  endMeeting,
  updateMeetingTitle,
  updateMeetingSummary,
  addTranscriptSegment,
} from "@/lib/database/meetings.action";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import { MicTranscriber } from "./MicTranscriber";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { useApp } from "@/contexts";
import {
  ArrowLeftIcon,
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

function buildTranscriptContext(segments: TranscriptSegment[], maxSegments = 30): string {
  const recent = segments.slice(-maxSegments);
  if (recent.length === 0) return "(No transcript yet)";
  return recent
    .map((s) => `[${s.speaker}]: ${s.content}`)
    .join("\n");
}

const MEETING_SYSTEM_PROMPT = `You are a real-time meeting assistant. You have access to the live transcript of an ongoing meeting. Your role is to:
1. Answer questions about what was discussed
2. Suggest responses when the user seems stuck
3. Provide counter-arguments when objections are raised
4. Track action items and commitments mentioned in the conversation
5. Summarize key points when asked

Be concise and actionable. Reference specific parts of the transcript when relevant.

Format replies in Markdown when helpful (headings, bullets, code blocks).`;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  const [chatInput, setChatInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
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
        const segs = await getSegmentsByMeetingId(meetingId);
        setSegments(segs);
      }
      setIsLoading(false);
    };
    load();
  }, [meetingId]);

  const handleMicTranscription = useCallback(
    async (text: string, spokenAt: number) => {
      if (!meetingId) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const startTimeMs = spokenAt - meetingStartRef.current;
      const segment: TranscriptSegment = {
        id, meetingId, speaker: "You", content: text,
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

  useEffect(() => {
    if (!meeting || meeting.status !== "active") return;
    const interval = setInterval(() => setTimer(formatTimer(meeting.startedAt)), 1000);
    return () => clearInterval(interval);
  }, [meeting]);

  useEffect(() => {
    if (lastSegment && meetingId) {
      setSegments((prev) => insertInSpokenOrder(prev, {
        id: lastSegment.id, meetingId, speaker: lastSegment.speaker,
        content: lastSegment.content, startTimeMs: lastSegment.startTimeMs,
        endTimeMs: lastSegment.endTimeMs, confidence: null, isFinal: true,
        createdAt: Date.now(),
      }));
    }
  }, [lastSegment, meetingId]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [segments]);

  useEffect(() => {
    if (chatScrollRef.current) {
      const el = chatScrollRef.current;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [chatMessages]);

  const handleStartTranscription = useCallback(async () => {
    if (meetingId) await startTranscription(meetingId);
  }, [meetingId, startTranscription]);

  const handleEndMeeting = useCallback(async () => {
    if (!meetingId) return;
    await stopTranscription();
    await endMeeting(meetingId);
    const finalSegments = await getSegmentsByMeetingId(meetingId);
    setSegments(finalSegments);
    if (finalSegments.length > 0) {
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
          if (provider) {
        try {
          const transcript = buildTranscriptContext(finalSegments, 100);
          let summary = "";
          const gen = fetchAIResponse({
            provider, selectedProvider: selectedAIProvider,
            systemPrompt:
              "You are a meeting summarizer. Return Markdown with the following sections as headings:\n\n## Overview\n## Key Topics\n## Decisions Made\n## Action Items\n## Follow-up Questions\n\nUse bullet lists where appropriate. Be concise and specific.",
            userMessage: `Summarize this meeting transcript:\n\n${transcript}`,
            knowledgeMode: "background",
          });
          for await (const chunk of gen) { summary += chunk; }
          if (summary) await updateMeetingSummary(meetingId, summary);
        } catch (err) { console.error("Failed to generate summary:", err); }
      }
    }
    const updated = await getMeetingById(meetingId);
    setMeeting(updated);
  }, [meetingId, stopTranscription, allAiProviders, selectedAIProvider]);

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

  const sendChatMessage = useCallback(async (message: string) => {
    if (!message.trim() || isAiLoading) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: message.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsAiLoading(true);

    const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
    if (!provider) {
      setChatMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Please configure an AI provider in Dev Space to use meeting chat." }]);
      setIsAiLoading(false);
      return;
    }

    const transcript = buildTranscriptContext(segments);
    const contextPrompt = `${MEETING_SYSTEM_PROMPT}\n\nCurrent meeting transcript:\n${transcript}`;
    const assistantId = `a-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const history = chatMessages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, timestamp: Date.now() }));
      const gen = fetchAIResponse({
        provider, selectedProvider: selectedAIProvider, systemPrompt: contextPrompt,
        userMessage: message.trim(), history,
      });
      for await (const chunk of gen) {
        setChatMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m
        ));
      }
    } catch (err) {
      setChatMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}` } : m
      ));
    } finally {
      setIsAiLoading(false);
    }
  }, [isAiLoading, allAiProviders, selectedAIProvider, segments, chatMessages]);

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
  const uniqueSpeakers = [...new Set(segments.map((s) => s.speaker))];

  return (
    <div className="flex flex-1 flex-col">
      <header className="pt-8">
        <div className="flex items-center gap-3 mb-1">
          <Button variant="ghost" size="icon" onClick={() => navigate("/meetings")} className="size-8">
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSaveTitle()}
                  className="h-8 text-lg font-semibold"
                  autoFocus
                />
                <Button variant="ghost" size="icon" className="size-7" onClick={handleSaveTitle}>
                  <CheckIcon className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-lg font-semibold truncate">{meeting.title}</h1>
                {isActive && (
                  <button onClick={() => { setEditTitle(meeting.title); setIsEditingTitle(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <PencilIcon className="size-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
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
                    {uniqueSpeakers.map((s) => speakerNames[s] || s).join(", ")}
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
          </div>

          {isActive && (
            <div className="flex items-center gap-2 shrink-0">
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
            </div>
          )}
        </div>

        {transcriptionError && (
          <div className="mx-11 mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">{transcriptionError}</div>
        )}

        {showSpeakerEdit && (
          <div className="mx-11 mt-2 p-3 rounded-lg border border-border/50 bg-card/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><UsersIcon className="size-3" />Rename Speakers</span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowSpeakerEdit(false)}>Done</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(speakerNames).map(([key, name]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0">{key}:</span>
                  <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeakerNames((prev) => ({ ...prev, [key]: e.target.value || key }))} className="h-7 text-xs" placeholder={key} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!showSpeakerEdit && segments.length > 0 && (
          <div className="mx-11 mt-1">
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
            className="h-[calc(100vh-14rem)] overflow-y-auto pr-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              autoScrollRef.current = atBottom;
              setShowScrollButton(!atBottom && segments.length > 5);
            }}
          >
            {segments.length === 0 ? (
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
                {segments.map((seg, i) => {
                  const prevSeg = i > 0 ? segments[i - 1] : null;
                  const showTimeDivider = !prevSeg || (seg.startTimeMs - prevSeg.startTimeMs > 60000);
                  const elapsedMin = Math.floor(seg.startTimeMs / 60000);
                  return (
                    <div key={seg.id}>
                      {showTimeDivider && (
                        <div className="flex items-center gap-3 py-2 mt-1">
                          <div className="flex-1 h-px bg-border/30" />
                          <span className="text-[10px] text-muted-foreground/40 font-medium">{elapsedMin}m into meeting</span>
                          <div className="flex-1 h-px bg-border/30" />
                        </div>
                      )}
                      <TranscriptSegmentItem segment={{ ...seg, speaker: speakerNames[seg.speaker] || seg.speaker }} />
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
          <div ref={chatScrollRef} className="flex-1 h-[calc(100vh-20rem)] overflow-y-auto pr-4 py-2">
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
                          <Markdown>{msg.content}</Markdown>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2Icon className="size-3 animate-spin" />Thinking...
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
          <ScrollArea className="h-[calc(100vh-14rem)] pr-4">
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
    </div>
  );
};

export default MeetingView;
