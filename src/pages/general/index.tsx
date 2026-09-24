import {
  About,
  AlwaysOnTopToggle,
  AutostartToggle,
  DeleteChats,
} from "../settings/components";
import { SettingsGroup } from "@/components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const General = () => {
  const settings = useSettings();

  return (
    <PageLayout title="General" subtitle="Startup, windows and data.">
      <SettingsGroup>
        <AutostartToggle />
        <AlwaysOnTopToggle />
        <DeleteChats {...settings} />
      </SettingsGroup>
      <SettingsGroup title="About">
        <About />
      </SettingsGroup>
    </PageLayout>
  );
};

export default General;
