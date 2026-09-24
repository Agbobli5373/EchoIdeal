import { AIProviders, EmbeddingsProvider, STTProviders } from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const DevSpace = () => {
  const settings = useSettings();

  return (
    <PageLayout
      title="AI and Speech"
      subtitle="The providers that write Suggested Answers, transcribe speech and search large Knowledge Documents."
    >
      {/* Provider Selection */}
      <AIProviders {...settings} />

      {/* STT Providers */}
      <STTProviders {...settings} />

      <EmbeddingsProvider />
    </PageLayout>
  );
};

export default DevSpace;
