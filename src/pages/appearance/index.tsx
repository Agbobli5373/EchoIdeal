import { Theme } from "../settings/components";
import { SettingsGroup } from "@/components";
import { PageLayout } from "@/layouts";

const Appearance = () => {
  return (
    <PageLayout title="Appearance" subtitle="How EchoIdeal looks.">
      <SettingsGroup>
        <Theme />
      </SettingsGroup>
    </PageLayout>
  );
};

export default Appearance;
