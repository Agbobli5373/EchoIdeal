import { AppIconToggle, ScreenShareToggle } from "../settings/components";
import { SettingsGroup } from "@/components";
import { PageLayout } from "@/layouts";

const Privacy = () => {
  return (
    <PageLayout
      title="Privacy"
      subtitle="What other people and apps can see."
    >
      <SettingsGroup>
        <ScreenShareToggle />
        <AppIconToggle />
      </SettingsGroup>
    </PageLayout>
  );
};

export default Privacy;
