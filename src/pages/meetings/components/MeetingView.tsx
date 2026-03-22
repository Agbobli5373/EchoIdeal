import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ScrollArea,
  Button,
  Input,
  Markdown,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
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
  updateMeetingPlaybook,
  updateMeetingSummaryArtifact,
  addTranscriptSegment,
} from "@/lib/database/meetings.action";
import {
  listTriggersForMeeting,
  createCopilotTrigger,
  deleteCopilotTrigger,
  type CopilotTrigger,
} from "@/lib/database/copilot-triggers.action";
import { buildTranscriptContext } from "@/lib/meeting-transcript";
import { buildTranscriptMarkdown } from "@/lib/meeting-transcript-export";
import { saveMarkdownExport } from "@/lib/markdown-file-export";
import { augmentPromptsForChat } from "@/lib/knowledge/augment-prompts";
import { useCopilotProfile } from "@/contexts/copilot-profile.context";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import { MicTranscriber } from "./MicTranscriber";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { useApp } from "@/contexts";
import {
  STORAGE_KEYS,
  COPILOT_RISK_NOTES_CHANGED_EVENT,
} from "@/config";
import { safeLocalStorage } from "@/lib";
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
  BookOpenIcon,
  ShieldIcon,
  DownloadIcon,
  PlusIcon,
  Trash2Icon,
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

const MEETING_SYSTEM_PROMPT = `You are a real-time meeting assistant. You have access to the live transcript of an ongoing meeting. Your role is to:
1. Answer questions about what was discussed
2. Suggest responses when the user seems stuck
3. Provide counter-arguments when objections are raised
4. Track action items and commitments mentioned in the conversation
5. Summarize key points when asked

Be concise and actionable. Reference specific parts of the transcript when relevant.

Format replies in Markdown when helpful (headings, bullets, code blocks).`;

const PLAYBOOK_SYSTEM = `You are a live meeting playbook. Output 3–5 short bullet suggestions only (what to say, clarify, or handle objections). No preamble, no title line. Use Markdown bullets.`;

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
  const { allAiProviders, selectedAIProvider, customizable } = useApp();
  const {
    activeProfile,
    profiles,
    setActiveProfileId,
    activeProfileId,
  } = useCopilotProfile();

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

  const [playbookMd, setPlaybookMd] = useState("");
  const [playbookPaused, setPlaybookPaused] = useState(false);
  const [playbookLoading, setPlaybookLoading] = useState(false);
  const [triggers, setTriggers] = useState<CopilotTrigger[]>([]);
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);
  const [wrapBusy, setWrapBusy] = useState(false);
  const [ntName, setNtName] = useState("");
  const [ntPattern, setNtPattern] = useState("");
  const [ntMatch, setNtMatch] = useState<"keyword" | "regex">("keyword");
  const [ntCool, setNtCool] = useState(120);
  const [ntTpl, setNtTpl] = useState(
    "Give one short line of coaching for the user based on the matched moment."
  );
  const [riskNotesVisible, setRiskNotesVisible] = useState(
    () =>
      safeLocalStorage.getItem(STORAGE_KEYS.COPILOT_RISK_NOTES_VISIBLE) ===
      "true"
  );

  const triggerCooldownRef = useRef<Record<string, number>>({});
  const triggerMinuteRef = useRef<number[]>([]);
  const prevSegCountRef = useRef(0);

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
        prevSegCountRef.current = segs.length;
        if (m.lastPlaybookJson) {
          try {
            const p = JSON.parse(m.lastPlaybookJson) as { body?: string };
            setPlaybookMd(p.body ?? m.lastPlaybookJson);
          } catch {
            setPlaybookMd(m.lastPlaybookJson);
          }
        } else {
          setPlaybookMd("");
        }
      }
      setIsLoading(false);
    };
    load();
  }, [meetingId]);

  const handleMicTranscription = useCallback(
    async (text: string) => {
      if (!meetingId) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const startTimeMs = Date.now() - meetingStartRef.current;
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
      setSegments((prev) => [...prev, segment]);
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
      setSegments((prev) => [...prev, {
        id: lastSegment.id, meetingId, speaker: lastSegment.speaker,
        content: lastSegment.content, startTimeMs: lastSegment.startTimeMs,
        endTimeMs: lastSegment.endTimeMs, confidence: null, isFinal: true,
        createdAt: Date.now(),
      }]);
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
    if (segments.length > 0) {
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
          if (provider) {
        try {
          const transcript = buildTranscriptContext(segments, 100);
          let summary = "";
          const gen = fetchAIResponse({
            provider, selectedProvider: selectedAIProvider,
            systemPrompt:
              "You are a meeting summarizer. Return Markdown with the following sections as headings:\n\n## Overview\n## Key Topics\n## Decisions Made\n## Action Items\n## Follow-up Questions\n\nUse bullet lists where appropriate. Be concise and specific.",
            userMessage: `Summarize this meeting transcript:\n\n${transcript}`,
          });
          for await (const chunk of gen) { summary += chunk; }
          if (summary) await updateMeetingSummary(meetingId, summary);
        } catch (err) { console.error("Failed to generate summary:", err); }
      }
    }
    const updated = await getMeetingById(meetingId);
    setMeeting(updated);
  }, [meetingId, stopTranscription, segments, allAiProviders, selectedAIProvider]);

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

  useEffect(() => {
    if (!meetingId) return;
    void listTriggersForMeeting(meetingId).then(setTriggers);
  }, [meetingId]);

  useEffect(() => {
    const onChanged = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      if (typeof ce.detail === "boolean") {
        setRiskNotesVisible(ce.detail);
        return;
      }
      setRiskNotesVisible(
        safeLocalStorage.getItem(STORAGE_KEYS.COPILOT_RISK_NOTES_VISIBLE) ===
          "true"
      );
    };
    window.addEventListener(
      COPILOT_RISK_NOTES_CHANGED_EVENT,
      onChanged as EventListener
    );
    return () =>
      window.removeEventListener(
        COPILOT_RISK_NOTES_CHANGED_EVENT,
        onChanged as EventListener
      );
  }, []);

  const refreshPlaybook = useCallback(async () => {
    if (!meetingId || !meeting || meeting.status !== "active" || playbookPaused) {
      return;
    }
    const provider = allAiProviders.find(
      (p) => p.id === selectedAIProvider.provider
    );
    if (!provider) return;
    const transcript = buildTranscriptContext(segments, 35);
    if (transcript === "(No transcript yet)") return;

    setPlaybookLoading(true);
    try {
      const userMsg = `Recent transcript:\n${transcript}\n\nProduce playbook bullets only.`;
      const mergedPlaybookSystem = [
        activeProfile?.systemPrompt?.trim(),
        PLAYBOOK_SYSTEM,
      ]
        .filter((x) => x && x.length > 0)
        .join("\n\n");
      const aug = await augmentPromptsForChat({
        systemPrompt: mergedPlaybookSystem,
        userMessage: userMsg,
        conversationKnowledgeMode: activeProfile?.knowledgeMode ?? undefined,
        strictKb: activeProfile?.strictKb,
      });
      let out = "";
      const gen = fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: aug.systemPrompt,
        userMessage: aug.userMessage,
      });
      for await (const chunk of gen) {
        out += chunk;
      }
      if (out.trim()) {
        setPlaybookMd(out);
        const payload = JSON.stringify({
          body: out,
          updatedAt: Date.now(),
        });
        await updateMeetingPlaybook(meetingId, payload);
        setMeeting((prev) =>
          prev
            ? {
                ...prev,
                lastPlaybookJson: payload,
                playbookUpdatedAt: Date.now(),
              }
            : null
        );
      }
    } catch (err) {
      console.error("Playbook refresh failed:", err);
    } finally {
      setPlaybookLoading(false);
    }
  }, [
    meetingId,
    meeting,
    playbookPaused,
    segments,
    allAiProviders,
    selectedAIProvider,
    activeProfile?.systemPrompt,
    activeProfile?.knowledgeMode,
    activeProfile?.strictKb,
  ]);

  useEffect(() => {
    if (!meetingId || playbookPaused || meeting?.status !== "active") return;
    const t = window.setTimeout(() => {
      void refreshPlaybook();
    }, 22000);
    return () => window.clearTimeout(t);
  }, [
    segments,
    playbookPaused,
    meetingId,
    meeting?.status,
    refreshPlaybook,
  ]);

  useEffect(() => {
    if (!meetingId || segments.length === 0) {
      prevSegCountRef.current = 0;
      return;
    }
    if (segments.length < prevSegCountRef.current) {
      prevSegCountRef.current = segments.length;
      return;
    }
    const newSegs = segments.slice(prevSegCountRef.current);
    prevSegCountRef.current = segments.length;
    if (triggers.length === 0) return;

    const run = async () => {
      const enabled = triggers.filter((t) => t.enabled);
      const now = Date.now();
      triggerMinuteRef.current = triggerMinuteRef.current.filter(
        (x) => now - x < 60_000
      );

      for (const seg of newSegs) {
        for (const tr of enabled) {
          if (triggerMinuteRef.current.length >= 8) return;
          let matched = false;
          try {
            if (tr.matchType === "keyword") {
              matched = seg.content
                .toLowerCase()
                .includes(tr.pattern.toLowerCase());
            } else {
              matched = new RegExp(tr.pattern, "i").test(seg.content);
            }
          } catch {
            continue;
          }
          if (!matched) continue;
          const lastAt = triggerCooldownRef.current[tr.id] ?? 0;
          if (now - lastAt < tr.cooldownSec * 1000) continue;
          triggerCooldownRef.current[tr.id] = now;
          triggerMinuteRef.current.push(now);

          const provider = allAiProviders.find(
            (p) => p.id === selectedAIProvider.provider
          );
          if (!provider) continue;
          const ctx = buildTranscriptContext(segments, 18);
          try {
            let text = "";
            for await (const c of fetchAIResponse({
              provider,
              selectedProvider: selectedAIProvider,
              systemPrompt: tr.promptTemplate,
              userMessage: `Context:\n${ctx}\n\nMatched: [${seg.speaker}]: ${seg.content}`,
            })) {
              text += c;
            }
            if (text.trim()) {
              setTriggerNotice(
                `${tr.name}: ${text.slice(0, 320)}${text.length > 320 ? "…" : ""}`
              );
              window.setTimeout(() => setTriggerNotice(null), 12000);
            }
          } catch {
            /* one-shot trigger */
          }
        }
      }
    };
    void run();
  }, [segments, triggers, allAiProviders, selectedAIProvider, meetingId]);

  const handleWrapUp = useCallback(async () => {
    if (!meetingId || segments.length === 0) return;
    const provider = allAiProviders.find(
      (p) => p.id === selectedAIProvider.provider
    );
    if (!provider) return;
    setWrapBusy(true);
    try {
      const transcript = buildTranscriptContext(segments, 200);
      const aug = await augmentPromptsForChat({
        systemPrompt:
          "You produce concise meeting wrap-ups in Markdown with ## Summary, ## Decisions, ## Action items.",
        userMessage: `Transcript:\n${transcript}`,
        conversationKnowledgeMode: activeProfile?.knowledgeMode ?? undefined,
        strictKb: activeProfile?.strictKb,
      });
      let md = "";
      for await (const c of fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: aug.systemPrompt,
        userMessage: aug.userMessage,
      })) {
        md += c;
      }
      if (md.trim()) {
        await updateMeetingSummaryArtifact(meetingId, md);
        setMeeting((prev) =>
          prev ? { ...prev, summaryArtifactMd: md } : null
        );
      }
    } catch (e) {
      console.error("Wrap-up failed:", e);
    } finally {
      setWrapBusy(false);
    }
  }, [
    meetingId,
    segments,
    allAiProviders,
    selectedAIProvider,
    activeProfile?.knowledgeMode,
    activeProfile?.strictKb,
  ]);

  const addMeetingTrigger = useCallback(async () => {
    if (!meetingId || !ntName.trim() || !ntPattern.trim()) return;
    const id = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await createCopilotTrigger({
      id,
      meetingId,
      name: ntName.trim(),
      matchType: ntMatch,
      pattern: ntPattern.trim(),
      cooldownSec: ntCool,
      promptTemplate: ntTpl.trim() || "Suggest what to say next.",
    });
    const list = await listTriggersForMeeting(meetingId);
    setTriggers(list);
    setNtName("");
    setNtPattern("");
  }, [meetingId, ntName, ntPattern, ntMatch, ntCool, ntTpl]);

  const removeTrigger = useCallback(
    async (id: string) => {
      await deleteCopilotTrigger(id);
      if (meetingId) {
        setTriggers(await listTriggersForMeeting(meetingId));
      }
    },
    [meetingId]
  );

  const exportArtifact = useCallback(() => {
    const text = meeting?.summaryArtifactMd?.trim();
    if (!text) return;
    const name = `${(meeting?.title || "meeting").replace(/[^\w\d-]+/g, "_")}-wrap-up.md`;
    void navigator.clipboard.writeText(text).catch(() => {});
    void saveMarkdownExport(text, name);
  }, [meeting?.summaryArtifactMd, meeting?.title]);

  const exportTranscript = useCallback(() => {
    if (!meeting || segments.length === 0) return;
    const text = buildTranscriptMarkdown({
      meeting,
      segments,
      speakerLabels: speakerNames,
    });
    const name = `${(meeting.title || "meeting").replace(/[^\w\d-]+/g, "_")}-transcript.md`;
    void navigator.clipboard.writeText(text).catch(() => {});
    void saveMarkdownExport(text, name);
  }, [meeting, segments, speakerNames]);

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
    const basePrompt = [
      activeProfile?.systemPrompt?.trim(),
      MEETING_SYSTEM_PROMPT,
    ]
      .filter((x) => x && x.length > 0)
      .join("\n\n");
    const contextPrompt = `${basePrompt}\n\nCurrent meeting transcript:\n${transcript}`;
    const assistantId = `a-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const history = chatMessages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, timestamp: Date.now() }));
      const augmented = await augmentPromptsForChat({
        systemPrompt: contextPrompt,
        userMessage: message.trim(),
        conversationKnowledgeMode: activeProfile?.knowledgeMode ?? undefined,
        strictKb: activeProfile?.strictKb,
      });
      const gen = fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: augmented.systemPrompt,
        userMessage: augmented.userMessage,
        history,
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
  }, [
    isAiLoading,
    allAiProviders,
    selectedAIProvider,
    segments,
    chatMessages,
    activeProfile?.systemPrompt,
    activeProfile?.knowledgeMode,
    activeProfile?.strictKb,
  ]);

  const profileQuick = useMemo(() => {
    try {
      const raw = activeProfile?.quickActionsJson;
      if (!raw) return [];
      const arr = JSON.parse(raw) as { label: string; prompt: string }[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [activeProfile?.quickActionsJson]);

  /** Radix Select requires value to match a SelectItem; profiles load async so avoid invalid value on first paint. */
  const profileSelectValue = useMemo(() => {
    if (activeProfileId && profiles.some((p) => p.id === activeProfileId)) {
      return activeProfileId;
    }
    return "_none_";
  }, [activeProfileId, profiles]);

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
  const stealthShare = customizable.screenShareVisible?.isEnabled === false;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 pt-8">
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

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Select
              value={profileSelectValue}
              onValueChange={(v) =>
                setActiveProfileId(v === "_none_" ? null : v)
              }
            >
              <SelectTrigger
                className="h-8 w-[168px] text-xs"
                title="Copilot profile (system prompt + knowledge defaults)"
              >
                <SelectValue placeholder="Copilot profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">No profile</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isActive && (
              <div className="flex items-center gap-2">
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
        </div>

        {transcriptionError && (
          <div className="mx-11 mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">{transcriptionError}</div>
        )}
        {triggerNotice && (
          <div className="mx-11 mt-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-xs text-foreground">
            {triggerNotice}
          </div>
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

      <Tabs
        defaultValue="transcript"
        className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="transcript" className="gap-1.5 text-xs">
            <FileTextIcon className="size-3" />Transcript
            {segments.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({segments.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 text-xs">
            <ZapIcon className="size-3" />AI Chat
          </TabsTrigger>
          <TabsTrigger value="playbook" className="gap-1.5 text-xs">
            <BookOpenIcon className="size-3" />Playbook
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5 text-xs">
            <MessageSquareIcon className="size-3" />Summary
          </TabsTrigger>
        </TabsList>

        {/* TRANSCRIPT TAB */}
        <TabsContent value="transcript" className="relative mt-0 flex min-h-0 flex-1 flex-col">
          {segments.length > 0 && (
            <div className="flex shrink-0 justify-end pb-2 pr-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                title="Download .md and copy to clipboard"
                onClick={exportTranscript}
              >
                <DownloadIcon className="size-3.5" />
                Export transcript
              </Button>
            </div>
          )}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto pr-4"
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
        <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto py-2 pr-4"
          >
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
                  {profileQuick.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => sendChatMessage(q.prompt)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/25 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <ListChecksIcon className="size-3" />{q.label}
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
            <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border/30 px-1 py-2">
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

          <div className="flex shrink-0 items-center gap-2 pb-2 pt-1">
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

        {/* PLAYBOOK TAB — single scroll column: suggestions + triggers */}
        <TabsContent
          value="playbook"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto pr-4">
            <div className="flex flex-col gap-3 pb-4">
              {riskNotesVisible && (
                <details className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none font-medium text-foreground/90">
                    Reminders (cost, privacy, screen AI)
                  </summary>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4">
                    <li>
                      Playbook auto-refresh and triggers call your chosen AI
                      provider and use tokens—pause or widen cooldowns if cost
                      matters.
                    </li>
                    <li>
                      Transcript text is sent to that provider when playbook,
                      triggers, chat, or wrap-up run. Use settings you trust.
                    </li>
                    <li>
                      Fusion assist (shortcut) needs image support and a
                      vision-capable model; otherwise use text-only flows.
                    </li>
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={playbookPaused ? "secondary" : "outline"}
                  onClick={() => setPlaybookPaused((p) => !p)}
                  disabled={!isActive}
                >
                  {playbookPaused ? "Resume" : "Pause"} auto-refresh
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshPlaybook()}
                  disabled={playbookLoading || !isActive}
                >
                  {playbookLoading ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    "Refresh now"
                  )}
                </Button>
                {meeting.playbookUpdatedAt != null && (
                  <span className="text-[10px] text-muted-foreground">
                    Last updated{" "}
                    {new Date(meeting.playbookUpdatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {stealthShare && (
                <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <ShieldIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Screen-share stealth is on (window hidden from capture).
                    Playbook text is minimized here—open EchoIdeal only when
                    safe.
                  </span>
                </div>
              )}
              <div
                className={
                  stealthShare
                    ? "max-h-32 select-none overflow-hidden rounded-md border border-border/30 py-2 text-sm leading-relaxed opacity-40 pointer-events-none"
                    : "py-2 text-sm leading-relaxed"
                }
              >
                {playbookMd ? (
                  <Markdown>{playbookMd}</Markdown>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isActive
                      ? "Playbook updates on a timer when there is transcript text. Pause anytime."
                      : "No playbook for this meeting."}
                  </p>
                )}
              </div>

              <div className="border-t border-border/40 pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Proactive triggers (this meeting)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Name"
                value={ntName}
                onChange={(e) => setNtName(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Keyword or regex pattern"
                value={ntPattern}
                onChange={(e) => setNtPattern(e.target.value)}
                className="h-8 text-xs"
              />
              <Select
                value={ntMatch}
                onValueChange={(v) => setNtMatch(v as "keyword" | "regex")}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword contains</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={5}
                value={ntCool}
                onChange={(e) => setNtCool(Number(e.target.value) || 60)}
                className="h-8 text-xs"
                title="Cooldown seconds"
              />
            </div>
            <Textarea
              value={ntTpl}
              onChange={(e) => setNtTpl(e.target.value)}
              className="min-h-[56px] text-xs"
              placeholder="System / template prompt when fired"
            />
            <Button size="sm" className="gap-1" onClick={() => void addMeetingTrigger()}>
              <PlusIcon className="size-3" />Add trigger
            </Button>
            <ul className="space-y-2 text-xs">
              {triggers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border/40 p-2"
                >
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-muted-foreground break-all">
                      {t.matchType}: {t.pattern} · {t.cooldownSec}s cooldown
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={() => void removeTrigger(t.id)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="min-h-0 flex-1 pr-4">
            <div className="space-y-4 pb-4">
            <div className="flex flex-wrap gap-2 py-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleWrapUp()}
                disabled={wrapBusy || segments.length === 0}
              >
                {wrapBusy ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  "Wrap up (AI artifact)"
                )}
              </Button>
              {meeting.summaryArtifactMd && (
                <Button size="sm" variant="outline" className="gap-1" onClick={exportArtifact}>
                  <DownloadIcon className="size-3" />
                  Export / copy
                </Button>
              )}
            </div>
            {meeting.summaryArtifactMd && (
              <div className="py-2 text-sm text-foreground/90 leading-relaxed border-b border-border/30 mb-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Wrap-up artifact</p>
                <Markdown>{meeting.summaryArtifactMd}</Markdown>
              </div>
            )}
            {meeting.summary ? (
              <div className="py-4 text-sm text-foreground/90 leading-relaxed">
                <p className="text-xs font-semibold text-muted-foreground mb-2">End-of-meeting summary</p>
                <Markdown>{meeting.summary}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <MessageSquareIcon className="size-8 opacity-30" />
                <p className="text-sm">No auto-summary yet.</p>
                <p className="text-xs text-muted-foreground/60 text-center max-w-sm">
                  {isActive
                    ? "A summary is generated when you end the meeting, or use Wrap up for a stored artifact."
                    : "No summary was generated for this meeting."}
                </p>
              </div>
            )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MeetingView;
