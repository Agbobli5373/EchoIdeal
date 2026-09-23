import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeftIcon,
  CopyIcon,
  MinusIcon,
  SquareIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useVersion } from "@/hooks";
import { isWindows } from "@/lib/platform";
import { cn } from "@/lib/utils";

// How long the pointer rests on maximise before Snap Layouts opens, close to
// the native button's delay.
const SNAP_LAYOUTS_DELAY_MS = 500;

// Segoe Fluent Icons (Windows 11) or Segoe MDL2 Assets (Windows 10) glyphs,
// the ones the native caption buttons use.
const GLYPHS = {
  minimize: "",
  maximize: "",
  restore: "",
  close: "",
};

/**
 * The dashboard's 44px title bar on Windows and Linux, where the window is
 * frameless. macOS keeps its own traffic lights instead.
 */
export const TitleBar = () => {
  const appWindow = getCurrentWindow();
  const navigate = useNavigate();
  // Re-renders on navigation, so the Back button's state stays current.
  useLocation();
  const { version } = useVersion();
  const [isMaximized, setIsMaximized] = useState(false);
  const snapTimer = useRef<number | null>(null);
  const snapOpen = useRef(false);
  const maximizeButton = useRef<HTMLButtonElement>(null);
  const nativeGlyphs = isWindows();

  useEffect(() => {
    appWindow
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});
    const unlisten = appWindow.onResized(() => {
      // Choosing a layout resizes the window, which closes the flyout.
      snapOpen.current = false;
      appWindow
        .isMaximized()
        .then(setIsMaximized)
        .catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // The flyout sits over the page, so the pointer only moves in the page again
  // once it has left both the button and the flyout. Close it then, as the
  // native button does. While it's open it holds keyboard focus; if the page
  // has focus back, the flyout has already closed.
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!snapOpen.current) return;
      if (maximizeButton.current?.contains(event.target as Node)) return;
      snapOpen.current = false;
      if (document.hasFocus()) return;
      invoke("hide_snap_layouts").catch(console.error);
    };
    const onFocus = () => {
      snapOpen.current = false;
    };
    document.addEventListener("pointermove", onPointerMove);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const cancelSnapLayouts = () => {
    if (snapTimer.current !== null) {
      window.clearTimeout(snapTimer.current);
      snapTimer.current = null;
    }
  };

  const scheduleSnapLayouts = () => {
    if (!nativeGlyphs) return;
    cancelSnapLayouts();
    snapTimer.current = window.setTimeout(() => {
      snapTimer.current = null;
      snapOpen.current = true;
      invoke("show_snap_layouts").catch(console.error);
    }, SNAP_LAYOUTS_DELAY_MS);
  };

  // react-router keeps the position in the history stack as `idx`.
  const canGoBack =
    ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 select-none items-center"
    >
      <button
        type="button"
        title="Back"
        aria-label="Back"
        onClick={() => navigate(-1)}
        disabled={!canGoBack}
        className="ml-1 flex size-9 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-foreground/[0.06] disabled:pointer-events-none disabled:opacity-40"
      >
        <ArrowLeftIcon className="size-4" />
      </button>

      <div className="pointer-events-none ml-2 flex items-center gap-2">
        <div className="flex size-4 items-center justify-center rounded-[4px] bg-primary">
          <ZapIcon className="size-2.5 text-primary-foreground" />
        </div>
        <span className="text-xs text-foreground">EchoIdeal</span>
        {version && (
          <span className="text-[11px] text-muted-foreground">v{version}</span>
        )}
      </div>

      <div data-tauri-drag-region className="h-full flex-1" />

      <div className="flex h-full">
        <CaptionButton
          label="Minimize"
          onClick={() => appWindow.minimize()}
          glyph={nativeGlyphs ? GLYPHS.minimize : undefined}
          icon={<MinusIcon className="size-4" />}
        />
        <CaptionButton
          ref={maximizeButton}
          label={isMaximized ? "Restore Down" : "Maximize"}
          onClick={() => {
            cancelSnapLayouts();
            appWindow.toggleMaximize();
          }}
          onMouseEnter={scheduleSnapLayouts}
          onMouseLeave={cancelSnapLayouts}
          glyph={
            nativeGlyphs
              ? isMaximized
                ? GLYPHS.restore
                : GLYPHS.maximize
              : undefined
          }
          icon={
            isMaximized ? (
              <CopyIcon className="size-3.5 -scale-x-100" />
            ) : (
              <SquareIcon className="size-3.5" />
            )
          }
        />
        <CaptionButton
          label="Close"
          // Closing hides the dashboard; see setup_dashboard_close_handler.
          onClick={() => appWindow.close()}
          glyph={nativeGlyphs ? GLYPHS.close : undefined}
          icon={<XIcon className="size-4" />}
          isClose
        />
      </div>
    </div>
  );
};

const CaptionButton = ({
  ref,
  label,
  onClick,
  onMouseEnter,
  onMouseLeave,
  glyph,
  icon,
  isClose = false,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  label: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  glyph?: string;
  icon: React.ReactNode;
  isClose?: boolean;
}) => (
  <button
    ref={ref}
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    className={cn(
      "flex h-full w-[46px] items-center justify-center text-foreground transition-colors",
      isClose
        ? "hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90"
        : "hover:bg-foreground/[0.06] active:bg-foreground/[0.04]"
    )}
  >
    {glyph ? (
      <span
        aria-hidden
        className="text-[10px] leading-none"
        style={{ fontFamily: '"Segoe Fluent Icons", "Segoe MDL2 Assets"' }}
      >
        {glyph}
      </span>
    ) : (
      icon
    )}
  </button>
);
