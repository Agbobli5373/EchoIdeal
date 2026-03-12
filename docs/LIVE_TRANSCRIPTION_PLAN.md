# Live Meeting Transcription — Implementation Plan

> Real-time transcription with speaker labels, live transcript view, and post-meeting summaries.

---

## Current State vs. Target

```
CURRENT (what we have)                    TARGET (what we're building)
─────────────────────                     ────────────────────────────

Audio capture ✅                          Audio capture ✅
    ↓                                         ↓
VAD detects speech chunk ✅               Continuous streaming transcription
    ↓                                         ↓
Send chunk to STT ✅                      Speaker diarization (who said what)
    ↓                                         ↓
Get text back ✅                          Live scrolling transcript view
    ↓                                         ↓
Send to AI for Q&A ✅                     Real-time AI assistance + suggestions
    ↓                                         ↓
Show AI response ✅                       Post-meeting summary generation
                                              ↓
                                          Searchable meeting history
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Meeting Session                           │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐ │
│  │ System Audio │───►│ Continuous   │───►│ Live Transcript     │ │
│  │ Capture      │    │ STT Stream   │    │ Store (SQLite)      │ │
│  │ (existing)   │    │ (new)        │    │ (new)               │ │
│  └─────────────┘    └──────┬───────┘    └──────────┬──────────┘ │
│                            │                        │            │
│                     ┌──────▼───────┐    ┌──────────▼──────────┐ │
│                     │ Speaker      │    │ Transcript UI       │ │
│                     │ Diarization  │    │ (new dashboard page)│ │
│                     │ (Phase 2)    │    │                     │ │
│                     └──────────────┘    │ • Live scroll view  │ │
│                                         │ • Speaker labels    │ │
│  ┌─────────────┐                        │ • Timestamps        │ │
│  │ AI Context   │◄──────────────────────│ • Summary tab       │ │
│  │ (existing +  │                       │ • Search            │ │
│  │  enhanced)   │                       └─────────────────────┘ │
│  └─────────────┘                                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phases

### Phase 1: Meeting Sessions & Transcript Storage (Foundation)

**Goal**: Create the data model and basic UI for meeting transcripts.

#### Database — New migration: `meetings.sql`

```sql
-- A meeting session (one per call/recording)
CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Meeting',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',  -- active | ended | archived
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual transcript segments within a meeting
CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    speaker TEXT NOT NULL DEFAULT 'Unknown',  -- speaker label
    content TEXT NOT NULL,                     -- transcribed text
    start_time_ms INTEGER NOT NULL,            -- ms from meeting start
    end_time_ms INTEGER,
    confidence REAL,                           -- STT confidence score
    is_final BOOLEAN NOT NULL DEFAULT 1,       -- false = interim result
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_segments_time ON transcript_segments(meeting_id, start_time_ms);
```

#### Frontend — New files

| File | Purpose |
|------|---------|
| `src/pages/meetings/index.tsx` | Meeting list page (like Chats but for meetings) |
| `src/pages/meetings/components/MeetingView.tsx` | Single meeting: tabs (Transcript / Summary / AI Chat) |
| `src/pages/meetings/components/TranscriptView.tsx` | Scrolling transcript with speaker labels + timestamps |
| `src/pages/meetings/components/MeetingControls.tsx` | Start/stop meeting, title edit |
| `src/hooks/useMeeting.ts` | Meeting session state: start, stop, segments, save |
| `src/lib/database/meetings.action.ts` | SQLite queries for meetings + segments |

#### Sidebar — Add "Meetings" nav item

Add between "Chats" and "System prompts" in the sidebar.

#### Route

```
/meetings          → Meeting list
/meetings/:id      → Meeting detail (transcript, summary, AI chat)
```

#### Tasks

- [ ] Create `meetings.sql` migration in `src-tauri/src/db/migrations/`
- [ ] Register migration in `src-tauri/src/db/mod.rs`
- [ ] Create `src/lib/database/meetings.action.ts` with CRUD queries
- [ ] Create `useMeeting` hook
- [ ] Create meeting list page
- [ ] Create meeting detail page with transcript view
- [ ] Add "Meetings" to sidebar and router
- [ ] Add meeting start/stop controls to the overlay bar

---

### Phase 2: Continuous Transcription Pipeline

**Goal**: Replace chunk-based STT with continuous streaming for real-time transcription.

#### Current flow (chunk-based)

```
VAD detects speech → Records until silence → Sends full WAV → Gets text back
(3-30 second delay before any text appears)
```

#### New flow (continuous streaming)

```
Audio captured → Split into small overlapping windows (1-3s)
    → Send each window to STT immediately
    → Get interim + final results
    → Display text as it arrives (< 500ms latency)
```

#### Rust changes — `src-tauri/src/speaker/`

Add a new capture mode alongside VAD and continuous:

```rust
pub enum CaptureMode {
    Vad,                    // Existing: detect speech, send chunk
    Continuous,             // Existing: record until manual stop
    LiveTranscription,      // NEW: continuous small-window STT
}
```

**New `run_live_transcription()` function:**

- Captures audio in rolling 2-second windows with 0.5s overlap
- Each window is encoded as WAV and emitted as `transcription-chunk`
- Maintains a buffer for context continuity

**New events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `transcription-chunk` | `{ audio_b64, window_index, meeting_id }` | Audio chunk ready for STT |
| `transcription-interim` | `{ text, window_index }` | Interim transcription result |
| `transcription-final` | `{ text, speaker, start_ms, end_ms, confidence }` | Final segment |
| `meeting-started` | `{ meeting_id }` | Meeting session began |
| `meeting-ended` | `{ meeting_id }` | Meeting session ended |

#### Frontend changes — `useTranscription.ts`

New hook that:
1. Listens for `transcription-chunk` events
2. Sends each chunk to the configured STT provider
3. Emits `transcription-interim` and `transcription-final`
4. Saves final segments to SQLite via `meetings.action.ts`
5. Updates the live transcript UI in real-time

#### Tasks

- [ ] Add `LiveTranscription` capture mode to Rust speaker module
- [ ] Implement `run_live_transcription()` with rolling windows
- [ ] Add `start_live_transcription` / `stop_live_transcription` Tauri commands
- [ ] Create `useTranscription` hook
- [ ] Connect to transcript UI with live updates
- [ ] Handle interim vs. final results (replace interim text with final)

---

### Phase 3: Speaker Diarization

**Goal**: Identify who is speaking ("You" vs. "Them" vs. specific names).

#### Approach options

| Approach | Complexity | Accuracy | Latency |
|----------|-----------|----------|---------|
| **A. Two-channel separation** | Low | Good for 1:1 | None |
| **B. Client-side embedding** | Medium | Good | ~200ms |
| **C. Cloud diarization API** | Low (code) | Best | ~1-3s |

**Recommended: Start with Approach A, add C later.**

#### Approach A — Channel-based (Phase 3a)

- **System audio** (what you hear) = "Them"
- **Microphone input** (what you say) = "You"
- Capture both streams simultaneously
- Label segments based on which stream they came from
- Simple, zero-latency, works for 1:1 meetings

**Rust changes:**
- Capture system audio AND microphone simultaneously
- Tag each audio chunk with its source (`system` or `mic`)
- Frontend labels `system` as "Them" and `mic` as "You"

#### Approach C — Cloud diarization (Phase 3b, optional)

For multi-person meetings, integrate with a diarization API:
- **Deepgram** has real-time diarization built into their STT
- **AssemblyAI** has speaker labels in their streaming API
- Add as a provider option in the STT provider template system

#### Tasks

- [ ] Add dual-stream capture (system + mic) in Rust
- [ ] Tag audio chunks with source channel
- [ ] Frontend labels speakers based on channel
- [ ] UI for renaming speakers ("Them" → "John")
- [ ] (Optional) Add Deepgram/AssemblyAI diarization provider template

---

### Phase 4: Live Transcript UI

**Goal**: Build the polished transcript view shown in the reference image.

#### Transcript View Design

```
┌──────────────────────────────────────────────────────┐
│  📋 Strategic Sales Growth Meeting                    │
│  Thu, Mar 12 · 👤 You, John · ⏱ 00:14:32           │
│                                                      │
│  ┌──────────┐ ┌───────────┐ ┌──────┐               │
│  │ Summary  │ │ Transcript│ │ Chat │               │
│  └──────────┘ └───────────┘ └──────┘               │
│                                                      │
│  ─── 12:32 PM ──────────────────────────────         │
│                                                      │
│  John  12:32 PM                                      │
│  Hi, this is John from TechSolutions.                │
│                                                      │
│  You  12:32 PM                                       │
│  Hello.                                              │
│                                                      │
│  John  12:32 PM                                      │
│  How are you today?                                  │
│                                                      │
│  You  12:32 PM                                       │
│  Good, thanks.                                       │
│                                                      │
│  John  12:32 PM                                      │
│  I wanted to talk about your current software.       │
│                                                      │
│  You  12:32 PM                                       │
│  Sure.                                               │
│                                                      │
│  ▼ Live indicator (auto-scrolls)                     │
└──────────────────────────────────────────────────────┘
```

#### Components

| Component | Purpose |
|-----------|---------|
| `MeetingHeader.tsx` | Title, date, participants, duration timer |
| `TabBar.tsx` | Summary / Transcript / Chat switcher |
| `TranscriptView.tsx` | Scrolling list of `TranscriptSegment` items |
| `TranscriptSegment.tsx` | Single entry: speaker name, timestamp, text |
| `SummaryView.tsx` | AI-generated meeting summary (after meeting ends) |
| `MeetingChat.tsx` | AI chat contextualized with transcript (ask questions about the meeting) |
| `MeetingTimer.tsx` | Live duration counter |
| `LiveIndicator.tsx` | Pulsing dot + "Live" badge during active meetings |

#### Tasks

- [ ] Build `TranscriptSegment` component (speaker color, name, time, text)
- [ ] Build `TranscriptView` with auto-scroll and scroll-to-bottom button
- [ ] Build `MeetingHeader` with editable title and participant list
- [ ] Build `TabBar` (Summary | Transcript | Chat)
- [ ] Build `SummaryView` placeholder
- [ ] Build `MeetingChat` (reuse existing AI chat infrastructure)
- [ ] Add live indicator animation

---

### Phase 5: Real-Time AI Assistance

**Goal**: Proactive AI suggestions during the meeting, not just reactive Q&A.

#### Features

| Feature | Description |
|---------|-------------|
| **Smart suggestions** | AI analyzes conversation and suggests responses |
| **Objection handling** | Detects objections and provides counter-arguments |
| **Fact lookup** | Answers technical questions using conversation context |
| **Action items** | Tracks commitments and to-dos as they happen |
| **Key moments** | Highlights important parts of the conversation |

#### Implementation

- Feed the last N transcript segments as context to the AI provider
- Use a specialized system prompt for meeting assistance
- Show suggestions in a collapsible panel beside the transcript
- Quick actions: "What should I say?", "Summarize so far", "Action items"

#### System prompt template

```
You are a real-time meeting assistant. You have access to the live
transcript of an ongoing meeting. Your role is to:
1. Suggest responses when the user seems stuck
2. Provide counter-arguments when objections are raised
3. Answer technical questions using the conversation context
4. Track action items and commitments
5. Flag key moments

Current transcript:
{{TRANSCRIPT_CONTEXT}}

User's question: {{TEXT}}
```

#### Tasks

- [ ] Create meeting-specific system prompt template
- [ ] Build transcript context builder (last N segments → prompt)
- [ ] Add suggestion panel in meeting view
- [ ] Add quick action buttons (contextual)
- [ ] Implement action item extraction

---

### Phase 6: Post-Meeting Summary

**Goal**: Auto-generate meeting summary when the session ends.

#### Flow

```
User clicks "End Meeting"
    ↓
Send full transcript to AI
    ↓
Generate structured summary:
    • Overview (2-3 sentences)
    • Key topics discussed
    • Decisions made
    • Action items with owners
    • Follow-up questions
    ↓
Save summary to meetings.summary
    ↓
Display in Summary tab
```

#### Tasks

- [ ] Build summary generation prompt
- [ ] Trigger summary on meeting end
- [ ] Save summary to DB
- [ ] Build summary display UI
- [ ] Add export options (copy, markdown, PDF)

---

## Overlay Bar Integration

The overlay bar needs a meeting mode indicator:

```
NORMAL MODE:
[🎧] [🎤] [Ask me anything...  ] [📷] [⚡] [⣿]

MEETING MODE (recording):
[🎧] [🎤] [🔴 Meeting · 00:14:32] [📷] [⚡] [⣿]
                                    ↑
                           Click to open transcript
```

When a meeting is active:
- The input area shows a red recording dot, "Meeting", and a timer
- Clicking it opens the meeting transcript in the dashboard
- The mic/audio buttons function as normal for quick voice queries

---

## Priority & Effort Estimate

| Phase | Effort | Priority | Dependency |
|-------|--------|----------|------------|
| **Phase 1**: DB + basic UI | 2-3 days | 🔴 Must | None |
| **Phase 2**: Continuous STT pipeline | 3-4 days | 🔴 Must | Phase 1 |
| **Phase 3a**: Channel-based speakers | 1-2 days | 🟡 Should | Phase 2 |
| **Phase 4**: Polished transcript UI | 2-3 days | 🔴 Must | Phase 2 |
| **Phase 5**: Real-time AI assistance | 2-3 days | 🟡 Should | Phase 4 |
| **Phase 6**: Post-meeting summary | 1-2 days | 🟡 Should | Phase 4 |
| **Phase 3b**: Cloud diarization | 2-3 days | 🟢 Nice | Phase 3a |

**Total estimate: ~2-3 weeks for core features (Phases 1-4)**

---

## Files to Create/Modify

### New files

```
src-tauri/src/db/migrations/meetings.sql
src/lib/database/meetings.action.ts
src/hooks/useMeeting.ts
src/hooks/useTranscription.ts
src/pages/meetings/index.tsx
src/pages/meetings/components/MeetingView.tsx
src/pages/meetings/components/TranscriptView.tsx
src/pages/meetings/components/TranscriptSegment.tsx
src/pages/meetings/components/MeetingHeader.tsx
src/pages/meetings/components/MeetingControls.tsx
src/pages/meetings/components/SummaryView.tsx
src/pages/meetings/components/MeetingChat.tsx
src/pages/meetings/components/TabBar.tsx
src/pages/meetings/components/index.ts
```

### Modified files

```
src-tauri/src/db/mod.rs                  — Register new migration
src-tauri/src/speaker/mod.rs             — Add LiveTranscription mode
src-tauri/src/speaker/commands.rs        — Add live transcription commands
src-tauri/src/lib.rs                     — Register new commands
src/routes/index.tsx                     — Add /meetings routes
src/hooks/useMenuItems.tsx               — Add Meetings nav item
src/pages/app/index.tsx                  — Meeting mode in overlay
src/config/constants.ts                  — Meeting-related storage keys
```

---

## Getting Started

**Phase 1 is the recommended starting point.** It establishes the data model and basic
UI with no changes to the audio pipeline — just storing transcript data and displaying it.
Once that's solid, Phase 2 adds the real-time streaming, and the rest builds on top.

To begin Phase 1, tell me to start and I'll implement the database migration, CRUD layer,
meeting hooks, pages, and sidebar navigation.
