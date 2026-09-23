import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "lucide-react";
import { usePageTitle } from "./PageHeader";

/**
 * The 52px toolbar row at the top of the dashboard's content on macOS, level
 * with the traffic lights: Back and the page's title. It's also where the
 * window is dragged from.
 */
export const MacToolbar = () => {
  const navigate = useNavigate();
  // Re-renders on navigation, so the Back button's state stays current.
  useLocation();
  const title = usePageTitle();

  // react-router keeps the position in the history stack as `idx`.
  const canGoBack =
    ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  return (
    <div
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 select-none items-center gap-1.5 border-b border-border/60 px-4"
    >
      <button
        type="button"
        title="Back"
        aria-label="Back"
        onClick={() => navigate(-1)}
        disabled={!canGoBack}
        className="flex h-6 w-[26px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span
        data-tauri-drag-region
        className="ml-1.5 truncate text-[15px] font-semibold text-foreground"
      >
        {title}
      </span>
    </div>
  );
};
