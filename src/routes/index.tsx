import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import {
  App,
  Home,
  Prompts,
  Knowledge,
  ViewChat,
  AiAndSpeech,
  ShortcutsAndCursor,
  Audio,
  ScreenCapture,
  Appearance,
  Privacy,
  General,
  Chats,
  Meetings,
  MeetingView,
} from "@/pages";
import { DashboardLayout } from "@/layouts";

// Pages that were renamed, merged or split, and where they live now.
const REDIRECTS: Record<string, string> = {
  "/dashboard": "/home",
  "/system-prompts": "/prompts",
  "/responses": "/prompts",
  "/dev-space": "/ai-and-speech",
  "/screenshot": "/screen-capture",
  "/shortcuts": "/shortcuts-and-cursor",
  "/settings": "/general",
};

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<DashboardLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:meetingId" element={<MeetingView />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/chats/view/:conversationId" element={<ViewChat />} />
          <Route path="/ai-and-speech" element={<AiAndSpeech />} />
          <Route path="/audio" element={<Audio />} />
          <Route path="/screen-capture" element={<ScreenCapture />} />
          <Route
            path="/shortcuts-and-cursor"
            element={<ShortcutsAndCursor />}
          />
          <Route path="/appearance" element={<Appearance />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/general" element={<General />} />
          {Object.entries(REDIRECTS).map(([from, to]) => (
            <Route
              key={from}
              path={from}
              element={<Navigate to={to} replace />}
            />
          ))}
        </Route>
      </Routes>
    </Router>
  );
}
