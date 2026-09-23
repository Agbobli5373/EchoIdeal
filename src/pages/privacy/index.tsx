import { AppIconToggle, ScreenShareToggle } from "../settings/components";
import { PageLayout } from "@/layouts";

const Privacy = () => {
  return (
    <PageLayout
      title="Privacy"
      subtitle="What other people and apps can see."
    >
      <ScreenShareToggle />
      <AppIconToggle />
    </PageLayout>
  );
};

export default Privacy;
