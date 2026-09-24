import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Loader2 } from "lucide-react";
import { Button, SettingsRow } from "@/components";
import { useVersion } from "@/hooks";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/about", {
  version: {
    title: "Check for updates",
    group: "EchoIdeal",
    keywords: "version update upgrade about",
  },
  bug: {
    title: "Report a bug",
    group: "EchoIdeal",
    keywords: "issue feedback github support",
  },
  quit: { title: "Quit EchoIdeal", group: "EchoIdeal", keywords: "exit close" },
});

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; percentage: number }
  | { kind: "installed" }
  | { kind: "error"; message: string };

/** The version and update check, Report a bug and Quit EchoIdeal. */
export const About = () => {
  const { version, isLoading } = useVersion();
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  const checkForUpdates = async () => {
    setState({ kind: "checking" });
    try {
      const update = await check();
      setState(update ? { kind: "available", update } : { kind: "uptodate" });
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setState({ kind: "error", message: "Couldn’t check for updates." });
    }
  };

  const install = async (update: Update) => {
    let total = 0;
    let downloaded = 0;
    setState({ kind: "installing", percentage: 0 });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength || 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setState({
            kind: "installing",
            percentage: total ? Math.round((downloaded / total) * 100) : 0,
          });
        }
      });
      setState({ kind: "installed" });
      await relaunch();
    } catch (error) {
      console.error("Failed to install update:", error);
      setState({ kind: "error", message: "The update didn’t install." });
    }
  };

  const status = (() => {
    switch (state.kind) {
      case "checking":
        return "Checking for updates…";
      case "uptodate":
        return "You’re on the latest version.";
      case "available":
        return `Version ${state.update.version} is available.`;
      case "installing":
        return `Installing the update… ${state.percentage}%`;
      case "installed":
        return "Updated. Restarting EchoIdeal…";
      case "error":
        return state.message;
      default:
        return undefined;
    }
  })();

  return (
    <>
      <SettingsRow
        {...SETTINGS.version}
        title={isLoading ? "EchoIdeal" : `EchoIdeal ${version}`}
        desc={status}

        control={
          state.kind === "available" ? (
            <Button size="sm" onClick={() => install(state.update)}>
              Install update
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={checkForUpdates}
              disabled={
                state.kind === "checking" || state.kind === "installing"
              }
            >
              {(state.kind === "checking" || state.kind === "installing") && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              Check for updates
            </Button>
          )
        }
      />
      <SettingsRow
        {...SETTINGS.bug}
        desc="Opens a new issue on GitHub."
        to="https://github.com/Agbobli5373/EchoIdeal/issues/new?template=bug-report.yml"
      />
      <SettingsRow
        {...SETTINGS.quit}
        desc="Closes the overlay and the dashboard."
        onSelect={() => {
          invoke("exit_app").catch(console.error);
        }}
      />
    </>
  );
};
