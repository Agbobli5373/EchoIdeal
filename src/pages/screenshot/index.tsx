import { ScreenshotConfigs, AnalyzePromptConfig } from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const Settings = () => {
  const settings = useSettings();
  return (
    <PageLayout
      title="Screen Capture"
      subtitle="How Screen Captures are taken and answered."
    >
      {/* Screenshot & Analyze Prompt */}
      <AnalyzePromptConfig />

      {/* Screenshot Configs */}
      <ScreenshotConfigs {...settings} />
    </PageLayout>
  );
};

export default Settings;
