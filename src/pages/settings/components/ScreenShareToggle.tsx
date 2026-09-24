import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";
import { getPlatform } from "@/lib";

export const ScreenShareToggle = () => {
  const { customizable, toggleScreenShareVisibility } = useApp();
  const isVisible = customizable.screenShareVisible?.isEnabled ?? false;

  return (
    <SettingsRow
      id="visible"
      title="Visible in screen shares"
      desc={
        <>
          When off, EchoIdeal doesn’t appear in screenshots, recordings or
          screen shares.
          {getPlatform() === "linux" &&
            " Hiding isn’t supported on Linux."}
        </>
      }
      keywords="screen share content protection recording stealth"
      control={
        <Switch
          checked={isVisible}
          onCheckedChange={(checked) => toggleScreenShareVisibility(checked)}
          aria-label="Visible in screen shares"
        />
      }
    />
  );
};
