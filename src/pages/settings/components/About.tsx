import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, Update } from "@tauri-apps/plugin-updater";
import { Loader2 } from "lucide-react";
import { Button, SettingsRow } from "@/components";
import { useVersion } from "@/hooks";

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
        return "Updated. Quit and reopen EchoIdeal to finish.";
      case "error":
        return state.message;
      default:
        return undefined;
    }
  })();

  return (
    <>
      <SettingsRow
        id="version"
        title={isLoading ? "EchoIdeal" : `EchoIdeal ${version}`}
        desc={status}
        keywords="version update upgrade about"
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
              disabled={state.kind === "checking" || state.kind === "installing"}
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
        id="bug"
        title="Report a bug"
        desc="Opens a new issue on GitHub."
        keywords="issue feedback github support"
        to="https://github.com/Agbobli5373/EchoIdeal/issues/new?template=bug-report.yml"
      />
      <SettingsRow
        id="quit"
        title="Quit EchoIdeal"
        desc="Closes the overlay and the dashboard."
        keywords="exit close"
        onSelect={() => {
          invoke("exit_app").catch(console.error);
        }}
      />
    </>
  );
};
