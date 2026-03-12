import { useState, useEffect, useCallback, useRef } from "react";
import {
  Meeting,
  TranscriptSegment,
  createMeeting,
  endMeeting as endMeetingDb,
  updateMeetingTitle,
  updateMeetingSummary,
  getAllMeetings,
  getMeetingById,
  getActiveMeeting,
  deleteMeeting as deleteMeetingDb,
  addTranscriptSegment,
  getSegmentsByMeetingId,
  deleteAllMeetings,
} from "@/lib/database/meetings.action";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const useMeeting = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const loadMeetings = useCallback(async () => {
    try {
      setIsLoading(true);
      const all = await getAllMeetings();
      setMeetings(all);

      const active = await getActiveMeeting();
      if (active) {
        setActiveMeeting(active);
        const segs = await getSegmentsByMeetingId(active.id);
        setSegments(segs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    if (activeMeeting && activeMeeting.status === "active") {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - activeMeeting.startedAt) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeMeeting]);

  const startMeeting = useCallback(async (title?: string): Promise<Meeting> => {
    try {
      const meeting = await createMeeting({ id: generateId(), title });
      setActiveMeeting(meeting);
      setSegments([]);
      setElapsed(0);
      setMeetings((prev) => [meeting, ...prev]);
      return meeting;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  const endCurrentMeeting = useCallback(async () => {
    if (!activeMeeting) return;
    try {
      await endMeetingDb(activeMeeting.id);
      const updated = await getMeetingById(activeMeeting.id);
      setActiveMeeting(null);
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
      if (updated) {
        setMeetings((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeMeeting]);

  const addSegment = useCallback(
    async (params: {
      speaker: string;
      content: string;
      startTimeMs: number;
      endTimeMs?: number;
      confidence?: number;
    }) => {
      const meetingId = activeMeeting?.id;
      if (!meetingId) return;

      try {
        const segment = await addTranscriptSegment({
          id: generateId(),
          meetingId,
          speaker: params.speaker,
          content: params.content,
          startTimeMs: params.startTimeMs,
          endTimeMs: params.endTimeMs ?? null,
          confidence: params.confidence ?? null,
          isFinal: true,
        });
        setSegments((prev) => [...prev, segment]);
      } catch (err) {
        console.error("Failed to add transcript segment:", err);
      }
    },
    [activeMeeting]
  );

  const loadMeetingSegments = useCallback(async (meetingId: string) => {
    try {
      const segs = await getSegmentsByMeetingId(meetingId);
      setSegments(segs);
      return segs;
    } catch (err) {
      console.error("Failed to load segments:", err);
      return [];
    }
  }, []);

  const renameMeeting = useCallback(
    async (id: string, title: string) => {
      try {
        await updateMeetingTitle(id, title);
        setMeetings((prev) =>
          prev.map((m) => (m.id === id ? { ...m, title } : m))
        );
        if (activeMeeting?.id === id) {
          setActiveMeeting((prev) => (prev ? { ...prev, title } : null));
        }
      } catch (err) {
        console.error("Failed to rename meeting:", err);
      }
    },
    [activeMeeting]
  );

  const saveSummary = useCallback(async (id: string, summary: string) => {
    try {
      await updateMeetingSummary(id, summary);
      setMeetings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, summary } : m))
      );
    } catch (err) {
      console.error("Failed to save summary:", err);
    }
  }, []);

  const removeMeeting = useCallback(async (id: string) => {
    try {
      await deleteMeetingDb(id);
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete meeting:", err);
    }
  }, []);

  const clearAllMeetings = useCallback(async () => {
    try {
      await deleteAllMeetings();
      setMeetings([]);
      setActiveMeeting(null);
      setSegments([]);
    } catch (err) {
      console.error("Failed to clear meetings:", err);
    }
  }, []);

  const formatElapsed = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  return {
    meetings,
    activeMeeting,
    segments,
    isLoading,
    error,
    elapsed,
    formattedElapsed: formatElapsed(elapsed),
    startMeeting,
    endCurrentMeeting,
    addSegment,
    loadMeetingSegments,
    renameMeeting,
    saveSummary,
    removeMeeting,
    clearAllMeetings,
    loadMeetings,
  };
};
