# EchoIdeal Architecture Guide

> A comprehensive guide to understanding how EchoIdeal works under the hood.
> Written for developers who are new to the codebase.

---

## Table of Contents

1. [What Is EchoIdeal?](#1-what-is-echoideal)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Project Structure](#3-project-structure)
4. [The Two Windows](#4-the-two-windows)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture (Rust)](#6-backend-architecture-rust)
7. [How a Message Flows From Input to AI Response](#7-how-a-message-flows-from-input-to-ai-response)
8. [State Management](#8-state-management)
9. [Database](#9-database)
10. [Window Management](#10-window-management)
11. [Global Keyboard Shortcuts](#11-global-keyboard-shortcuts)
12. [Screenshot Capture](#12-screenshot-capture)
13. [System Audio Capture](#13-system-audio-capture)
14. [Feature Flags & License System](#14-feature-flags--license-system)
15. [Theming](#15-theming)
16. [Platform Differences](#16-platform-differences)
17. [Key Design Decisions](#17-key-design-decisions)

---

## 1. What Is EchoIdeal?

EchoIdeal is a **desktop AI assistant** that floats as an overlay on your screen. Think of it
as a smart search bar that:

- Sits on top of all your windows (like Spotlight on Mac)
- Connects to AI providers (OpenAI, Claude, Gemini, etc.) to answer questions
- Can capture screenshots and analyze them
- Can listen to system audio and transcribe it
- Stores conversations locally for privacy

It's built with **Tauri**, which means:
- The **UI** is a web app (React + TypeScript) running inside a native window
- The **backend** is written in Rust and handles system-level operations
- They communicate through Tauri's **command/event system** (like a bridge)

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    EchoIdeal Application                 │
│                                                         │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │   Frontend (WebView)  │  │   Backend (Rust)       │  │
│  │                       │  │                        │  │
│  │  React + TypeScript   │  │  Tauri Framework       │  │
│  │  TailwindCSS          │◄─►  System APIs           │  │
│  │  Vite (dev server)    │  │  SQLite Database       │  │
│  │                       │  │  HTTP Client           │  │
│  │  Runs in WebKit       │  │  Audio Capture         │  │
│  │  (native browser)     │  │  Screenshot Capture    │  │
│  └───────────────────────┘  └────────────────────────┘  │
│           │                          │                   │
│           │    invoke() / listen()   │                   │
│           └──────────────────────────┘                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Tauri Plugins                       │    │
│  │  SQL · HTTP · Shortcuts · Autostart · Updater   │    │
│  │  Keychain · Shell · PostHog · Machine UID       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### How Frontend ↔ Backend Communication Works

```
  Frontend (TypeScript)              Backend (Rust)
  ─────────────────────              ──────────────
                                    
  invoke("command", {args})  ──────►  #[tauri::command]
       (request)                      fn command(args) → Result
                              ◄──────
       (response)                     returns data
                                    
  listen("event-name")       ◄──────  app.emit("event-name", data)
       (real-time)                    (push from backend)
```

**`invoke()`** = Frontend calls a Rust function and waits for a response (like an API call).

**`listen()`** = Frontend subscribes to events that the backend pushes (like WebSocket messages).

---

## 3. Project Structure

```
EchoIdeal/
├── src/                          # Frontend (React + TypeScript)
│   ├── main.tsx                  # Entry point
│   ├── global.css                # Theme colors, Tailwind config
│   ├── routes/index.tsx          # All page routes
│   ├── contexts/                 # React Context providers
│   │   ├── app.context.tsx       # Global app state (providers, license, settings)
│   │   └── theme.context.tsx     # Dark/light theme, transparency
│   ├── hooks/                    # Custom React hooks
│   │   ├── useCompletion.ts      # Main overlay: input → AI response flow
│   │   ├── useChatCompletion.ts  # Dashboard chat: same but for saved convos
│   │   ├── useGlobalShortcuts.ts # Registers keyboard shortcuts
│   │   ├── useSystemAudio.ts     # System audio capture + transcription
│   │   ├── useSettings.ts        # Settings page logic
│   │   ├── useHistory.ts         # Chat history CRUD
│   │   └── ...
│   ├── pages/                    # Page components (one per route)
│   │   ├── app/                  # Main overlay window
│   │   ├── dashboard/            # License, API usage
│   │   ├── chats/                # Conversation history
│   │   ├── settings/             # App settings
│   │   ├── dev/                  # AI/STT provider config
│   │   ├── responses/            # Response length, language
│   │   ├── shortcuts/            # Keyboard shortcut config
│   │   ├── screenshot/           # Screenshot settings
│   │   ├── audio/                # Audio device selection
│   │   └── system-prompts/       # Custom system prompts
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Base components (Button, Card, Input, etc.)
│   │   ├── Sidebar.tsx           # Dashboard sidebar navigation
│   │   ├── Markdown/             # Markdown renderer with syntax highlighting
│   │   └── ...
│   ├── lib/                      # Utilities and business logic
│   │   ├── functions/            # AI response, STT, common helpers
│   │   ├── storage/              # localStorage wrappers
│   │   ├── database/             # SQLite query helpers
│   │   └── utils.ts              # Tailwind cn() helper
│   ├── config/                   # Constants and configuration
│   │   ├── ai-providers.constants.ts  # Built-in AI provider templates
│   │   ├── stt.constants.ts           # Built-in STT provider templates
│   │   ├── feature-flags.ts           # Premium feature toggle
│   │   └── shortcuts.ts               # Default shortcut bindings
│   └── types/                    # TypeScript type definitions
│
├── src-tauri/                    # Backend (Rust)
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri config (window size, plugins, bundling)
│   ├── build.rs                  # Build script (env vars)
│   ├── capabilities/             # Permission definitions per platform
│   ├── src/
│   │   ├── main.rs               # Entry point (calls lib::run)
│   │   ├── lib.rs                # App setup: plugins, commands, state, shortcuts
│   │   ├── window.rs             # Window creation and management
│   │   ├── api.rs                # AI streaming, transcription, secure storage
│   │   ├── activate.rs           # License activation/validation
│   │   ├── capture.rs            # Screenshot capture (full + selection)
│   │   ├── shortcuts.rs          # Global shortcut registration + handlers
│   │   ├── speaker/              # System audio capture (per-platform)
│   │   │   ├── mod.rs            # Shared logic, VAD, commands
│   │   │   ├── macos.rs          # Core Audio capture
│   │   │   ├── linux.rs          # PulseAudio capture
│   │   │   └── windows.rs        # WASAPI capture
│   │   └── db/                   # Database migrations
│   │       ├── mod.rs            # Migration loader
│   │       └── migrations/       # SQL files
│   └── icons/                    # App icons for all platforms
│
├── package.json                  # npm dependencies and scripts
├── vite.config.ts                # Vite bundler config
├── tsconfig.json                 # TypeScript config
└── index.html                    # HTML shell for the WebView
```

---

## 4. The Two Windows

EchoIdeal has **two separate windows** that serve different purposes:

```
┌──────────────────────────────────────────────────────────────┐
│ SCREEN                                                       │
│                                                              │
│  ┌─────────────────────────────────────────┐                 │
│  │  MAIN WINDOW (overlay bar)              │  ◄── Always on  │
│  │  Route: /                               │      top, thin  │
│  │  [🎧] [🎤] [Ask me anything...] [📷][⚡][⣿]│      bar       │
│  └─────────────────────────────────────────┘                 │
│                                                              │
│          ┌──────────────────────────────┐                    │
│          │  DASHBOARD WINDOW            │  ◄── Normal window │
│          │  Route: /chats, /settings... │      with sidebar  │
│          │  ┌────────┬─────────────┐    │                    │
│          │  │Sidebar │  Content    │    │                    │
│          │  │        │             │    │                    │
│          │  │ Chats  │  (varies)   │    │                    │
│          │  │ Settings│            │    │                    │
│          │  │ ...    │             │    │                    │
│          │  └────────┴─────────────┘    │                    │
│          └──────────────────────────────┘                    │
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │  Your other apps (Zoom, VS Code...)  │                    │
│  └──────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

| Property | Main Window (Overlay) | Dashboard Window |
|----------|----------------------|------------------|
| **Purpose** | Quick AI input, audio controls | Full settings, chat history, config |
| **Size** | 600×54px (expands when responding) | 800×600px (resizable) |
| **Decorations** | None (no title bar) | Yes (title bar, close/minimize) |
| **Transparent** | Yes | No |
| **Content Protected** | Yes (hidden in screenshots) | Yes |
| **Always on top** | Configurable | No |
| **Route** | `/` | `/chats` (default), navigable |

**Why two windows?** The overlay needs to be tiny and always-visible. Settings and chat
history need a full-size interface. Tauri lets us create multiple native windows that share
the same React app but render different routes.

---

## 5. Frontend Architecture

### Routing

```
BrowserRouter
├── /                          → App (overlay bar)
└── /dashboard (DashboardLayout)
    ├── /dashboard             → Dashboard page
    ├── /chats                 → Chat list
    ├── /chats/view/:id        → Single conversation
    ├── /settings              → App settings
    ├── /responses             → Response config
    ├── /shortcuts             → Keyboard shortcuts
    ├── /screenshot            → Screenshot settings
    ├── /audio                 → Audio device selection
    ├── /system-prompts        → Custom prompts
    └── /dev-space             → AI/STT provider config
```

### Component Hierarchy

```
<BrowserRouter>
  <ThemeProvider>          ← Dark/light theme
    <AppProvider>          ← Global state (providers, license, settings)
      <Routes>
        <Route path="/" element={<App />} />           ← Overlay
        <Route element={<DashboardLayout />}>           ← Sidebar + content
          <Route path="/chats" element={<Chats />} />
          <Route path="/settings" element={<Settings />} />
          ...
        </Route>
      </Routes>
    </AppProvider>
  </ThemeProvider>
</BrowserRouter>
```

### Key Hooks and What They Do

| Hook | Used In | Responsibility |
|------|---------|---------------|
| `useCompletion` | Overlay bar | Manages the complete flow: user types → sends to AI → streams response → saves to DB |
| `useChatCompletion` | Chat view page | Same flow but for replaying/continuing a saved conversation |
| `useApp` | Overlay bar | Initializes shortcuts, storage migration, system audio, window behavior |
| `useSystemAudio` | Overlay bar | Manages system audio capture lifecycle: start/stop/transcribe/respond |
| `useGlobalShortcuts` | App init | Registers global keyboard shortcuts and dispatches actions |
| `useSettings` | Dev Space page | Manages provider selection, variable extraction, screenshot config |
| `useHistory` | Chats page | CRUD for chat conversations from SQLite |
| `useSystemPrompts` | System Prompts page | CRUD for system prompts in SQLite |
| `useWindow` | Overlay bar | Dynamically resizes the main window as content changes |

---

## 6. Backend Architecture (Rust)

### Module Responsibilities

```
src-tauri/src/
├── lib.rs          # Wires everything together: plugins, commands, state, setup
├── main.rs         # Just calls lib::run()
├── window.rs       # Creates/manages main + dashboard windows
├── api.rs          # HTTP requests: AI streaming, transcription, secure storage
├── activate.rs     # License: activate, deactivate, validate, checkout
├── capture.rs      # Screenshot: full-screen + selection mode
├── shortcuts.rs    # Global shortcut registration + action handlers
├── speaker/        # System audio capture
│   ├── mod.rs      # Shared: VAD logic, Tauri commands, stream processing
│   ├── macos.rs    # macOS: Core Audio (via cidre)
│   ├── linux.rs    # Linux: PulseAudio
│   └── windows.rs  # Windows: WASAPI
└── db/
    ├── mod.rs      # Migration loader
    └── migrations/ # SQL migration files
```

### Managed State (Shared Across Commands)

```rust
// In lib.rs — these are registered with .manage() and
// accessible in any #[tauri::command] via app.state::<T>()

AudioState {
    stream_task: JoinHandle<()>,   // Active audio capture task
    vad_config: VadConfig,         // Voice Activity Detection settings
    is_capturing: bool,            // Whether audio capture is running
}

CaptureState {
    captured_monitors: Vec<MonitorInfo>,  // Stored screenshots for selection
    overlay_active: bool,                  // Whether selection overlay is showing
}

WindowVisibility {
    is_hidden: bool,               // Whether main window is hidden
}

RegisteredShortcuts {
    shortcuts: HashMap<String, String>,  // action_id → shortcut_string
}

LicenseState {
    has_active_license: AtomicBool,  // Used by shortcuts to gate features
}

MoveWindowState {
    active_directions: HashMap<String, CancellationToken>,  // For hold-to-move
}
```

---

## 7. How a Message Flows From Input to AI Response

This is the most important flow in the app. Here's what happens when you type "Hello" and press Enter:

```
 User types "Hello"             Press Enter
      │                              │
      ▼                              ▼
 ┌──────────────────────────────────────────────┐
 │  useCompletion.submit()                      │
 │                                              │
 │  1. Build enhanced system prompt             │
 │     (base prompt + length + language +       │
 │      markdown formatting instructions)       │
 │                                              │
 │  2. Gather history (previous messages)       │
 │                                              │
 │  3. Gather images (screenshots, files)       │
 │                                              │
 │  4. Check: use EchoIdeal API or custom?      │
 │     └─► shouldUseEchoIdealAPI()              │
 └──────────────────┬───────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 ┌──────────────┐     ┌────────────────────────────┐
 │ EchoIdeal API│     │ Custom Provider             │
 │              │     │                            │
 │ invoke()     │     │ 1. Parse curl template     │
 │ "chat_stream │     │    curl2Json(provider.curl)│
 │  _response"  │     │                            │
 │              │     │ 2. Replace variables       │
 │   ┌─────┐   │     │    {{API_KEY}} → "sk-..."  │
 │   │Rust │   │     │    {{MODEL}} → "gpt-4"     │
 │   │ HTTP│   │     │    {{SYSTEM_PROMPT}} → ...  │
 │   │call │   │     │                            │
 │   └──┬──┘   │     │ 3. Build message array     │
 │      │      │     │    (system + history + user)│
 │      ▼      │     │                            │
 │  Emits:     │     │ 4. fetch() to AI provider  │
 │  "chunk"    │     │                            │
 │  events     │     │ 5. Read SSE stream         │
 └──────┬──────┘     │    data: {"choices":[...]} │
        │            │                            │
        │            │ 6. Extract content via      │
        │            │    responseContentPath      │
        │            └─────────────┬───────────────┘
        │                          │
        └────────────┬─────────────┘
                     ▼
          ┌─────────────────────┐
          │  Yield chunks       │
          │  (streaming text)   │
          │                     │
          │  response += chunk  │
          │  UI re-renders      │
          │  Window height      │
          │  adjusts            │
          └─────────┬───────────┘
                    ▼
          ┌─────────────────────┐
          │  Stream complete    │
          │                     │
          │  Save conversation  │
          │  to SQLite DB       │
          └─────────────────────┘
```

### Provider Template System

AI providers are defined as **curl templates** with placeholders:

```
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{MODEL}}",
    "messages": [
      {"role": "system", "content": "{{SYSTEM_PROMPT}}"},
      {"role": "user", "content": "{{TEXT}}"}
    ]
  }'
```

The app:
1. **Extracts** `{{API_KEY}}`, `{{MODEL}}` as user-configurable variables
2. **Skips** `{{SYSTEM_PROMPT}}`, `{{TEXT}}`, `{{IMAGE}}` (filled automatically)
3. **Parses** the curl into method, URL, headers, and body with `curl2Json`
4. **Replaces** all `{{PLACEHOLDERS}}` with actual values
5. **Sends** the HTTP request and reads the streaming response

This means adding a new AI provider is just writing a curl command — no code changes needed.

---

## 8. State Management

EchoIdeal uses **three layers** of state:

```
┌─────────────────────────────────────────────────────┐
│                    State Layers                      │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Layer 1: React State (in-memory)             │  │
│  │  • React Context (AppProvider, ThemeProvider)  │  │
│  │  • Component useState                         │  │
│  │  • Lives only while the app is running        │  │
│  └───────────────────────────────────────────────┘  │
│                       ▲ syncs ▼                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Layer 2: localStorage (persistent, frontend) │  │
│  │  • Theme preference                           │  │
│  │  • Selected AI/STT provider + variables       │  │
│  │  • Shortcut bindings                          │  │
│  │  • Response settings (length, language)        │  │
│  │  • Screenshot configuration                   │  │
│  │  • Customizable state (app icon, always-on-top)│ │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Layer 3: Backend Storage (persistent, Rust)  │  │
│  │                                               │  │
│  │  SQLite (echoideal.db):                       │  │
│  │  • conversations (chat history)               │  │
│  │  • messages (individual messages)             │  │
│  │  • system_prompts (custom prompts)            │  │
│  │                                               │  │
│  │  secure_storage.json:                         │  │
│  │  • license_key                                │  │
│  │  • instance_id                                │  │
│  │  • selected_echoideal_model                   │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Layer 4: Rust Managed State (in-memory)      │  │
│  │  • AudioState (capture task, VAD config)      │  │
│  │  • CaptureState (stored screenshots)          │  │
│  │  • LicenseState (AtomicBool)                  │  │
│  │  • RegisteredShortcuts (HashMap)              │  │
│  │  • WindowVisibility                           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Why localStorage Instead of SQLite for Settings?

- **Speed**: localStorage is synchronous and instant. No async overhead.
- **Multi-window sync**: Both the overlay and dashboard windows share localStorage.
  When one window changes a setting, the other gets a `storage` event.
- **SQLite is for structured data**: Conversations have relationships (messages belong
  to conversations) — that's what SQL is good at.

---

## 9. Database

SQLite database (`echoideal.db`) managed by `tauri-plugin-sql`. Migrations run automatically on startup.

### Schema

```
┌──────────────────────┐       ┌──────────────────────────┐
│   conversations      │       │   messages               │
├──────────────────────┤       ├──────────────────────────┤
│ id         TEXT (PK) │───┐   │ id         TEXT (PK)     │
│ title      TEXT      │   │   │ conversation_id TEXT (FK)│◄──┐
│ created_at TEXT      │   └──►│ role       TEXT          │   │
│ updated_at TEXT      │       │ content    TEXT          │   │
└──────────────────────┘       │ timestamp  TEXT          │   │
                               │ attached_files TEXT      │   │
                               └──────────────────────────┘   │
                                                              │
┌──────────────────────┐                                      │
│   system_prompts     │       ON INSERT/UPDATE message:      │
├──────────────────────┤       → trigger updates              │
│ id         TEXT (PK) │         conversations.updated_at ────┘
│ name       TEXT      │
│ prompt     TEXT      │
│ created_at TEXT      │
│ updated_at TEXT      │
└──────────────────────┘
```

### Access Pattern

```
Frontend                           Backend
───────                            ───────
                                  
import Database from               tauri_plugin_sql (Rust plugin)
  '@tauri-apps/plugin-sql'         manages the connection pool
                                  
const db = await                   "sqlite:echoideal.db" preloaded
  Database.load("sqlite:...")      in tauri.conf.json plugins.sql
                                  
db.execute(sql, params)  ────────► SQLite
db.select(sql, params)   ◄────────
```

The frontend talks to SQLite **directly** through the Tauri SQL plugin — there are no
Rust command wrappers for most DB operations. The `src/lib/database/` files contain
the SQL queries.

---

## 10. Window Management

### How Windows Are Created

```
App Startup (lib.rs)
│
├── Main Window
│   Created by: tauri.conf.json (declarative)
│   Label: "main"
│   Size: 600 × 54px
│   Position: top-center of screen
│   Properties: transparent, no decorations, content protected
│
├── Dashboard Window
│   Created by: window.rs → create_dashboard_window()
│   Label: "dashboard"
│   URL: /chats
│   Size: 800 × 600px (macOS: 1200 × 800px)
│   Behavior: on close → HIDE (not destroy)
│
└── Capture Overlays (temporary)
    Created by: capture.rs → start_screen_capture()
    Labels: "capture-overlay-0", "capture-overlay-1", ...
    Size: full screen per monitor
    Behavior: destroyed after selection
```

### Window Resize Flow (Overlay)

The overlay bar **dynamically resizes** as the AI response streams in:

```
AI response chunk arrives
        │
        ▼
useWindow.updateHeight()
        │
        ▼
Measure DOM element height
        │
        ▼
invoke("set_window_height", { height })
        │
        ▼
Rust: window.set_size(600, height)
```

---

## 11. Global Keyboard Shortcuts

### Registration Flow

```
App Startup
     │
     ▼
useGlobalShortcuts() reads config from localStorage
     │
     ▼
invoke("update_shortcuts", { config })
     │
     ▼
Rust: parse shortcut strings (e.g. "Ctrl+Shift+D")
     │
     ▼
Register with tauri_plugin_global_shortcut
     │
     ▼
Central handler receives ALL shortcut events
     │
     ├── "toggle_dashboard"  → show/hide dashboard window
     ├── "toggle_window"     → show/hide overlay
     ├── "focus_input"       → bring overlay to front
     ├── "move_window_up"    → move overlay (while key held)
     ├── "audio_recording"   → emit "start-audio-recording" event
     ├── "screenshot"        → emit "trigger-screenshot" event
     └── "system_audio"      → emit "toggle-system-audio" event
```

### Default Shortcuts

| Action | Default Binding |
|--------|----------------|
| Toggle Dashboard | `Ctrl+Shift+D` |
| Toggle Window | `Ctrl+\` |
| Refocus Input | `Ctrl+Shift+I` |
| Move Window | `Ctrl+Arrow Keys` |

---

## 12. Screenshot Capture

### Two Modes

```
┌─────────────────────────────────────────────────┐
│              Screenshot Modes                    │
│                                                 │
│  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Full Screen     │  │  Selection Mode     │  │
│  │                  │  │                     │  │
│  │  1. Find monitor │  │  1. Capture ALL     │  │
│  │     with overlay │  │     monitors        │  │
│  │  2. Capture it   │  │  2. Store images    │  │
│  │  3. Encode PNG   │  │     in CaptureState │  │
│  │  4. Return base64│  │  3. Create overlay  │  │
│  │                  │  │     windows         │  │
│  │  invoke(         │  │  4. User draws rect │  │
│  │   "capture_to    │  │  5. Crop + encode   │  │
│  │    _base64")     │  │  6. Emit event      │  │
│  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### How Selection Mode Works Step-by-Step

```
User triggers screenshot shortcut
        │
        ▼
invoke("start_screen_capture")
        │
        ▼
Rust: xcap::Monitor::all() → capture each monitor
        │
        ▼
Store images in CaptureState
        │
        ▼
Create transparent overlay window per monitor
        │
        ▼
Frontend Overlay.tsx renders on each overlay window
  • Dark semi-transparent background
  • User clicks and drags to select area
  • Frontend tracks mouse coordinates
        │
        ▼
invoke("capture_selected_area", { x, y, w, h, monitor_index })
        │
        ▼
Rust: crop stored image → PNG → base64
        │
        ▼
emit("captured-selection", base64_data)
        │
        ▼
Frontend receives image, attaches to message
        │
        ▼
invoke("close_overlay_window") → destroy overlays
```

---

## 13. System Audio Capture

### Architecture

```
                       ┌──────────────┐
                       │  System Audio │
                       │  (speakers)   │
                       └──────┬───────┘
                              │
                  ┌───────────┴───────────┐
                  │  Platform-specific    │
                  │  capture module       │
                  │                       │
                  │  macOS: Core Audio    │
                  │  Linux: PulseAudio   │
                  │  Windows: WASAPI     │
                  └───────────┬───────────┘
                              │
                         f32 samples
                              │
                  ┌───────────┴───────────┐
                  │  VAD (Voice Activity  │
                  │  Detection)           │
                  │                       │
                  │  Analyzes energy in   │
                  │  audio chunks to      │
                  │  detect speech        │
                  └───────────┬───────────┘
                              │
                    Speech detected!
                              │
                  ┌───────────┴───────────┐
                  │  Encode to WAV        │
                  │  Convert to base64    │
                  └───────────┬───────────┘
                              │
                  emit("speech-detected", wav_base64)
                              │
                  ┌───────────┴───────────┐
                  │  Frontend receives    │
                  │  useSystemAudio hook  │
                  │                       │
                  │  1. Send to STT API   │
                  │     (transcribe)      │
                  │  2. Get text          │
                  │  3. Send to AI API    │
                  │  4. Display response  │
                  └───────────────────────┘
```

### VAD (Voice Activity Detection) Parameters

| Parameter | What It Controls |
|-----------|-----------------|
| `sensitivity` | How sensitive speech detection is (0-1) |
| `peak_threshold` | Minimum audio level to consider as speech |
| `silence_chunks_to_stop` | How many quiet chunks before "speech ended" |
| `max_recording_duration_secs` | Maximum recording length |

---

## 14. Feature Flags & License System

### How Premium Gating Works

```
┌──────────────────────────────────────────────────────┐
│                    Feature Flag                       │
│                                                      │
│   src/config/feature-flags.ts                        │
│   export const PREMIUM_FEATURES_ENABLED = true;      │
│                                                      │
│   When true:                                         │
│   • hasActiveLicense initialized to true             │
│   • Skip validate_license_api() call                 │
│   • All UI gates disabled                            │
│                                                      │
│   When false:                                        │
│   • Normal license validation via remote API         │
│   • UI shows "Get License" prompts                   │
│                                                      │
│   Rust side:                                         │
│   Cargo.toml: default = ["premium_unlocked"]         │
│   • check_license_status returns true                │
│   • validate_license_api returns is_active: true     │
└──────────────────────────────────────────────────────┘
```

### What `hasActiveLicense` Controls

The single `hasActiveLicense` boolean in React Context gates 15+ features:

| Feature | Where Gated |
|---------|-------------|
| Window drag/move | `DragButton.tsx`, `shortcuts.rs` |
| Screenshot selection mode | `ScreenshotConfigs.tsx` |
| Chat file attachments | `View.tsx` |
| Shortcut customization | `ShortcutManager.tsx` |
| Response length/language | `responses/index.tsx` |
| Theme customization | `Theme.tsx` |
| Always-on-top | `Theme.tsx` |
| System prompt generation | `Generate.tsx` |
| Contact support link | `useMenuItems.tsx` |

---

## 15. Theming

### How Dark/Light Mode Works

```
ThemeProvider (theme.context.tsx)
        │
        ├── Reads theme from localStorage
        │   ("dark", "light", or "system")
        │
        ├── If "system": listens to OS media query
        │   matchMedia("(prefers-color-scheme: dark)")
        │
        ├── Applies class to <html>:
        │   <html class="dark"> or <html class="">
        │
        └── CSS uses .dark selector:
            .dark { --background: oklch(0.13 0.015 265); }
            :root { --background: oklch(0.985 0.002 260); }
```

### Color System

Colors use **OKLCH** (a perceptual color space):
- `oklch(lightness chroma hue)`
- Hue **265** = indigo/violet (EchoIdeal's brand color)
- All colors reference CSS variables: `--primary`, `--background`, etc.
- Components use Tailwind classes: `bg-primary`, `text-muted-foreground`

### Transparency

The overlay bar supports window transparency:
- CSS variable `--opacity` controls card/popover alpha
- CSS variable `--backdrop-blur` adds frosted glass effect
- Set via slider in Settings → Window Transparency

---

## 16. Platform Differences

```
┌──────────────────┬─────────────────┬──────────────────┬────────────────┐
│ Feature          │ macOS           │ Windows          │ Linux          │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ Window stealth   │ ✅ NSPanel +    │ ✅ SetWindow     │ ❌ Not         │
│ (hidden in       │ NSWindowSharing │ DisplayAffinity  │ supported      │
│ screenshots)     │ None            │                  │                │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ System audio     │ Core Audio      │ WASAPI           │ PulseAudio     │
│ capture          │ (cidre crate)   │ (wasapi crate)   │ (libpulse)     │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ Custom cursor    │ ✅ Supported    │ ✅ Supported     │ ❌ Always      │
│ (invisible)      │                 │                  │ default        │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ NSPanel (float)  │ ✅ Non-activating│ N/A             │ N/A            │
│                  │ floating panel  │                  │                │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ Autostart        │ LaunchAgent     │ Registry         │ XDG autostart  │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ macOS permissions│ ✅ Plugin       │ N/A              │ N/A            │
│ (mic, screen)    │                 │                  │                │
├──────────────────┼─────────────────┼──────────────────┼────────────────┤
│ Build requires   │ Full Xcode      │ MSVC Build Tools │ apt packages   │
│                  │ (for cidre)     │                  │ (webkit, gtk)  │
└──────────────────┴─────────────────┴──────────────────┴────────────────┘
```

### Conditional Compilation in Rust

```rust
// Only compiled on macOS:
#[cfg(target_os = "macos")]
use tauri_nspanel::WebviewWindowExt;

// Only compiled on Linux:
#[cfg(target_os = "linux")]
use libpulse_binding as pulse;

// Compiled on all desktop platforms:
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;
```

---

## 17. Key Design Decisions

### Why Tauri Instead of Electron?

| | Tauri | Electron |
|---|---|---|
| **Binary size** | ~10 MB | ~270 MB |
| **Memory usage** | Low (shared WebKit) | High (bundled Chromium) |
| **Backend** | Rust (fast, safe) | Node.js |
| **Startup time** | <100ms | ~1-2 seconds |

For an always-on overlay app, small size and low resource usage are critical.

### Why Curl Templates for AI Providers?

Instead of writing custom API client code for each provider, EchoIdeal uses curl command
templates. This means:
- **Users can add providers** without code changes (just paste a curl command)
- **All providers use the same code path** (parse curl → make request → read stream)
- **Easy to debug** (the curl command can be tested in a terminal)

### Why localStorage + SQLite (Not Just One)?

- **localStorage**: Fast, synchronous, shared between windows. Perfect for settings.
- **SQLite**: Relational, queryable, supports large data. Perfect for conversations.
- **secure_storage.json**: For sensitive data (license keys) stored in the app data directory.

### Why Two Windows Instead of Tabs?

- The overlay must be **tiny, transparent, always-on-top, and content-protected**.
- Settings need a **normal window with decorations and scroll**.
- These are incompatible window configurations — you can't have both in one window.

### Why Feature Flags Instead of Removing License Code?

The `PREMIUM_FEATURES_ENABLED` flag lets you:
- **Toggle licensing on/off** without changing multiple files
- **Keep the license code intact** for when you want to add payments later
- **Test both modes** easily during development

---

## Glossary

| Term | Meaning |
|------|---------|
| **Tauri** | Framework for building desktop apps with web frontend + Rust backend |
| **WebView** | The native browser engine that renders the React UI (WebKit on macOS/Linux, WebView2 on Windows) |
| **invoke()** | Frontend → Backend function call (like fetch to a local API) |
| **emit/listen** | Backend → Frontend event push (like server-sent events) |
| **VAD** | Voice Activity Detection — algorithm that detects when someone is speaking |
| **SSE** | Server-Sent Events — streaming response format used by AI APIs |
| **OKLCH** | A color space used for CSS color variables (perceptually uniform) |
| **Content Protected** | Window flag that hides the window from screenshots/recordings |
| **NSPanel** | macOS-specific floating window type that doesn't steal focus |
