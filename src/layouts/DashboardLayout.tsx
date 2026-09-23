import { Sidebar, TitleBar } from "@/components";
import { isMacOS } from "@/lib/platform";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";

export const DashboardLayout = () => {
  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout />;
      }}
      resetKeys={["dashboard-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div className="dashboard-frame relative flex h-screen w-screen flex-col overflow-hidden">
        {isMacOS() ? (
          // The toolbar row the traffic lights sit in.
          <div
            className="absolute left-0 right-0 top-0 z-50 h-[52px] select-none"
            data-tauri-drag-region={true}
          />
        ) : (
          <TitleBar />
        )}

        <div className="flex min-h-0 flex-1">
          {/* Sidebar, on the window's material */}
          <Sidebar />
          {/* Main Content, on an opaque layer */}
          <main className="dashboard-content flex flex-1 flex-col overflow-hidden px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};
