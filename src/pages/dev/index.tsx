import {
  AIProviders,
  EmbeddingsProvider,
  STTProviders,
  WebSearchSettings,
} from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const DevSpace = () => {
  const settings = useSettings();

  return (
    <PageLayout
      title="AI and Speech"
      subtitle="The providers behind Suggested Answers, speech, searched Knowledge and web search."
    >
      {/* Provider Selection */}
      <AIProviders {...settings} />

      {/* STT Providers */}
      <STTProviders {...settings} />

      <EmbeddingsProvider />

      <WebSearchSettings />
    </PageLayout>
  );
};

export default DevSpace;
