import { AlwaysOnTopToggle, AutostartToggle } from "../settings/components";
import { PageLayout } from "@/layouts";

const General = () => {
  return (
    <PageLayout title="General" subtitle="Startup, windows and data.">
      <AutostartToggle />
      <AlwaysOnTopToggle />
    </PageLayout>
  );
};

export default General;
