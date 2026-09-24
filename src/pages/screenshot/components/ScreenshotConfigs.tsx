import { Input, SegmentedControl, SettingsRow } from "@/components";
import { UseSettingsReturn } from "@/types";

export const ScreenshotConfigs = ({
  screenshotConfiguration,
  handleScreenshotModeChange,
  handleScreenshotPromptChange,
  handleScreenshotEnabledChange,
}: UseSettingsReturn) => {
  // `enabled` means full-screen capture; off means drag to select an area.
  const method = screenshotConfiguration.enabled ? "screenshot" : "selection";

  return (
    <>
      <SettingsRow
        id="cap-method"
        title="Capture"
        desc={
          method === "screenshot"
            ? "The whole screen, with one click."
            : "An area you select by dragging."
        }
        keywords="screenshot area region selection full screen"
        control={
          <SegmentedControl
            label="Capture"
            value={method}
            onChange={(value) =>
              handleScreenshotEnabledChange(value === "screenshot")
            }
            options={[
              { value: "screenshot", label: "Full screen" },
              { value: "selection", label: "Selection" },
            ]}
          />
        }
      />
      <SettingsRow
        id="cap-mode"
        title="After capturing"
        desc={
          screenshotConfiguration.mode === "auto"
            ? "Sends the capture to the AI straight away with the prompt below. One capture at a time."
            : "Attaches the capture to your next question, so you can add several and ask about them together."
        }
        keywords="auto manual processing submit attach"
        stacked={screenshotConfiguration.mode === "auto"}
        control={
          <SegmentedControl
            label="After capturing"
            value={screenshotConfiguration.mode}
            onChange={handleScreenshotModeChange}
            options={[
              { value: "auto", label: "Answer at once" },
              { value: "manual", label: "Attach to my question" },
            ]}
          />
        }
      >
        {screenshotConfiguration.mode === "auto" && (
          <Input
            placeholder="What to ask about each capture…"
            aria-label="Prompt sent with each capture"
            value={screenshotConfiguration.autoPrompt}
            onChange={(e) => handleScreenshotPromptChange(e.target.value)}
            className="h-9"
          />
        )}
      </SettingsRow>
    </>
  );
};
