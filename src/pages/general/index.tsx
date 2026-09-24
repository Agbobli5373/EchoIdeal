import {
  AlwaysOnTopToggle,
  AutostartToggle,
  DeleteChats,
} from "../settings/components";
import { SettingsGroup, SettingsRow } from "@/components";
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
      <SettingsGroup>
        <SettingsRow
          id="about"
          title="About EchoIdeal"
          desc="Version and updates, the developer, how to get in touch, and the licence."
          to="/about"
        />
      </SettingsGroup>
    </PageLayout>
  );
};

export default General;
