import { MacToolbar, PageTitleProvider, Sidebar, TitleBar } from "@/components";
import { isMacOS } from "@/lib/platform";
import { ReadinessProvider } from "@/hooks";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";

export const DashboardLayout = () => {
  const mac = isMacOS();
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
      <ReadinessProvider>
        <PageTitleProvider>
          <div className="dashboard-frame relative flex h-screen w-screen flex-col overflow-hidden">
            {mac ? (
              // The sidebar's share of the toolbar row the traffic lights sit in.
              <div
                className="absolute left-0 top-0 z-50 h-[52px] w-60 select-none"
                data-tauri-drag-region={true}
              />
            ) : (
              <TitleBar />
            )}

            <div className="flex min-h-0 flex-1">
              {/* Sidebar, on the window's material */}
              <Sidebar />
              {/* Main Content, on an opaque layer */}
              <main className="dashboard-content flex min-w-0 flex-1 flex-col overflow-hidden">
                {mac && <MacToolbar />}
                <div className="flex min-h-0 flex-1 flex-col px-8">
                  <Outlet />
                </div>
              </main>
            </div>
          </div>
        </PageTitleProvider>
      </ReadinessProvider>
    </ErrorBoundary>
  );
};
