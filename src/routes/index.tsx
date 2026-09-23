import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import {
  App,
  SystemPrompts,
  Knowledge,
  ViewChat,
  Settings,
  DevSpace,
  Shortcuts,
  Audio,
  Screenshot,
  Chats,
  Responses,
  Meetings,
  MeetingView,
} from "@/pages";
import { DashboardLayout } from "@/layouts";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Navigate to="/chats" replace />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:meetingId" element={<MeetingView />} />
          <Route path="/system-prompts" element={<SystemPrompts />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/chats/view/:conversationId" element={<ViewChat />} />
          <Route path="/shortcuts" element={<Shortcuts />} />
          <Route path="/screenshot" element={<Screenshot />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audio" element={<Audio />} />
          <Route path="/responses" element={<Responses />} />
          <Route path="/dev-space" element={<DevSpace />} />
        </Route>
      </Routes>
    </Router>
  );
}
