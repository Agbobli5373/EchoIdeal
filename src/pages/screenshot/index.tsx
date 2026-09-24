import { ScreenshotConfigs, AnalyzePromptConfig } from "./components";
import { SettingsGroup } from "@/components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const ScreenCapture = () => {
  const settings = useSettings();
  return (
    <PageLayout
      title="Screen Capture"
      subtitle="How Screen Captures are taken and answered."
    >
      <SettingsGroup
        more={{
          id: "cap-more",
          label: "Screen Capture prompt",
          children: <AnalyzePromptConfig />,
        }}
      >
        <ScreenshotConfigs {...settings} />
      </SettingsGroup>
    </PageLayout>
  );
};

export default ScreenCapture;
